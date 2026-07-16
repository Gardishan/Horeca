import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { DEMO_ACCOUNTS } from "@/lib/constants";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const meta = clientMeta(request);
    await assertRateLimit(`login:${meta.ipAddress ?? "unknown"}`, 10, 10 * 60 * 1000);
    const input = await parseJson(request, loginSchema);
    if (process.env.DEMO_AUTH_ENABLED === "false" && DEMO_ACCOUNTS.some((account) => account.email === input.email)) {
      throw new AppError("Demo-аккаунты отключены", 403, "DEMO_DISABLED");
    }
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError("Неверный email или пароль", 401, "INVALID_CREDENTIALS");
    }
    await setSession(user.id, user.role);
    return ok({ id: user.id, email: user.email, name: user.name, role: user.role });
  });
}
