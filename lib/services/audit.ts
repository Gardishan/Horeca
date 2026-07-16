import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | PrismaClient;

export type AuditInput = {
  adminUserId: string;
  companyId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function writeAuditLog(input: AuditInput, db: DbClient = prisma) {
  return db.adminAuditLog.create({
    data: {
      adminUserId: input.adminUserId,
      companyId: input.companyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

