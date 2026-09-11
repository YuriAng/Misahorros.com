# Tasks: Multiple Budget Profiles

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400–1,600 (1 migration, ~6 server files, ~4 client files, ~6 contract test files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 |
| Delivery strategy | auto-chain (orchestrator selected) |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migration + backfill + assertions | PR 1 | `npm test -- tests/contract/migration.test.js` | `npx knex migrate:latest` against ephemeral Postgres | Revert `server/migrations/002_*.js`, `server/services/profiles.js` (new); nothing else depends on it yet |
| 2 | Profile service + profile CRUD routes | PR 2 | `npm test -- tests/contract/profiles.test.js` | Same server + Postgres as PR 1 | Remove `server/routes/profiles.js`, `server/services/profiles.js` refinements; settings/bootstrap not yet updated |
| 3 | Profile-scoped reads/writes across all routes | PR 3 | `npm test -- tests/contract/isolation.test.js` | Same as above; profile infrastructure from PR 2 now in place | Revert scoping predicates in categories/months/transactions/import; endpoints no longer filter by profile |
| 4 | Settings/bootstrap integration + schema fixes | PR 4 | `npm test -- tests/contract/{settings,import,health-bootstrap}.test.js` | Same as above | Revert settings key extraction, bootstrap profile list, import targeting |
| 5 | Client state + UI + final integration tests | PR 5 | `npm test` (full suite) | `npm run build && npm run preview` against running API | Revert `src/state.js`, `src/api.js`, `src/storage.js`, `index.html`, `src/render.js`, `src/main.js` |

---

## Phase 1: Migration Foundation

Implement migration `002_budget_profiles.js` with a full-transaction backfill and composite-key reshaping. This phase must be completed first because all downstream code depends on the `profile_id` columns and `budget_profiles` table.

- [x] 1.1 Write RED test: `tests/contract/migration.test.js` — backfill on `001` schema with seeded data verifies post-migration counts match pre-migration, all rows belong to `prof_default`, `active_profile` is set
- [x] 1.2 Write RED test: migration `down()` succeeds when only default profile owns data; `down()` throws when a second profile owns rows
- [x] 1.3 Create `server/migrations/002_budget_profiles.js`: profiles table + default profile insert + nullable columns + backfill loop + row-count assertions + NOT NULL enforcement + composite FK/PK reshaping + `active_profile` UPSERT
- [x] 1.4 Implement `down()` in migration: refuse on non-default-profile data; reverse composite FKs/PKs; drop columns; drop table; delete `active_profile` key
- [x] 1.5 GREEN: run migration tests; verify assertions catch drift and truncation; verify rollback path
- [x] 1.6 Create `server/services/profiles.js`: stub `requireActiveProfile` middleware (passes for now, resolves in Phase 2)

---

## Phase 2: Profile Service & CRUD Routes

Introduce profile resolution middleware and the profile management API. After this phase, profiles can be created, renamed, archived, and listed; the server can resolve the active profile from settings.

- [x] 2.1 Write RED test: `tests/contract/profiles.test.js` — create new profile succeeds; duplicate live name returns `409`; archived profile does not block new one with same name
- [x] 2.2 Write RED test: list includes live + archived; rename works; archive works; last profile cannot be archived (`409 last_profile`); active profile cannot be archived (`409 profile_is_active`)
- [x] 2.3 GREEN: implement `server/services/profiles.js`: `requireActiveProfile` reads `settings.active_profile`, sets `req.profileId`, throws 500 if `active_profile` is unset (should never happen after migration); archive validation logic
- [x] 2.4 GREEN: create `server/routes/profiles.js`: `GET /api/profiles` (optional `?includeArchived=1`); `POST /api/profiles` (create with optional id, validate name not blank); `PATCH /api/profiles/:id` (rename); `DELETE /api/profiles/:id` (archive with invariant checks)
- [x] 2.5 Verify `requireActiveProfile` middleware integrates with router mounts in `server/routes/index.js` (Phase 4 will wire them)

---

## Phase 3: Profile-Scoped Read/Write Operations

Rewrite all query methods and route handlers to filter by `profile_id`. This is the highest-risk phase: every handler must be audited for the profile predicate, or data leaks.

- [x] 3.1 Write RED test: `tests/contract/isolation.test.js` — seed two profiles with distinct categories, switch to profile B, assert `GET /api/categories` returns zero categories from profile A
- [x] 3.2 Write RED test: isolation on `GET /api/months/:monthKey` with distinct income/transactions per profile; isolation on transaction list; carry-forward copies only in-profile budgets
- [x] 3.3 Write RED test: foreign-id updates return `404` not `403` — `PATCH /api/categories/{foreignCategoryId}`, `PUT /api/transactions/{foreignId}`, `DELETE /api/transactions/{foreignId}` all 404 without mutating
- [x] 3.4 GREEN: modify `server/services/months.js`: `getMonthPayload(profileId, monthKey, executor)` signature; add `profile_id` predicates to month/budget/transaction queries; add defense-in-depth predicates on LEFT JOINs; keep GROUP BY unchanged
- [x] 3.5 GREEN: modify `server/services/months.js`: `materializeMonth(trx, profileId, monthKey)` signature; update callers in routes
- [x] 3.6 GREEN: modify `server/routes/months.js`: all handlers add `profile_id: req.profileId` to `.where()` predicates; carry-forward source lookup scoped to profile
- [x] 3.7 GREEN: modify `server/routes/categories.js`: `GET` and `POST` scoped; `PATCH` adds `profile_id` predicate for foreign-id safety (404 on cross-profile id)
- [x] 3.8 GREEN: modify `server/routes/transactions.js`: `POST` scoped; `PUT` and `DELETE` add `profile_id` predicate for foreign-id safety; category validation stays `400` for unknown (including cross-profile)
- [x] 3.9 REFACTOR: verify every `onConflict(['month_key', 'category_id'])` grows to `['profile_id', 'month_key', 'category_id']` in `categories.js:29`, `months.js:73`, `import.js:174` — **done for `categories.js`/`months.js`**; `import.js:174` deliberately deferred to Phase 4/task 4.10 (widening the tuple is meaningless before that task adds `profile_id: 'prof_default'` to the same inserts — doing it here would touch a call site whose insert doesn't carry `profile_id` yet)
- [x] 3.x (unplanned, required by this phase) mount `requireActiveProfile` before `categories`/`months`/`transactions` routers in `server/routes/index.js` — pulled forward from task 4.8 because Phase 3's own isolation tests are unwritable/untestable without `req.profileId` actually being resolved; `/import` stays unmounted, matching task 4.8's original scope for that router
- [x] 3.x (unplanned, required by this phase) fix `GET /api/bootstrap`'s `getMonthPayload(monthKey)` call site (now requires `profileId` first per 3.4) with a minimal inline `active_profile` lookup; full bootstrap profile-awareness (`profiles` array, `settings.activeProfile`) still lands in Phase 4/task 4.7

---

## Phase 4: Settings & Bootstrap Integration

Wire `active_profile` into settings, bootstrap, and import endpoints. This phase finalizes server-side setup without touching the client yet.

- [x] 4.1 Create `server/services/settings.js`: export const `SETTINGS_KEYS = ['currency', 'active_month', 'active_profile']`
- [x] 4.2 Write RED test: `tests/contract/settings.test.js` — `GET /api/settings` includes `activeProfile` field; `PUT /api/settings` with `activeProfile` in body returns `400 use PUT /api/profiles/active`
- [x] 4.3 GREEN: modify `server/routes/settings.js`: `GET` returns `activeProfile` alongside existing keys; `PUT` rejects `activeProfile` with `400` + error message
- [x] 4.4 GREEN: modify `server/routes/settings.js` and `server/routes/index.js` to use `SETTINGS_KEYS` constant from `server/services/settings.js` (removes duplication)
- [x] 4.5 Write RED test: `PUT /api/profiles/active` with valid profile id returns full bootstrap payload (settings + profiles + categories + month); with archived profile returns `409`; with unknown id returns `404`
- [x] 4.6 GREEN: add `PUT /api/profiles/active` endpoint to `server/routes/profiles.js`: single transaction, validate profile exists and not archived, UPSERT `settings.active_profile`, return full bootstrap
- [x] 4.7 GREEN: modify `server/routes/index.js`: `GET /api/bootstrap` adds `profiles` array and `settings.activeProfile` to payload
- [x] 4.8 GREEN: modify `server/routes/index.js`: mount `requireActiveProfile` middleware before categories/months/transactions/import routers (not before settings or profiles)
- [x] 4.9 Write RED test: `tests/contract/legacy-import.test.js` — import while different profile is active still targets `prof_default`; idempotent import within `prof_default` only
- [x] 4.10 GREEN: modify `server/routes/import.js`: hardcode target profile to `prof_default` (not `req.profileId`); all inserts/updates carry `profile_id: 'prof_default'`
- [x] 4.11 REFACTOR: extend existing contract tests in `tests/contract/{categories,months,transactions}.test.js` to seed default profile in their setup — verified as a no-op: `insertCategory()` (support.js) already defaults `profile_id: DEFAULT_PROFILE_ID` since Phase 2, and every write goes through the already-scoped routes; confirmed by full-suite green, no edits needed
- [x] 4.x (unplanned, required by this phase) `server/services/bootstrap.js` (new): `buildBootstrapPayload(executor, { profileId, monthKey })` — one shared builder for both `GET /api/bootstrap` and `PUT /api/profiles/active`, so the two stay byte-identical in shape (design.md explicitly requires this parity). Not called out as a file in design.md's File Changes table, but necessary to implement 4.6+4.7 without duplicating the settings/profiles/categories/month aggregation twice
- [x] 4.x (unplanned, required by this phase) `import.js`'s own `months` insert (`.onConflict('month_key')`, separate from `materializeMonth()`) also had to widen to `['profile_id', 'month_key']` — `months`' PK became the composite pair in migration 002, so the bare `month_key` conflict target stopped naming any real constraint. Not on design.md's explicit 3-site onConflict list (which only covered `category_budgets`-shaped inserts), but required for `import.js` to insert at all
- [x] 4.x (unplanned, required by this phase) `server/services/profiles.js` gained `serializeProfile()` (moved out of `server/routes/profiles.js`) so `server/services/bootstrap.js` and `server/routes/profiles.js` share one profile-serialization shape instead of two copies
- [x] 4.x (unplanned, required by this phase) `tests/contract/health-bootstrap.test.js`'s existing `toEqual` assertions on `GET /api/bootstrap` needed updating for the new `profiles`/`activeProfile` fields — a direct consequence of the spec-mandated response-shape change (budget-api spec "Response Shapes"), not a design deviation

---

## Phase 5: Client State & UI

Replicate profile awareness on the frontend. This phase must run after PR 4 ensures the server contract is stable.

- [x] 5.1 Write RED test: `tests/unit/state.test.js` — existing tests for `readMonth`, `getCategorySpent`, etc. still pass **unchanged** (proof that derivations remain pure)
- [x] 5.2 Write RED test: `setActiveProfile()` replaces `cache.months = {}` and `cache.categories`; stale row from another profile becomes unrepresentable in cache
- [x] 5.3 GREEN: modify `src/storage.js`: `defaultData()` adds `profiles: []` and `settings.activeProfile: null`
- [x] 5.4 GREEN: modify `src/api.js`: add `getProfiles()`, `createProfile(payload)`, `renameProfile(id, name)`, `archiveProfile(id)`, `setActiveProfile(id)` methods
- [x] 5.5 GREEN: modify `src/state.js`: add `getProfiles()`, `getActiveProfile()` readers; add `addProfile(name)`, `renameProfile(id, name)`, `archiveProfile(id)`, `setActiveProfile(id)` mutators; `bootstrap()` populates `cache.profiles` and `cache.settings.activeProfile`
- [x] 5.6 GREEN: modify `src/state.js`: `setActiveProfile()` calls API, replaces `cache.settings`, `cache.profiles`, `cache.categories` wholesale, sets `cache.months = {}`, then bootstraps the active month if it exists; **every derivation function body stays verbatim**
- [x] 5.7 GREEN: modify `index.html`: add profile nav `<div class="profile-nav">` with `<select id="profileSelect">` and `<button id="manageProfilesBtn">`; add `#profileFormOverlay` and `#profileForm` (copy structure from category form) — also added `#newProfileBtn` inside the form (not in design.md's literal snippet) since the design's single gear button alone had no path to "create" mode; `#manageProfilesBtn` opens the form pre-filled for the active profile (rename/archive), `#newProfileBtn` resets it to blank (create)
- [x] 5.8 GREEN: modify `src/render.js`: add `renderProfileSelect()` function called from `renderApp()` to populate select options with live profiles; remains a pure synchronous reader
- [x] 5.9 GREEN: modify `src/main.js`: add change handler on `#profileSelect` calling `setActiveProfile(e.target.value)` via `withBusy()`; wire `#manageProfilesBtn`/`#newProfileBtn` to open overlay in edit/create mode; wire form submit to `createProfile` or `renameProfile` based on hidden `#profileId`; wire `#deleteProfileBtn` to `archiveProfile` behind `confirm()` (server's `409 profile_is_active`/`409 last_profile` surface via the existing `ApiError` -> `showError()` path, no special-casing needed)
- [x] 5.10 REFACTOR: verify `tests/unit/state.test.js` passes **without modification** (this is the formal signal that pure layer isolation holds) — confirmed: all 7 pre-existing tests untouched and green, only one new `describe('setActiveProfile')` block was added
- [x] 5.x (unplanned, minor) `src/style.css`: added `.profile-nav` flex-row rules — `.app-header` is `flex-direction: column`, so the new `<div class="profile-nav">` needed its own row layout, matching `.month-nav`'s existing pattern

---

## Phase 6: Contract Test Suite (Isolation & Carry-Forward)

Write the complete RED test suite for cross-profile leakage and carry-forward correctness. These tests verify the composite-FK and server-scoping guarantees.

- [x] 6.1 Write RED test: `tests/contract/isolation.test.js` — complete matrix: `GET /api/categories`, `GET /api/months/:k`, `POST /api/transactions`, `PUT income`, every aggregate response, and carry-forward hint all return zero data from non-active profile
- [x] 6.2 Write RED test: carry-forward source month lookup and copy both scoped to active profile; `carryForward.sourceMonth` equals the row actually copied
- [x] 6.3 Write RED test: `POST /api/transactions` with category from different profile rejected with `400 Unknown category` (implied FK check); direct SQL insert with cross-profile category rejected by database with FK error
- [x] 6.4 GREEN: implement full isolation test suite covering all endpoints listed above; seed two profiles with overlapping months and categories, alternate switches, assert zero bleed
- [x] 6.5 GREEN: implement carry-forward correctness: verify source and actual copy are identical; verify second profile's carry-forward does not see first profile's budgets
- [x] 6.6 GREEN: verify all existing contract tests in `tests/contract/{categories,months,transactions,settings,import,health-bootstrap}.test.js` pass with profile infrastructure in place

---

## Phase 7: Final Verification & Integration

Verify the end-to-end flow, parity tests, and comprehensive test coverage.

- [x] 7.1 Write RED test: parity test extended — verify server `categoryTotals` equals client pure functions over each profile's data independently
- [x] 7.2 GREEN: extend `tests/contract/parity.test.js` to test both profiles' aggregates match their respective client cache derivations
- [x] 7.3 GREEN: run full test suite `npm test`; all 6+ new contract test files pass
- [x] 7.4 GREEN: run build `npm run build`; frontend builds without errors
- [x] 7.5 REFACTOR: document in `openspec/config.yaml` that `strict_tdd: true` and `apply.tdd: true` were honored throughout (RED tests ran first)
- [x] 7.6 Manual checklist: ran migration `002` directly against the live production database (after a fresh `pg_dump` backup) via `docker compose up -d --build app`. Verified: per-table counts unchanged (categories 12, months 4, category_budgets 23, transactions 38), zero NULL `profile_id` values, exactly one profile ("General"/`prof_default`) with `settings.activeProfile` pointing at it, and a live create/switch/verify-empty/switch-back/archive smoke test confirmed a second profile starts empty and switching back restores all 12 categories with no cross-contamination.

---

## Cross-Phase Risks & Mitigations

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Migration fails on real production DB | 1 | Backfill in one transaction; row-count assertions before/after; rehearsal on dump copy before deploy |
| Query misses profile filter, leaks data across profiles | 3 | Composite FKs make cross-profile reads unrepresentable in DB; isolation contract tests cover every endpoint; 404 returns on foreign-id mutations prevent silent edge cases |
| `onConflict` tuple widening missed in one site | 3 | Second write to same budget cell surfaces a loud `duplicate key` error (not silent); tests must write twice to each cell |
| Settings keys duplicated again | 4 | Extract to `server/services/settings.js` constant; bootstrap and settings routes both import from it |
| Carry-forward hint/endpoint drift | 3–4 | Contract test asserts `carryForward.sourceMonth === copiedFrom`; both queries scoped together in same transaction; scoping missing in one breaks the test |
| Client cache stale after profile switch | 5 | `setActiveProfile()` does wholesale reset `cache.months = {}`; test verifies stale row from other profile is unrepresentable in cache after switch |
| Pure derivations become profile-aware | 5 | Existing `tests/unit/state.test.js` must pass **without edit**; any profile awareness leaking into pure layer breaks this test and signals design violation |

