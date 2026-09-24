import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/beta-launch.yml", "utf8");
const cleanup = /      - name: Disable Beta after an unsuccessful launch\n([\s\S]*?)(?=\n      - name: Remove ephemeral SSH material)/.exec(workflow)?.[1];

describe("Beta launch failure cleanup", () => {
  let directory: string;
  let commandLog: string;
  let script: string;
  let environment: NodeJS.ProcessEnv;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "horeca-beta-cleanup-"));
    const bin = path.join(directory, "bin");
    const state = path.join(directory, "state");
    await mkdir(bin);
    await mkdir(state);
    commandLog = path.join(directory, "commands.jsonl");
    await writeFile(commandLog, "");
    const railway = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(args) + '\\n');
const scenario = process.env.FIXTURE_SCENARIO;
function fail() { console.error(process.env.RAILWAY_TOKEN); process.exit(1); }
if (args[0] === 'variable') {
  if (scenario === 'variable-failure') fail();
  console.log('{}');
} else if (args[0] === 'redeploy') {
  if (scenario === 'redeploy-failure') fail();
  console.log('{}');
} else if (args[0] === 'deployment' && args[1] === 'list') {
  const counter = process.env.BETA_STATE_DIR + '/fixture-count';
  const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
  fs.writeFileSync(counter, String(count + 1));
  if (count === 0 && scenario === 'snapshot-failure') fail();
  const rows = [{ id: 'old-enabled', status: 'SUCCESS', createdAt: '2026-09-01' }];
  if (count > 0 && scenario !== 'stale') rows.push({id: 'new-disabled', status: scenario === 'terminal-failure' ? 'FAILED' : count === 1 ? 'DEPLOYING' : 'SUCCESS', createdAt: '2026-09-02'});
  console.log(JSON.stringify(rows));
} else { fail(); }
`;
    await writeFile(path.join(bin, "railway"), railway, { mode: 0o700 });
    await writeFile(path.join(bin, "timeout"), '#!/bin/bash\nshift\nexec "$@"\n', { mode: 0o700 });
    await writeFile(path.join(bin, "sleep"), "#!/bin/bash\nexit 0\n", { mode: 0o700 });
    await writeFile(path.join(bin, "node"), '#!/bin/bash\nprintf "smoke:%s\\n" "$*" >> "$FIXTURE_LOG"\nif [ "$FIXTURE_SCENARIO" = "smoke-failure" ]; then echo "$RAILWAY_TOKEN" >&2; exit 1; fi\necho "{\\"checks\\":[\\"traffic kill switch closed\\"]}"\n', { mode: 0o700 });
    script = path.join(directory, "cleanup.sh");
    const block = cleanup?.split("        run: |\n")[1];
    await writeFile(script, block ? block.split("\n").map((line) => line.replace(/^          /, "")).join("\n") : "exit 99");
    environment = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`,
      BETA_ENABLE_ATTEMPTED: "true", BETA_STATE_DIR: state,
      APP_SERVICE_ID: "beta-service", BETA_BASE_URL: "https://beta.example.test",
      RAILWAY_TOKEN: "synthetic-project-token-must-not-leak",
      BETA_ACCESS_TOKEN: "synthetic-beta-token-must-not-leak",
      GITHUB_STEP_SUMMARY: path.join(directory, "summary.md"),
      FIXTURE_LOG: commandLog, FIXTURE_SCENARIO: "success",
    };
  });
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  function run(overrides: Record<string, string | undefined> = {}) {
    return spawnSync("bash", [script], { env: { ...environment, ...overrides }, encoding: "utf8", timeout: 15_000 });
  }

  it("records enabling before its mutation and gates cleanup on this run failing or cancelling", () => {
    expect(cleanup).toBeDefined();
    expect(cleanup).toContain("always() && (failure() || cancelled()) && env.BETA_ENABLE_ATTEMPTED == 'true'");
    const flag = workflow.indexOf('echo "BETA_ENABLE_ATTEMPTED=true" >> "${GITHUB_ENV}"');
    expect(flag).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(workflow.indexOf('railway variable set "BETA_ENABLED=true"'));
  });

  it("does not touch an older Beta when this run never attempted enabling", async () => {
    const result = run({ BETA_ENABLE_ATTEMPTED: "" });
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(commandLog, "utf8")).toBe("");
  });

  it("disables traffic, waits for a new deployment and verifies the external kill switch", async () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const commands = await readFile(commandLog, "utf8");
    expect(commands).toContain('["variable","set","BETA_ENABLED=false","--environment","beta","--service","beta-service","--skip-deploys","--json"]');
    expect(commands).toContain('["redeploy","--environment","beta","--service","beta-service","--yes","--json"]');
    expect(commands).toContain("smoke:scripts/smoke-beta-external.mjs preflight");
    expect(await readFile(environment.GITHUB_STEP_SUMMARY!, "utf8")).toContain("new-disabled");
  });

  it.each(["variable-failure", "redeploy-failure", "snapshot-failure", "terminal-failure", "stale", "smoke-failure"])("fails visibly without exposing raw output for %s", async (scenario) => {
    const result = run({ FIXTURE_SCENARIO: scenario });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Beta safety shutdown could not be verified");
    expect(`${result.stdout}${result.stderr}`).not.toContain("synthetic-project-token");
    expect(`${result.stdout}${result.stderr}`).not.toContain("synthetic-beta-token");
    const commands = await readFile(commandLog, "utf8");
    if (scenario === "snapshot-failure") {
      expect(commands).toContain('"BETA_ENABLED=false"');
      expect(commands).toContain('["redeploy"');
    }
    if (scenario === "variable-failure") expect(commands).not.toContain('["redeploy"');
    if (["terminal-failure", "stale", "snapshot-failure"].includes(scenario)) expect(commands).not.toContain("smoke:");
  });
});
