# Controlled MVP Beta delivery

Scope confirmed by the product owner on 2026-09-24: the existing invite-only,
demo-only MVP Beta acceptance criteria. Commercial onboarding, real documents,
real payments, production signing and new infrastructure providers are excluded.

## Change contract

- Restore the promised buyer-to-supplier flow: the authenticated supplier reads
  only their own company requests and buyer contacts in a paginated inbox.
  Reuse the catalog's 24-row convention; add no request status transitions.
- Match billing actions to the currently selected pending subscription, so an
  old invoice cannot prevent payment setup for a new plan.
- Preserve the form element across asynchronous document upload and recover
  visibly from network/invalid-response errors.
- Pass serializable navigation data across the Server/Client Component boundary;
  require rendered supplier and administrator headings in the HTTP smoke.
- Validate catalog query parameters before Prisma; retain the existing defaults
  and integer clamps. Invalid input receives the standard 422 API envelope and
  an explicit recovery state on the catalog page.
- Require every existing mandatory MVP readiness control. Tests must accept
  genuinely completed evidence as well as reject incomplete evidence.
- Reject release identity without a SHA-256 image digest. A verified deployment
  candidate is distinct from the completed strict gate and prerelease.
- Fix the Beta seed's private-file placement and verify actual protected
  downloads after deployment/restart. A persistent runtime volume must exist.
- Remove current critical/high dependency advisories using compatible fixes;
  keep Node 22 and Prisma 6 and preserve the existing admin-rotation command.

## Risks and verification

Buyer contacts must never cross company or role boundaries or enter shared
caches. The inbox derives ownership from the authenticated supplier and selects
only the fields needed by the screen. Auth failures, company isolation and the
safe unexpected-error envelope require regression evidence.

Billing UI must not change payment/verification policy. New invoices must bind
to the selected subscription. Upload success must refresh the document list;
failure must clear the busy state without leaking backend details.

Private demo files must stay outside public assets, cannot be overwritten on
repeated bootstrap, and must survive restart. Bootstrap must reject non-Beta,
non-demo, enabled-traffic and unmounted-storage execution.

Verification sequence: focused RED/GREEN tests, clean dependency install,
`npm run verify`, `npm run security:audit`, clean PostgreSQL 17 migration/seed,
HTTP role/ownership/billing/download smoke, then the strict MVP gate. External
provider evidence is recorded only after an actual external run.

## Verification evidence — 2026-09-24

Environment: macOS, Node 22.23.1, npm 10.9.8, isolated PostgreSQL 17.11 on
loopback. Changes were verified on top of `9233a2c2bbd2852d982090885682577373a7c335`;
the owner's demo-admin rotation commits are preserved.

- Focused tests reproduced billing/form, catalog validation and Server/Client
  serialization failures before their fixes. Runtime validation fixtures also
  reproduced credential disclosure through native URL/JSON error messages.
- `npm ci`, `npm run verify` and `npm run security:audit` passed. The full gate
  includes 246 tests, coverage (92.06% statements, 89.58% branches, 100% functions,
  92.37% lines), lint, Prisma validation and production standalone build.
- Existing migration `202607160001_init` applied to a new empty PostgreSQL 17.11
  database; demo seed and all 12 HTTP smoke groups passed. No schema change.
- Smoke covers request delivery and company isolation, new-plan invoice binding,
  rendered supplier/admin pages, protected downloads, CSRF and role failures,
  trust filtering and terminal payment/document/verification decisions.
- SSH and failure-cleanup fixtures execute the workflow's shell blocks with
  synthetic keys and fake provider commands. They are not provider evidence.
- Independent code review found no unresolved functional/security blocker.
  Docker and Android artifact builds still require CI in this environment.

The dependency fixes align with the parallel security PR
[#56](https://github.com/Gardishan/Horeca/pull/56), including deepmerge-ts 8.0.2,
and additionally update Vitest/coverage to 4.1.11. The regular npm 10 clean
install succeeds with the committed lockfile; no advisory exception is added.

## External launch boundary

Read-only GitHub checks on 2026-09-24 found `beta` Environment present, but no
repository or Environment Actions secrets. The latest Beta Launch run
[31879629530](https://github.com/Gardishan/Horeca/actions/runs/31879629530)
failed; deployment `5919544578` has no external URL. Remote main was
`849bbb4b461a696dfc91a3f3ff64518abfdc47b2`.

The owner activated Railway Hobby and authenticated CLI 5.41.2. Readback at
2026-09-24T11:55Z found one newly created project `refreshing-expression`, its
`production` environment and one `Horeca` service connected to this repository.
Deployment `cd8a8a37-670d-43ea-a210-1cd369f84601` was `CRASHED`; PostgreSQL and
volumes were absent. The owner approved reuse, and the project/environment were
renamed to `horeca-kz-beta` / `beta` without changing IDs. Resource provisioning
and external verification are in progress.

Configure `BETA_RAILWAY_PROJECT_TOKEN`, `BETA_SMOKE_ACCESS_TOKEN` and
`BETA_RAILWAY_SSH_PRIVATE_KEY` in GitHub Environment `beta`. The existing
temporary repository-secret fallback uses the same names and should be removed
after Environment injection is confirmed. A pre-existing relay host pin may be
supplied as `BETA_RAILWAY_SSH_KNOWN_HOSTS`; otherwise the workflow follows the
official CLI's host-scoped initial-trust model. An observed fingerprint is not
independent host verification. Never put token/private-key values in this
report, GitHub comments or chat.

Before launch, provision PostgreSQL with TLS and an application volume mounted
at `/app/storage/private`, writable by runtime UID 1001. Railway mounts begin
root-owned, so Docker image-time ownership alone is insufficient. Verify actual
runtime permissions and synthetic file bootstrap while Beta is disabled.

The workflow verifies the provider's `meta.imageDigest`, protected document
downloads and uploaded-file hashes across redeploy/rollback/restore. After an
enable attempt, failure cleanup attempts to disable and redeploy Beta and
prove the kill switch externally. Runner loss or provider outage can prevent
cleanup; operators must then use the documented manual kill-switch procedure.

Local verification is not evidence of an external launch. Keep unresolved
controls in `docs/mvp-launch-readiness.json` open until their actual runtime,
APK, rollback, observation and release-identity criteria pass.

## Runtime packaging correction

External disabled-Beta preflight on 2026-09-24 found liveness 200 but readiness
500 on deployment `dd55767a-48ed-4531-b7eb-343c178e244b`, main `a332671f`.
The log identifies missing `@prisma/client-2c3a283f134fdcb6`. Turbopack created
that alias in `.next/node_modules` but omitted it and Prisma from standalone
NFT traces. A local copy outside the repository reproduces missing runtime
modules; the previous smoke inherited the repository's parent `node_modules`.
The catalog kill switch remains closed (`503 BETA_DISABLED`).

Change contract: use Next's supported `next build --webpack` production build
and run the existing HTTP smoke from an isolated temporary artifact. Keep Next
16.3.6 security fixes, application policy and schema unchanged. Risks are build
output/CSP/RSC differences, covered by the full gate and existing role/HTML/HTTP
smoke. No ad hoc rewriting of generated external-module aliases. Related upstream
trace report: [Next.js #95816](https://github.com/vercel/next.js/issues/95816);
[documented CLI build flags](https://nextjs.org/docs/app/api-reference/cli/next).

The same provider probe confirmed that SSH commands run as UID 0 even when the
application PID1 runs as UID 1001. Bootstrap must clear supplementary groups and
drop GID/UID to the Docker application's 1001 before creating private directories
or files. A failed privilege change must prevent writes; do not widen file modes
or recursively change ownership as a workaround. Runtime PID1, mounted-volume
ownership and write access as UID1001 were independently verified while traffic
remained disabled.

## Railway upload-path correction

Launch run [36000555873](https://github.com/Gardishan/Horeca/actions/runs/36000555873)
on main `dd72be8f634b27609d9cfb558a04aaaaa04c1902` passed provider, SSH and
runtime-secret preflight, then stopped before upload with `prefix not found`.
CLI 5.41.2 retains the explicit relative `.` input while using the absolute
linked project directory as the archive prefix. The workflow now uses the
documented `railway up` current-directory form so both paths share that root.
Scope is only upload-path selection; service, environment, credentials and
deployment gates are unchanged. The failed run never enabled Beta. A fresh
main CI and actual upload/deployment must verify the correction.

## APK verification correction

The corrected upload succeeded on Railway, and
[Beta Launch 36002052452](https://github.com/Gardishan/Horeca/actions/runs/36002052452)
on `bfa8e345eda060b2bea0cfea166fb32cd9bfca2a` passed migration, demo seed,
external role/download smoke and database/private-file persistence after app
redeploy. Gradle built the APK successfully, but the verifier inspected only
`classes.dex`. The downloaded Quality APK reproduces the defect: the configured
URL resides in `classes2.dex`.

Change contract: verify the exact configured URL among root APK DEX string
constants, including secondary DEX files. Reject missing/wrong URLs, resource-only
matches and unreadable artifacts. Preserve Gradle and application configuration;
do not add dependencies or weaken the origin check. Focused fixtures and the
actual downloaded APK cover the failure before another full launch attempt.

The failed run exercised the safety shutdown: at 2026-09-24T12:58:08Z the
workflow verified a new disabled deployment and external kill switch. An
independent probe at 13:00:46Z returned `503 BETA_DISABLED`. This is real shutdown
evidence, not a successful launch or rollback rehearsal.

## Railway rollback and shutdown correction

[Beta Launch 36004483180](https://github.com/Gardishan/Horeca/actions/runs/36004483180)
on `f5455cbbf0de4aaf105350747be24befb36493a9` passed external smoke, persistence
and the external-origin APK check. The rollback step then returned HTTP 400.
Live API introspection on 2026-09-25 reports
`deploymentRollback(id: String!): Boolean!`; the workflow's object selection
was invalid. The read query is separate and must not be blamed from this log.
[Read-only diagnostic 36137079916](https://github.com/Gardishan/Horeca/actions/runs/36137079916)
confirmed the complete deployment read, `canRollback`, image digest and scalar
schema with the existing project token. No broader credential is required.

Change contract: call both rollback mutations as scalar operations, require an
explicit `true`, then retain the existing provider deployment and external smoke
readbacks. A rejected mutation must stop promotion. Preserve project-token scope;
do not replace it with broader account credentials.

The failure cleanup requested deployment `fa257e47-4ed1-4233-b9c3-7527bfa1f986`
at 2026-09-24T13:21:37.341Z. Provider readback records SUCCESS at 13:28:08.056Z;
the old 24-by-5-second poll loop had already stopped. Independent HTTPS probes
on 2026-09-25 confirmed `503 BETA_DISABLED` and `503 NOT_READY`.
Ordinary-failure cleanup must use the existing 15-minute deployment budget;
cancellation remains explicitly best effort within 240 seconds. Test delayed
success beyond the former poll cap and deadline expiry. Provider outage or loss
of the runner can still prevent verification; do not claim shutdown from a
variable update alone. No application policy or schema changes are in scope.
