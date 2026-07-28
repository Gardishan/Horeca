import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  assessDependencyAudits,
  type AuditReport,
} from "../lib/dependency-audit-policy";

type AdvisoryRegistry = {
  exceptions: Array<{
    id: string;
  }>;
};

function runAudit(arguments_: string[]) {
  const npmExecutable = process.env.npm_execpath;
  const command = npmExecutable ? process.execPath : "npm";
  const commandArguments = npmExecutable
    ? [npmExecutable, "audit", "--json", ...arguments_]
    : ["audit", "--json", ...arguments_];
  const result = spawnSync(command, commandArguments, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;

  let report: AuditReport;
  try {
    report = JSON.parse(result.stdout) as AuditReport;
  } catch {
    throw new Error(
      `npm audit returned invalid JSON${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
    );
  }

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `npm audit exited with status ${result.status}${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
    );
  }
  return report;
}

const registry = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "docs", "security", "advisories.json"),
    "utf8",
  ),
) as AdvisoryRegistry;
const productionReport = runAudit(["--omit=dev", "--audit-level=high"]);
const fullReport = runAudit(["--audit-level=high"]);
const assessment = assessDependencyAudits(
  productionReport,
  fullReport,
  registry.exceptions,
);

if (assessment.errors.length > 0) {
  for (const error of assessment.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const accepted = assessment.activeAdvisories.map((advisory) => advisory.id);
  console.log(
    accepted.length > 0
      ? `Dependency audit passed: production graph is clean; accepted dev-only advisories: ${accepted.join(", ")}.`
      : "Dependency audit passed: no high or critical vulnerabilities.",
  );
}
