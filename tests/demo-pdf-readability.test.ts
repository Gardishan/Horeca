import { describe, expect, it } from "vitest";
import { createDemoPdf } from "../scripts/demo-pdf.mjs";
import { assertReadableDemoPdf } from "../scripts/assert-readable-pdf.mjs";
import manifest from "../prisma/demo-files.json";

describe("independent PDF readability", () => {
  it.each(Object.values(manifest))("parses a readable page for $title", ({ title }) => {
    expect(() => assertReadableDemoPdf(createDemoPdf({ title }))).not.toThrow();
  });

  it("parses a marker with a unique printable reference", () => {
    expect(() => assertReadableDemoPdf(createDemoPdf({
      title: "Beta persistence probe",
      reference: "12345678-1234-4123-8123-123456789abc",
    }))).not.toThrow();
  });

  it.each([
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    "%PDF-1.4\n% Synthetic Beta persistence probe 12345678-1234-4123-8123-123456789abc\n%%EOF\n",
  ])("rejects the former signature-only fixture", (legacy) => {
    expect(() => assertReadableDemoPdf(Buffer.from(legacy))).toThrow("PDF is unreadable");
  });

  it("rejects a truncated PDF even when its header is intact", () => {
    expect(() => assertReadableDemoPdf(createDemoPdf({ title: "registration" }).subarray(0, 200)))
      .toThrow("PDF is unreadable");
  });
});
