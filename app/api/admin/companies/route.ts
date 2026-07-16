import type { CompanyStatus, VerificationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { apiHandler, ok } from "@/lib/http";
import { listAdminCompanies } from "@/lib/services/admin";

export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireRole("ADMIN");
    const url = new URL(request.url);
    return ok(
      await listAdminCompanies({
        search: url.searchParams.get("search") ?? undefined,
        status: (url.searchParams.get("status") as CompanyStatus | null) ?? undefined,
        verification: (url.searchParams.get("verification") as VerificationStatus | null) ?? undefined,
      }),
    );
  });
}

