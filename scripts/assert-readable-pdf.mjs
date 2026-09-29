import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Use an independent parser, not the fixture generator or a %PDF signature test.
export function assertReadableDemoPdf(bytes) {
  const result = spawnSync(
    process.env.PDF_VALIDATION_PYTHON || "python3",
    [fileURLToPath(new URL("./check-readable-pdf.py", import.meta.url))],
    { input: bytes, timeout: 10_000, maxBuffer: 128 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("PDF is unreadable, lacks demo content, or the independent PDF validator is unavailable. Install scripts/pdf-validation-requirements.txt and set PDF_VALIDATION_PYTHON.");
  }
}
