# MVP Beta launch checkpoint — 2026-09-29

The final launch is **blocked by the provider**, not completed. Application source
`28d066a9b05e24384cc271eb6511973f33b8355d` passed main Quality and Security after
the mobile cabinet fix in PR #74. Railway's active API incident held the new
deployment in INITIALIZING. It reached BUILDING while cancellation was pending;
the workflow stopped before enable, and provider readback subsequently confirmed the deployment `REMOVED` with no pending work.

At 17:10:06 UTC, external readiness still returned 200 for the earlier verified
candidate `00a7b3a03fb6d177aadffb1abf8fa6cbe895bda2`. That candidate's successful
workflow, database/file persistence, same-code rollback and external APK are
historical evidence. They do not verify the mobile correction in the new image.

## Evidence boundaries

- `launch-checkpoint.json`: exact commits, deployment IDs, incident, cancellation
  readback and remaining sequence. The cancellation API timed out; its terminal
  effect was verified separately, rather than inferred from the request.
- `candidate-00a7-*.json`: prior runtime and fresh September 29 readbacks. The
  199-second observation recorded 193 HTTP rows, no HTTP 5xx, two favicon 404s,
  29 client-aborted 499s and one logged UNAUTHORIZED 401 event during rapid UI
  navigation. A normal single-click logout subsequently passed without page
  errors or HTTP 5xx. This is a limited Beta observation, not an SLA/load test.
- `postgres-restart-*.json`: actual physical restart on September 24. September
  29 continuity readback confirms the same cluster, migration checksum, start
  time, persistent volume and TLS 1.3; the historical event is not redated.
- `mobile-css-simulation.json`: 13 pages at 390/768/1440 px, 39 passing width
  checks after injecting the proposed sizing behavior in a browser. This is
  explicitly a pre-deploy simulation; final deployed CSS still needs checking.
- `sbom-verification.json`: signed production-npm CycloneDX SBOM for attempted
  source `28d066a`, including separate file checksum and Actions ZIP digest.
- `disabled-rollback-rehearsal.json` and `app-demo-bootstrap-evidence.json`:
  earlier scoped kill-switch/rollback and UID1001 private-file evidence.

## Operator handoff

The existing running process is still the earlier enabled candidate. Stored
next-deployment variables are `BETA_ENABLED=false` and version `28d066a`; do not
confuse these control-plane values with the process verified through HTTPS.
GitHub auto-deploy remains disabled. No tag or draft/published Release exists.

After Railway recovers, confirm no pending deployments, then run **Beta Launch**
on the latest green `main`. This documentation merge changes the next launch SHA:
collect a matching new APK, SBOM and digest rather than reusing `28d066a` identity.
Verify browser/mobile flows, a rollback to the recorded prior version with
restoration, and a fresh observation window. Only after the complete strict
`npm run mvp:release-check` passes may the exact-SHA prerelease be created and
[issue #44](https://github.com/Gardishan/Horeca/issues/44) closed.

Instructions for testers and operators: [BETA_GUIDE.md](../../BETA_GUIDE.md).
Commercial production blockers remain unchanged.

Provider incident: [Railway API degradation](https://status.railway.com/incident/YYTG8I10).
CI: [Quality](https://github.com/Gardishan/Horeca/actions/runs/36600977390),
[Security](https://github.com/Gardishan/Horeca/actions/runs/36600977405).
Cancelled launch: [Beta Launch](https://github.com/Gardishan/Horeca/actions/runs/36601519494).
