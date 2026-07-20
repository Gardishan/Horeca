import { describe, expect, it } from "vitest";
import {
  RuntimeConfigurationError,
  assertDemoSeedAllowed,
  validateRuntimeConfiguration,
} from "@/lib/runtime-config";

function productionEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    APP_ENV: "production",
    DEPLOYMENT_VERSION: "e6a1451",
    DATABASE_URL:
      "postgresql://horeca:database-secret@db.example.kz:5432/horeca?sslmode=verify-full",
    AUTH_SECRET: "auth-secret-that-is-long-enough-and-must-never-leak",
    APP_URL: "https://horeca.example.kz",
    NEXT_PUBLIC_APP_URL: "https://horeca.example.kz",
    PRIVATE_STORAGE_ROOT: "/var/lib/horeca/private",
    DEMO_AUTH_ENABLED: "false",
    RATE_LIMIT_MODE: "remote",
    RATE_LIMIT_ALLOW_IN_MEMORY: "false",
    RATE_LIMIT_BACKEND_URL: "https://rate-limit.example.kz/consume",
    RATE_LIMIT_BACKEND_TOKEN: "rate-limit-secret-that-must-never-leak",
  };
}

describe("runtime configuration", () => {
  it("accepts a secure deployed configuration and returns only a safe summary", () => {
    const environment = productionEnvironment();
    const summary = validateRuntimeConfiguration(environment);

    expect(summary).toEqual({
      appEnvironment: "production",
      appOrigin: "https://horeca.example.kz",
      deploymentVersion: "e6a1451",
      rateLimitMode: "remote",
      storageRoot: "/var/lib/horeca/private",
    });
    expect(JSON.stringify(summary)).not.toContain("database-secret");
    expect(JSON.stringify(summary)).not.toContain("auth-secret");
    expect(JSON.stringify(summary)).not.toContain("rate-limit-secret");
  });

  it("rejects an insecure deployed configuration without echoing secret values", () => {
    const environment = productionEnvironment();
    Object.assign(environment, {
      DEPLOYMENT_VERSION: "",
      DATABASE_URL: "postgresql://horeca:do-not-leak@localhost:5432/horeca",
      AUTH_SECRET: "do-not-leak",
      APP_URL: "http://horeca.example.kz/path?debug=true",
      NEXT_PUBLIC_APP_URL: "https://other.example.kz",
      PRIVATE_STORAGE_ROOT: "./storage/private",
      DEMO_AUTH_ENABLED: "true",
      RATE_LIMIT_MODE: "memory",
      RATE_LIMIT_ALLOW_IN_MEMORY: "true",
      RATE_LIMIT_BACKEND_URL: "http://rate-limit.example.kz/consume",
      RATE_LIMIT_BACKEND_TOKEN: "also-do-not-leak",
    });

    let error: unknown;
    try {
      validateRuntimeConfiguration(environment);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(RuntimeConfigurationError);
    expect(error).toMatchObject({
      issues: expect.arrayContaining([
        expect.stringContaining("DEPLOYMENT_VERSION"),
        expect.stringContaining("DATABASE_URL"),
        expect.stringContaining("AUTH_SECRET"),
        expect.stringContaining("APP_URL"),
        expect.stringContaining("NEXT_PUBLIC_APP_URL"),
        expect.stringContaining("PRIVATE_STORAGE_ROOT"),
        expect.stringContaining("DEMO_AUTH_ENABLED"),
        expect.stringContaining("RATE_LIMIT_MODE"),
        expect.stringContaining("RATE_LIMIT_ALLOW_IN_MEMORY"),
      ]),
    });
    expect(String(error)).not.toContain("do-not-leak");
    expect(JSON.stringify(error)).not.toContain("do-not-leak");
  });

  it("supports an explicit local test environment with an in-memory limiter", () => {
    expect(
      validateRuntimeConfiguration({
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
      }),
    ).toMatchObject({ appEnvironment: "test", rateLimitMode: "memory" });
  });

  it("requires an explicit APP_ENV for a production Node process", () => {
    const environment = productionEnvironment();
    delete environment.APP_ENV;

    expect(() => validateRuntimeConfiguration(environment)).toThrowError(/APP_ENV/);
  });

  it("rejects malformed URLs and unsupported database schemes", () => {
    const environment = productionEnvironment();
    environment.DATABASE_URL = "mysql://db.example.kz/horeca";
    environment.APP_URL = "not-a-url";
    environment.NEXT_PUBLIC_APP_URL = "not-a-url";
    environment.RATE_LIMIT_BACKEND_URL = "not-a-url";

    expect(() => validateRuntimeConfiguration(environment)).toThrowError(
      RuntimeConfigurationError,
    );
  });

  it("prevents demo seed data in staging and production", () => {
    expect(() =>
      assertDemoSeedAllowed({ APP_ENV: "production", NODE_ENV: "production" }),
    ).toThrowError(
      /Demo seed/,
    );
    expect(() =>
      assertDemoSeedAllowed({ APP_ENV: "staging", NODE_ENV: "production" }),
    ).toThrowError(/Demo seed/);
    expect(() => assertDemoSeedAllowed({ APP_ENV: "test", NODE_ENV: "test" })).not.toThrow();
  });
});
