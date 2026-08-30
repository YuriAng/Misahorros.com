# Verification Report: server-persistence

**Change**: server-persistence
**Mode**: Full artifacts (proposal + design + specs + tasks all present)
**Verdict**: PASS WITH WARNINGS

## Completeness

| Item | Status |
|---|---|
| Tasks complete | 36/36 checked across Phase 1-8 |
| Proposal read | Yes |
| Design read | Yes |
| Specs read (4 domains) | Yes — budget-api, budget-persistence, legacy-data-import, self-hosted-deployment |
| Apply-progress read | Yes (Engram `sdd/server-persistence/apply-progress`, 7 work units, all independently re-validated PASS) |

## Build/Test Evidence (run fresh by this verify phase)

| Command | Result | Detail |
|---|---|---|
| `npm test` (run 1) | PASS | `Test Files 10 passed (10)`, `Tests 51 passed (51)`, ~8.2s |
| `npm test` (run 2, reproducibility) | PASS | `Test Files 10 passed (10)`, `Tests 51 passed (51)`, ~8.5s |
| `npm run build` | PASS | Vite production build succeeded, `dist/` emitted, no errors |
| Docker container leak check | Clean | `docker ps -a` / `docker volume ls` show zero stray `budget-pwa-test-pg-*` containers or volumes after test runs |

A benign `Connection terminated unexpectedly` line appears in stderr during the ephemeral-Postgres first-boot restart (documented Postgres official-image behavior per the Phase 7 apply-progress report); it does not affect the pass/fail outcome and the suite's retry loop absorbs it — confirmed by two consecutive green runs.

## Success Criteria Checklist (proposal.md, verified against real evidence)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `docker compose up` runs the app; data survives container restarts | MET | `docker-compose.yml` defines exactly `app`+`postgres` with named volume `pgdata`; Phase 8 manual verification (orchestrator, real commands) confirmed healthy startup, restart survival, and full `down`/`up` (no `-v`) survival — recorded in `state.yaml`/apply-progress |
| 2 | All budget operations work against the API | MET | 43 contract tests across settings/categories/months/budgets/transactions all pass against real Postgres via `supertest` |
| 3 | Existing localStorage data imports once, verified by matching totals | MET | `tests/contract/import.test.js` asserts imported counts equal source fixture counts; Phase 5 apply-progress additionally reports a real Playwright click-through of the import banner flow |
| 4 | No GET endpoint creates or mutates records | MET | `months.test.js` and `settings.test.js` assert `months` row count is unchanged (0) across repeated GETs; both response bodies byte-identical |
| 5 | A transaction added while viewing a past month files under its own date's month | MET | `transactions.test.js` — dedicated create-path and update-path Bug Fix B regression tests, both pass |
| 6 | No spent/remaining column exists; balances are computed | MET | `invariant.test.js` queries `information_schema.columns` across the whole `public` schema for 6 forbidden names, asserts zero matches; `parity.test.js` proves server SQL aggregates equal client pure functions, including an over-budget/negative-remaining case |
| 7 | `npm test` runs Vitest with passing calculation and contract tests | MET | Confirmed above — 10 files / 51 tests, 8 unit + 43 contract |

**All 7 success criteria are MET with real runtime evidence, not prose claims.**

## Spec Compliance Matrix (spot-checked against real contract tests)

| Domain | Requirement | Scenario(s) checked | Result |
|---|---|---|---|
| budget-api | Side-Effect-Free Reads | Untouched month zero totals; repeated GETs idempotent | PASS — `months.test.js` |
| budget-api | Transaction Month Derived From Date | Add while viewing different month; edit date moves month | PASS — `transactions.test.js` |
| budget-api | Response Shapes | Categories array field set | PASS — `categories.test.js` |
| budget-api | Validation/Not-Found Errors | Missing amount 400; unknown txn 404; unknown categoryId 400 | PASS — `transactions.test.js` |
| budget-persistence | Relational Schema | Migration creates 5 tables; composite PK uniqueness | PASS — `invariant.test.js` (table existence); composite PK enforced by DDL (`server/migrations/001_init.js`), exercised implicitly by `PUT budgets` route logic, not independently negative-tested |
| budget-persistence | Derived-Balance Invariant | No spent/remaining column; value computed only | PASS — `invariant.test.js`, `parity.test.js` |
| budget-persistence | Foreign Key Integrity | Hard-delete rejected; archive preserves history | **GAP — see WARNING below** |
| legacy-data-import | Idempotent Import | Run twice unchanged; partial-failure retry fills gap | PASS — `import.test.js` |
| legacy-data-import | Import Reports Counts | Summary counts match source; re-run reports 0 new | PASS — `import.test.js` |
| legacy-data-import | Source Data Is Never Deleted | localStorage untouched | PASS (design-level: import route only reads `req.body`, never touches client localStorage; confirmed by source inspection of `server/routes/import.js` — inherently server-side, cannot mutate the browser's storage) |
| legacy-data-import | Malformed Source Rejected | Missing `categories` -> 400, zero rows | PASS — `import.test.js` |
| self-hosted-deployment | Two-Service Compose Topology | `docker compose up` starts both | PASS — Phase 8 manual verification + `docker-compose.yml` inspection |
| self-hosted-deployment | Durable Postgres Storage | Restart / down-up survival | PASS — Phase 8 manual verification |
| self-hosted-deployment | Automatic Migrations on Startup | Migrate before serve; failure blocks startup | PASS by inspection — `docker-entrypoint.sh` uses `set -e` before `exec node server/index.js`; not independently re-verified by this phase (relies on Phase 6 work-unit validation + Phase 8 manual checklist) |

## Design Coherence

| Design decision | Code match |
|---|---|
| Express as sole API+static layer | `server/index.js` serves `dist/` + `/api` router — confirmed |
| Knex migrations from entrypoint | `docker-entrypoint.sh`: `npx knex migrate:latest` then `exec node server/index.js` — confirmed |
| `months` row created only by writes | `server/services/months.js` materialization logic; `months.test.js`/`settings.test.js` confirm GETs never create it — confirmed |
| Carry-forward as explicit endpoint, 409 if materialized | `months.test.js` carry-forward tests (200 + 409 cases) — confirmed |
| `month_key` server-derived via `APP_TZ` | `transactions.test.js` Bug Fix B tests pass; apply-progress documents the UTC-4 month-boundary pitfall was caught and fixed in test fixtures | 
| No spent/remaining columns; two derivation sites reconciled by parity test | `invariant.test.js` + `parity.test.js` — confirmed |
| `render.js` untouched | `git diff main..feat/server-persistence-07-contract-tests --stat` shows no `src/render.js` entry — confirmed |
| `ON DELETE RESTRICT` FKs, no `DELETE /api/categories` route | Confirmed via `grep` on `server/migrations/001_init.js` (both FK columns) and `server/routes/categories.js` (no delete handler) — correct, but not test-covered (see WARNING) |

## Scope Check

`git diff main..feat/server-persistence-07-contract-tests --stat`: 40 files changed, all within the described surface — `server/`, `src/{api.js,main.js,state.js,storage.js,style.css}`, `tests/{unit,contract}/`, `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `.env.example`, `knexfile.js`, `package.json`/`package-lock.json`, `vitest.config.js`, `openspec/config.yaml`, `openspec/changes/server-persistence/tasks.md`. `src/render.js` is absent from the diff as designed. No unexpected files. `src/style.css` gained banner styles not itemized in design.md's File Changes table — reasonable companion to the Phase 5 import/error-banner UI work, not scope leakage (see SUGGESTION).

## Bug Fix / Invariant Coverage Confirmation (explicit ask)

| Item | Real test | Result |
|---|---|---|
| No-write-on-GET (Bug Fix A) | `tests/contract/months.test.js` "never creates a months row across repeated GETs"; `tests/contract/settings.test.js` "never creates a months row as a side effect of setting activeMonth" | PASS |
| Month derived from date (Bug Fix B) | `tests/contract/transactions.test.js` — create-path and update-path tests | PASS |
| Derived-balance invariant | `tests/contract/invariant.test.js` (schema inspection) + `tests/contract/parity.test.js` (value equivalence, incl. over-budget case) | PASS |

All three are covered by tests that actually ran and passed in this verification's fresh `npm test` execution — not only claimed in prior work-unit prose.

## Issues

### CRITICAL
None.

### WARNING
1. **Foreign Key Integrity requirement (budget-persistence) lacks an automated regression test.** Both scenarios — "hard-deleting a category with transactions is rejected via FK" and "archiving a category preserves queryable history" — have no covering test in `tests/contract/`. The `ON DELETE RESTRICT` constraint is correctly declared in `server/migrations/001_init.js` (confirmed by direct inspection) and was manually verified against real Postgres during the Phase 2 work-unit's independent validation, but that check is not captured as a repeatable test that runs with `npm test`. A future migration edit could silently weaken this guarantee with nothing to catch it. Recommend adding a `tests/contract/persistence.test.js` (or similar) that attempts a raw hard-delete against a category with an existing transaction/budget and asserts the FK violation, plus a test that archives a category and confirms its transactions/budgets remain queryable.

### SUGGESTION
1. **No dedicated fast unit test for server-side `monthKeyFromDate(date, APP_TZ)`.** design.md's Testing Strategy table calls for one, including the UTC-4 month-boundary edge case. It is currently only exercised indirectly through HTTP-level Bug-Fix-B tests in `transactions.test.js` (which require the full ephemeral-Postgres harness to run). This gap was already self-flagged in the Phase 7 apply-progress report. Low risk since the behavior is correctly covered end-to-end, but a pure-function unit test would give faster, more isolated feedback on timezone-boundary regressions.
2. **`src/style.css` additions (`.import-banner`, `.error-banner`) are not itemized in design.md's File Changes table.** Functionally correct and necessary for the Phase 5 UI work (confirmed via the Playwright click-through in apply-progress); purely a design-document completeness gap, not a functional defect.

## Final Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 1 WARNING, 2 SUGGESTIONS. All 36 tasks complete, all 7 proposal Success Criteria met with real runtime evidence, `npm test` (51/51) and `npm run build` both pass cleanly on a fresh run, and the two explicit bug fixes plus the derived-balance invariant are each demonstrably covered by real passing tests. The one WARNING (missing FK-integrity regression test) does not indicate a defect in the shipped implementation — the constraint is correctly declared and was manually verified with real Postgres in a prior work unit — but it is a real, closable coverage gap the orchestrator/user should be aware of before archiving.

Ready for `sdd-archive`. The WARNING and SUGGESTIONS are non-blocking; the user/orchestrator should decide whether to close the FK-integrity test gap before or after archive.
