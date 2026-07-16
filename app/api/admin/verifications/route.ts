import type { VerificationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { apiHandler, ok } from "@/lib/http";
import { listAdminVerifications } from "@/lib/services/admin";

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireRole("ADMIN");
    const status = new URL(request.url).searchParams.get("status") as VerificationStatus | null;
    return ok(await listAdminVerifications(status ?? undefined));
  });
}

