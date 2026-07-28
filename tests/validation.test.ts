import { describe, expect, it } from "vitest";
import { adminCompanySchema } from "@/lib/validation";

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
