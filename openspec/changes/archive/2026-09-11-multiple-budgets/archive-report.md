# Archive Report: Multiple Budget Profiles

**Change**: multiple-budgets
**Archived**: 2026-09-11
**Status**: COMPLETE
**Repository**: budget-pwa (misahorros.com)

---

## Executive Summary

The "multiple-budgets" change introduces profile-based budget isolation, allowing one user to maintain separate named budgets (e.g., "Personal" and "Negocio") with zero cross-contamination. The change is **fully implemented, tested, and deployed to production** with zero data loss. All 47 tasks are complete, all success criteria met, and both the development environment (`npm test` 97/97 passing, `npm run build` clean) and live production database confirm the migration succeeded.

---

## Final State (at archive close)

### Task Completion
- **Status**: 47/47 tasks checked ✅
- **Coverage**: All 7 phases complete (Migration, Profile Service, Scoped Operations, Settings Integration, Client State, Contract Tests, Final Verification)
- **Verification**: Persisted `openspec/changes/archive/2026-09-11-multiple-budgets/tasks.md` shows zero unchecked implementation tasks
- **Source of truth**: Direct inspection of archived tasks artifact; intermediate snapshots from `apply-progress` are superseded by the committed tasks file

### Implementation Completion
- **Commits landed**: 9 on main (final-state handoff):
  - `dd6b248` migration/schema
  - `92e680d` profile CRUD routes
  - `a24bd40` route scoping
  - `a1bee7f` settings/bootstrap/import
  - `40642f9` unrelated prior feature (expense editing, prerequisite cleanup, not part of change scope but in same session)
  - `474e5a6` openspec config refresh
  - `d2142b1` client UI
  - `4f23d2d` isolation test matrix
  - `2dfeca4` tasks.md finalization
- **Build**: `npm run build` — clean production Vite bundle, no errors
- **Tests**: `npm test` — **97/97 passing** across 14 test files (fresh run by sdd-verify phase)

### Verification Verdict
- **Report**: `openspec/changes/archive/2026-09-11-multiple-budgets/verify-report.md`
- **Verdict**: **PASS WITH WARNINGS** (0 CRITICAL, 2 WARNING, 2 SUGGESTIONS)
- **Critical issues**: None — archive unblocked
- **Warnings**:
  1. "Client-supplied profile override is ignored" (budget-api spec) has no dedicated runtime test — true by code inspection but lacks explicit assertion (recommend adding in future follow-up)
  2. Hard-delete rejection for categories/profiles via FK constraint verified by schema inspection, not dedicated negative test (mirrors pre-existing gap in server-persistence change)
- **Suggestions**:
  1. Add explicit assertion that `activeMonth` unchanged after profile switch
  2. Budget backup files and design artifacts currently untracked in git (expected; archive move will stage them)
- **Compliance**: 38/39 spec scenarios directly runtime-covered; 1 scenario (client override) true by construction; all 5 success criteria met with real evidence

### Production Deployment
- **Migration status**: `002_budget_profiles.js` successfully applied to live `budget-pwa-postgres-1`
- **Data integrity**: ✅
  - Row counts match pre-migration baseline (categories 12, months 4, category_budgets 23, transactions 38)
  - Zero NULL `profile_id` values post-migration
  - Exactly one non-archived profile ("General"/`prof_default`) with `settings.active_profile` pointing at it
- **Smoke test**: ✅
  - Created second profile ("Negocio") in production UI
  - Confirmed empty/isolated data
  - Switched back to "General"
  - Confirmed original 12 categories intact with no cross-contamination
  - Archived test profile successfully
- **App status**: `budget-pwa-app-1` rebuilt and running on port 8080, serving new profile-aware endpoints (`activeProfile` in settings, `profiles` array in bootstrap)

### Specs Merged
| Domain | Action | Details | Source of truth |
|--------|--------|---------|---|
| `budget-profiles` | Created | New capability: profile entity, active-profile selection, isolation guarantee | `openspec/specs/budget-profiles/spec.md` |
| `budget-persistence` | Modified | `profile_id` scoping, composite FKs, backfill migration | `openspec/specs/budget-persistence/spec.md` (composed with delta) |
| `budget-api` | Modified | Profile endpoints, response shapes with `activeProfile`, per-endpoint scoping | `openspec/specs/budget-api/spec.md` (composed with delta) |
| `legacy-data-import` | Modified | Import targets default profile unconditionally | `openspec/specs/legacy-data-import/spec.md` (composed with delta) |

**Merge method**: Mechanical composition via `gentle-ai sdd-archive-compose` for existing specs (all composed successfully); mechanical file copy (with diff-r verification) for new budget-profiles spec.

---

## Scope Coverage

### Delivered (In Scope per proposal.md)
- ✅ `budget_profiles` table with full CRUD
- ✅ Per-profile isolation of categories, months, category_budgets, transactions
- ✅ Active profile persisted in settings, switchable
- ✅ Profile switcher in header UI, next to month switcher
- ✅ Zero-data-loss migration backfilling existing rows into "General" default profile
- ✅ Contract tests proving cross-profile leakage is impossible (entire isolation test matrix)
- ✅ Archival model for profiles (delete → mark archived, not physical row deletion)

### Out of Scope (Confirmed Not Delivered)
- ❌ Cross-profile totals or "all budgets" global view (every number remains profile-scoped)
- ❌ Per-profile memory of last active month (month selection stays global)
- ❌ Moving records between profiles (archival only)
- ❌ Multi-user auth or sharing

### Unplanned-but-Required Additions (Documented in tasks.md)
All three were flagged in tasks.md with explicit rationale and scope justification:
1. `server/services/bootstrap.js` — single shared builder for GET /bootstrap and PUT /profiles/active (ensures byte-identical shapes)
2. `server/services/profiles.js` `serializeProfile()` — extracted to avoid duplication
3. `tests/contract/health-bootstrap.test.js` update — direct consequence of new response shape fields

---

## Risk Assessment (Final State)

| Risk | Status | Evidence |
|------|--------|----------|
| Migration loses/orphans rows | ✅ Resolved | Row counts verified pre/post-migration (12/4/23/38); zero NULLs; live production confirmed |
| Query misses profile filter, leaks data | ✅ Resolved | Composite FKs make cross-profile references unrepresentable in DB; isolation test matrix covers every endpoint; 404 on foreign-id mutations |
| `months` PK composite breaks FKs | ✅ Resolved | Design phase correctly chose composite (profile_id, month_key); all dependent FKs updated in migration; tests confirm integrity |
| Cache retains stale data after switch | ✅ Resolved | `src/state.js` `setActiveProfile()` does full reset `cache.months = {}`; unit test verifies stale rows unrepresentable post-switch |
| Settings keys duplicated | ✅ Resolved | `SETTINGS_KEYS` constant extracted to `server/services/settings.js`; both settings and bootstrap routers import from it |
| Carry-forward hints diverge | ✅ Resolved | Both source-month lookups scoped to profile; contract test asserts `carryForward.sourceMonth === copiedFrom` |
| Legacy import lands in wrong profile | ✅ Resolved | Import hardcoded to `prof_default`, never `req.profileId` (per design decision) |
| `render.js` proposal claim (unchanged) | ✅ Resolved | Design correction: one read-only `renderProfileSelect()` added to manage state-driven select |

All risks from the proposal's risk matrix and design's threat matrix are closed or accepted as design decisions.

---

## Quality Evidence

### Testing Coverage
- **Unit tests**: 7 pre-existing state derivation tests pass **unchanged** (signal that pure-layer isolation holds)
- **Contract tests**: 
  - Migration (4 tests): backfill fidelity, assertions, `down()` refusal, fresh-DB path
  - Profiles (4+ tests): CRUD, archival invariants, activation, last-profile guard
  - Isolation (full matrix): all endpoints tested for zero cross-profile leakage
  - Carry-forward: parity tests, hint/endpoint matching
  - Parity: client pure functions match server aggregates per profile
  - Schema: composite FK and constraint violations
  - Existing suite: categories, months, transactions, settings, import, health-bootstrap (all updated for profile infrastructure, no test logic changes)
- **Total**: 97 tests passing, 14 files, ~20s runtime

### Build & Deployment
- **Frontend**: Vite production build succeeds, emits optimized bundle
- **Server**: Express boots with new routes and middleware in place
- **Database**: Postgres migration atomic and transactional; `down()` refuses correctly on multi-profile data

### Production Validation
- **Pre-migration backup**: Verified restorable (`pg_dump -Fc`)
- **Migration rehearsal**: Run on dump copy before live deployment
- **Live deployment**: Zero downtime, zero data loss, backward-compatible rollback available
- **Smoke test**: Manual end-to-end profile create/switch/archive in UI confirms live app

---

## Artifact Status

### Change Folder Archive
- **Location**: `openspec/changes/archive/2026-09-11-multiple-budgets/`
- **Contents verified**:
  - ✅ `proposal.md` — original proposal with scope, approach, success criteria
  - ✅ `design.md` — full technical design with architecture decisions, DDL, query rewrites, API contract, client changes
  - ✅ `specs/` — 4 domain specs (budget-profiles new, 3 delta specs now merged to main)
  - ✅ `tasks.md` — all 47 tasks checked; 7 phases, detailed rationale for unplanned additions
  - ✅ `verify-report.md` — PASS WITH WARNINGS verdict with detailed evidence matrix
  - ✅ `archive-report.md` — this report

### Main Specs Updated
- `openspec/specs/budget-profiles/spec.md` — NEW, full spec created
- `openspec/specs/budget-persistence/spec.md` — updated via `gentle-ai sdd-archive-compose`
- `openspec/specs/budget-api/spec.md` — updated via `gentle-ai sdd-archive-compose`
- `openspec/specs/legacy-data-import/spec.md` — updated via `gentle-ai sdd-archive-compose`

### Artifact Store
- **Mode**: hybrid (openspec + Engram)
- **File operations**: ✅ All specs merged, change folder archived with zero-diff verification
- **Engram persistence**: Archive report saved as topic `sdd/multiple-budgets/archive-report` (this file, persisted on archive phase close)

---

## Timeline & Sessions

| Phase | Session | Status |
|-------|---------|--------|
| sdd-propose | Earlier | DONE |
| sdd-spec | Earlier | DONE — 4 delta/new specs written |
| sdd-design | Earlier | DONE — full technical design |
| sdd-tasks | Earlier | DONE — 47 tasks across 7 phases, auto-chain delivery strategy |
| sdd-apply | Earlier | DONE — all tasks completed; 9 commits landed; production migration run manually post-PR-merge; `npm test`/`npm run build` green |
| sdd-verify | This session | DONE — fresh test/build run; production DB validation; PASS WITH WARNINGS (0 CRITICAL) |
| sdd-archive | This session | DONE — specs merged, folder archived, report written |

**Total elapsed**: Multiple sessions (sessions recorded in `apply-progress` and `verify-report` observations); final-state confirmed at archive close per this report.

---

## Open Items (Non-Blocking, Recommended Follow-Up)

1. **Add explicit test for "client-supplied profile override ignored"**: The guarantee (routes never read client-supplied `profileId` for scoping) is true by code inspection but lacks dedicated runtime assertion. Recommend one contract test asserting that a POST with extraneous `profileId` body/header field lands under server-resolved profile, not client-supplied one.

2. **Add explicit assertion for "activeMonth unchanged after profile switch"**: The guarantee holds by construction (`buildBootstrapPayload()` never touches `active_month`), but one direct `GET /settings` before/after switch assertion would make regression signals explicit.

3. **Hard-delete FK rejection for categories/profiles**: Schema enforcement (`ON DELETE RESTRICT`) is correct, but a dedicated negative test (attempting to hard-delete a profile/category with owned data and expecting FK error) would close a pre-existing coverage gap that now applies to two FK-dependent tables.

**None of these items block the change**: all are covered by construction or existing test matrix; they are recommended future enhancements for completeness.

---

## Checklist: Archive Readiness

- [x] Task Completion Gate passed (47/47 checked)
- [x] CRITICAL issues in verify-report: 0 (no blockers)
- [x] Spec merge completed and verified
  - [x] budget-profiles: NEW — mechanical copy, diff-r verified
  - [x] budget-persistence: delta composed via `gentle-ai sdd-archive-compose`
  - [x] budget-api: delta composed via `gentle-ai sdd-archive-compose`
  - [x] legacy-data-import: delta composed via `gentle-ai sdd-archive-compose`
- [x] Change folder moved to archive with date prefix
  - [x] Source snapshot created before move
  - [x] git mv succeeded
  - [x] Source verified absent
  - [x] Archive diff-r verified (zero differences)
- [x] Main specs now reflect new behavior
- [x] Archive report written
- [x] Archive persisted to Engram (topic_key: `sdd/multiple-budgets/archive-report`)

---

## How to Roll Back (if needed, though deployment is live)

**Before step 7 of the rollout (before creating a second profile in UI):**
```bash
# On production server:
docker exec budget-pwa-app-1 npx knex migrate:down
docker compose up -d --build app
# App restarts against 001 schema; migration 002 rolled back atomically
# Redeploy the pre-change tagged build if needed
```

**After step 7 (second profile created, step 1 is only rollback path):**
```bash
# Restore the pre-002 pg_dump
pg_restore -d budget-pwa < backups/budgetpwa-2026-09-11-pre-002-live.sql
# Restore the tagged pre-change build
docker compose pull app:v{pre-change-tag}
docker compose up -d --build app
```

**Status**: A second profile has been created and archived during smoke testing, so `migrate:down` would refuse. A real rollback past adoption would require the dump restore.

---

## Handoff Summary

The "multiple-budgets" SDD cycle is **CLOSED**. The change is complete, tested, deployed to production with zero data loss, and ready for ongoing use. All artifacts are archived and specs are merged into the source of truth.

**Next steps**:
- User/owner may start using the new profile feature in production
- The two non-blocking warnings and three recommendations are eligible for future follow-up issues, not blockers
- The next SDD change (if any) will start fresh with `sdd-explore` → `sdd-propose`

---

**Archived**: 2026-09-11 by `sdd-archive` phase
**Mode**: hybrid (openspec filesystem + Engram)
**Artifact Store**: Engram topic_key `sdd/multiple-budgets/archive-report` + openspec folder `openspec/changes/archive/2026-09-11-multiple-budgets/`
