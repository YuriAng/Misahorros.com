# Tasks: Automatic Release Deployment

## Review Workload Forecast
Estimated changed lines: 900–1,180 authored (correction tests, whitelist/workflow alignment, recovery-scope cleanup, and full verification).
400-line budget risk: High
Chained PRs recommended: No
Suggested split: Single PR; approved `size:exception`, absolute authored-line budget ≤1600.
Delivery strategy: single-pr
Chain strategy: size-exception

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units
| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Correct bundle contract and remove deferred recovery scope | PR 1 | `npm test -- tests/deploy/release-deploy.test.js` | Disposable Compose plus offline release-bundle rehearsal | Revert workflow, deploy scripts/docs, and deployment tests only |
| 2 | Prove complete release safety matrix | PR 1 | `npm test && npm run build` | `docker compose ... up -d --build`; protected rehearsal tag is N/A (no production access) | Revert verification-only evidence |

Already applied and requiring correction: `.github/workflows/release-deploy.yml`, `deploy/release-deploy.sh`, `deploy/install-host.sh`, `deploy/OPERATIONS.md`, and `tests/deploy/release-deploy.test.js`. Next apply starts at 1.1.

## Phase 1: Corrective RED tests
- [x] 1.1 Preserve applied prerequisites 1.1–1.2 and prior RED evidence.
- [x] 1.2 RED: extend `tests/deploy/release-deploy.test.js` to require workflow-bundled `index.html`, `deploy/install-host.sh`, and `docker-entrypoint.sh` while still rejecting documentation-like/unexpected paths.
- [x] 1.3 RED: assert absence of `misahorros-recover-db`, `RECOVERY_COMPATIBILITY_ACK`, compatibility acknowledgment, and failed-release database restore in `deploy/install-host.sh`, `deploy/OPERATIONS.md`, and tests.

## Phase 2: GREEN corrections
- [x] 2.1 Update `.github/workflows/release-deploy.yml` and `deploy/release-deploy.sh` whitelist/bundle selection to accept required runtime paths and preserve checksum validation.
- [x] 2.2 Remove recovery command, acknowledgment, and automated failed-release restore from `deploy/install-host.sh`, `deploy/OPERATIONS.md`, and `tests/deploy/release-deploy.test.js`; retain bootstrap-only initial restore and application rollback.

## Phase 3: Full verification
- [x] 3.1 Correct the contract-test PostgreSQL readiness race and re-run all Vitest; focused months and full suites pass.
- [x] 3.2 Rehearse the corrected offline bundle and verify every proposal/spec scenario, strict-TDD RED→GREEN ordering, no remote mutation, and authored total ≤1600.
