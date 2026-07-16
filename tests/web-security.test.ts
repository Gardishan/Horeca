import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildStaticSecurityHeaders,
  createCspNonce,
} from "@/lib/web-security";

describe("web security headers", () => {
  it("creates a fresh CSP nonce for every request", () => {
    const first = createCspNonce();
    const second = createCspNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(second).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(first).not.toBe(second);
  });

  it("builds a strict production policy around the request nonce", () => {
    const policy = buildContentSecurityPolicy("dGVzdC1ub25jZQ==");
    expect(policy).toContain("script-src 'self' 'nonce-dGVzdC1ub25jZQ==' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'nonce-dGVzdC1ub25jZQ=='");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("allows only the development evaluator exception outside production", () => {
    const policy = buildContentSecurityPolicy("dGVzdA==", true);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("'unsafe-inline'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("emits HSTS only for production headers", () => {
    const production = new Map(buildStaticSecurityHeaders(true).map(({ key, value }) => [key, value]));
    const development = new Map(buildStaticSecurityHeaders(false).map(({ key, value }) => [key, value]));
    expect(production.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(development.has("Strict-Transport-Security")).toBe(false);
    expect(production.get("Permissions-Policy")).toContain("browsing-topics=()");
  });

  it("rejects a nonce that could inject a directive", () => {
    expect(() => buildContentSecurityPolicy("bad'; script-src *")).toThrow(/nonce/i);
  });
});
