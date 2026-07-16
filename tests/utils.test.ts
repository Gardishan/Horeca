import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/utils";

describe("slugify", () => {
  it("creates stable URL-safe slugs for Russian and Kazakh product names", () => {
    expect(slugify("Кофе в зёрнах — 1 кг")).toBe("kofe-v-zernah-1-kg");
    expect(slugify("Қазақ шайы")).toBe("qazaq-shaiy");
  });
});

