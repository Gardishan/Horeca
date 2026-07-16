import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const controlSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["done", "planned", "blocked"]),
  blocking: z.boolean(),
  owner: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  nextAction: z.string().min(1).optional(),
});

const registrySchema = z
  .object({
    version: z.literal(1),
    product: z.string().min(1),
    target: z.literal("commercial-production"),
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
      if (control.status !== "done" && !control.nextAction) {
        context.addIssue({
          code: "custom",
          message: "unfinished control requires nextAction",
          path: ["controls", index, "nextAction"],
        });
      }
    });
  });

export type ReadinessRegistry = z.infer<typeof registrySchema>;

export function evaluateReadiness(input: unknown) {
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

  const counts = { done: 0, planned: 0, blocked: 0 };
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

export function missingEvidenceFiles(registry: ReadinessRegistry, root: string) {
  return registry.controls
    .filter((control) => control.status === "done")
    .flatMap((control) =>
      control.evidence
        .filter((reference) => !reference.startsWith("https://"))
        .filter((reference) => !existsSync(path.join(root, reference)))
        .map((reference) => `${control.id}: ${reference}`),
    );
}

export function runReadinessCheck(argv = process.argv.slice(2), root = process.cwd()) {
  const registryPath = path.join(root, "docs", "production-readiness.json");
  let source: unknown;
  try {
    source = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch (error) {
    console.error(`Readiness registry cannot be read: ${String(error)}`);
    return 1;
  }

  const result = evaluateReadiness(source);
  if (!result.valid) {
    console.error("Readiness registry is invalid:");
    result.errors.forEach((error) => console.error(`- ${error}`));
    return 1;
  }

  const missingEvidence = missingEvidenceFiles(result.registry, root);
  if (missingEvidence.length > 0) {
    console.error("Readiness evidence is missing:");
    missingEvidence.forEach((reference) => console.error(`- ${reference}`));
    return 1;
  }

  console.log(
    `Readiness registry valid: ${result.counts.done} done, ${result.counts.planned} planned, ${result.counts.blocked} blocked.`,
  );

  if (result.blockers.length > 0) {
    console.log("Commercial production blockers:");
    result.blockers.forEach((control) =>
      console.log(`- ${control.id} [${control.status}] ${control.owner}: ${control.nextAction}`),
    );
  }

  if (argv.includes("--strict") && !result.ready) {
    console.error("Strict release gate failed: commercial production blockers remain open.");
    return 1;
  }

  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) process.exitCode = runReadinessCheck();
