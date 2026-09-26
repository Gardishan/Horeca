import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// An unreachable local port: the script must get past compilation and the
// environment guard, then fail on the database without printing a password.
const unreachableDatabase = "postgresql://horeca@127.0.0.1:1/horeca_rotate?schema=public&connect_timeout=2";

function rotate(overrides: Record<string, string | undefined>) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/rotate-demo-admin.ts"], {
    env: { ...process.env, DATABASE_URL: unreachableDatabase, DEMO_ADMIN_PASSWORD: undefined, ...overrides },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("db:rotate-admin script", () => {
  it("refuses staging and production before touching the database", () => {
    for (const APP_ENV of ["staging", "production"]) {
      const result = rotate({ APP_ENV });

      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("Demo seed is disabled in staging and production");
      expect(result.stderr).not.toContain("Top-level await");
      expect(result.stdout).not.toContain("пароль:");
    }
  }, 60_000);

  it("runs in a demo environment and exits non-zero without a password when the database is unreachable", () => {
    const result = rotate({ APP_ENV: "test" });

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).not.toContain("Top-level await");
    expect(result.stderr).not.toContain("Demo seed is disabled");
    expect(result.stderr).toMatch(/Can't reach database server|127\.0\.0\.1:1/);
    expect(result.stdout).not.toContain("пароль:");
  }, 60_000);
});
