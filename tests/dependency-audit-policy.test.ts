import { describe, expect, it } from "vitest";
import {
  assessDependencyAudits,
  type AuditReport,
} from "@/lib/dependency-audit-policy";

function report(
  high: number,
  critical = 0,
  advisories: Array<{ id: string; severity: "high" | "critical" }> = [],
): AuditReport {
  return {
    metadata: {
      vulnerabilities: { high, critical },
    },
    vulnerabilities: Object.fromEntries(
      advisories.map((advisory) => [
        advisory.id,
        {
          via: [
            {
              url: `https://github.com/advisories/${advisory.id}`,
              severity: advisory.severity,
            },
          ],
        },
      ]),
    ),
  };
}

describe("dependency audit policy", () => {
  it("allows only registered high advisories outside production", () => {
    const result = assessDependencyAudits(
      report(0),
      report(18, 0, [{ id: "GHSA-dev-only", severity: "high" }]),
      [{ id: "GHSA-dev-only" }],
    );

    expect(result.errors).toEqual([]);
    expect(result.activeAdvisories).toEqual([
      { id: "GHSA-dev-only", severity: "high" },
    ]);
  });

  it("rejects production, unexpected and critical findings", () => {
    const result = assessDependencyAudits(
      report(1, 0, [{ id: "GHSA-production", severity: "high" }]),
      report(2, 1, [
        { id: "GHSA-unexpected", severity: "high" },
        { id: "GHSA-critical", severity: "critical" },
      ]),
      [{ id: "GHSA-critical" }],
    );

    expect(result.errors.join(" ")).toMatch(/Production dependency graph/);
    expect(result.errors.join(" ")).toMatch(/Critical vulnerabilities cannot/);
    expect(result.errors.join(" ")).toMatch(/GHSA-unexpected/);
  });

  it("never downgrades a duplicate critical advisory", () => {
    const fullReport: AuditReport = {
      metadata: { vulnerabilities: { high: 1, critical: 1 } },
      vulnerabilities: {
        first: {
          via: [
            {
              url: "https://github.com/advisories/GHSA-duplicate",
              severity: "critical",
            },
          ],
        },
        second: {
          via: [
            {
              url: "https://github.com/advisories/GHSA-duplicate",
              severity: "high",
            },
          ],
        },
      },
    };

    const result = assessDependencyAudits(report(0), fullReport, [
      { id: "GHSA-duplicate" },
    ]);

    expect(result.activeAdvisories).toEqual([
      { id: "GHSA-duplicate", severity: "critical" },
    ]);
    expect(result.errors.join(" ")).toMatch(/Critical vulnerabilities cannot/);
  });

  it("rejects stale exceptions and unidentified audit failures", () => {
    const result = assessDependencyAudits(
      report(0),
      report(1),
      [{ id: "GHSA-no-longer-present" }],
    );

    expect(result.errors.join(" ")).toMatch(/unidentified/);
    expect(result.errors.join(" ")).toMatch(/GHSA-no-longer-present/);
  });

  it("surfaces npm audit execution errors", () => {
    const result = assessDependencyAudits(
      { error: { summary: "registry unavailable" } },
      { error: {} },
      [],
    );

    expect(result.errors).toEqual([
      "Production dependency audit failed: registry unavailable",
      "Full dependency audit failed: unknown npm audit error",
    ]);
  });
});
