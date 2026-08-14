import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const statusSchema = z.enum(["done", "planned", "in_progress", "blocked"]);
const controlSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  status: statusSchema,
  blocking: z.boolean(),
  owner: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  verifiedAt: z.iso.datetime().nullable(),
  environment: z.string().min(1),
  notes: z.string().min(1),
});

const registrySchema = z
  .object({
    version: z.literal(1),
    product: z.literal("HoReCa KZ"),
    target: z.literal("mvp-beta"),
    updatedAt: z.iso.date(),
    controls: z.array(controlSchema).min(1),
  })
  .superRefine((registry, context) => {
    const ids = new Set<string>();
    registry.controls.forEach((control, index) => {
      if (ids.has(control.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate control id: ${control.id}`,
          path: ["controls", index, "id"],
        });
      }
      ids.add(control.id);
      if (control.status === "done" && control.evidence.length === 0) {
        context.addIssue({
          code: "custom",
          message: "done control requires evidence",
          path: ["controls", index, "evidence"],
        });
      }
      if (control.status === "done" && !control.verifiedAt) {
        context.addIssue({
          code: "custom",
          message: "done control requires verifiedAt",
          path: ["controls", index, "verifiedAt"],
        });
      }
    });
  });

export type MvpReadinessRegistry = z.infer<typeof registrySchema>;

export function evaluateMvpReadiness(input: unknown) {
  const parsed = registrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false as const,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      counts: null,
      blockers: [],
      ready: false,
    };
  }

  const counts = { done: 0, planned: 0, in_progress: 0, blocked: 0 };
  for (const control of parsed.data.controls) counts[control.status] += 1;
  const blockers = parsed.data.controls.filter(
    (control) => control.blocking && control.status !== "done",
  );
  return {
    valid: true as const,
    errors: [],
    registry: parsed.data,
    counts,
    blockers,
    ready: blockers.length === 0,
  };
}

export function missingMvpEvidenceFiles(registry: MvpReadinessRegistry, root: string) {
  return registry.controls
    .filter((control) => control.status === "done")
    .flatMap((control) =>
      control.evidence
        .filter((reference) => !reference.startsWith("https://"))
        .filter((reference) => !existsSync(path.join(root, reference)))
        .map((reference) => `${control.id}: ${reference}`),
    );
}

export function runMvpReadinessCheck(argv = process.argv.slice(2), root = process.cwd()) {
  const registryPath = path.join(root, "docs", "mvp-launch-readiness.json");
  let source: unknown;
  try {
    source = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch (error) {
    console.error(`MVP readiness registry cannot be read: ${String(error)}`);
    return 1;
  }

  const result = evaluateMvpReadiness(source);
  if (!result.valid) {
    console.error("MVP readiness registry is invalid:");
    result.errors.forEach((error) => console.error(`- ${error}`));
    return 1;
  }

  const missingEvidence = missingMvpEvidenceFiles(result.registry, root);
  if (missingEvidence.length > 0) {
    console.error("MVP readiness evidence is missing:");
    missingEvidence.forEach((reference) => console.error(`- ${reference}`));
    return 1;
  }

  console.log(
    `MVP readiness registry valid: ${result.counts.done} done, ${result.counts.in_progress} in progress, ${result.counts.planned} planned, ${result.counts.blocked} blocked.`,
  );
  if (result.blockers.length > 0) {
    console.log("MVP Beta launch blockers:");
    result.blockers.forEach((control) =>
      console.log(`- ${control.id} [${control.status}] ${control.owner}: ${control.notes}`),
    );
  }
  if (argv.includes("--strict") && !result.ready) {
    console.error("Strict MVP Beta gate failed: launch evidence remains incomplete.");
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) process.exitCode = runMvpReadinessCheck();
