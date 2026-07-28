type AuditSeverity = "info" | "low" | "moderate" | "high" | "critical";

type AuditAdvisory = {
  source?: number;
  url?: string;
  severity?: AuditSeverity;
};

export type AuditReport = {
  error?: {
    summary?: string;
  };
  metadata?: {
    vulnerabilities?: Partial<Record<AuditSeverity, number>>;
  };
  vulnerabilities?: Record<
    string,
    {
      via?: Array<string | AuditAdvisory>;
    }
  >;
};

export type AdvisoryException = {
  id: string;
};

type ActiveAdvisory = {
  id: string;
  severity: "high" | "critical";
};

export type DependencyAuditAssessment = {
  activeAdvisories: ActiveAdvisory[];
  errors: string[];
};

function blockingCount(report: AuditReport) {
  const counts = report.metadata?.vulnerabilities;
  return (counts?.high ?? 0) + (counts?.critical ?? 0);
}

function advisoryId(advisory: AuditAdvisory) {
  if (advisory.url) {
    try {
      const lastSegment = new URL(advisory.url).pathname.split("/").filter(Boolean).at(-1);
      if (lastSegment) return lastSegment;
    } catch {
      return advisory.url;
    }
  }
  return advisory.source ? `source:${advisory.source}` : "unidentified-advisory";
}

function activeAdvisories(report: AuditReport) {
  const advisories = new Map<string, ActiveAdvisory>();

  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (
        typeof via === "string" ||
        (via.severity !== "high" && via.severity !== "critical")
      ) {
        continue;
      }
      const id = advisoryId(via);
      const severity =
        via.severity === "critical" || advisories.get(id)?.severity === "critical"
          ? "critical"
          : "high";
      advisories.set(id, { id, severity });
    }
  }

  return [...advisories.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function assessDependencyAudits(
  productionReport: AuditReport,
  fullReport: AuditReport,
  exceptions: AdvisoryException[],
): DependencyAuditAssessment {
  const errors: string[] = [];
  const active = activeAdvisories(fullReport);
  const activeIds = new Set(active.map((advisory) => advisory.id));
  const exceptionIds = new Set(exceptions.map((exception) => exception.id));

  if (productionReport.error) {
    errors.push(
      `Production dependency audit failed: ${productionReport.error.summary ?? "unknown npm audit error"}`,
    );
  }
  if (fullReport.error) {
    errors.push(
      `Full dependency audit failed: ${fullReport.error.summary ?? "unknown npm audit error"}`,
    );
  }
  if (blockingCount(productionReport) > 0) {
    errors.push("Production dependency graph contains high or critical vulnerabilities");
  }
  if (active.some((advisory) => advisory.severity === "critical")) {
    errors.push("Critical vulnerabilities cannot be accepted by an advisory exception");
  }
  if (blockingCount(fullReport) > 0 && active.length === 0) {
    errors.push("Full dependency audit contains an unidentified high or critical advisory");
  }

  const unexpected = [...activeIds].filter((id) => !exceptionIds.has(id)).sort();
  if (unexpected.length > 0) {
    errors.push(`Unregistered high dependency advisories: ${unexpected.join(", ")}`);
  }

  const stale = [...exceptionIds].filter((id) => !activeIds.has(id)).sort();
  if (stale.length > 0) {
    errors.push(`Advisory exceptions no longer present in the audit: ${stale.join(", ")}`);
  }

  return { activeAdvisories: active, errors };
}
