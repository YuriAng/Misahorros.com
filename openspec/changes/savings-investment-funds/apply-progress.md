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

---

## PR 3 of 5 (stacked-to-main) — Phase 3: Month Totals & Bootstrap Integration

**Status**: COMPLETE — tasks 3.1–3.9 done. Branch `feat/savings-investment-funds-03-totals-bootstrap`, stacked on `feat/savings-investment-funds-02-services-routes`. Server-only — no `src/` file touched (client integration is PR 4–5 scope).

### Completed Tasks

- [x] 3.1 Modified `server/services/months.js:getMonthPayload()`: added a `fund_movements` query scoped by `(profile_id, month_key)`, ordered `date DESC, id DESC`, placed after the transactions read and before the category aggregate (exact position from design.md). Mapped rows with an inline object literal matching design.md's exact `getMonthPayload()` code, **not** `serializeFundMovement()` — see Deviations.
- [x] 3.2 Computed `fundDeposits`/`fundWithdrawals` via a plain `for` reduce over the same `fundMovements` array (no second SQL aggregate); both added to the `totals` object.
- [x] 3.3 Revised `totalAvailable` to `income.amount - totalSpent - fundDeposits + fundWithdrawals`, with an inline comment on why deposits subtract and withdrawals add.
- [x] 3.4 Modified `server/services/bootstrap.js` (pre-existing file, **not** created — see Deviations): added `listFundsWithBalance` to the existing `Promise.all` alongside `categoryRows`/`profileRows`; `funds` added to the returned payload shape, transcribed verbatim from design.md's Query Rewrites code block.
- [x] 3.5 `server/routes/index.js:GET /api/bootstrap` already called `buildBootstrapPayload` (landed before this SDD change) — **zero edit needed**; confirmed by reading the handler before touching anything, per task 3.5's own instruction to "call `buildBootstrapPayload` instead of inline aggregation."
- [x] 3.6 RED: `tests/contract/parity.test.js` — extended the first parity fixture (`MONTH_KEY = '2026-05'`) with a fund (300 deposit + 120 withdrawal, both dated inside the month); asserted `server.body.totals.fundDeposits`/`fundWithdrawals` are both `> 0` (not just truthy) so an empty/unmodified fixture cannot pass vacuously. Also narrowed all three parity tests' client-vs-server `toEqual` comparisons to strip `fundDeposits`/`fundWithdrawals` before comparing against `getMonthTotals()` — see Deviations for why.
- [x] 3.7 RED: `tests/contract/months.test.js` — new `describe` block, 3 tests: a 200 deposit lowers `totalAvailable` by exactly 200 and raises `fundDeposits` by 200; a 50 withdrawal (against a pre-seeded 500 balance, to avoid `409 insufficient_funds`) raises `totalAvailable` by exactly 50 and raises `fundWithdrawals` by 50; a 200 deposit + 200 withdrawal in one month leaves `totalAvailable` unchanged while both terms read 200 (pins the two-gross-term design against a naive net-only regression).
- [x] 3.8 RED: `tests/contract/health-bootstrap.test.js` — confirmed the actual file name first (it is `health-bootstrap.test.js`, matching the task's own primary suggestion). Updated the fresh-database `toEqual` to include `funds: []`; added a new `describe` block with 2 tests: `GET /api/bootstrap` returns a `funds` array with the same shape `GET /api/funds` ships (`id`, `name`, `archived`, `createdAt`, `balance`); `PUT /api/profiles/active` returns `funds: []` for a newly activated profile with no funds of its own, then a fund created after the switch appears only in that profile's bootstrap.
- [x] 3.9 GREEN: ran `npm test -- tests/contract/months.test.js tests/contract/parity.test.js tests/contract/health-bootstrap.test.js` → **21/21 passed**. Ran full `npm test` → **144/144 passed** (139 from PR 1+2 baseline + 5 net-new: 3 in `months.test.js`, 2 in `health-bootstrap.test.js`; `parity.test.js` gained assertions inside existing tests, not new `it` blocks).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1–3.3 | `tests/contract/months.test.js`, `tests/contract/parity.test.js` | Contract (month payload) | ✅ 21/21 of the 3 target files run and passing before any edit | ✅ Written against the pre-edit `getMonthPayload()` (no `fundMovements`/`fundDeposits`/`fundWithdrawals` fields existed) | ✅ Passed after implementation | ✅ 3 distinct scenarios in `months.test.js` (deposit-only, withdrawal-only, combined-both) plus the parity fixture's combined case | ➖ None needed — direct transcription of design.md's exact code |
| 3.4–3.5 | `tests/contract/health-bootstrap.test.js` | Contract (bootstrap) | ✅ same baseline run | ✅ Written against the pre-edit `buildBootstrapPayload()` (no `funds` key existed) | ✅ Passed after implementation | ✅ 2 cases: funds present in bootstrap, funds correctly scoped after a profile switch | ➖ None needed |
| 3.6 | `tests/contract/parity.test.js` | Contract (parity) | ✅ same baseline run | ✅ Written — `fundDeposits`/`fundWithdrawals` referenced fields that did not exist pre-edit | ✅ Passed after implementation | ➖ Single fixture carries both a deposit and a withdrawal in the same assertion, which is the triangulating pair the task itself specifies | ➖ None needed |
| 3.7 | `tests/contract/months.test.js` | Contract (totals) | ✅ same baseline run | ✅ Written (3 new `it`s) | ✅ Passed after implementation | ✅ 3 cases: deposit-only, withdrawal-only, combined (the combined case is the forced triangulation — a net-only implementation would pass the first two but fail the third) | ➖ None needed |
| 3.8 | `tests/contract/health-bootstrap.test.js` | Contract (bootstrap) | ✅ same baseline run | ✅ Written | ✅ Passed | ✅ 2 cases (shape presence; profile-switch scoping) | ➖ None needed |
| 3.9 | all 3 files + full suite | Contract | ✅ | ✅ | ✅ 21/21 scoped, 144/144 full suite | N/A (verification task) | N/A |

**RED-before-GREEN discipline note**: tasks 3.1–3.5 (implementation) are ordered in `tasks.md` *before* the RED-test tasks 3.6–3.8, mirroring the exact same convention Phase 2 used (`server/services/funds.js` + `server/routes/funds.js` written at 2.1–2.5, RED tests written at 2.6–2.7). Because Phase 3 has no later "wiring" task that would keep the feature genuinely broken until after the RED tests are written (unlike Phase 2's router-mount at task 2.9), implementing 3.1–3.4 first would have made the RED tests pass immediately on first run — a false GREEN with no RED ever observed. To preserve genuine RED evidence: the `months.js`/`bootstrap.js` edits were captured as a patch, **reverted** to the pre-PR-3 state, the RED tests were written and run against that reverted state (confirmed: 10 failed / 11 passed, failures limited to exactly the new fund-aware assertions), then the patch was re-applied and the full scoped + full-suite runs were repeated to confirm GREEN. The committed diff is identical either way; only the verification order changed.

### Test Summary

- **Total tests written/modified**: 5 new `it` blocks (3 in `months.test.js`, 2 in `health-bootstrap.test.js`); 1 existing `it` extended with new assertions and a fund fixture (`parity.test.js`'s first test); 2 existing `it`s in `parity.test.js` adjusted for the new `totals` shape (fund-term stripping before client comparison); 1 existing `it` in `months.test.js` and 1 in `health-bootstrap.test.js` updated for the new zero-valued shape
- **Total tests passing**: 21/21 in scope (`months.test.js` + `parity.test.js` + `health-bootstrap.test.js`); 144/144 across the full suite
- **Layers used**: Contract (21 in scope)
- **Approval tests**: the 3 pre-existing `toEqual`-shape assertions updated for the new `totals`/bootstrap shape (one in `months.test.js`, one in `health-bootstrap.test.js`, plus the two no-fund-fixture parity tests) are approval-style updates — they captured the OLD shape, were run to confirm they still passed against pre-edit code, then updated to the NEW expected shape and confirmed newly RED before the implementation made them GREEN again

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm test -- tests/contract/months.test.js tests/contract/parity.test.js tests/contract/health-bootstrap.test.js` → **21 passed (21)**, 3 test files passed |
| Runtime harness command/scenario and exact result | Full `npm test` (`vitest run`) against the same ephemeral Docker Postgres harness as PR 1/2 — **144 passed (144)**, 17 test files passed. One transient `Acquire connection error: Connection terminated unexpectedly` log line appeared on one run; all reported pass counts were unaffected (same known ephemeral-Postgres pool noise documented in PR 1 and PR 2, not a regression introduced here). |
| Rollback boundary | Revert `server/services/months.js` and `server/services/bootstrap.js` to their PR-2-landed state; revert the 3 test file edits (`tests/contract/months.test.js`, `tests/contract/parity.test.js`, `tests/contract/health-bootstrap.test.js`); revert the `tasks.md` checkbox update. No client file (`src/*`) was touched — Phase 4's cache-leak fix and fund state/UI readers have not started. `server/routes/index.js` and `server/routes/profiles.js` needed **zero** changes (already wired to `buildBootstrapPayload` from before this SDD change began). |

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `server/services/months.js` | Modified | Added the `fund_movements` query + inline row mapping (`fundMovements`); added the `fundDeposits`/`fundWithdrawals` reduce; revised `totalAvailable` formula with rationale comment |
| `server/services/bootstrap.js` | Modified (pre-existing file; task 3.4 said "create" — see Deviations) | Added `listFundsWithBalance` to the existing `Promise.all`; `funds` added to the returned shape |
| `tests/contract/months.test.js` | Modified | Updated the zero-valued-totals shape assertion; added a new `describe` block with 3 fund-totals tests (task 3.7) |
| `tests/contract/parity.test.js` | Modified | Extended the first parity fixture with a fund + nonzero deposit/withdrawal (task 3.6, vacuum-guard assertion); narrowed all 3 tests' client/server `toEqual` comparisons to exclude fund terms the client (PR 4 scope) does not compute yet |
| `tests/contract/health-bootstrap.test.js` | Modified | Added `funds: []` to the fresh-database shape; added a new `describe` block with 2 bootstrap-funds tests (task 3.8) |
| `openspec/changes/savings-investment-funds/tasks.md` | Modified | Marked tasks 3.1–3.9 complete |
| `openspec/changes/savings-investment-funds/apply-progress.md` | Modified | Appended this Phase 3 record |

### Deviations from Design

Two naming/file-state deviations from the literal task/spec text, both resolved in favor of design.md as the authoritative source (consistent with PR 2's precedent of design.md superseding literal task/spec prose where they conflict):

1. **`server/services/bootstrap.js` already existed** — task 3.4 says "Create `server/services/bootstrap.js` (new file)," but the file was already present (dated before this SDD change, already exporting `buildBootstrapPayload` and already called by both `GET /api/bootstrap` and `PUT /api/profiles/active`). Verified directly by reading the file before editing. design.md's own File Changes table correctly lists this file as **"Modify,"** not "Create" — design.md and the actual repository state agree; only `tasks.md`'s task 3.4 prose is stale. Treated as a modify: `funds` was added to the existing `Promise.all`, matching design.md's Query Rewrites code block verbatim. Task 3.5 (wiring `GET /api/bootstrap` to call `buildBootstrapPayload`) was consequently a no-op — that wiring had already landed with the file itself.
2. **`fundMovements` entries in the month payload omit `monthKey` and are not built via `serializeFundMovement()`** — task 3.1 says to map rows with `serializeFundMovement()` (which includes `monthKey` in its output, per `server/services/funds.js`). design.md's exact `getMonthPayload()` code block (and its accompanying rationale: "`fundMovements` entries deliberately omit `monthKey`... matching how `transactions` entries omit it... while the `POST` response... includes it") explicitly uses an inline object literal without `monthKey` instead. Followed design.md's literal code and documented rationale over the task's summary phrasing.

One field-naming note carried forward from PR 2's precedent, not newly introduced here: `specs/budget-api/spec.md`'s "Month Totals Include Fund Movement Terms" requirement prose names the fields `totalDeposits`/`totalWithdrawals`, while design.md and `tasks.md` (3.2–3.3) both say `fundDeposits`/`fundWithdrawals`. Implemented as `fundDeposits`/`fundWithdrawals` per design.md and tasks.md, matching the already-landed `funds.js`/`listFundsWithBalance` naming for consistency within the codebase. Flagged again for a future `sdd-verify`/`sdd-archive` pass to reconcile the spec prose's field names, same as PR 2's flagged reconciliation for endpoint naming.

**Cross-PR client/server shape divergence** (not a design deviation, but worth recording precisely because it is temporary and intentional): adding `fundDeposits`/`fundWithdrawals` to `totals` and revising `totalAvailable`'s formula server-side, while `src/state.js:getMonthTotals()` is explicitly out of scope until PR 4, means the client's old totals and the server's new totals genuinely diverge once a fund movement exists in a month (not just a shape difference — `totalAvailable`'s *value* differs too, since the client still uses the pre-fund formula). `tests/contract/parity.test.js`'s three tests were narrowed accordingly: the no-fund-movement tests strip the two new always-present-but-zero fields before comparing structurally against the client; the one test with real fund movements additionally recomputes and asserts the server's formula directly, and compares the client only against the pre-fund-term totals shape. This narrowing is testable, intentional, and self-documenting — it is expected to collapse back into a single full-object `toEqual` once PR 4 lands `getMonthTotals()`'s fund-aware revision.

### Issues Found

None blocking. One transient `Acquire connection error: Connection terminated unexpectedly` log line during the full-suite run — same documented ephemeral-Postgres-pool noise as PR 1 and PR 2, with the full 144/144 pass count unaffected.

### Remaining Tasks (Phases 4-5, NOT in this PR)

- [ ] 4.x Client state management + critical cache-leak fix
- [ ] 5.x Client rendering & event binding
- [ ] 6.x Contract & integration tests (isolation, parity, migration-interaction)
- [ ] 7.x Final verification & documentation

### Workload / PR Boundary

- Mode: stacked PR slice (PR 3 of 5, `stacked-to-main`)
- Current work unit: Unit 3 — "Month totals revision + bootstrap integration" (per tasks.md's Suggested Work Units table)
- Boundary: starts from PR 2's landed fund CRUD + movements API (`server/services/funds.js`, `server/routes/funds.js`, router mount — zero changes needed here); ends with `GET /api/months/{k}` and `GET /api/bootstrap`/`PUT /api/profiles/active` all fund-aware and contract-tested, zero changes to any client file (`src/*`)
- Estimated review budget impact: `git diff --stat` for this PR's 6 changed files (excluding `apply-progress.md` itself, which is this evidence record, not implementation): **214 insertions, 15 deletions = 229 authored changed lines** — well under the 400-line budget for this slice, consistent with design.md's estimate that this phase needs "one added query + one JS reduce" in `months.js` and "one query joined into an existing `Promise.all`" in `bootstrap.js`

### Status

9/9 tasks complete for Phase 3. Combined with Phase 1 + Phase 2: 24/24 tasks complete across PR 1 + PR 2 + PR 3.

---

## PR 4 of 5 (stacked-to-main) — Phase 4: Client Critical Fix & State Management

**Status**: COMPLETE — tasks 4.1–4.10 done. Branch `feat/savings-investment-funds-04-client-state`, stacked on `feat/savings-investment-funds-03-totals-bootstrap`. Client state only — no `src/render.js`, `src/main.js`, `index.html`, or `src/style.css` touched (rendering/event-binding is PR 5's scope).

### Completed Tasks

- [x] 4.1 `src/storage.js:defaultData()`: added `funds: []`. `src/state.js`: added `fundMovements: []` to `EMPTY_MONTH` (frozen, matching the existing freeze pattern), `ensureCacheMonth()`'s initializer, and `monthFromPayload()`'s mapping (`(payload.fundMovements || []).map(m => ({ ...m }))` — defensive fallback kept even here, matching the existing codebase's "a pure read never throws" convention).
- [x] 4.2 `src/api.js`: added `getFunds()`, `createFund(payload)`, `renameFund(id, name)`, `archiveFund(id)`, `getFundMovements(id, { limit } = {})` (query-string `?limit=` built the same way `getBootstrap(monthKey)`'s `?month=` is), `createFundMovement(id, body)` — all follow the existing `request()` helper and `encodeURIComponent()` on every id, matching every other id-bearing route in the file verbatim.
- [x] 4.3 `src/state.js:bootstrap()`: added `cache.funds = initial.funds.map(f => ({ ...f }));` immediately after the existing `cache.profiles` line, matching design.md exactly.
- [x] 4.4 **CRITICAL CACHE-LEAK FIX**: `src/state.js:setActiveProfile()` — added `cache.funds = payload.funds.map(f => ({ ...f }));` immediately before the existing `cache.months = {}` reset. **Reconciliation note**: tasks.md's own prose said "add `cache.funds = {}` ... matching how `cache.months = {}` is reset," which is internally inconsistent with task 4.1/4.3's own array shape (`cache.funds = initial.funds.map(...)`, `cache.funds.push(...)`, `cache.funds.findIndex(...)`) — `{}` would make every later array method in 4.5–4.7 throw. design.md's own exact line for this call site (`` `setActiveProfile()` (`:196-203`) **must** gain `cache.funds = payload.funds.map(f => ({ ...f }));`. Omitting it leaves the previous profile's funds ... rendered under the new profile. ... the single highest-value review item on the client side. ``) is unambiguous and was used verbatim, resolving the inconsistency in tasks.md's prose in design.md's favor, exactly as the task's own instruction anticipated. The fix mirrors the existing `cache.categories = payload.categories.map(c => ({ ...c }));` line immediately above it — wholesale array replacement, never a merge, same guarantee class as the pre-existing `cache.months = {}` reset.
  - **Unit test** (not a new describe block — a sibling assertion added inside the EXISTING `setActiveProfile` test per the task's own instruction, matching its style exactly): `tests/unit/state.test.js` — pre-populates `state.funds` with a stale fund (`fnd_stale`, `balance: 777`) belonging to the profile being left; the mocked `api.setActiveProfile` response carries a different fund (`fnd_fresh`) for the new profile; after `await setActiveProfile('prof_negocio')`, asserts `getData().funds` equals exactly the new payload's funds array and `getData().funds.find(f => f.id === 'fnd_stale')` is `undefined` — zero trace of the old profile's fund (and its stale balance) survives the switch.
- [x] 4.5 Fund readers in `src/state.js`: `getFunds()` (`cache.funds.filter(f => !f.archived)`); `getFundBalance(fundId)` (`cache.funds.find(...)`, `0` for unknown id — mirrors the existing `getCategoryBudget`'s "`|| 0` for missing" convention); `getFundMonthMovements(monthKey, fundId)` (`readMonth(monthKey).fundMovements.filter(m => m.fundId === fundId)`, no defensive fallback here — that lives only in `getMonthTotals()` per design.md's exact code).
- [x] 4.6 Fund mutators in `src/state.js`: `addFund(name)` (`api.createFund({ name })` → `cache.funds.push(created)` → returns `created`); `renameFund(id, name)` (`api.renameFund(id, name)` → replace in-place via `findIndex`); `archiveFund(id)` (`api.archiveFund(id)` → `cache.funds[idx] = { ...cache.funds[idx], archived: true }`, balance left untouched — mirrors the existing `archiveProfile`/`archiveCategory` in-place-patch pattern exactly).
- [x] 4.7 `addFundMovement(fundId, { type, amount, note, date })`: `api.createFundMovement(fundId, {...})` → `{ movement, balance }` destructured from the response; `cache.funds[idx] = { ...cache.funds[idx], balance }` (balance taken straight from the response, no re-fetch); `ensureCacheMonth(movement.monthKey)` (the SERVER's derived month, never the `monthKey` argument the caller passed as "the month on screen" — mirrors `addTransaction`'s identical `created.monthKey` pattern); `month.fundMovements.unshift({...})` with the movement shape (no `monthKey` field — matches the server's own `fundMovements` entries, which also omit it).
- [x] 4.8 `src/state.js:getMonthTotals(monthKey)`: added `const movements = month.fundMovements || []` (defensive fallback for a month cached by a pre-PR-4 client); a single `for` loop accumulating `fundDeposits`/`fundWithdrawals` — **deliberately the exact `for`-loop shape from `server/services/months.js:getMonthPayload()`** (read directly before writing this), not design.md's illustrative `filter().reduce()` twice — the task's own instruction says "identical reduce logic to the server... read it to match exactly," and the server's landed code (PR 3) is a single `for` loop, not two filtered reduces. Returns `{ income, totalBudgeted, totalSpent, fundDeposits, fundWithdrawals, totalAvailable: income - totalSpent - fundDeposits + fundWithdrawals }`.
- [x] 4.9 RED tests in `tests/unit/state.test.js`: the cache-leak sibling assertion (4.4, above); `getMonthTotals()` extended with 3 new cases (deposits-only, withdrawals-only, both-same-amount) plus the pre-existing "aggregates..." test itself now doubles as the ABSENT-`fundMovements`-key case, since `installMonthFixture()`'s literal object was deliberately left without a `fundMovements` key — confirming the `|| []` fallback never throws, using a real shared fixture rather than a second synthetic test. Also added: `getFunds`/`getFundBalance`/`getFundMonthMovements` reader tests and `addFund`/`renameFund`/`archiveFund`/`addFundMovement` mutator tests (full coverage of every new production function, not just the two explicitly named in 4.9's prose — required by Strict TDD's "every new function needs a test" rule, since tasks.md's 4.9 prose names only the two critical scenarios but 4.5–4.7 add 7 new exported functions). Confirmed RED: `npm test -- tests/unit/state.test.js` → **13 failed / 6 passed** (6 passing were the untouched pre-existing category tests; every fund-related assertion failed with `TypeError: {fn} is not a function` or a stale-data mismatch, confirming production code did not yet exist).
- [x] 4.10 GREEN: `npm test -- tests/unit/state.test.js` → **19/19 passed**. `npm test -- tests/contract/parity.test.js` → **3/3 passed**, with PR 3's intentionally-narrowed assertions widened back to full-object `toEqual(server.body.totals)` comparisons in all three tests (PR 3's `apply-progress.md` explicitly flagged this: "expected to collapse back into a single full-object `toEqual` once PR 4 lands `getMonthTotals()`'s fund-aware revision") — the first test's client-side fixture now also carries `fundMovements: server.body.fundMovements.map(m => ({ ...m }))`, and its two-term formula assertion on `server.body.totals.totalAvailable` is unchanged in substance, just no longer destructured away from the full object. The second and third tests deliberately leave `fundMovements` unset on their client-side month fixtures, pinning the `|| []` defensive fallback against a REAL server-shaped fixture (not just a unit literal) while still reaching full-object parity, since `fundDeposits`/`fundWithdrawals` are genuinely `0` in both. Full `npm test` → **155/155 passed** (144 from PR 1+2+3 baseline + 11 net-new, all in `tests/unit/state.test.js`).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `tests/unit/state.test.js` (indirectly, via every test that reads `month.fundMovements`) | Unit | ✅ 8/8 passing pre-edit (baseline run before any edit) | ✅ Covered by the absent-key `getMonthTotals` test and the `setActiveProfile` month-shape assertion, both referencing a `fundMovements` field that did not exist on the pre-edit shape | ✅ Passed | ➖ Single (structural shape addition, no branching) | ➖ None needed |
| 4.2 | `tests/unit/state.test.js` (indirectly — every mutator test calls through `api.*`, exercising the new wrapper's argument shape) | Unit | N/A (new exports, additive only) | ✅ Written against `api.createFund`/`renameFund`/`archiveFund`/`createFundMovement` mocks that referenced exports that did not exist on `src/api.js` | ✅ Passed once implemented | ➖ Single per wrapper (thin pass-through, no branching) | ➖ None needed — mirrors `patchCategory`/`renameProfile` verbatim |
| 4.3 | `tests/unit/state.test.js:setActiveProfile` (bootstrap itself has no existing unit test in this file — exercised indirectly via the shape `cache.funds` must have for every other test to run) | Unit | ✅ same baseline | ➖ `bootstrap()` has no dedicated unit test in this suite (consistent with the file's existing scope — `bootstrap()` was already untested before this PR, not a regression introduced here) | ✅ Verified by every other passing test that depends on `cache.funds` existing as an array | ➖ N/A | ➖ None needed |
| 4.4 | `tests/unit/state.test.js:setActiveProfile` | Unit | ✅ same baseline — the pre-existing `setActiveProfile` test (1/1) run and confirmed passing before this edit | ✅ Written: pre-populated `state.funds` with `fnd_stale`, asserted post-switch `getData().funds` equals exactly the new payload's funds and `fnd_stale` is absent | ✅ Passed after adding `cache.funds = payload.funds.map(...)` | ✅ The mocked response's fund (`fnd_fresh`) differs in every field (id, name, createdAt, balance) from the stale one, so a no-op fix (leaving `cache.funds` unset or merging) would fail on at least 3 independent fields, not just one coincidental match | ➖ None needed |
| 4.5 | `tests/unit/state.test.js` (`getFunds`, `getFundBalance`, `getFundMonthMovements` describes) | Unit | ✅ same baseline | ✅ Written against functions that did not exist (`TypeError: ... is not a function`) | ✅ Passed | ✅ `getFundBalance`: known id (1000) + unknown id (0, forced real logic, not a hardcoded return); `getFundMonthMovements`: two movements across two different funds in the same month, asserting only the matching one is returned | ➖ None needed |
| 4.6 | `tests/unit/state.test.js` (`addFund`, `renameFund`, `archiveFund` describes) | Unit | ✅ same baseline | ✅ Written against functions that did not exist | ✅ Passed | ➖ Single scenario each (push / replace-in-place / archive-in-place are each a single code path, no branching to triangulate) | ➖ None needed — mirrors `addProfile`/`renameProfile`/`archiveProfile` exactly |
| 4.7 | `tests/unit/state.test.js:addFundMovement` | Unit | ✅ same baseline | ✅ Written against a function that did not exist, asserting balance-from-response, SERVER-derived month bucket (`'2026-02'`, distinct from the test's own `MONTH_KEY = '2026-01'`), and the exact unshifted movement shape (no `monthKey` field) | ✅ Passed | ➖ Single scenario (one deposit); the deliberate month-mismatch between `MONTH_KEY` and `movement.monthKey` IS the triangulating case — a naive implementation using the viewed month would fail this assertion specifically | ➖ None needed — mirrors `addTransaction`'s `created.monthKey` pattern exactly |
| 4.8 | `tests/unit/state.test.js:getMonthTotals` (4 cases) + `tests/contract/parity.test.js` (3 cases) | Unit + Contract | ✅ same baseline (unit); ✅ 21/21 of the 3 Phase-3 contract files run and confirmed passing before any edit (contract) | ✅ Written: absent-key (via the unmodified fixture), deposits-only, withdrawals-only, both-same-amount — all asserting the exact expected numeric object, none passing before the reduce existed | ✅ Passed after implementing the `for` loop + revised `totalAvailable` | ✅ 4 distinct unit cases + the parity test's real-fixture case (deposit 300 + withdrawal 120) — the both-same-amount unit case is the forced triangulation: a net-only (buggy) implementation would return `0`/`0` instead of `200`/`200` | ➖ None needed — transcribed the server's own `for` loop verbatim, no duplication to extract |
| 4.9 | `tests/unit/state.test.js` (all new describes) | Unit | ✅ 8/8 pre-edit baseline confirmed passing | ✅ All written before any corresponding production code existed; confirmed RED (13 failed / 6 passed) in one run before any `src/` edit | ✅ All 13 passed after implementation | ✅ Covered per-function above | ➖ None needed |
| 4.10 | `tests/unit/state.test.js` + `tests/contract/parity.test.js` + full suite | Unit + Contract | ✅ | ✅ | ✅ 19/19 unit, 3/3 parity, 155/155 full suite | N/A (verification task) | N/A |

### Test Summary

- **Total tests written/modified**: 11 new `it` blocks in `tests/unit/state.test.js` (1 extended existing `setActiveProfile` test with fund assertions, not counted as new; 3 new `getMonthTotals` cases; 2 `getFunds`/`getFundBalance` cases — `getFundBalance` itself has 2; 1 `getFundMonthMovements`; 1 `addFund`; 1 `renameFund`; 1 `archiveFund`; 1 `addFundMovement`); 3 existing `it` blocks in `tests/contract/parity.test.js` widened from narrowed to full-object comparisons
- **Total tests passing**: 19/19 in `tests/unit/state.test.js` scope; 3/3 in `tests/contract/parity.test.js` scope; 155/155 across the full suite (144 PR 1+2+3 baseline + 11 net-new unit tests)
- **Layers used**: Unit (19 in `state.test.js`), Contract (3 in `parity.test.js`, widened not added)
- **Approval tests**: the pre-existing `getMonthTotals` "aggregates..." test and the pre-existing `setActiveProfile` test are both approval-style extensions — captured the OLD expected shape, confirmed it passed pre-edit, then extended the expectation (new keys / new assertions) and confirmed newly RED before the implementation made them GREEN again
- **Pure functions created**: `getFundBalance`, `getFundMonthMovements` (both pure reads); `getFunds` (pure filter); `getMonthTotals`'s fund-term reduce is pure given its `month` input

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm test -- tests/unit/state.test.js` → **19 passed (19)**, 1 test file passed |
| Runtime harness command/scenario and exact result | `npm test -- tests/contract/parity.test.js` against the same ephemeral Docker Postgres harness as PR 1/2/3 — **3 passed (3)**, confirming the client's revised `getMonthTotals()` is in full structural and numeric parity with the server's `getMonthPayload()` `totals` object (not just a shape match — the real fixture carries a 300 deposit + 120 withdrawal in the first test, and both the "absent fundMovements" fallback tests (2nd/3rd) and the real-fixture test (1st) are exercised against the real Express app + Postgres, not a mock). Full `npm test` → **155 passed (155)**, 17 test files passed. One transient `Acquire connection error: Connection terminated unexpectedly` log line on 2 of 4 total `npm test` invocations during this PR — same documented ephemeral-Postgres-pool noise as every prior PR in this change, pass counts unaffected on every run (it also appeared once on the pure-unit `tests/unit/state.test.js`-only run, which touches no database at all — confirming it is leftover async noise from a PRIOR test file's connection pool in the same process, not anything this PR's code triggers). |
| Rollback boundary | Revert `src/state.js`, `src/api.js`, `src/storage.js` to their PR-3-landed state (no changes in those files since PR 3); revert `tests/unit/state.test.js` and `tests/contract/parity.test.js` to their PR-3-landed content; revert the `tasks.md` checkbox update. No `src/render.js`, `src/main.js`, `index.html`, or `src/style.css` was touched — Phase 5's UI rendering and event binding have not started, and the app's DOM layer still calls the OLD (pre-fund) `getMonthTotals()`/`getData()` shape until PR 5 lands, which is harmless since this PR is purely additive to the cache shape and every pre-existing field keeps its old meaning. |

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `src/storage.js` | Modified | Added `funds: []` to `defaultData()` |
| `src/api.js` | Modified | Added `getFunds`, `createFund`, `renameFund`, `archiveFund`, `getFundMovements`, `createFundMovement` — six thin `request()` wrappers |
| `src/state.js` | Modified | `EMPTY_MONTH`/`ensureCacheMonth()`/`monthFromPayload()` gain `fundMovements: []`; `bootstrap()` gains `cache.funds` population; `setActiveProfile()` gains the critical `cache.funds = payload.funds.map(...)` cache-leak fix; added `getFunds`, `getFundBalance`, `getFundMonthMovements`, `addFund`, `renameFund`, `archiveFund`, `addFundMovement`; revised `getMonthTotals()` with the fund-aware reduce and formula |
| `tests/unit/state.test.js` | Modified | Added the cache-leak sibling assertion inside the existing `setActiveProfile` test; extended `getMonthTotals` with 3 new cases; added `getFunds`/`getFundBalance`/`getFundMonthMovements`/`addFund`/`renameFund`/`archiveFund`/`addFundMovement` test suites; extended the `vi.mock('../../src/api.js', ...)` stub and the `state.js` import destructure for the new functions |
| `tests/contract/parity.test.js` | Modified | Widened all 3 tests' narrowed (PR 3) comparisons back to full-object `toEqual(server.body.totals)`; first test's client fixture now also carries `fundMovements` |
| `openspec/changes/savings-investment-funds/tasks.md` | Modified | Marked tasks 4.1–4.10 complete |
| `openspec/changes/savings-investment-funds/apply-progress.md` | Modified | Appended this Phase 4 record |

### Deviations from Design

Two reconciliations, both resolved in design.md's favor per the apply instructions' own guidance, consistent with PR 2/PR 3's precedent of design.md superseding literal task prose where the two conflict:

1. **Task 4.4's `cache.funds = {}` instruction vs. design.md's `cache.funds = payload.funds.map(f => ({ ...f }))`** — tasks.md's own prose is internally inconsistent: it describes `cache.funds` as something reset with `{}` (keyed-object shape, like `cache.months`), while task 4.1 and 4.3's OWN prose describe it as an array (`funds: []`, `cache.funds = initial.funds.map(f => ({ ...f }))`). `{}` would break every array method (`.push`, `.findIndex`, `.filter`) task 4.5–4.7 add on the very same field. design.md's own line for this exact call site is unambiguous (`cache.funds = payload.funds.map(f => ({ ...f }));`, explicitly called out as "the single highest-value review item on the client side"), and was followed verbatim — this is a reconciliation, not a freelanced deviation, per the apply instructions' own explicit "resolve it by checking design.md's authoritative shape" guidance for this exact ambiguity.
2. **Task 4.8's "identical reduce logic to the server" vs. design.md's illustrative `filter().reduce()` twice** — design.md's own `getMonthTotals()` code block uses two `.filter().reduce()` calls, but `server/services/months.js:getMonthPayload()` (the actual landed PR 3 code, read directly before writing this task) uses a single `for` loop with an `if/else` inside it. Task 4.8's prose explicitly says to use "identical reduce logic as server" and told me to "read it to match exactly" — so the server's real `for`-loop shape was used instead of design.md's descriptive snippet, which predates PR 3's actual implementation choice. Both are logically equivalent (same inputs produce the same outputs); this is a literal-match-to-server choice, not a behavioral deviation.

### Issues Found

None blocking. The `Acquire connection error: Connection terminated unexpectedly` log line (same documented ephemeral-Postgres-pool noise as every prior PR) appeared on 2 of 4 `npm test` invocations in this PR, including once on a pure-unit-test-only run that opens no database connection at all — confirming the noise is process-wide Docker/pg connection-pool cleanup from a previous test file in the same Vitest worker, not anything introduced by this PR's code. All reported pass counts were unaffected on every run.

### Remaining Tasks (Phase 5, NOT in this PR)

- [ ] 5.x Client UI rendering & event binding (`src/render.js`, `src/main.js`, `index.html`, `src/style.css`)
- [ ] 6.x Contract & integration tests (isolation, parity, migration-interaction)
- [ ] 7.x Final verification & documentation

### Workload / PR Boundary

- Mode: stacked PR slice (PR 4 of 5, `stacked-to-main`)
- Current work unit: Unit 4 — "Client state + critical cache-leak fix + API" (per tasks.md's Suggested Work Units table)
- Boundary: starts from PR 3's landed server-side fund-aware totals/bootstrap (zero client file touched); ends with `src/state.js`/`src/api.js`/`src/storage.js` fully fund-aware, the critical cache-leak fix verified by a dedicated unit test, and `tests/contract/parity.test.js`'s PR-3-narrowed assertions widened back to full strength — zero changes to `src/render.js`, `src/main.js`, `index.html`, or `src/style.css`
- Estimated review budget impact: `git diff --stat` for this PR's 6 changed files (excluding `apply-progress.md` itself, which is this evidence record, not implementation): **377 insertions, 34 deletions = 411 authored changed lines** — marginally over the 400-line budget. This was not artificially split by file type (the cache-leak fix, its dedicated test, the 7 new state functions, and their tests are one inseparable work unit per the `work-unit-commits` skill's guidance), and the overage is not code that can shrink without cutting test coverage for the CRITICAL cache-leak fix or the 7 new functions it ships alongside — flagging as a **size:exception** candidate for this single PR rather than attempting a sub-split that would leave `addFundMovement`/`getMonthTotals` untested mid-chain.

### Status

10/10 tasks complete for Phase 4. Combined with Phase 1 + Phase 2 + Phase 3: 34/34 tasks complete across PR 1 + PR 2 + PR 3 + PR 4.

---

## PR 5 of 5 (stacked-to-main) — Phase 5: Client Rendering & Event Binding, + Phase 6 + Phase 7

**Status**: COMPLETE — tasks 5.1–5.10 (Phase 5, hard requirement), 6.1–6.6 (Phase 6), and 7.1–7.5 (Phase 7) all done. Branch `feat/savings-investment-funds-05-ui-rendering`, stacked on `feat/savings-investment-funds-04-client-state`. **This is the final PR of the 5-PR stacked chain.**

### Completed Tasks — Phase 5 (UI, hard requirement)

- [x] 5.1 `index.html`: added `.funds-section` between `#summaryCard` and `.categories-section` — `#addFundBtn` ("+ Nuevo") + `#fundsList` container, empty state handled entirely by `renderFunds()`.
- [x] 5.2 `#fundFormOverlay` added, copied structurally from `#categoryFormOverlay`: `#fundId` (hidden), `#fundName` input, `#fundFormTitle` (dynamic), `#deleteFundBtn` (hidden until edit mode), cancel/save actions.
- [x] 5.3 `#fundMovementFormOverlay` added: `#movementFundId` (hidden), `#movementType` (hidden, set by the opener, never a `<select>` — matches design.md's rationale that the user already expressed intent by clicking "Depositar"/"Retirar"), `#movementAmount`, `#movementDate`, `#movementNote`, `#movementBalanceHint` (display only), cancel/save.
- [x] 5.4 `src/render.js:renderFunds()` — called from `renderApp()` between `renderSummary()` and `renderCategories()`; renders every live fund with name, balance, this-month net deposits/withdrawals (or "Sin movimientos este mes"), edit/deposit/withdraw actions; empty-state message when `getFunds()` returns `[]`. Transcribed from design.md's exact code block.
- [x] 5.5 `src/render.js:renderSummary()` — destructures `fundDeposits`/`fundWithdrawals` from `getMonthTotals()`; `pctUsed`/`status` now computed from `outflow = totalSpent + fundDeposits` against `inflow = income + fundWithdrawals` (previously spending-only); conditional `fundMeta` row ("A fondos: $X" / "Desde fondos: $Y") appended to `.summary-meta` when either term is nonzero.
- [x] 5.6 `src/main.js` — delegated click listener on `#fundsList`: `.edit-fund` opens the fund form in edit mode; `.fund-deposit`/`.fund-withdraw` open the movement form with the correct `type`; the withdraw button ships `disabled` in the rendered markup when `fund.balance <= 0` (UX hint only — `renderFunds()`'s own ternary, not a separate JS guard; the server's `409 insufficient_funds` is the real rule).
- [x] 5.7 `src/main.js` — `#addFundBtn` opens `#fundFormOverlay` via `openFundFormFor(null)`; `#fundForm` submit branches `renameFund()`/`addFund()` on the hidden `#fundId`'s presence; `#deleteFundBtn` visible only in edit mode (toggled by `openFundFormFor`), archives via `confirm()` → `archiveFund()` inside `withBusy()`, mirroring `#deleteProfileBtn`'s exact shape.
- [x] 5.8 `src/main.js` — `#fundMovementForm` submit wraps `addFundMovement(fundId, { type, amount, note, date })` in `withBusy()`, closes `#fundMovementFormOverlay` on success; a thrown `ApiError` (e.g. `409 insufficient_funds`, `409 fund_archived`) surfaces through the existing `showError()` banner path, same as every other `withBusy()`-wrapped handler. `openFundMovementFormFor()` sets `#movementDate` via the existing `toDateInputValue()` and fills `#movementBalanceHint` via `formatCurrency(getFundBalance(fundId), currency)` (imported from `./utils.js`, not a duplicated `Intl.NumberFormat` call).
- [x] 5.9 Verified (no code change needed): both new overlays use the identical `class="overlay"` + `[data-close]` markup shape as `#categoryFormOverlay`/`#profileFormOverlay`, so the existing module-load-time `document.querySelectorAll('[data-close]').forEach(...)` wiring (`src/main.js:36-38`) picks them up automatically, because they are static `index.html` markup present at module-load time, not dynamically rendered.
- [x] 5.10 `src/style.css` — added `.funds-section` (flex column), `.funds-list` (flex column, 10px gap, matches `.categories-list`), `.fund-card` (same card shell as `.category-card`/`.summary-card`: surface background, `--radius-lg`, shadow), `.fund-header`, `.fund-name`, `.fund-balance` (1.3rem/700 weight, `--color-ok` green — a positive quantity of money, distinct from `.transaction-amount`'s red "money spent" convention, which is the correct semantic: a fund balance is money held, not money gone), `.fund-meta`, `.fund-actions` (flex row, reuses `.btn-link`/`.btn-icon-sm` from the existing stylesheet, zero new button classes).

### Completed Tasks — Phase 6 (Contract & Integration Tests)

- [x] 6.1 `tests/contract/isolation.test.js` fund-isolation matrix (GET zero cross-profile funds; GET/POST movements foreign-id `404`) — **already fully covered** by `tests/contract/funds.test.js`'s "Cross-profile isolation" describe block (PR2, task 2.7, lines 288-341): exercises exactly `GET /api/funds` (zero foreign funds), `PATCH`/`DELETE`/`POST .../movements` all returning `404` for a foreign fund id. No duplicate test added to `isolation.test.js` for this exact matrix, per the apply instructions' explicit "only add what's genuinely missing" directive — verified by reading the file before writing anything new.
- [x] 6.2 `tests/contract/isolation.test.js` — **genuinely missing**, added: `describe('Fund movement totals isolation (task 6.2)', ...)` with 2 tests — (a) a deposit recorded under profile A leaves profile B's `totals.fundDeposits`/`fundWithdrawals` at `0` and `fundMovements` at `[]` after switching; (b) profile A's `totalAvailable` is unchanged by profile B recording its own deposit to its own fund after switching back to A. Neither test existed before this PR — the pre-existing fund-totals tests (PR3, `months.test.js` task 3.7) only exercised a single profile.
- [x] 6.3 Fund-movement-materializes-month interaction — **genuinely missing**, added to `tests/contract/funds.test.js`: `describe('Fund movement materializes the month (task 6.3)', ...)` — materializes the prior month via income, confirms the next month's `carryForward.available` starts `true`, records a fund deposit, confirms the month is now `materialized: true` and `carryForward.available` flipped to `false`. Pins design.md's "New Risks Discovered During Design" entry ("A fund movement materializes the month, silently disabling the carry-forward banner") as an explicit contract instead of an implicit side effect.
- [x] 6.4 `tests/contract/migration.test.js` `003` up/down contract — **already fully covered** by PR1 (tasks 1.2–1.5): `describe('server/migrations/003_savings_investment_funds.js', ...)` has exactly the three required cases (up creates both tables with exact shape; down refuses once a movement exists; down succeeds and restores the exact pre-003/002 shape on an empty ledger). Verified by reading the file before writing anything; no new test added.
- [x] 6.5 GREEN: `npm test -- tests/contract/isolation.test.js tests/contract/funds.test.js` → **44 passed (44)**, 2 test files passed. Full `npm test -- tests/contract/` (via the full suite run below) confirms no cross-profile leakage and all `409` guards trigger correctly.
- [x] 6.6 GREEN: `tests/contract/migration.test.js` passes as part of the full suite below (unchanged in this PR; already green since PR1) — up/down contract and no-data-loss-on-empty-down both hold.

### Completed Tasks — Phase 7 (Final Verification & Documentation)

- [x] 7.1 GREEN: full `npm test` → **158 passed (158)**, 17 test files passed (155 PR1-4 baseline + 3 net-new: 2 in `isolation.test.js`, 1 in `funds.test.js`). Zero unrelated test files modified.
- [x] 7.2 GREEN: `npm run build` → `dist/index.html` (8.60 kB, gzip 1.93 kB), `dist/assets/index-*.css` (6.75 kB, gzip 1.76 kB), `dist/assets/index-*.js` (24.69 kB, gzip 6.78 kB) — built in ~200ms, zero errors. No TypeScript/linting configured in this project (confirmed in `openspec/config.yaml`), so "no TypeScript/linting errors" is vacuously true by project convention, not skipped.
- [x] 7.3 Manual smoke test — see the exact rationale recorded in `tasks.md`'s 7.3 line: this repo has no DOM/UI test layer (confirmed: `tests/` contains only `tests/unit/` and `tests/contract/`), so a literal browser click-through is unavailable to this agent. In its place: (a) confirmed the production `dist/assets/index-*.js` bundle contains the new funds UI code paths via distinguishing literal strings present after minification (`fund-deposit`, `fund-withdraw`, `edit-fund`, `Depositar en el fondo`, `A fondos`); (b) every behavioral step of the smoke-test script runs against a real Express server + real ephemeral Postgres via the contract suite (not mocks) — create/deposit/withdraw/balance-and-availability-change/second-fund/switch/isolation/archive-at-zero/archive-with-balance-409 are all covered by `funds.test.js`, `months.test.js`, and this PR's `isolation.test.js` additions. The one genuinely untested step is the literal DOM paint of the empty-funds-state string, which has the same no-test-coverage precedent as `renderCategories()`'s empty state in this same codebase — not a new gap this change introduces.
- [x] 7.4 Decision log — see "Decision Log (task 7.4)" below.
- [x] 7.5 Deliverable checklist — see "Deliverable Checklist (task 7.5)" below.

### Decision Log (task 7.4)

Both open questions from design.md's "Open Questions" section are resolved as follows, per design.md's own rationale (no new decision made in this PR — documenting the already-implemented choice per task 7.4's instruction):

1. **Fund-card ordering is `created_at ASC`, matching categories** — `server/services/funds.js:listFundsWithBalance()`'s `ORDER BY f.created_at ASC` (PR2) is the implemented and shipped behavior. Balance-descending ordering was considered in design.md but not implemented; the owner has not requested a change, and `created_at ASC` matches `categories`'s own ordering convention exactly (`server/services/categories.js`), so a new user's first-created fund stays first in muscle memory, consistent with how the first-created category already behaves.
2. **Append-only ledger is accepted as-is** — a mistyped deposit is corrected by recording a compensating withdrawal (or vice versa), leaving both rows visible in `GET /api/funds/{id}/movements`'s history. This was design.md's explicit choice ("Decision: the ledger is append-only — no movement edit or delete in this change"), implemented in PR2 (`POST` is the only write to `fund_movements`; no `PUT`/`DELETE` route exists for movements) and never revisited in PR3–PR5. Movement editing remains a possible additive future change, out of scope here.

### Deliverable Checklist (task 7.5)

| Item | Proven by |
|---|---|
| Migration creates tables with exact schema | PR1, `server/migrations/003_savings_investment_funds.js` + `tests/contract/migration.test.js` (up() shape assertions) |
| All constraints enforce derived-balance invariant | PR1, `tests/contract/invariant.test.js` (`FORBIDDEN_COLUMN_NAMES` includes `balance`/`fund_balance`/`total_deposited`/`total_withdrawn`; pinned 8-table list) + the DB-level `CHECK`/composite-FK constraints in `003`'s DDL |
| Server-computed balances ship in bootstrap and month payloads | PR3, `server/services/bootstrap.js` (`funds` array with `balance`) + `server/services/months.js` (`fundMovements` + `totals.fundDeposits`/`fundWithdrawals`); `tests/contract/health-bootstrap.test.js` + `tests/contract/months.test.js` |
| Client cache-leak fixed in `setActiveProfile()` | PR4, `src/state.js:setActiveProfile()` — `cache.funds = payload.funds.map(f => ({ ...f }))` wholesale replacement; dedicated unit test in `tests/unit/state.test.js` |
| Parity test guards against vacuous pass | PR3, `tests/contract/parity.test.js` — asserts `server.body.totals.fundDeposits > 0` in the fund-bearing fixture so an unmodified fixture cannot pass vacuously; widened to full-object `toEqual` in PR4 once the client caught up |
| Fund-movement-materializes-month interaction documented | This PR (PR5), `tests/contract/funds.test.js`'s "Fund movement materializes the month (task 6.3)" — pins design.md's flagged risk as an explicit, executable contract |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npm test -- tests/contract/isolation.test.js tests/contract/funds.test.js` → **44 passed (44)**, 2 test files passed |
| Runtime harness command/scenario and exact result | Full `npm test` (`vitest run`) against the same ephemeral Docker Postgres harness as every prior PR in this change — **158 passed (158)**, 17 test files passed. `npm run build` (`vite build`) → clean production build, 3 output assets, zero errors. Confirmed the minified `dist/assets/index-*.js` genuinely contains the new funds UI code via literal distinguishing strings (`fund-deposit`, `fund-withdraw`, `edit-fund`, `Depositar en el fondo`, `A fondos`) surviving minification — this is the closest available proxy to a browser smoke test, given this repo ships no DOM/UI test harness (confirmed by inspecting `tests/` directory structure: only `tests/unit/` and `tests/contract/` exist, zero browser/jsdom/Playwright layer). |
| Rollback boundary | Revert `index.html`, `src/render.js`, `src/main.js`, `src/style.css` to their PR-4-landed state (Phase 5); revert `tests/contract/isolation.test.js` and `tests/contract/funds.test.js` to their PR-4-landed content (Phase 6); revert the `tasks.md` checkbox updates. This is the final PR in the stacked chain — reverting it returns the app to PR4's state (fund-aware client cache/state exists, but no UI renders or wires it, and the fund-isolation-totals + materialization contract tests do not exist). No server file (`server/*`) was touched in this PR. |

### Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `index.html` | Modified | `.funds-section` (`#addFundBtn`, `#fundsList`) between `#summaryCard` and `.categories-section`; `#fundFormOverlay` and `#fundMovementFormOverlay`, both structurally copied from `#categoryFormOverlay` |
| `src/render.js` | Modified | Added `renderFunds()`, called from `renderApp()`; `renderSummary()` revised to compute `pctUsed`/`status` from fund-aware `outflow`/`inflow`, plus a conditional `fundMeta` row |
| `src/main.js` | Modified | `openFundFormFor()`, `openFundMovementFormFor()`; `#addFundBtn` click; `#fundsList` delegated click (`.edit-fund`/`.fund-deposit`/`.fund-withdraw`); `#fundForm` submit (create/rename branch); `#deleteFundBtn` click (confirm + archive); `#fundMovementForm` submit (`addFundMovement()` wrapped in `withBusy()`); imported `formatCurrency` from `./utils.js` |
| `src/style.css` | Modified | `.funds-section`, `.funds-list`, `.fund-card`, `.fund-header`, `.fund-name`, `.fund-balance`, `.fund-meta`, `.fund-actions` |
| `tests/contract/isolation.test.js` | Modified | Added `describe('Fund movement totals isolation (task 6.2)', ...)` — 2 tests |
| `tests/contract/funds.test.js` | Modified | Added `describe('Fund movement materializes the month (task 6.3)', ...)` — 1 test |
| `openspec/changes/savings-investment-funds/tasks.md` | Modified | Marked tasks 5.1–5.10, 6.1–6.6, 7.1–7.5 complete (55/55 tasks across the whole change now `[x]`) |
| `openspec/changes/savings-investment-funds/apply-progress.md` | Modified | Appended this Phase 5+6+7 record |

### Deviations from Design

None in Phase 5 — `index.html`, `src/render.js`, and `src/main.js` all transcribe design.md's exact code blocks (`renderFunds()`, the revised `renderSummary()` destructure/formula, the `#fundsList` delegated listener, the `#fundMovementForm` submit handler) with one cosmetic improvement: design.md's own `openFundMovementFormFor()` sketch does not show how `#movementBalanceHint` formats currency; this PR uses the existing `formatCurrency()` utility from `src/utils.js` (already imported by `render.js` for the identical purpose) instead of a duplicated inline `Intl.NumberFormat` call, consistent with "don't duplicate the currency-formatting logic" being an unstated but obvious extension of this codebase's existing DRY convention (`formatCurrency` already exists specifically to avoid this duplication).

Phase 6: task 6.1's literal instruction ("modify `tests/contract/isolation.test.js`") was reconciled against the actual state of the test suite — the exact fund-isolation matrix it describes already exists, fully, in `tests/contract/funds.test.js` (landed in PR2). Rather than duplicate three already-passing assertions into a second file for the sake of literal task-text compliance, this PR followed the apply instructions' own explicit override ("only add what's genuinely missing per tasks.md 6.1–6.6's exact wording") and added only the two genuinely new assertions task 6.2 requires. This mirrors the precedent PR2/PR3/PR4 all established: literal task/spec prose yields to design.md and to the actual repository state when they diverge, and the divergence is documented rather than silently resolved.

### Issues Found

None blocking. The `Acquire connection error: Connection terminated unexpectedly` log line (same documented ephemeral-Postgres-pool noise as every prior PR in this change) appeared once during the full-suite run in this PR; the reported pass count (158/158) was unaffected, consistent with every prior PR's identical observation.

### Remaining Tasks

None. This was the final PR (5 of 5) in the stacked chain. All 7 phases, 55/55 tasks, are complete.

### Workload / PR Boundary

- Mode: stacked PR slice (PR 5 of 5, `stacked-to-main`) — final PR in the chain
- Current work unit: Unit 5 — "Client UI rendering + event handlers + full integration" (per tasks.md's Suggested Work Units table), extended in this PR to also close out Unit 6/7's genuinely-missing items since Phase 5 alone landed comfortably under budget
- Boundary: starts from PR4's landed fund-aware client cache/state (zero UI rendering or wiring); ends with the full funds UI surface (section, two overlays, rendering, event wiring, styling) plus the two genuinely-missing Phase 6 contract tests and Phase 7's full-suite/build verification — the entire `savings-investment-funds` change is now feature-complete end to end
- Estimated review budget impact: `git diff --stat` for this PR's 7 changed files (excluding `apply-progress.md` itself): **327 insertions, 22 deletions = 349 authored changed lines** — under the 400-line budget for this slice, consistent with the Suggested Work Units table's estimate for Unit 5; no `size:exception` needed

### Status

21/21 tasks complete for this PR: Phase 5 (10) + Phase 6 (6) + Phase 7 (5). Combined with Phase 1 (6) + Phase 2 (9) + Phase 3 (9) + Phase 4 (10): **55/55 tasks complete across the entire `savings-investment-funds` change (PR 1 + PR 2 + PR 3 + PR 4 + PR 5).** Ready for verify. Ready for verify.
