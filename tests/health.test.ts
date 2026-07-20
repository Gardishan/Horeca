import { describe, expect, it, vi } from "vitest";
import { checkReadiness } from "@/lib/health";

const testEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  APP_ENV: "test",
  DEPLOYMENT_VERSION: "vitest",
  DATABASE_URL: "postgresql://horeca:horeca@localhost:5432/horeca",
  AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
  APP_URL: "http://127.0.0.1:3100",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  PRIVATE_STORAGE_ROOT: "./storage/private",
  DEMO_AUTH_ENABLED: "true",
  RATE_LIMIT_MODE: "memory",
  RATE_LIMIT_ALLOW_IN_MEMORY: "true",
};

describe("readiness", () => {
  it("is ready only after configuration and database checks succeed", async () => {
    const databaseProbe = vi.fn().mockResolvedValue([{ result: 1 }]);

    await expect(
      checkReadiness({ environment: testEnvironment, databaseProbe }),
    ).resolves.toEqual({
      ready: true,
      deploymentVersion: "vitest",
    });
    expect(databaseProbe).toHaveBeenCalledOnce();
  });

  it("fails safely when runtime configuration is invalid", async () => {
    const databaseProbe = vi.fn().mockResolvedValue([{ result: 1 }]);

    await expect(
      checkReadiness({ environment: { ...testEnvironment, AUTH_SECRET: "short" }, databaseProbe }),
    ).resolves.toEqual({ ready: false, failure: "configuration" });
    expect(databaseProbe).not.toHaveBeenCalled();
  });

  it("fails safely when the database is unavailable", async () => {
    const databaseProbe = vi.fn().mockRejectedValue(new Error("database password leak"));

    const result = await checkReadiness({ environment: testEnvironment, databaseProbe });

    expect(result).toEqual({ ready: false, failure: "database" });
    expect(JSON.stringify(result)).not.toContain("password leak");
  });

  it("bounds the database probe with a timeout", async () => {
    const databaseProbe = vi.fn(() => new Promise(() => undefined));

    await expect(
      checkReadiness({ environment: testEnvironment, databaseProbe, timeoutMs: 5 }),
    ).resolves.toEqual({ ready: false, failure: "database" });
  });
});
