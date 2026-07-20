import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { startNodeRuntime } from "@/lib/runtime-startup";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("server startup instrumentation", () => {
  it("terminates a Node runtime with invalid production configuration", () => {
    const environment = {
      NODE_ENV: "production",
      APP_ENV: "production",
      AUTH_SECRET: "secret-value-that-must-never-appear-in-the-log",
      DATABASE_URL: "",
    } as NodeJS.ProcessEnv;
    const logger = { error: vi.fn(), info: vi.fn() };
    const terminate = vi.fn((() => {
      throw new Error("exit:1");
    }) as never);

    expect(() => startNodeRuntime(environment, logger, terminate)).toThrow("exit:1");

    expect(terminate).toHaveBeenCalledWith(1);
    const logged = String(logger.error.mock.calls[0]?.[0]);
    expect(logged).toContain("runtime_configuration_invalid");
    expect(logged).toContain("DATABASE_URL");
    expect(logged).not.toContain("secret-value-that-must-never-appear-in-the-log");
  });

  it("does nothing in a non-Node runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(register()).resolves.toBeUndefined();

    expect(infoLog).not.toHaveBeenCalled();
  });
});
