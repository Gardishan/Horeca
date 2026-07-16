import { AppError } from "@/lib/errors";

type Bucket = { count: number; resetAt: number };
type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };

const buckets = new Map<string, Bucket>();

function unavailable() {
  return new AppError(
    "Защита от злоупотреблений временно недоступна",
    503,
    "RATE_LIMIT_UNAVAILABLE",
  );
}

function consumeMemory(key: string, limit: number, windowMs: number): RateLimitDecision {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  if (buckets.size > 5_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return { allowed: current.count <= limit, retryAfterSeconds };
}

async function hashRateLimitKey(key: string) {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("base64url");
}

async function consumeRemote(
  endpoint: string,
  token: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitDecision> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: await hashRateLimitKey(key), limit, windowMs }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(1_500),
    });
  } catch {
    throw unavailable();
  }

  if (!response.ok) throw unavailable();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw unavailable();
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>).allowed !== "boolean" ||
    typeof (payload as Record<string, unknown>).retryAfterSeconds !== "number"
  ) {
    throw unavailable();
  }

  const decision = payload as RateLimitDecision;
  if (!Number.isFinite(decision.retryAfterSeconds) || decision.retryAfterSeconds < 0) {
    throw unavailable();
  }
  return decision;
}

function shouldUseMemoryBackend() {
  const mode = process.env.RATE_LIMIT_MODE;
  if (mode === "memory") {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.RATE_LIMIT_ALLOW_IN_MEMORY !== "true"
    ) {
      throw unavailable();
    }
    return true;
  }
  if (mode === "remote") return false;
  return process.env.NODE_ENV !== "production";
}

export async function assertRateLimit(key: string, limit: number, windowMs: number) {
  let decision: RateLimitDecision;
  if (shouldUseMemoryBackend()) {
    decision = consumeMemory(key, limit, windowMs);
  } else {
    const endpoint = process.env.RATE_LIMIT_BACKEND_URL;
    const token = process.env.RATE_LIMIT_BACKEND_TOKEN;
    if (!endpoint || !token || !endpoint.startsWith("https://")) throw unavailable();
    decision = await consumeRemote(endpoint, token, key, limit, windowMs);
  }

  if (!decision.allowed) {
    throw new AppError(
      "Слишком много запросов. Попробуйте немного позже.",
      429,
      "RATE_LIMITED",
      { retryAfterSeconds: Math.max(1, Math.ceil(decision.retryAfterSeconds)) },
    );
  }
}

export function resetRateLimitForTests() {
  buckets.clear();
}
