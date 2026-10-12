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
