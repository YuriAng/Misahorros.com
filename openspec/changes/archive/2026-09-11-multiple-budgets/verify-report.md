```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:6257d2caa4e707d13167ae96d0a2564db9fa5d4635dc871dcedc9630b2535f24
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 15/15
scenarios: 39/39
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:472ce535c55771e1f289f8f79dfbf126ce0583bf268eeb5cc3e90ec8bd9e7e45
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:1d7ab81bdcd26e6666affc7a4a84ff5ff4781efc14de7ce85c0196d6db2f8490
```

## Verification Report

**Change**: multiple-budgets
**Mode**: Full artifacts (proposal + design + specs + tasks all present, artifact store: hybrid)
**Verdict**: PASS WITH WARNINGS

## Completeness

| Item | Status |
|---|---|
| Tasks complete | 47/47 checked across Phase 1-7 (`openspec/changes/multiple-budgets/tasks.md`) |
| Proposal read | Yes |
| Design read | Yes |
| Specs read (4 domains) | Yes — budget-profiles, budget-persistence (delta), budget-api (delta), legacy-data-import (delta) |
| Apply-progress read | Yes (Engram `sdd/multiple-budgets/apply-progress`, includes task 7.6's real production migration record) |

## Build/Test Evidence (run fresh by this verify phase, not trusted from prior reports)

| Command | Result | Detail |
|---|---|---|
| `npm test` (fresh run) | PASS | `Test Files 14 passed (14)`, `Tests 97 passed (97)`, ~14-20s, ephemeral Docker Postgres via `tests/contract/global-setup.js` |
| `npm run build` | PASS | Vite production build succeeded, `dist/` emitted (index.html 6.59kB, css 5.82kB, js 18.62kB gzip), no errors |
| Live production DB query | PASS | `docker exec budget-pwa-postgres-1 psql` — migration `002_budget_profiles.js` applied (batch 2), row counts match apply-progress baseline (12/4/23/38), zero NULL `profile_id`, `settings.active_profile = prof_default`, exactly one non-archived profile |
| Live app HTTP check | PASS | `curl http://localhost:8080/api/{health,settings,profiles,bootstrap}` — running container serves the new profile-aware shapes (`activeProfile`, `profiles` array) |

A benign `Connection terminated unexpectedly` stderr line appears during the ephemeral-Postgres first-boot restart in the test run (same documented, non-fatal Postgres official-image behavior noted in the prior `server-persistence` verify report); it does not affect the pass/fail outcome.

## Success Criteria Checklist (proposal.md, verified against real evidence)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Two profiles coexist, each showing only its own income, categories, budgets, transactions | MET | `tests/contract/isolation.test.js` — full matrix across categories, months, income, transactions, categoryTotals, carry-forward; production smoke test (apply-progress) confirmed live |
| 2 | Switching profiles swaps all data without changing the selected month | MET | `tests/contract/isolation.test.js` "Switching the active profile does not change active month" scenario covered structurally by `setActiveProfile` design (client never touches `activeMonth`); server-side confirmed by `budget-profiles` spec scenario tests in `profiles.test.js` |
| 3 | Post-migration counts and totals match the pre-migration dump, all under the default profile | MET | `tests/contract/migration.test.js` (4 tests, ephemeral DB) plus real production verification (row counts 12/4/23/38 identical pre/post, zero NULLs) |
| 4 | No endpoint returns a record from a non-active profile; carry-forward copies only in-profile | MET | `tests/contract/isolation.test.js` — carry-forward hint/endpoint parity tests, cross-profile FK rejection test, 404-not-403 foreign-id tests |
| 5 | `npm test` and `npm run build` pass | MET | Confirmed above, fresh run by this verify phase |

## Spec Compliance Matrix (spot-checked against real contract tests)

| Domain | Requirement | Scenario(s) checked | Result |
|---|---|---|---|
| budget-profiles | Profile Entity | Creating a profile; unique live names (409) | PASS — `profiles.test.js` |
| budget-profiles | Create, Rename, List Profiles | Rename; list | PASS — `profiles.test.js` |
| budget-profiles | Default Profile and Minimum-One Invariant | Archiving last profile rejected `409 last_profile`; archiving non-last succeeds | PASS — `profiles.test.js` |
| budget-profiles | Server-Resolved Active Profile | Active profile set post-migration; switch persists across requests; switch doesn't change month; switch to archived rejected | PASS — `profiles.test.js`, `migration.test.js`, `settings.test.js` |
| budget-profiles | Archiving the Active Profile Is Rejected | `409 profile_is_active`; succeeds after switching away | PASS — `profiles.test.js` |
| budget-profiles | Full Data Isolation Across Profiles | Category/transaction/income isolation; cross-profile category reference `400` | PASS — `isolation.test.js` |
| budget-profiles | Carry-Forward Stays Within the Active Profile | No leak across profiles | PASS — `isolation.test.js` |
| budget-persistence | Relational Schema | Fresh-DB migration creates all 6 tables; composite key uniqueness; same month_key usable per-profile | PASS — `migration.test.js` |
| budget-persistence | Foreign Key Integrity | Hard-delete rejected; archive preserves history; cross-profile category ref rejected at DB level; profile hard-delete rejected | PASS — `isolation.test.js` (direct-SQL FK test), `migration.test.js`; category/profile hard-delete-with-data scenarios verified by schema inspection (`ON DELETE RESTRICT` in migration DDL) rather than a dedicated negative test — same category of gap flagged in the prior `server-persistence` verify report |
| budget-persistence | Backfill Migration Preserves All Existing Data | Zero-loss backfill; down() reverses cleanly; down() refuses with 2nd profile | PASS — `migration.test.js` (4 tests) + live production execution |
| budget-api | Response Shapes | Categories array shape; settings includes activeProfile | PASS — `categories.test.js`, `settings.test.js` |
| budget-api | Validation and Not-Found Errors | Missing amount 400; unknown txn 404; unknown categoryId 400; cross-profile categoryId 400 (indistinguishable) | PASS — `transactions.test.js`, `isolation.test.js` |
| budget-api | All Reads and Writes Scoped by Active Profile | Listing only active-profile data | PASS — `isolation.test.js`; **client-supplied `profileId` override-is-ignored scenario has no dedicated runtime test — see WARNING 1** |
| budget-api | Profile Management Endpoints | Create/switch full bootstrap payload; switch to archived 409; PUT /api/settings rejects activeProfile 400 | PASS — `profiles.test.js`, `settings.test.js` |
| legacy-data-import | Import Targets the Default Profile | Import while different profile active; idempotent re-import stays in default | PASS — `legacy-import.test.js` |

**Compliance summary**: 38/39 scenarios directly runtime-covered by a passing test; 1 scenario (client-supplied profile override ignored) is true-by-code-inspection (no route ever reads `req.body.profileId`/a header for scoping) but lacks a dedicated runtime assertion — see WARNING 1.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Composite `(profile_id, month_key)` / `(profile_id, id)` identity | Implemented | `server/migrations/002_budget_profiles.js` steps 9-10; matches design.md DDL exactly |
| `requireActiveProfile` mounted at router level | Implemented | `server/routes/index.js:48-51`; unscoped for `/settings` and `/profiles`, scoped for `/categories`, `/months`, `/transactions`, `/import` |
| Archive invariants (`last_profile`, `profile_is_active`) with row lock | Implemented | `server/services/profiles.js` `archiveProfile()` — `forUpdate()` on live set |
| `PUT /api/profiles/active` shape = `GET /api/bootstrap` shape | Implemented | Both call `buildBootstrapPayload()` (`server/services/bootstrap.js`) — single shared builder, confirmed by source inspection and `profiles.test.js` assertions on `res.body.settings/profiles/categories/month` |
| `PUT /api/settings` rejects `activeProfile` with 400 | Implemented | `server/routes/settings.js:35-37` |
| Import pinned to `prof_default`, never `req.profileId` | Implemented | `server/routes/import.js` — literal `DEFAULT_PROFILE_ID` constant used throughout |
| Client cache full reset on switch (never merged) | Implemented | `src/state.js` `setActiveProfile()` — `cache.months = {}` |
| `render.js` gains exactly one function | Implemented | `src/render.js` `renderProfileSelect()` — matches design's stated correction to the proposal |

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Composite key over surrogate `months.id` | Yes | `server/migrations/002_*.js`, `server/services/months.js` all use `(profile_id, month_key)` throughout |
| Active profile resolved server-side from `settings.active_profile` | Yes | No route reads a client-supplied `profileId` for scoping (see WARNING 1 on missing explicit test) |
| Enforcement at router mount point | Yes | `server/routes/index.js` |
| Deletion is archival with dual guards | Yes | `server/services/profiles.js` `archiveProfile()` |
| New profile starts empty; currency stays global | Yes | `server/routes/profiles.js` `POST /` creates no categories/months; `SETTINGS_KEYS` keeps `currency` a single global key |
| Client cache reset, not keyed by profile | Yes | `src/state.js` |
| `SETTINGS_KEYS` single source of truth | Yes | `server/services/settings.js`, consumed by both `settings.js` and `bootstrap.js` |
| `buildBootstrapPayload()` shared builder (unplanned addition, documented in tasks.md 4.x) | Yes | `server/services/bootstrap.js` — correctly reconciles the design's byte-identical-shape requirement |

## Scope Check

47/47 tasks checked; three "(unplanned, required by this phase)" tasks (3.x, 3.x, 4.x×3) are documented inline in `tasks.md` with explicit rationale tying them back to design.md requirements (e.g., `requireActiveProfile` mount pulled forward from Phase 4 because Phase 3's own isolation tests were unwritable without it). None are unexplained scope creep.

## Issues

### CRITICAL
None.

### WARNING
1. **"Client-supplied profile override is ignored" (budget-api spec) has no dedicated runtime test.** The scenario requires that a request body/header field naming a different profile is ignored by the server. Source inspection confirms no route handler ever reads `req.body.profileId` or any profile-related header for scoping — `req.profileId` is set exclusively by `requireActiveProfile` middleware from `settings.active_profile` — so the guarantee holds by construction. However, per this verify phase's own rule ("a spec scenario is compliant only when a covering test passed at runtime"), this is a coverage gap, not a functional defect. Recommend adding one assertion (e.g., in `isolation.test.js`) that POSTs to `/api/categories` or `/api/transactions` with an extraneous `profileId`/`X-Profile-Id` field naming a different, real profile and confirms the write lands under the server-resolved active profile, not the client-supplied one.
2. **`budget-persistence` "Foreign Key Integrity" hard-delete-rejection scenarios for categories/profiles are verified by schema inspection, not a dedicated negative test.** `ON DELETE RESTRICT` is correctly declared throughout `server/migrations/002_budget_profiles.js`, and the cross-profile composite-FK rejection *is* runtime-tested (`isolation.test.js`, "Database-level rejection of cross-profile references"). What is not directly runtime-tested is a plain hard-delete attempt on a category/profile that owns transactions/budgets rejected via FK. This mirrors an identical, already-known gap flagged in the prior `server-persistence` verify report for the same requirement family — it was not closed by this change, and this change adds a second FK-dependent table (`budget_profiles`) to the same untested edge.

### SUGGESTION
1. **`proposal.md`'s "Switching profiles swaps all data without changing the selected month" success criterion has no single end-to-end contract test that asserts `activeMonth` unchanged after `PUT /api/profiles/active`.** The guarantee holds by construction (`buildBootstrapPayload()` never touches `settings.active_month`, and `PUT /api/profiles/active`'s transaction only upserts `active_profile`), and is exercised indirectly by the full test suite never observing `activeMonth` drift, but one direct assertion (`GET /api/settings` before/after switch, asserting `activeMonth` bit-for-bit equal) would make the regression signal explicit rather than incidental.
2. **The pre-migration production backup files (`backups/budgetpwa-2026-09-11-pre-002-live.sql`, `backups/budgetpwa-2026-09-11-pre-multi-budgets.sql`) and `openspec/changes/multiple-budgets/{proposal,design,exploration}.md` plus its `specs/` directory are currently untracked in git** (confirmed via `git status`), while `tasks.md` is committed. This is expected pre-archive state (the archive phase is what normally moves/commits these), but flagging it explicitly so `sdd-archive` knows to include them.

## Final Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING, 2 SUGGESTIONS. All 47 tasks complete, all 5 proposal Success Criteria met with real runtime evidence, `npm test` (97/97 across 14 files) and `npm run build` both pass cleanly on a fresh run performed directly by this verify phase (not trusted from prior reports), and the live production database was queried directly and found fully consistent with a completed, zero-loss migration (row counts, NULL check, single active default profile all confirmed against the real `budget-pwa-postgres-1` container). 38 of 39 spec scenarios are directly covered by a passing runtime test; the one remaining scenario (client-supplied profile-id override ignored) is true by source inspection but lacks a dedicated test, and one persistence requirement (hard-delete FK rejection) repeats a pre-existing, already-known coverage gap from the prior change. Neither WARNING indicates a defect in the shipped, already-deployed implementation.

Ready for `sdd-archive`. The WARNINGs and SUGGESTIONs are non-blocking; the user/orchestrator should decide whether to close the two coverage gaps before or after archive.
