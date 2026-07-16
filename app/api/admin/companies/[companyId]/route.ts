import { requireRole } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { getAdminCompany } from "@/lib/services/admin";
import { adminCompanySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/services/audit";

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  return apiHandler(async () => {
    await requireRole("ADMIN");
    const { companyId } = await context.params;
    return ok(await getAdminCompany(companyId));
  });
}

export async function PUT(request: Request, context: { params: Promise<{ companyId: string }> }) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const admin = await requireRole("ADMIN");
    const { companyId } = await context.params;
    const input = await parseJson(request, adminCompanySchema);
    const before = await getAdminCompany(companyId);
    const updated = await prisma.$transaction(async (tx) => {
      const company = await tx.company.update({ where: { id: companyId }, data: input });
      await writeAuditLog(
        {
          adminUserId: admin.id,
          companyId,
          action: "COMPANY_UPDATED",
          entityType: "Company",
          entityId: companyId,
          before: { status: before.status, verificationStatus: before.verificationStatus, isBlocked: before.isBlocked },
          after: input,
          ...clientMeta(request),
        },
        tx,
      );
      return company;
    });
    return ok(updated);
  });
}

