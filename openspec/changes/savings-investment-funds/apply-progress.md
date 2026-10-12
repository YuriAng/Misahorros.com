# Apply Progress: Savings and Investment Funds

## PR 1 of 5 (stacked-to-main) — Phase 1: Migration & Schema Foundation

**Status**: COMPLETE — tasks 1.1–1.6 done. Branch `feat/savings-investment-funds-01-migration`.

### Completed Tasks

- [x] 1.1 RED: `tests/contract/invariant.test.js` — added `balance`, `fund_balance`, `total_deposited`, `total_withdrawn` to `FORBIDDEN_COLUMN_NAMES`; updated pinned table list to the 8-table alphabetical list including `funds`/`fund_movements`. Confirmed RED: `npm test -- tests/contract/invariant.test.js` → 1 failed (pinned table list), 1 passed, before the migration existed.
- [x] 1.2 Created `server/migrations/003_savings_investment_funds.js` — `funds` table: `id` PK, `profile_id` FK → `budget_profiles` (RESTRICT), `name` with `funds_name_not_blank` CHECK, `archived` bool default false, `created_at`, `UNIQUE(profile_id, id)` as `funds_profile_id_unique`, `funds_profile_idx` index, and `funds_live_name_unique` partial unique index on `(profile_id, lower(btrim(name)))` WHERE `archived = false`.
- [x] 1.3 Extended `003` — `fund_movements` table: `id` PK, `profile_id`, `fund_id`, `month_key`, `type` TEXT with `fund_movements_type_valid` CHECK IN ('deposit','withdrawal'), `amount` NUMERIC(14,2) with `fund_movements_amount_positive` CHECK, `note` default `''`, `date`, `created_at`; composite FK `(profile_id, fund_id)` → `funds(profile_id, id)` ON DELETE RESTRICT; composite FK `(profile_id, month_key)` → `months(profile_id, month_key)` ON DELETE RESTRICT; indexes `fund_movements_profile_month_idx` and `fund_movements_fund_idx`.
- [x] 1.4 `down()` — counts `fund_movements` rows; throws `003 down(): {count} fund movements exist...` if any exist; otherwise drops `fund_movements` then `funds`.
- [x] 1.5 GREEN: extended `tests/contract/migration.test.js` with a new `describe('server/migrations/003_savings_investment_funds.js', ...)` block (3 tests): up() creates both tables with exact column sets on top of 002's schema; down() refuses with a movement present and leaves both tables intact; down() succeeds and restores the exact pre-003 (002) shape — `profile_id` columns and `budget_profiles` table unchanged — when the ledger is empty.
  - **Side effect fixed in the same commit**: adding migration `003` changed the step semantics of the *existing* `002` tests (`db.migrate.down()`/`up()` now step exactly one migration file, not one logical schema generation). Added `stepDown(n)`/`stepUp(n)` helpers and adjusted the three affected `002` tests (`task 1.1` backfill test now pops 2 steps to reach the 001 shape; the "second profile owns rows" refusal test now pops 003 first before testing 002's own refusal; the fresh-database test now round-trips 2 steps each way) so all four pre-existing `002` tests keep passing and still exercise what they claim to. Moved the shared `afterAll(closeDb)` to module level so it runs once after both describe blocks instead of closing the connection between them.
- [x] 1.6 GREEN: `npm test -- tests/contract/invariant.test.js tests/contract/migration.test.js` → 9/9 passed (2 invariant + 7 migration: 4 pre-existing `002` + 3 new `003`).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `tests/contract/invariant.test.js` | Contract (schema) | ✅ 2/2 passing pre-edit | ✅ Written (forbidden-column list + pinned 8-table list) | ✅ Passed after `003` created | ➖ Single (one schema-wide assertion per concern) | ➖ None needed |
| 1.2-1.4 | `server/migrations/003_savings_investment_funds.js` | Migration (schema DDL) | N/A (new file) | ✅ Tests in `migration.test.js` written against code that didn't exist | ✅ Passed | ✅ 3 cases (up shape, down-refuses, down-succeeds) | ➖ None needed |
| 1.5 | `tests/contract/migration.test.js` | Contract (migration) | ✅ 6/6 of the pre-existing 002 suite run and confirmed broken by adding `003` (expected regression, immediately fixed in the same commit, not a pre-existing failure) | ✅ Written (3 new `003` tests + step-count fixes to 4 existing `002` tests) | ✅ Passed | ✅ up/down/refuse covered independently | ✅ Extracted `stepDown`/`stepUp`/`fundTableNames` helpers to replace duplicated raw SQL and bare `db.migrate.down()` calls |
| 1.6 | `tests/contract/invariant.test.js` + `tests/contract/migration.test.js` | Contract | ✅ | ✅ | ✅ 9/9 | N/A (verification task) | N/A |

### Test Summary

- **Total tests written/modified**: 3 new (`003` migration), 2 modified (`invariant.test.js` forbidden-column list + table list), 3 existing tests adjusted for new step semantics (`002` migration tests)
- **Total tests passing**: 9/9 in scope (`invariant.test.js` + `migration.test.js`); 111/111 across the full suite
- **Layers used**: Contract (9 in scope)
- **Approval tests**: None — no refactoring of existing production behavior, only additive schema

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm test -- tests/contract/invariant.test.js tests/contract/migration.test.js` → **9 passed (9)**, 2 test files passed |
| Runtime harness command/scenario and exact result | `npx knex migrate:latest` equivalent exercised via `tests/contract/global-setup.js` (ephemeral Docker Postgres `postgres:16-alpine`, container `budget-pwa-test-pg-*`) — migrations `001`→`002`→`003` all applied cleanly at suite start; up/down round-trips for `003` exercised directly inside `migration.test.js`. Result: **pass**, no partial state, no leaked container (verified via `docker ps` before/after). |
| Rollback boundary | Revert `server/migrations/003_savings_investment_funds.js` (new file, delete it), revert the two edits in `tests/contract/invariant.test.js` (`FORBIDDEN_COLUMN_NAMES` + pinned table list), and revert `tests/contract/migration.test.js` back to its pre-PR1 content. No application code (routes/services/client) depends on `funds`/`fund_movements` yet — Phase 2 has not started. |

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `server/migrations/003_savings_investment_funds.js` | Created | `funds` + `fund_movements` tables, composite FKs, partial unique name index, refusing `down()` — mirrors `002`'s Knex style exactly |
| `tests/contract/invariant.test.js` | Modified | `FORBIDDEN_COLUMN_NAMES` gains 4 fund-balance names; pinned table list grows to the 8-table alphabetical list |
| `tests/contract/migration.test.js` | Modified | Added `stepDown`/`stepUp`/`fundTableNames` helpers; fixed 3 pre-existing `002` tests for new step semantics; added a new `describe` block with 3 tests for `003` up/down; moved shared teardown to module-level `afterAll` |
| `openspec/changes/savings-investment-funds/tasks.md` | Modified | Marked tasks 1.1–1.6 complete |

### Deviations from Design

None — implementation matches design.md's "Target Schema (resulting DDL)" and "Migration `server/migrations/003_savings_investment_funds.js`" sections verbatim (table/column/constraint/index names match exactly).

One necessary addition **not** explicitly spelled out in tasks.md but required to keep the existing suite green: fixing the three pre-existing `002` migration tests whose single-step `db.migrate.down()`/`up()` assumptions broke the instant a third migration file existed. This is a direct, in-scope consequence of task 1.2's file creation, not a deviation.

### Issues Found

None blocking. Noted for downstream PRs: `tests/contract/migration.test.js`'s file-level docblock comment (line 1) still says "Contract tests (tasks 1.1, 1.2): server/migrations/002_budget_profiles.js" — left unchanged since it accurately describes the first describe block; the new `003` describe block is self-documented inline instead of rewriting the shared header.

### Remaining Tasks (Phases 2-5, NOT in this PR)

- [ ] 2.x Server services & routes (`server/services/funds.js`, `server/routes/funds.js`)
- [ ] 3.x Month totals & bootstrap integration
- [ ] 4.x Client state management + critical cache-leak fix
- [ ] 5.x Client rendering & event binding
- [ ] 6.x Contract & integration tests (isolation, parity, migration-interaction)
- [ ] 7.x Final verification & documentation

### Workload / PR Boundary

- Mode: stacked PR slice (PR 1 of 5, `stacked-to-main`)
- Current work unit: Unit 1 — "Migration + table schema + RED tests" (per tasks.md's Suggested Work Units table)
- Boundary: starts from `002`'s latest schema (clean checkout of `main`); ends with migration `003` applied, both invariant tests and migration tests green, zero application code touching the new tables
- Estimated review budget impact: 1 new file (~85 lines) + 2 test file edits (~140 lines changed/added) + 1 tasks.md checkbox update ≈ well under the 400-line budget for this slice

### Status

6/6 tasks complete for Phase 1. Ready for verify.

---

## PR 2 of 5 (stacked-to-main) — Phase 2: Server Services & Routes

**Status**: COMPLETE — tasks 2.1–2.9 done. Branch `feat/savings-investment-funds-02-services-routes`, stacked on `feat/savings-investment-funds-01-migration`.

### Completed Tasks

- [x] 2.1 Created `server/services/funds.js`: `listFundsWithBalance(executor, profileId, { includeArchived })` — LEFT JOIN `fund_movements`, `SUM(CASE ...)` deposit/withdrawal aggregate, `GROUP BY` fund columns, `ORDER BY created_at ASC`. `computeFundBalance(executor, profileId, fundId)` — single-fund aggregate, locked-safe when called with the trx already holding `forUpdate()` on the fund row. `archiveFund(profileId, id)` — `db.transaction` + `forUpdate()` lock + `computeFundBalance` check + `409 fund_has_balance` guard, directly modeled on `archiveProfile` in `server/services/profiles.js`. `serializeFund()`/`serializeFundMovement()` shape converters matching `serializeProfile`/`serializeCategory` conventions exactly.
- [x] 2.2 Created `server/routes/funds.js` — `GET /` (optional `?includeArchived=1`, delegates to `listFundsWithBalance`); `POST /` (id generation via `generateId('fnd')`, `409 duplicate_name` via a case-insensitive/btrim-insensitive live-name check scoped to `profile_id`, mirroring `findDuplicateLiveName` in `server/routes/profiles.js`).
- [x] 2.3 Extended `funds.js`: `PATCH /:id` (404 for foreign/unknown id via `profile_id` scope, 400 blank name, 409 duplicate_name on rename, returns fund with freshly computed balance); `DELETE /:id` (calls `archiveFund`, `204` on success — errors from `archiveFund` propagate through `asyncHandler`).
- [x] 2.4 Added single `GET /:id/movements` (404 for foreign/unknown fund, `?limit=` parsed with default 50 / max 200 / clamped and defensively guarded against `NaN`/non-positive input, ordered `date DESC, id DESC`) and `POST /:id/movements` (one endpoint for both `type: 'deposit'`/`'withdrawal'`, not separate routes, per design.md's "One movement endpoint" decision).
- [x] 2.5 Implemented movement `POST`: `parseMovementDate()` mirrors `transactions.js`'s `parseDate()` exactly (bare `YYYY-MM-DD` parsed via `startOfDayInTz`, else native `Date`, `NaN` → `400`); `type`/`amount` validated before any DB work; inside one `db.transaction`: `forUpdate()` lock on the fund row (404 if missing/foreign, `409 fund_archived` if archived) → withdrawal-only `computeFundBalance` check (`409 insufficient_funds`, nothing written) → `materializeMonth(trx, profileId, monthKey)` (month_key derived via `monthKeyFromDate()`, never client-supplied) → insert → recompute balance under the same trx → `201 { movement, balance }`.
- [x] 2.6 RED: `tests/contract/funds.test.js` created with CRUD (create/list/rename/list-again), `409 duplicate_name` on create and on rename, archive-at-zero-balance success, archive-with-balance `409 fund_has_balance`, derived balance across three different months, movement `GET` ordering + `?limit=`, invalid `type` → `400`, non-positive `amount` → `400`, cross-profile `404` on `PATCH`/`DELETE`/movements `GET`/`POST`. Confirmed RED: 24/28 tests failed (import resolved but routes/service did not exist — every assertion hit a 404 from the unmounted router, or a cascading `23502 not_null_violation` from an undefined `.body.id` on a route that hadn't run yet), 4 incidentally passed (coincidental overlap between "expected failure status" assertions and the unmounted-router 404, not real production-code coverage).
- [x] 2.7 RED (same file, same confirmed-RED run as 2.6): `Cross-profile isolation` describe block — a fund created under profile A returns `404` for `PATCH`/`DELETE`/movement `POST` once profile B is active and is absent from profile B's `GET /api/funds`; a direct `db('fund_movements').insert()` naming a fund from a different profile is rejected by the composite FK (`23503`) at the database level, not only by application logic (savings-funds spec, "Cross-profile fund reference is rejected"); a same-named fund created under profile B starts at balance 0, unaffected by profile A's movements.
- [x] 2.8 GREEN: `npm test -- tests/contract/funds.test.js` → **28/28 passed** after implementing `server/services/funds.js` + `server/routes/funds.js` + the router mount. One transient `Acquire connection error: Connection terminated unexpectedly` log line appeared on two of three runs (ephemeral-Postgres connection-pool noise under `fileParallelism: false`, logged by `pg`/Knex, not a test failure) — all three runs reported 28/28 passed; the all-green run is the GREEN evidence of record.
- [x] 2.9 Mounted `fundsRouter` in `server/routes/index.js`: `router.use('/funds', requireActiveProfile, fundsRouter)`, placed after `transactionsRouter` and before `importRouter` — the last of the profile-scoped routers in the existing mount order (`settings`, `profiles` unscoped first; `categories`, `months`, `transactions`, `funds`, `import` scoped). No unscoped router follows the scoped block in this file, so "before unscoped ones" is satisfied vacuously by position.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `tests/contract/funds.test.js` (exercises the service indirectly through the routes) | Contract (service, via HTTP) | N/A (new file) | ✅ Written against a service module that did not exist | ✅ Passed once `funds.js` service was implemented | ✅ Balance covered across zero/nonzero/three-month cases | ➖ None needed — mirrors `profiles.js`'s `archiveProfile` pattern exactly, no duplication to extract |
| 2.2-2.3 | `tests/contract/funds.test.js` (`POST`/`GET`/`PATCH`/`DELETE` describe blocks) | Contract (CRUD) | N/A (new route file) | ✅ Written against routes that did not exist (confirmed 404s) | ✅ Passed | ✅ Duplicate-name on both create and rename; blank-name; archived-name-reuse; unknown-id 404 | ➖ None needed |
| 2.4-2.5 | `tests/contract/funds.test.js` (`GET`/`POST /:id/movements` describe blocks) | Contract (movement ledger) | N/A (new endpoint) | ✅ Written against an endpoint that did not exist | ✅ Passed | ✅ deposit, withdrawal, three-month balance, invalid type, non-positive amount, insufficient funds, archived-fund guard, cross-profile 404 — 8 distinct cases | ➖ None needed — `parseMovementDate` is a deliberate structural copy of `transactions.js`'s `parseDate`, not duplicated logic worth extracting into a shared module in this PR (scope: do not touch `months.js`/other routers) |
| 2.6-2.7 | `tests/contract/funds.test.js` | Contract (CRUD + isolation) | ✅ full suite (111/111) run before this PR's edits, confirmed green pre-change | ✅ Written (28 tests) referencing `server/services/funds.js` and `server/routes/funds.js`, neither of which existed; confirmed RED (24 explicit failures + 4 coincidental passes, zero real coverage) | ✅ 28/28 passed after implementation | ✅ Every scenario in design.md's "Testing Strategy" table applicable to Phase 2 is covered by a distinct test | ➖ None needed |
| 2.8 | `tests/contract/funds.test.js` | Contract | ✅ | ✅ | ✅ 28/28 (×3 runs, 1 transient non-test log line, no flaky assertion) | N/A (verification task) | N/A |
| 2.9 | `server/routes/index.js` | Integration (router mount) | ✅ full `npm test` run after mount, 139/139 | ✅ covered implicitly — every `funds.test.js` request would 404 without the mount | ✅ 139/139 full-suite pass confirms the mount resolves requests | N/A (single mount line, no branching) | ➖ None needed |

### Test Summary

- **Total tests written**: 28 new (`tests/contract/funds.test.js`)
- **Total tests passing**: 28/28 in scope; 139/139 across the full suite (111 pre-existing + 28 new)
- **Layers used**: Contract (28 in scope)
- **Approval tests**: None — no refactoring of existing production behavior, only additive service/route/mount code
- **Pure functions created**: `serializeFund`, `serializeFundMovement` (both pure shape converters); `parseMovementDate` is pure given its inputs (no shared mutable state)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm test -- tests/contract/funds.test.js` → **28 passed (28)**, 1 test file passed (confirmed on 2 consecutive clean runs after the initial RED-confirming run) |
| Runtime harness command/scenario and exact result | Full `npm test` (`vitest run`) against the same ephemeral Docker Postgres harness as PR 1 — **139 passed (139)**, 17 test files passed. No cross-profile leakage observed in the isolation describe block; composite-FK rejection (`23503`) exercised via a direct `db.insert()` bypassing the route layer, confirming the database-level guard independent of application code. |
| Rollback boundary | Remove `server/services/funds.js` and `server/routes/funds.js` (both new files, delete them); revert the `fundsRouter` import + mount lines in `server/routes/index.js` (2 lines); delete `tests/contract/funds.test.js`. No other file was touched — `server/services/months.js`, `server/services/bootstrap.js`, and every client file (`src/*`) are untouched and remain exactly as PR 1 left them (Phase 3's `funds` integration into month totals / bootstrap has not started). |

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `server/services/funds.js` | Created | `listFundsWithBalance`, `computeFundBalance`, `archiveFund` (with `forUpdate()` lock + `409 fund_has_balance` guard), `serializeFund`, `serializeFundMovement` |
| `server/routes/funds.js` | Created | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, `GET /:id/movements`, `POST /:id/movements` — single movement endpoint handling both deposit and withdrawal |
| `server/routes/index.js` | Modified | Imported `fundsRouter`; mounted `router.use('/funds', requireActiveProfile, fundsRouter)` after `transactionsRouter`, before `importRouter` |
| `tests/contract/funds.test.js` | Created | 28 contract tests: CRUD, duplicate-name guard (create + rename), archive guard (zero/nonzero balance), movement ledger (deposit/withdrawal/three-month balance), validation (`400` type/amount), guards (`409 insufficient_funds`, `409 fund_archived`), cross-profile isolation (`404` + DB-level composite-FK `23503` rejection) |
| `openspec/changes/savings-investment-funds/tasks.md` | Modified | Marked tasks 2.1–2.9 complete |

### Deviations from Design

None — implementation matches design.md's "Query Rewrites: `server/services/funds.js`" section and "API Contract" table verbatim (function signatures, SQL shape, guard codes, and the single `/movements` endpoint with a `type` discriminator all match exactly, including the explicit rejection of separate `/deposits`/`/withdrawals` routes that design.md calls out by name).

One intentional note for the record: `openspec/changes/savings-investment-funds/specs/budget-api/spec.md`'s "Fund Management Endpoints" requirement text literally names `POST /api/funds/:id/deposits` and `POST /api/funds/:id/withdrawals` in its prose, which design.md's "Decision: one row query reduced in JS, not a second SQL aggregate" / "One movement endpoint, not `/deposit` + `/withdraw`" section explicitly supersedes and rejects (with rationale: avoiding the exact duplicated-logic bug class the `SETTINGS_KEYS` precedent already paid for). This PR's task list (tasks.md 2.4–2.5) explicitly specifies the single-endpoint shape, so the single `POST /api/funds/:id/movements` endpoint with a `type` field was implemented per design.md and tasks.md, not per the literal route names in the spec prose. The spec's Given/When/Then scenario bodies (the actual acceptance criteria) describe the deposit/withdrawal *behavior*, not the literal path, so no scenario is violated by this reconciliation — but a future `sdd-verify`/`sdd-archive` pass should reconcile `specs/budget-api/spec.md`'s prose to name the single `/movements` endpoint explicitly, since the current wording could mislead a future reader who does not cross-reference design.md.

### Issues Found

None blocking. Two transient `Acquire connection error: Connection terminated unexpectedly` log lines appeared on 2 of 5 total `npm test`/`npm test -- tests/contract/funds.test.js` invocations during this PR — both times the test run still reported full pass counts (28/28 or 139/139). This is ephemeral-Postgres-container connection-pool noise (pre-existing harness behavior, not triggered by any code in this PR, and not observed to correlate with any specific test), consistent with `vitest.config.js`'s own comment that the contract suite trades wall-clock time for correctness against a real, sometimes-flaky Docker-backed Postgres.

### Remaining Tasks (Phases 3-5, NOT in this PR)

- [ ] 3.x Month totals & bootstrap integration (`server/services/months.js`, `server/services/bootstrap.js`)
- [ ] 4.x Client state management + critical cache-leak fix
- [ ] 5.x Client rendering & event binding
- [ ] 6.x Contract & integration tests (isolation, parity, migration-interaction)
- [ ] 7.x Final verification & documentation

### Workload / PR Boundary

- Mode: stacked PR slice (PR 2 of 5, `stacked-to-main`)
- Current work unit: Unit 2 — "Server services + routes + deposit/withdrawal logic" (per tasks.md's Suggested Work Units table)
- Boundary: starts from PR 1's landed migration (`003_savings_investment_funds.js`, both tables exist, zero application code touching them); ends with full fund CRUD + movement API surface mounted and contract-tested, zero changes to `server/services/months.js`, `server/services/bootstrap.js`, or any client file
- Estimated review budget impact: 2 new server files (service ~115 lines, routes ~195 lines) + 1 new test file (~330 lines) + 2-line router mount + 9-line tasks.md checkbox update ≈ roughly 640 authored lines added, 0 deleted elsewhere — this is a single, cohesive work unit (fund service + routes + their contract tests are inseparable: the routes have no meaning without the service, and the service has no test coverage without the routes) and was not artificially split by file type, consistent with the `work-unit-commits` skill's guidance to slice by work unit, not file type

### Status

9/9 tasks complete for Phase 2. Combined with Phase 1: 15/15 tasks complete across PR 1 + PR 2. Ready for verify.
