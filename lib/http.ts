import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { AppError } from "@/lib/errors";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, init);
}

export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new AppError("Cross-site запрос отклонён", 403, "CSRF_REJECTED");
  }

  const origin = request.headers.get("origin");
  if (!origin || origin === "null") {
    throw new AppError("Origin обязателен для изменения данных", 403, "CSRF_REJECTED");
  }
  const requestUrl = new URL(request.url);
  const allowedOrigins = new Set([requestUrl.origin]);
  for (const configuredUrl of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!configuredUrl) continue;
    try {
      allowedOrigins.add(new URL(configuredUrl).origin);
    } catch {
      // Runtime validation reports invalid application URLs before serving traffic.
    }
  }
  if (!allowedOrigins.has(origin)) {
    throw new AppError("Origin запроса не разрешён", 403, "CSRF_REJECTED");
  }
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new AppError("Ожидался корректный JSON", 400, "INVALID_JSON");
  }
  return schema.parse(json);
}

export function clientMeta(request: Request) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function apiHandler(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json<ApiFailure>(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Проверьте заполненные поля",
            details: error.issues,
          },
        },
        { status: 422 },
      );
    }
    if (error instanceof AppError) {
      return NextResponse.json<ApiFailure>(
        {
          ok: false,
          error: { code: error.code, message: error.message, details: error.details },
        },
        { status: error.status },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json<ApiFailure>(
        {
          ok: false,
          error: { code: "DUPLICATE", message: "Такая запись уже существует" },
        },
        { status: 409 },
      );
    }

    console.error("Unhandled API error", error);
    return NextResponse.json<ApiFailure>(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" },
      },
      { status: 500 },
    );
  }
}
