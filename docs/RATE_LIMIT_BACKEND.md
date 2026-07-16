# Distributed rate-limit backend contract

HoReCa KZ uses an in-process limiter only in development and explicit local smoke tests. A production process fails closed with `RATE_LIMIT_UNAVAILABLE` until an HTTPS backend is configured.

## Environment

```dotenv
RATE_LIMIT_MODE="remote"
RATE_LIMIT_BACKEND_URL="https://rate-limit.example.kz/v1/consume"
RATE_LIMIT_BACKEND_TOKEN="managed-secret"
RATE_LIMIT_ALLOW_IN_MEMORY="false"
```

`RATE_LIMIT_BACKEND_TOKEN` belongs in a managed secret store. Redirects are rejected so the bearer token cannot be forwarded to another origin. The application timeout is 1500 ms; connection, timeout, non-2xx and malformed-response failures return HTTP 503 instead of silently disabling abuse protection.

## Request

The application sends `POST` with `Authorization: Bearer …`, `Content-Type: application/json` and `Cache-Control: no-store` semantics:

```json
{
  "key": "base64url-sha256-of-purpose-and-client-key",
  "limit": 10,
  "windowMs": 600000
}
```

Raw IP addresses and account identifiers are not sent. The backend must still treat the hashed key as pseudonymous operational data and expire it with the rate-limit window.

## Response

```json
{
  "allowed": false,
  "retryAfterSeconds": 37
}
```

The backend must atomically consume one unit and return the decision for the supplied limit/window. `retryAfterSeconds` must be a finite non-negative number. Shared Redis, an edge limiter or another strongly consistent shared store can implement the contract; an in-process map cannot.

## Production closure evidence

Before this control is marked done:

1. place the application behind a trusted TLS proxy/WAF that overwrites forwarding headers;
2. provision the shared backend and scoped secret;
3. prove allowed, denied, timeout and malformed-backend paths in staging;
4. load-test concurrency across at least two application replicas;
5. attach metrics/alerts, rollback steps and a post-rollout observe window;
6. verify that `RATE_LIMIT_ALLOW_IN_MEMORY` is not `true` in production readback.
