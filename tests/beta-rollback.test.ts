import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/beta-launch.yml", "utf8");
// The live Railway schema (2026-09-25) returns Boolean!, not a Deployment object.
const commands = [...workflow.matchAll(/^          railway api --compact \\\n            --raw-var "id=\$\{(?:ENABLED_DEPLOYMENT_ID|CANDIDATE_DEPLOYMENT_ID)\}" \\\n            'mutation (RollbackDeployment|RestoreDeployment)[^\n]+' \\\n            > "[^\n]+"(?:\n          jq -e [^\n]+)?/gm)];

describe("Railway rollback acceptance contract", () => {
  let directory: string;
  let environment: NodeJS.ProcessEnv;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "horeca-rollback-test-"));
    const bin = path.join(directory, "bin");
    await mkdir(bin);
    await writeFile(path.join(bin, "railway"), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(process.env.QUERY_LOG, JSON.stringify(args));
// Simulate GraphQL scalar-selection rejection from the observed live schema.
if (args.at(-1).includes('deploymentRollback(id: $id) {')) {
  console.log(JSON.stringify({errors: [{message: 'Boolean cannot have a selection set'}]}));
  process.exit(1);
}
const response = JSON.parse(process.env.API_RESPONSE);
console.log(JSON.stringify(response));
if (response.errors?.length) process.exit(1);
`, { mode: 0o700 });
    environment = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BETA_STATE_DIR: directory,
      ENABLED_DEPLOYMENT_ID: "known-enabled",
      CANDIDATE_DEPLOYMENT_ID: "known-candidate",
      QUERY_LOG: path.join(directory, "query.json"),
    };
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function run(operation: string, response: unknown) {
    const match = commands.find((command) => command[1] === operation);
    expect(match, `Missing workflow mutation ${operation}`).toBeDefined();
    const script = `set -euo pipefail\n${match![0].replace(/^ {10}/gm, "")}\nprintf 'accepted'`;
    return spawnSync("bash", ["-c", script], {
      env: { ...environment, API_RESPONSE: JSON.stringify(response) },
      encoding: "utf8", timeout: 5000,
    });
  }

  it.each(["RollbackDeployment", "RestoreDeployment"])("accepts an explicit true from %s for the intended deployment", async (operation) => {
    const result = run(operation, { data: { deploymentRollback: true } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("accepted");
    const args = JSON.parse(await readFile(environment.QUERY_LOG!, "utf8"));
    expect(args).toContain(`id=${operation === "RollbackDeployment" ? "known-enabled" : "known-candidate"}`);
  });

  it.each([
    ["RollbackDeployment", { data: { deploymentRollback: false } }],
    ["RestoreDeployment", { data: { deploymentRollback: false } }],
    ["RollbackDeployment", { data: { deploymentRollback: null } }],
    ["RestoreDeployment", { data: {} }],
    ["RollbackDeployment", { errors: [{ message: "Not authorized" }] }],
    ["RestoreDeployment", { data: { deploymentRollback: true }, errors: [{ message: "Provider error" }] }],
    ["RestoreDeployment", { data: { deploymentRollback: { id: "unexpected-object" } } }],
  ])("stops %s when the provider does not explicitly accept it (%j)", (operation, response) => {
    const result = run(operation as string, response);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("accepted");
  });
});
