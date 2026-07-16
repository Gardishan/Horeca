import { describe, expect, it, vi } from "vitest";
import { compactObject, slugify, toPlainNumber, uniqueSlug } from "@/lib/utils";

describe("slugify", () => {
  it("creates stable URL-safe slugs for Russian and Kazakh product names", () => {
    expect(slugify("Кофе в зёрнах — 1 кг")).toBe("kofe-v-zernah-1-kg");
    expect(slugify("Қазақ шайы")).toBe("qazaq-shaiy");
  });

  it("normalizes whitespace, accents and length", () => {
    expect(slugify("  Crème brûlée  ")).toBe("creme-brulee");
    expect(slugify("---")).toBe("");
    expect(slugify("a".repeat(120))).toHaveLength(80);
  });

  it("adds a collision-resistant suffix and falls back for empty names", () => {
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "12345678-1234-4234-8234-123456789abc",
    );
    expect(uniqueSlug("Қазақ шайы")).toBe("qazaq-shaiy-12345678");
    expect(uniqueSlug("---")).toBe("item-12345678");
    randomUUID.mockRestore();
  });
});

describe("serialization helpers", () => {
  it("converts Prisma-like decimals without changing numbers", () => {
    expect(toPlainNumber(null)).toBeNull();
    expect(toPlainNumber(undefined)).toBeNull();
    expect(toPlainNumber(42)).toBe(42);
    expect(toPlainNumber({ toNumber: () => 12.5 })).toBe(12.5);
  });

  it("removes only undefined properties", () => {
    expect(compactObject({ keep: 0, empty: null, enabled: false, remove: undefined })).toEqual({
      keep: 0,
      empty: null,
      enabled: false,
    });
  });
});
