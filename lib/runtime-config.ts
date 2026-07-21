import path from "node:path";

type ApplicationEnvironment = "development" | "test" | "staging" | "production";
export type RuntimeConfigurationSummary = {
  appEnvironment: ApplicationEnvironment;
  appOrigin: string;
  deploymentVersion: string;
  malwareScanMode: "mock" | "remote";
  rateLimitMode: "memory" | "remote";
  storageRoot: string;
};

const applicationEnvironments = new Set<ApplicationEnvironment>([
  "development",
  "test",
  "staging",
  "production",
]);

export class RuntimeConfigurationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid runtime configuration: ${issues.join("; ")}`);
    this.name = "RuntimeConfigurationError";
    this.issues = issues;
  }
}

function required(
  environment: NodeJS.ProcessEnv,
  name: string,
  issues: string[],
): string {
  const value = environment[name]?.trim();
  if (!value) issues.push(`${name} is required`);
  return value ?? "";
}

function configuredUrl(name: string, value: string, issues: string[]): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    issues.push(`${name} must be a valid URL`);
    return null;
  }
}

function resolveApplicationEnvironment(
  environment: NodeJS.ProcessEnv,
  issues: string[],
): ApplicationEnvironment {
  const configured = environment.APP_ENV?.trim();
  if (configured && applicationEnvironments.has(configured as ApplicationEnvironment)) {
    return configured as ApplicationEnvironment;
  }
  if (configured) {
    issues.push("APP_ENV must be development, test, staging or production");
    return "development";
  }
  if (environment.NODE_ENV === "production") {
    issues.push("APP_ENV is required for a production Node process");
    return "production";
  }
  return environment.NODE_ENV === "test" ? "test" : "development";
}

function validateApplicationUrl(
  name: string,
  url: URL | null,
  deployed: boolean,
  issues: string[],
) {
  if (!url) return;
  if (deployed && url.protocol !== "https:") {
    issues.push(`${name} must use HTTPS in staging and production`);
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    issues.push(`${name} must contain only the application origin`);
  }
}

export function validateRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfigurationSummary {
  const issues: string[] = [];
  const appEnvironment = resolveApplicationEnvironment(environment, issues);
  const deployed = appEnvironment === "staging" || appEnvironment === "production";

  const deploymentVersion = environment.DEPLOYMENT_VERSION?.trim() || "local";
  if (deployed && deploymentVersion === "local") {
    issues.push("DEPLOYMENT_VERSION is required in staging and production");
  }

  const databaseUrlValue = required(environment, "DATABASE_URL", issues);
  const databaseUrl = configuredUrl("DATABASE_URL", databaseUrlValue, issues);
  if (databaseUrl && !["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    issues.push("DATABASE_URL must use the PostgreSQL protocol");
  }
  if (databaseUrl && deployed) {
    const sslMode = databaseUrl.searchParams.get("sslmode");
    if (!sslMode || !["require", "verify-ca", "verify-full"].includes(sslMode)) {
      issues.push("DATABASE_URL must require TLS in staging and production");
    }
  }

  const authSecret = required(environment, "AUTH_SECRET", issues);
  if (authSecret && authSecret.length < 32) {
    issues.push("AUTH_SECRET must contain at least 32 characters");
  }

  const appUrl = configuredUrl("APP_URL", required(environment, "APP_URL", issues), issues);
  const publicAppUrl = configuredUrl(
    "NEXT_PUBLIC_APP_URL",
    required(environment, "NEXT_PUBLIC_APP_URL", issues),
    issues,
  );
  validateApplicationUrl("APP_URL", appUrl, deployed, issues);
  validateApplicationUrl("NEXT_PUBLIC_APP_URL", publicAppUrl, deployed, issues);
  if (appUrl && publicAppUrl && appUrl.origin !== publicAppUrl.origin) {
    issues.push("APP_URL and NEXT_PUBLIC_APP_URL must have the same origin");
  }

  const storageRoot = required(environment, "PRIVATE_STORAGE_ROOT", issues);
  if (storageRoot && deployed && !path.isAbsolute(storageRoot)) {
    issues.push("PRIVATE_STORAGE_ROOT must be absolute in staging and production");
  }

  const configuredRateLimitMode = environment.RATE_LIMIT_MODE?.trim();
  const rateLimitMode = configuredRateLimitMode === "remote" ? "remote" : "memory";
  if (configuredRateLimitMode && !["memory", "remote"].includes(configuredRateLimitMode)) {
    issues.push("RATE_LIMIT_MODE must be memory or remote");
  }
  if (deployed && rateLimitMode !== "remote") {
    issues.push("RATE_LIMIT_MODE must be remote in staging and production");
  }
  if (deployed && environment.RATE_LIMIT_ALLOW_IN_MEMORY !== "false") {
    issues.push("RATE_LIMIT_ALLOW_IN_MEMORY must be false in staging and production");
  }

  if (rateLimitMode === "remote") {
    const backendUrl = configuredUrl(
      "RATE_LIMIT_BACKEND_URL",
      required(environment, "RATE_LIMIT_BACKEND_URL", issues),
      issues,
    );
    if (backendUrl && backendUrl.protocol !== "https:") {
      issues.push("RATE_LIMIT_BACKEND_URL must use HTTPS");
    }
    const backendToken = required(environment, "RATE_LIMIT_BACKEND_TOKEN", issues);
    if (backendToken && backendToken.length < 32) {
      issues.push("RATE_LIMIT_BACKEND_TOKEN must contain at least 32 characters");
    }
  }

  if (deployed && environment.DEMO_AUTH_ENABLED !== "false") {
    issues.push("DEMO_AUTH_ENABLED must be false in staging and production");
  }

  const configuredMalwareScanMode = environment.MALWARE_SCAN_MODE?.trim();
  const malwareScanMode = configuredMalwareScanMode === "remote" ? "remote" : "mock";
  if (configuredMalwareScanMode && !["mock", "remote"].includes(configuredMalwareScanMode)) {
    issues.push("MALWARE_SCAN_MODE must be mock or remote");
  }
  if (deployed && malwareScanMode !== "remote") {
    issues.push("MALWARE_SCAN_MODE must be remote in staging and production");
  }

  const scannerUrlValue = malwareScanMode === "remote"
    ? required(environment, "MALWARE_SCAN_BACKEND_URL", issues)
    : environment.MALWARE_SCAN_BACKEND_URL?.trim() ?? "";
  const scannerUrl = configuredUrl("MALWARE_SCAN_BACKEND_URL", scannerUrlValue, issues);
  if (scannerUrl && scannerUrl.protocol !== "https:") {
    issues.push("MALWARE_SCAN_BACKEND_URL must use HTTPS");
  }
  if (scannerUrl && (scannerUrl.username || scannerUrl.password)) {
    issues.push("MALWARE_SCAN_BACKEND_URL must not contain credentials");
  }

  const scannerToken = malwareScanMode === "remote"
    ? required(environment, "MALWARE_SCAN_BACKEND_TOKEN", issues)
    : environment.MALWARE_SCAN_BACKEND_TOKEN?.trim() ?? "";
  if (scannerToken && scannerToken.length < 32) {
    issues.push("MALWARE_SCAN_BACKEND_TOKEN must contain at least 32 characters");
  }

  const scannerTimeoutValue = malwareScanMode === "remote"
    ? required(environment, "MALWARE_SCAN_TIMEOUT_MS", issues)
    : environment.MALWARE_SCAN_TIMEOUT_MS?.trim() ?? "";
  if (scannerTimeoutValue) {
    const scannerTimeoutMs = Number(scannerTimeoutValue);
    if (
      !Number.isInteger(scannerTimeoutMs) ||
      scannerTimeoutMs < 1_000 ||
      scannerTimeoutMs > 60_000
    ) {
      issues.push("MALWARE_SCAN_TIMEOUT_MS must be an integer from 1000 to 60000");
    }
  }

  if (issues.length > 0) throw new RuntimeConfigurationError(issues);

  return {
    appEnvironment,
    appOrigin: appUrl?.origin ?? "",
    deploymentVersion,
    malwareScanMode,
    rateLimitMode,
    storageRoot,
  };
}

export function assertDemoSeedAllowed(environment: NodeJS.ProcessEnv = process.env) {
  const appEnvironment = environment.APP_ENV;
  if (
    appEnvironment === "staging" ||
    appEnvironment === "production" ||
    (!appEnvironment && environment.NODE_ENV === "production")
  ) {
    throw new Error("Demo seed is disabled in staging and production");
  }
}
