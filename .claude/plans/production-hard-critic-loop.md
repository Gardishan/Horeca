# Production hard-critic loop

Date: 2026-07-28
Baseline: `main` at `cd328c2ea7e3bc24b9aef098424f95cc2713dbd4`
Pattern: sequential
Mode: safe

## Goal

Re-evaluate the current repository as an adversarial production reviewer. Fix only
high-value defects that can be closed with repository evidence; do not convert
external runtime blockers into documentation-only completion.

## Scope

- Current application, container, CI, security and readiness contracts.
- User-critical buyer, supplier and admin paths already represented in the code.
- Reproducibility, secret/file leakage, authorization, error handling and negative
  paths.

## Non-goals

- Buying or provisioning cloud resources.
- Production DNS or cutover.
- Choosing legal, identity, payment, fiscal or data-residency policy for the owner.
- Claiming staging/runtime evidence from local or CI execution.
- Broad refactors or package-major upgrades without an independently proven need.

## Objective rubric

Each loop round is `NICE` only when all applicable criteria pass:

1. Correctness: critical state transitions preserve documented invariants.
2. Security: no secret/private-file leakage, authorization bypass, unsafe fallback
   or known high/critical dependency issue.
3. Failure behavior: external-service failures are explicit and fail closed where
   security or integrity is affected.
4. Artifact integrity: the standalone container contains only required runtime
   files and is built from the reviewed source/lockfile.
5. Reproducibility: Node 22 gates, clean install, verify, migration/seed and smoke
   remain deterministic.
6. Evidence honesty: readiness status changes only with the evidence required by
   the control.
7. Regression safety: narrow tests plus the full Quality and Security workflows
   pass on the exact reviewed commit.

## Loop

1. Establish the green Node 22 baseline.
2. Audit by rubric and record concrete failure proof.
3. Fix the highest-severity repo-only finding in one coherent slice.
4. Run narrow tests, `npm run verify`, audits and relevant artifact/runtime checks.
5. Review the complete diff and re-run the rubric from a clean checkpoint.
6. Publish one PR and merge only after Quality and Security pass.

## Stop conditions

- Maximum three rounds.
- Stop after two consecutive checkpoints with no new critical repo-only finding.
- Stop on a decision, credential, paid resource, production mutation or runtime
  access that is outside the authorized scope.
- Stop after two repeated identical failures with no new evidence and report the
  blocker instead of retrying.

## Rollback

Keep every round in an isolated branch and one coherent PR. Before merge, discard
the branch. After merge, revert the squash commit if post-merge evidence exposes a
regression.
