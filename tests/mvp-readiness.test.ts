import { describe, expect, it } from "vitest";
import registry from "@/docs/mvp-launch-readiness.json";
import {
  evaluateMvpReadiness,
  missingMvpEvidenceFiles,
} from "@/scripts/check-mvp-readiness";

describe("MVP Beta readiness registry", () => {
  it("is machine-readable and keeps external launch evidence explicit", () => {
    const result = evaluateMvpReadiness(registry);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.ready).toBe(false);
    expect(result.counts.done).toBeGreaterThan(0);
    expect(result.blockers.map((control) => control.id)).toContain("beta-deployment");
    expect(result.blockers.map((control) => control.id)).toContain("external-https-smoke");
    expect(missingMvpEvidenceFiles(result.registry, process.cwd())).toEqual([]);
  });

  it("rejects duplicate controls and unverifiable completion", () => {
    const first = registry.controls[0];
    const invalid = {
      ...registry,
      controls: [
        { ...first, evidence: [], verifiedAt: null },
        { ...first },
      ],
    };

    const result = evaluateMvpReadiness(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/done control requires evidence/);
    expect(result.errors.join(" ")).toMatch(/done control requires verifiedAt/);
    expect(result.errors.join(" ")).toMatch(/duplicate control id/);
  });
});
