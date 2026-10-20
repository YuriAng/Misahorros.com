# release-data-loss-guard

## Objective
Prevent a release from silently going live on an empty database (incident 2026-10-02: v0.0.4 bundle pinned volume `budget-pwa_pgdata`, Postgres started empty, health gates passed).

## Scope
- Branch: `fix/release-data-loss-guard`, based on `origin/feat/release-deployment` (already pins `name: misahorros-pgdata`, covers point 1).
- Files: `deploy/install-host.sh`, `deploy/release-deploy.sh`, `tests/deploy/release-deploy.test.js`, `deploy/OPERATIONS.md`.

## Design
- `install-host.sh` (launcher): when a previous release exists, count total rows of public non-`knex_%` tables on the running previous stack BEFORE `down`; fail closed (exit 70) if the count is unreadable. Pass as `PRE_DEPLOY_ROWS` to `release-deploy.sh`.
- `release-deploy.sh`: after migrations and app up, count again; if `PRE_DEPLOY_ROWS` > 0 and post count is 0 (or unreadable) -> `fail` -> existing rollback path runs. Unset/empty `PRE_DEPLOY_ROWS` (first release) skips the guard.
- Narrow on purpose: only total wipe is detected; no bypass flag.
- Test seam: docker stub answers queries containing `row_total`: `MISA_ROWS_PRE` when args contain `-f`, `MISA_ROWS_POST` when they contain `--env-file` (both default 0).

## Tasks
- [x] T1 RED: tests (wipe -> rolled_back; same rows -> succeeded; unreadable pre-count aborts before `down`)
- [x] T2 GREEN: implement guard in both scripts
- [x] T3 docs: OPERATIONS.md note
- [x] T4 full test run + work-unit commit

## Config
TDD: strict (source: project sdd-init). Runner: `npx vitest run tests/deploy`.
Route: delegated direct (writer trigger: 2+ non-trivial files).
Delivery: ask-on-risk; no push/PR without user decision.

## Evidence
- RED: 2 of 12 failed (wipe not detected; unreadable pre-count exit 0 instead of 70).
- GREEN: `npx vitest run tests/deploy` 12/12 pass; `bash -n` ok on both scripts and extracted launcher.
