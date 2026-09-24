import { describe, expect, it } from "vitest";
import registry from "@/docs/mvp-launch-readiness.json";
import {
  evaluateMvpReadiness,
  missingMvpEvidenceFiles,
} from "@/scripts/check-mvp-readiness";

const requiredControlIds = [
  "critical-flows",
  "controlled-beta-safety",
  "beta-database",
  "beta-deployment",
  "external-https-smoke",
  "android-debug-artifact",
  "release-identity",
  "beta-operations",
] as const;

function completeRegistry() {
  return {
    version: 1,
    product: "HoReCa KZ",
    target: "mvp-beta",
    updatedAt: "2026-09-24",
    controls: requiredControlIds.map((id) => ({
      id,
      title: `Fixture ${id}`,
      status: "done",
      blocking: true,
      owner: "Test owner",
      evidence: ["docs/DEPLOYMENT.md"],
      verifiedAt: "2026-09-24T00:00:00Z",
      environment: "test-fixture",
      notes: "Synthetic evidence for readiness validation tests only",
    })),
  };
}

describe("MVP Beta readiness registry", () => {
  it("keeps the live registry valid without prescribing its launch status", () => {
    const result = evaluateMvpReadiness(registry);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.registry.controls.map((control) => control.id).sort()).toEqual(
      [...requiredControlIds].sort(),
    );
    expect(result.registry.controls.every((control) => control.blocking)).toBe(true);
    expect(missingMvpEvidenceFiles(result.registry, process.cwd())).toEqual([]);
  });

  it("accepts completion when every mandatory control has completion evidence", () => {
    const result = evaluateMvpReadiness(completeRegistry());

    expect(result.valid).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it.each(["planned", "in_progress", "blocked"])(
    "keeps the gate closed for a %s mandatory control",
    (status) => {
      const fixture = completeRegistry();
      fixture.controls[3].status = status;
      const result = evaluateMvpReadiness(fixture);

      expect(result.valid).toBe(true);
      expect(result.ready).toBe(false);
      expect(result.blockers.map((control) => control.id)).toEqual(["beta-deployment"]);
    },
  );

  it.each(requiredControlIds)("rejects omission of mandatory control %s", (id) => {
    const fixture = completeRegistry();
    fixture.controls = fixture.controls.filter((control) => control.id !== id);
    const result = evaluateMvpReadiness(fixture);

    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.errors.join(" ")).toContain(`missing mandatory control: ${id}`);
  });

  it.each(requiredControlIds)("rejects downgrading mandatory control %s", (id) => {
    const fixture = completeRegistry();
    fixture.controls = fixture.controls.map((control) => (
      control.id === id ? { ...control, blocking: false } : control
    ));
    const result = evaluateMvpReadiness(fixture);

    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.errors.join(" ")).toContain(`mandatory control must be blocking: ${id}`);
  });

  it("rejects controls outside the canonical MVP scope", () => {
    const fixture = completeRegistry();
    const result = evaluateMvpReadiness({
      ...fixture,
      controls: [...fixture.controls, { ...fixture.controls[0], id: "unexpected-control" }],
    });

    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.errors.join(" ")).toContain("unknown MVP control: unexpected-control");
  });

  it("rejects duplicate controls and unverifiable completion", () => {
    const fixture = completeRegistry();
    const first = fixture.controls[0];
    const invalid = {
      ...fixture,
      controls: [
        ...fixture.controls.slice(1),
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
