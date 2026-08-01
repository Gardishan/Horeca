import { describe, expect, it } from "vitest";
import {
  adminCompanySchema,
  productSchema,
  supplierProductSchema,
} from "@/lib/validation";

describe("admin company update validation", () => {
  it("rejects critical state transitions through the generic profile endpoint", () => {
    for (const payload of [
      { status: "ACTIVE" },
      { verificationStatus: "APPROVED" },
      { isBlocked: false },
    ]) {
      expect(adminCompanySchema.safeParse(payload).success).toBe(false);
    }
  });

  it("accepts profile and recommendation updates", () => {
    expect(
      adminCompanySchema.parse({
        name: "Updated supplier",
        isRecommended: true,
      }),
    ).toEqual({
      name: "Updated supplier",
      isRecommended: true,
    });
  });
});

describe("product update validation", () => {
  it("keeps featured merchandising admin-only", () => {
    expect(supplierProductSchema.partial().safeParse({ isFeatured: true }).success).toBe(false);
    expect(productSchema.partial().parse({ isFeatured: true })).toEqual({ isFeatured: true });
  });

  it("does not synthesize create defaults during partial updates", () => {
    expect(supplierProductSchema.partial().parse({ name: "Updated coffee" })).toEqual({
      name: "Updated coffee",
    });
  });
});
