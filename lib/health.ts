import { validateRuntimeConfiguration } from "@/lib/runtime-config";

type DatabaseProbe = () => Promise<unknown>;

type ReadinessOptions = {
  environment?: NodeJS.ProcessEnv;
  databaseProbe: DatabaseProbe;
  timeoutMs?: number;
};

export type ReadinessResult =
  | { ready: true; deploymentVersion: string }
  | { ready: false; failure: "configuration" | "database" };

async function withTimeout(probe: DatabaseProbe, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function checkReadiness({
  environment = process.env,
  databaseProbe,
  timeoutMs = 1_500,
}: ReadinessOptions): Promise<ReadinessResult> {
  let configuration;
  try {
    configuration = validateRuntimeConfiguration(environment);
  } catch {
    return { ready: false, failure: "configuration" };
  }

  try {
    await withTimeout(databaseProbe, timeoutMs);
  } catch {
    return { ready: false, failure: "database" };
  }

  return { ready: true, deploymentVersion: configuration.deploymentVersion };
}
