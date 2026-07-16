import { AppError } from "@/lib/errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new AppError(
      "Слишком много запросов. Попробуйте немного позже.",
      429,
      "RATE_LIMITED",
      { retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) },
    );
  }

  current.count += 1;

  if (buckets.size > 5_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
}

