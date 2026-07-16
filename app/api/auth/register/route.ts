import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/auth";
import { apiHandler, assertSameOrigin, clientMeta, ok, parseJson } from "@/lib/http";
import { supplierRegistrationSchema } from "@/lib/validation";
import { assertRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const meta = clientMeta(request);
    await assertRateLimit(`register:${meta.ipAddress ?? "unknown"}`, 5, 60 * 60 * 1000);
    const input = await parseJson(request, supplierRegistrationSchema);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name, role: "SUPPLIER" },
      });
      await tx.company.create({
        data: {
          ownerId: created.id,
          name: input.companyName,
          legalName: input.legalName,
          binIin: input.binIin,
          address: input.address,
          city: input.city,
          deliveryCities: [input.city],
          categories: [],
          description: "",
          phone: input.phone,
          email: input.email,
          status: "DRAFT",
          verificationStatus: "NOT_STARTED",
        },
      });
      return created;
    });
    await setSession(user.id, user.role);
    return ok({ id: user.id, name: user.name, email: user.email, role: user.role }, { status: 201 });
  });
}
