import { describe, expect, it } from "vitest";
import registry from "@/docs/production-readiness.json";
import { evaluateReadiness, missingEvidenceFiles } from "@/scripts/check-readiness";

describe("production readiness registry", () => {
  it("is machine-readable and keeps commercial blockers explicit", () => {
    const result = evaluateReadiness(registry);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.ready).toBe(false);
    expect(result.counts.done).toBeGreaterThan(0);
    expect(result.blockers.map((control) => control.id)).toContain("production-platform");
    expect(missingEvidenceFiles(result.registry, process.cwd())).toEqual([]);
  });

  it("rejects duplicate controls and unverifiable completion", () => {
    const invalid = {
      ...registry,
      controls: [
        { ...registry.controls[0], evidence: [] },
        { ...registry.controls[0] },
      ],
    };

    const result = evaluateReadiness(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/done control requires evidence/);
    expect(result.errors.join(" ")).toMatch(/duplicate control id/);
  });

  it("rejects unfinished controls without an exact next action", () => {
    const invalid = {
      ...registry,
      controls: [{ ...registry.controls.find((control) => control.status !== "done"), nextAction: undefined }],
    };

    const result = evaluateReadiness(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/unfinished control requires nextAction/);
  });
});
