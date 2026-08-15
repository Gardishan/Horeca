import { timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { validateRuntimeConfiguration } from "../lib/runtime-config";

const variablesPath = process.argv[2];
const normalizedDatabaseUrlPath = process.argv[3];

if (!variablesPath) throw new Error("Railway runtime variables JSON path is required");
const variables = JSON.parse(await readFile(variablesPath, "utf8"));

for (const name of ["DATABASE_URL", "AUTH_SECRET", "BETA_ACCESS_TOKEN"]) {
  if (typeof variables[name] !== "string" || variables[name].length < 1) {
    throw new Error(`${name} is missing from Railway runtime variables`);
  }
}
if (variables.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET is too short");
if (variables.BETA_ACCESS_TOKEN.length < 32) throw new Error("BETA_ACCESS_TOKEN is too short");
if ("RAILWAY_TOKEN" in variables) throw new Error("RAILWAY_TOKEN must not exist in Railway runtime variables");

const githubBetaToken = process.env.BETA_ACCESS_TOKEN ?? "";
if (githubBetaToken.length < 32) throw new Error("GitHub Environment BETA_ACCESS_TOKEN is missing or too short");
const railwayTokenBuffer = Buffer.from(variables.BETA_ACCESS_TOKEN);
const githubTokenBuffer = Buffer.from(githubBetaToken);
if (
  railwayTokenBuffer.length !== githubTokenBuffer.length ||
  !timingSafeEqual(railwayTokenBuffer, githubTokenBuffer)
) {
  throw new Error("GitHub and Railway BETA_ACCESS_TOKEN values do not match");
}

const databaseUrl = new URL(variables.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
  throw new Error("DATABASE_URL does not use PostgreSQL");
}
if (!["require", "verify-ca", "verify-full"].includes(databaseUrl.searchParams.get("sslmode") ?? "")) {
  databaseUrl.searchParams.set("sslmode", "require");
}

const normalizedVariables = { ...variables, DATABASE_URL: databaseUrl.toString() };
const summary = validateRuntimeConfiguration(normalizedVariables);

if (normalizedDatabaseUrlPath) {
  await writeFile(normalizedDatabaseUrlPath, normalizedVariables.DATABASE_URL, { mode: 0o600 });
}

console.log(JSON.stringify({
  ok: true,
  appEnvironment: summary.appEnvironment,
  appOrigin: summary.appOrigin,
  deploymentVersion: summary.deploymentVersion,
  storageMode: summary.storageMode,
  rateLimitMode: summary.rateLimitMode,
  malwareScanMode: summary.malwareScanMode,
  databaseTlsRequired: true,
  runtimeSecretsPresent: ["DATABASE_URL", "AUTH_SECRET", "BETA_ACCESS_TOKEN"],
  betaTokenParity: true,
  railwayTokenAbsentFromRuntime: true,
}, null, 2));
