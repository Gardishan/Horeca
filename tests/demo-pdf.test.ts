import { describe, expect, it } from "vitest";
import { createDemoPdf } from "../scripts/demo-pdf.mjs";

describe("deterministic demo PDF", () => {
  it("produces one printable page with correct byte offsets and stream length", () => {
    const input = { title: "registration", reference: "123e4567-e89b-42d3-a456-426614174000" };
    const bytes = createDemoPdf(input);
    expect(createDemoPdf(input)).toEqual(bytes);
    const pdf = bytes.toString("ascii");
    expect(pdf).toContain("/Type /Catalog /Pages 2 0 R");
    expect(pdf).toContain("/Type /Pages /Kids [3 0 R] /Count 1");
    expect(pdf).toContain("/BaseFont /Helvetica");
    expect(pdf).toContain("HORECA KZ - DEMO ONLY");
    expect(pdf).toContain(input.reference);
    const stream = /\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/.exec(pdf)!;
    expect(stream).not.toBeNull();
    expect(Buffer.byteLength(stream[2], "ascii")).toBe(Number(stream[1]));
    const startxref = Number(/\nstartxref\n(\d+)\n%%EOF\n$/.exec(pdf)![1]);
    expect(bytes.subarray(startxref, startxref + 4).toString()).toBe("xref");
    const entries = pdf.slice(startxref).split("\n").slice(3, 8);
    for (const [index, entry] of entries.entries()) {
      expect(entry).toMatch(/^\d{10} 00000 n $/);
      expect(pdf.slice(Number(entry.slice(0, 10)))).toMatch(new RegExp(`^${index + 1} 0 obj\\n`));
    }
  });

  it("escapes PDF literal delimiters instead of treating title or reference as operators", () => {
    const pdf = createDemoPdf({ title: "registration (demo) \\ test", reference: "ref ) ( \\" }).toString("ascii");
    expect(pdf).toContain("registration \\(demo\\) \\\\ test");
    expect(pdf).toContain("ref \\) \\( \\\\");
  });

  it("wraps maximum length text within the fixed page layout", () => {
    const pdf = createDemoPdf({ title: "W".repeat(80), reference: "R".repeat(80) }).toString("ascii");
    const textLines = [...pdf.matchAll(/^\(([^)]*)\) Tj$/gm)].slice(1).map((match) => match[1]);
    expect(textLines.every((line) => line.length <= 48)).toBe(true);
    expect(textLines.length).toBeLessThan(12);
  });

  it.each(["", " ", "a".repeat(81), "line\nbreak", "tab\ttext", "кириллица", "nul\0text"])("rejects unsafe or unsupported text %j", (text) => {
    expect(() => createDemoPdf({ title: text })).toThrow(TypeError);
    expect(() => createDemoPdf({ title: "registration", reference: text })).toThrow(TypeError);
  });
});
