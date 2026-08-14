import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";

export const BETA_ACCESS_COOKIE = "horeca_beta_access";
export const BETA_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 8;

export type BetaGateDecision = "allow" | "redirect" | "unauthorized" | "unavailable";

const BETA_COOKIE_CONTEXT = "horeca-kz-controlled-beta-access-v2";
const BETA_EXEMPT_PATHS = new Set([
  "/beta-access",
  "/api/beta-access",
  "/api/health/live",
  "/api/health/ready",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

export function isBetaEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return environment.APP_ENV === "beta";
}

export function isBetaDemoOnly(environment: NodeJS.ProcessEnv = process.env) {
  return isBetaEnvironment(environment) && environment.BETA_DEMO_ONLY === "true";
}

function requiredSecret(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  if (!value || value.length < 32) {
    throw new AppError("Контролируемая Beta временно недоступна", 503, "BETA_UNAVAILABLE");
  }
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function secureEqual(first: string, second: string) {
  return timingSafeEqual(digest(first), digest(second));
}

function betaCookieSignature(expiresAt: number, environment: NodeJS.ProcessEnv) {
  const accessTokenDigest = digest(requiredSecret(environment, "BETA_ACCESS_TOKEN")).toString(
    "base64url",
  );
  return createHmac("sha256", requiredSecret(environment, "AUTH_SECRET"))
    .update(`${BETA_COOKIE_CONTEXT}:${expiresAt}:${accessTokenDigest}`)
    .digest("base64url");
}

export function createBetaAccessCookieValue(
  environment: NodeJS.ProcessEnv = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const expiresAt = nowSeconds + BETA_ACCESS_MAX_AGE_SECONDS;
  return `${expiresAt}.${betaCookieSignature(expiresAt, environment)}`;
}

export function verifyBetaAccessCookie(
  supplied: string | null | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!supplied) return false;
  try {
    const [expiresAtText, signature, extra] = supplied.split(".");
    if (extra !== undefined || !expiresAtText || !signature || !/^\d+$/.test(expiresAtText)) {
      return false;
    }
    const expiresAt = Number(expiresAtText);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) return false;
    return secureEqual(signature, betaCookieSignature(expiresAt, environment));
  } catch {
    return false;
  }
}

export function verifyBetaAccessToken(
  supplied: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!isBetaEnvironment(environment) || !supplied) return false;
  try {
    return secureEqual(supplied, requiredSecret(environment, "BETA_ACCESS_TOKEN"));
  } catch {
    return false;
  }
}

export function evaluateBetaRequest(input: {
  pathname: string;
  cookieValue?: string | null;
  environment?: NodeJS.ProcessEnv;
  nowSeconds?: number;
}): BetaGateDecision {
  const environment = input.environment ?? process.env;
  if (!isBetaEnvironment(environment) || BETA_EXEMPT_PATHS.has(input.pathname)) {
    return "allow";
  }
  if (environment.BETA_ENABLED !== "true") return "unavailable";
  if (verifyBetaAccessCookie(input.cookieValue, environment, input.nowSeconds)) return "allow";
  return input.pathname.startsWith("/api/") ? "unauthorized" : "redirect";
}

export function assertBetaRegistrationAllowed(
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (isBetaEnvironment(environment) && environment.BETA_REGISTRATION_ENABLED !== "true") {
    throw new AppError(
      "Регистрация в контролируемой Beta временно закрыта",
      403,
      "BETA_REGISTRATION_CLOSED",
    );
  }
}

export function assertBetaDemoMaterial(
  form: FormData,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!isBetaEnvironment(environment)) return;
  if (!isBetaDemoOnly(environment)) {
    throw new AppError("Контролируемая Beta временно недоступна", 503, "BETA_UNAVAILABLE");
  }
  if (form.get("demoMaterialAcknowledged") !== "true") {
    throw new AppError(
      "Подтвердите, что файл содержит только демонстрационные данные",
      422,
      "BETA_DEMO_MATERIAL_REQUIRED",
    );
  }
}

export function assertBetaManualPayment(
  acknowledged: boolean | undefined,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!isBetaEnvironment(environment)) return;
  if (!isBetaDemoOnly(environment)) {
    throw new AppError("Контролируемая Beta временно недоступна", 503, "BETA_UNAVAILABLE");
  }
  if (acknowledged !== true) {
    throw new AppError(
      "Подтвердите, что операция является демонстрационной и не отражает реальный платёж",
      422,
      "BETA_DEMO_PAYMENT_REQUIRED",
    );
  }
}

export function safeBetaReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/catalog";
  try {
    const parsed = new URL(value, "https://beta.invalid");
    if (parsed.origin !== "https://beta.invalid") return "/catalog";
    if (
      parsed.pathname.startsWith("/api/") ||
      parsed.pathname.startsWith("/_next/") ||
      parsed.pathname === "/beta-access" ||
      parsed.pathname.startsWith("/beta-access/")
    ) {
      return "/catalog";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/catalog";
  }
}
