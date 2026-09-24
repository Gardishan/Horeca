import { timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { RuntimeConfigurationError, validateRuntimeConfiguration } from "../lib/runtime-config";

class BetaRuntimeValidationError extends Error {}

async function main() {
  const variablesPath = process.argv[2];
  const normalizedDatabaseUrlPath = process.argv[3];

  if (!variablesPath) throw new BetaRuntimeValidationError("Railway runtime variables JSON path is required");
  let source;
  try {
    source = await readFile(variablesPath, "utf8");
  } catch {
    throw new BetaRuntimeValidationError("Railway runtime variables file could not be read");
  }
  let variables;
  try {
    variables = JSON.parse(source);
  } catch {
    throw new BetaRuntimeValidationError("Railway runtime variables file must contain valid JSON");
  }
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new BetaRuntimeValidationError("Railway runtime variables must be a JSON object");
  }

  for (const name of ["DATABASE_URL", "AUTH_SECRET", "BETA_ACCESS_TOKEN"]) {
    if (typeof variables[name] !== "string" || variables[name].length < 1) {
      throw new BetaRuntimeValidationError(`${name} is missing from Railway runtime variables`);
    }
  }
  if (variables.AUTH_SECRET.length < 32) throw new BetaRuntimeValidationError("AUTH_SECRET is too short");
  if (variables.BETA_ACCESS_TOKEN.length < 32) throw new BetaRuntimeValidationError("BETA_ACCESS_TOKEN is too short");
  if ("RAILWAY_TOKEN" in variables) throw new BetaRuntimeValidationError("RAILWAY_TOKEN must not exist in Railway runtime variables");

  const githubBetaToken = process.env.BETA_ACCESS_TOKEN ?? "";
  if (githubBetaToken.length < 32) throw new BetaRuntimeValidationError("GitHub Environment BETA_ACCESS_TOKEN is missing or too short");
  const railwayTokenBuffer = Buffer.from(variables.BETA_ACCESS_TOKEN);
  const githubTokenBuffer = Buffer.from(githubBetaToken);
  if (
    railwayTokenBuffer.length !== githubTokenBuffer.length ||
    !timingSafeEqual(railwayTokenBuffer, githubTokenBuffer)
  ) {
    throw new BetaRuntimeValidationError("GitHub and Railway BETA_ACCESS_TOKEN values do not match");
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(variables.DATABASE_URL);
  } catch {
    throw new BetaRuntimeValidationError("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new BetaRuntimeValidationError("DATABASE_URL does not use PostgreSQL");
  }
  if (!["require", "verify-ca", "verify-full"].includes(databaseUrl.searchParams.get("sslmode") ?? "")) {
    databaseUrl.searchParams.set("sslmode", "require");
  }

  const normalizedVariables = { ...variables, DATABASE_URL: databaseUrl.toString() };
  const summary = validateRuntimeConfiguration(normalizedVariables);

  if (normalizedDatabaseUrlPath) {
    try {
      await writeFile(normalizedDatabaseUrlPath, normalizedVariables.DATABASE_URL, { mode: 0o600 });
    } catch {
      throw new BetaRuntimeValidationError("Normalized database URL could not be written");
    }
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
}

main().catch((error) => {
  console.error(
    error instanceof BetaRuntimeValidationError || error instanceof RuntimeConfigurationError
      ? error.message
      : "Beta runtime validation failed. Check the variables file and runtime configuration.",
  );
  process.exitCode = 1;
});
