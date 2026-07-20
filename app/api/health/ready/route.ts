import { prisma } from "@/lib/prisma";
import { checkReadiness } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const readiness = await checkReadiness({
    databaseProbe: () => prisma.$queryRaw`SELECT 1`,
  });

  if (!readiness.ready) {
    console.error(JSON.stringify({ event: "readiness_failed", failure: readiness.failure }));
    return Response.json(
      {
        ok: false,
        error: { code: "NOT_READY", message: "Service is not ready" },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": "5" },
      },
    );
  }

  return Response.json(
    {
      ok: true,
      data: { status: "ready", deploymentVersion: readiness.deploymentVersion },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
