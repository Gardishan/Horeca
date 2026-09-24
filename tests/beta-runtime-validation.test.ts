import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const betaToken = "synthetic-beta-token-with-more-than-32-characters";
const databasePassword = "synthetic-database-password";
const authSecret = "synthetic-auth-secret-with-more-than-32-characters";

function variables() {
  return {
    APP_ENV: "beta",
    DEPLOYMENT_VERSION: "synthetic-release",
    DATABASE_URL: `postgresql://fixture:${databasePassword}@localhost:5432/beta`,
    AUTH_SECRET: authSecret,
    BETA_ACCESS_TOKEN: betaToken,
    APP_URL: "https://beta.example.test",
    NEXT_PUBLIC_APP_URL: "https://beta.example.test",
    PRIVATE_STORAGE_MODE: "filesystem",
    PRIVATE_STORAGE_ROOT: "/app/storage/private",
    DEMO_AUTH_ENABLED: "true",
    BETA_ENABLED: "false",
    BETA_DEMO_ONLY: "true",
    BETA_REGISTRATION_ENABLED: "false",
    RATE_LIMIT_MODE: "memory",
    RATE_LIMIT_ALLOW_IN_MEMORY: "true",
    MALWARE_SCAN_MODE: "mock",
  };
}

describe("Beta runtime validation CLI redaction", () => {
  let directory: string;
  let variablesPath: string;
  let normalizedPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "horeca-beta-runtime-test-"));
    variablesPath = path.join(directory, "variables.json");
    normalizedPath = path.join(directory, "database-url");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function run() {
    return spawnSync(process.execPath, [
      "--import", "tsx", "scripts/validate-beta-runtime.mjs", variablesPath, normalizedPath,
    ], {
      env: { ...process.env, BETA_ACCESS_TOKEN: betaToken },
      encoding: "utf8",
    });
  }

  function expectSafeFailure(result: ReturnType<typeof run>, message: string) {
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(message);
    for (const secret of [databasePassword, authSecret, betaToken]) {
      expect(result.stderr).not.toContain(secret);
    }
  }

  it("validates Beta configuration and writes the normalized URL without logging credentials", async () => {
    await writeFile(variablesPath, JSON.stringify(variables()));
    const result = run();

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      appEnvironment: "beta",
      appOrigin: "https://beta.example.test",
      betaTokenParity: true,
      databaseTlsRequired: true,
    });
    const normalized = new URL(await readFile(normalizedPath, "utf8"));
    expect(normalized.searchParams.get("sslmode")).toBe("require");
    expect(normalized.password).toBe(databasePassword);
    for (const secret of [databasePassword, authSecret, betaToken]) {
      expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    }
  });

  it("redacts a malformed database URL instead of exposing the native URL error input", async () => {
    await writeFile(variablesPath, JSON.stringify({
      ...variables(),
      DATABASE_URL: `postgresql://fixture:${databasePassword}@[invalid`,
    }));

    expectSafeFailure(run(), "DATABASE_URL must be a valid PostgreSQL URL");
  });

  it("redacts malformed JSON rather than printing its secret-bearing source text", async () => {
    await writeFile(variablesPath, "LEAKjson");
    const result = run();

    expectSafeFailure(result, "Railway runtime variables file must contain valid JSON");
    expect(result.stderr).not.toContain("LEAKjson");
  });

  it.each([
    { label: "null", source: null },
    { label: "array", source: [] },
    { label: "string", source: "secret-bearing string" },
  ])("rejects a non-object variables document: $label", async ({ source }) => {
    await writeFile(variablesPath, JSON.stringify(source));

    expectSafeFailure(run(), "Railway runtime variables must be a JSON object");
  });

  it("preserves an actionable missing-secret diagnostic without a stack", async () => {
    await writeFile(variablesPath, JSON.stringify({ ...variables(), AUTH_SECRET: "" }));

    expectSafeFailure(run(), "AUTH_SECRET is missing from Railway runtime variables");
  });

  it("preserves safe runtime-policy diagnostics", async () => {
    await writeFile(variablesPath, JSON.stringify({ ...variables(), BETA_DEMO_ONLY: "false" }));

    expectSafeFailure(run(), "Invalid runtime configuration: BETA_DEMO_ONLY must be true in beta");
  });

  it("still rejects mismatched invitation secrets without printing either value", async () => {
    const mismatchedToken = "different-synthetic-token-with-more-than-32-characters";
    await writeFile(variablesPath, JSON.stringify({ ...variables(), BETA_ACCESS_TOKEN: mismatchedToken }));
    const result = run();

    expectSafeFailure(result, "GitHub and Railway BETA_ACCESS_TOKEN values do not match");
    expect(result.stderr).not.toContain(mismatchedToken);
  });

  it("redacts unexpected validation failures", async () => {
    await writeFile(variablesPath, JSON.stringify({ ...variables(), APP_ENV: 42 }));

    expectSafeFailure(run(), "Beta runtime validation failed. Check the variables file and runtime configuration.");
  });

  it("redacts errors writing the normalized credentials file", async () => {
    await writeFile(variablesPath, JSON.stringify(variables()));
    normalizedPath = directory;
    const result = run();

    expectSafeFailure(result, "Normalized database URL could not be written");
    expect(result.stderr).not.toContain(directory);
  });

  it("redacts filesystem errors and their paths", () => {
    const result = run();

    expectSafeFailure(result, "Railway runtime variables file could not be read");
    expect(result.stderr).not.toContain(directory);
  });
});
