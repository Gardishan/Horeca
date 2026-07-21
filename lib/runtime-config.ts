import path from "node:path";

type ApplicationEnvironment = "development" | "test" | "staging" | "production";
export type RuntimeConfigurationSummary = {
  appEnvironment: ApplicationEnvironment;
  appOrigin: string;
  deploymentVersion: string;
  malwareScanMode: "mock" | "remote";
  rateLimitMode: "memory" | "remote";
  storageMode: "filesystem" | "s3";
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

function isValidBucketName(bucket: string) {
  return (
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) &&
    !bucket.includes("..") &&
    !bucket.includes(".-") &&
    !bucket.includes("-.") &&
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)
  );
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

  const configuredStorageMode = environment.PRIVATE_STORAGE_MODE?.trim();
  const storageMode = configuredStorageMode === "s3" ? "s3" : "filesystem";
  if (configuredStorageMode && !["filesystem", "s3"].includes(configuredStorageMode)) {
    issues.push("PRIVATE_STORAGE_MODE must be filesystem or s3");
  }
  if (deployed && storageMode !== "s3") {
    issues.push("PRIVATE_STORAGE_MODE must be s3 in staging and production");
  }

  const storageRoot = storageMode === "filesystem"
    ? required(environment, "PRIVATE_STORAGE_ROOT", issues)
    : environment.PRIVATE_STORAGE_ROOT?.trim() ?? "";
  if (storageRoot && deployed && !path.isAbsolute(storageRoot)) {
    issues.push("PRIVATE_STORAGE_ROOT must be absolute in staging and production");
  }

  const s3VariableNames = [
    "PRIVATE_STORAGE_S3_ENDPOINT",
    "PRIVATE_STORAGE_S3_REGION",
    "PRIVATE_STORAGE_S3_BUCKET",
    "PRIVATE_STORAGE_S3_FORCE_PATH_STYLE",
    "PRIVATE_STORAGE_S3_SSE",
    "PRIVATE_STORAGE_S3_KMS_KEY_ID",
  ] as const;
  const s3ConfigurationPresent = storageMode === "s3" || s3VariableNames.some(
    (name) => Boolean(environment[name]?.trim()),
  );
  if (s3ConfigurationPresent) {
    const s3EndpointValue = required(environment, "PRIVATE_STORAGE_S3_ENDPOINT", issues);
    const s3Endpoint = configuredUrl("PRIVATE_STORAGE_S3_ENDPOINT", s3EndpointValue, issues);
    if (s3Endpoint && s3Endpoint.protocol !== "https:") {
      issues.push("PRIVATE_STORAGE_S3_ENDPOINT must use HTTPS");
    }
    if (s3Endpoint && (s3Endpoint.username || s3Endpoint.password)) {
      issues.push("PRIVATE_STORAGE_S3_ENDPOINT must not contain credentials");
    }
    if (s3Endpoint && (s3Endpoint.pathname !== "/" || s3Endpoint.search || s3Endpoint.hash)) {
      issues.push("PRIVATE_STORAGE_S3_ENDPOINT must contain only the service origin");
    }

    const s3Region = required(environment, "PRIVATE_STORAGE_S3_REGION", issues);
    if (s3Region && !/^[a-zA-Z0-9-]{1,64}$/.test(s3Region)) {
      issues.push("PRIVATE_STORAGE_S3_REGION must be a valid region identifier");
    }

    const s3Bucket = required(environment, "PRIVATE_STORAGE_S3_BUCKET", issues);
    if (s3Bucket && !isValidBucketName(s3Bucket)) {
      issues.push("PRIVATE_STORAGE_S3_BUCKET must be a valid DNS-compatible bucket name");
    }

    const forcePathStyle = required(
      environment,
      "PRIVATE_STORAGE_S3_FORCE_PATH_STYLE",
      issues,
    );
    if (forcePathStyle && !["true", "false"].includes(forcePathStyle)) {
      issues.push("PRIVATE_STORAGE_S3_FORCE_PATH_STYLE must be true or false");
    }

    const encryption = required(environment, "PRIVATE_STORAGE_S3_SSE", issues);
    if (encryption && !["AES256", "aws:kms"].includes(encryption)) {
      issues.push("PRIVATE_STORAGE_S3_SSE must be AES256 or aws:kms");
    }
    const kmsKeyId = environment.PRIVATE_STORAGE_S3_KMS_KEY_ID?.trim() ?? "";
    if (encryption === "aws:kms" && !kmsKeyId) {
      issues.push("PRIVATE_STORAGE_S3_KMS_KEY_ID is required when PRIVATE_STORAGE_S3_SSE is aws:kms");
    }
    if (encryption === "AES256" && kmsKeyId) {
      issues.push("PRIVATE_STORAGE_S3_KMS_KEY_ID must be empty when PRIVATE_STORAGE_S3_SSE is AES256");
    }
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
    storageMode,
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
