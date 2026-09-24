import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/beta-launch.yml", "utf8");

function shellStep(name: string) {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `      - name: ${name}`);
  if (start < 0) throw new Error(`Missing workflow step: ${name}`);
  const run = lines.findIndex((line, index) => index > start && line === "        run: |");
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line && !line.startsWith("          ")) break;
    body.push(line.slice(10));
  }
  return body.join("\n");
}

const setup = shellStep("Prepare registered SSH identity and relay host trust")
  .replaceAll("${HOME}/.ssh", "${SSH_TEST_HOME}/.ssh");
const provider = shellStep("Verify main and inspect Railway read-only state");
const probe = provider.slice(provider.indexOf('ssh_probe="'), provider.indexOf("railway domain list"));

let root: string;
let privateKey: string;
let hostRecord: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "horeca-ssh-test-"));
  const keyPath = join(root, "synthetic-key");
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyPath]);
  privateKey = readFileSync(keyPath, "utf8");
  const [algorithm, publicKey] = readFileSync(`${keyPath}.pub`, "utf8").split(" ");
  hostRecord = `ssh.railway.com ${algorithm} ${publicKey}\n`;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function runSetup(knownHosts: string, key = privateKey) {
  const directory = mkdtempSync(join(root, "case-"));
  const result = spawnSync("bash", ["-c", setup], {
    encoding: "utf8",
    env: {
      ...process.env,
      SSH_TEST_HOME: join(directory, "home"),
      RUNNER_TEMP: join(directory, "runner"),
      GITHUB_ENV: join(directory, "github-env"),
      BETA_SSH_PRIVATE_KEY: key,
      BETA_SSH_KNOWN_HOSTS: knownHosts,
    },
  });
  return { ...result, directory };
}

describe("Beta SSH trust setup", () => {
  it("uses host-scoped initial trust without an operator pin and keeps key material private", () => {
    const result = runSetup("");
    const keyPath = join(result.directory, "runner/horeca-beta-launch/ssh/id_ed25519");
    const configPath = join(result.directory, "home/.ssh/config");

    expect(result.status).toBe(0);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(result.stdout + result.stderr).not.toContain(privateKey);
    expect(readFileSync(join(result.directory, "runner/horeca-beta-launch/ssh/known_hosts"), "utf8")).toBe("");
    const config = execFileSync("ssh", ["-G", "-T", "-F", configPath, "ssh.railway.com"], { encoding: "utf8" });
    expect(config).toContain("stricthostkeychecking accept-new");
    expect(config).toContain("batchmode yes");
    expect(config).toContain("identitiesonly yes");
  });

  it("requires the supplied relay pin with strict checking when an operator provides one", () => {
    const result = runSetup(hostRecord);

    expect(result.status).toBe(0);
    const config = execFileSync("ssh", ["-G", "-T", "-F", join(result.directory, "home/.ssh/config"), "ssh.railway.com"], { encoding: "utf8" });
    expect(config).toMatch(/stricthostkeychecking (true|yes)/);
    expect(readFileSync(join(result.directory, "github-env"), "utf8")).toContain("BETA_SSH_TRUST_MODE=pinned");
  });

  it.each(["missing", "invalid"])("rejects a %s private key", (kind) => {
    const result = runSetup("", kind === "missing" ? "" : "synthetic-invalid-key");

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toContain(privateKey);
  });

  it("rejects a supplied pin for a different host instead of falling back to initial trust", () => {
    const result = runSetup(hostRecord.replace("ssh.railway.com", "unrelated.example.test"));

    expect(result.status).not.toBe(0);
  });

  it.each([
    ["successful probe", "horeca-beta-ssh-fixture", "0", true],
    ["empty response", "", "0", false],
    ["unroutable relay response", '{"status":"pending"}', "0", false],
    ["failed connection", "", "1", false],
  ])("logs an observed fingerprint only after a %s", (_label, response, exitCode, success) => {
    const directory = mkdtempSync(join(root, "probe-"));
    const knownHosts = join(directory, "known_hosts");
    writeFileSync(knownHosts, hostRecord);
    mkdirSync(join(directory, "state"));
    const result = spawnSync("bash", ["-c", [
      "set -euo pipefail",
      'state_dir="${TEST_STATE_DIR}"',
      "database_service_id=synthetic-database",
      'railway() { printf "%s" "$TEST_PROBE_OUTPUT"; return "$TEST_PROBE_EXIT"; }',
      probe,
    ].join("\n")], {
      encoding: "utf8",
      env: {
        ...process.env,
        TEST_STATE_DIR: join(directory, "state"),
        TEST_PROBE_OUTPUT: response,
        TEST_PROBE_EXIT: exitCode,
        GITHUB_RUN_ID: "fixture",
        BETA_SSH_KEY_PATH: join(root, "synthetic-key"),
        BETA_SSH_TRUST_MODE: "initial-use",
        BETA_SSH_KNOWN_HOSTS_PATH: knownHosts,
      },
    });

    expect(result.status === 0).toBe(success);
    expect(result.stdout.includes("first-observed host fingerprint (TOFU): SHA256:")).toBe(success);
    expect(result.stdout + result.stderr).not.toContain(privateKey);
  });
});
