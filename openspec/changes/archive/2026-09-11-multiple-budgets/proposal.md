# Proposal: Multiple Budget Profiles

> **Persistence-boundary change** (`openspec/config.yaml` rule): adds a scoping column to every domain table plus a new migration.

## Intent

The owner wants separate budgets — e.g. "Personal" and "Negocio" — that never contaminate each other. Today `categories`, `months`, and `settings` are global singletons (`server/migrations/001_init.js`): one income, one category set, one ledger for the whole app. Confirmed scope is **full isolation** per profile (not shared categories with split income), introducing a grouping level *above* month, switchable like `prevMonth`/`nextMonth`.

## Scope

### In Scope
- `budget_profiles` table; create, rename, list; one row flagged default.
- Per-profile isolation of `categories`, `months` (income), `category_budgets`, `transactions`.
- Active profile persisted as a `settings` key, alongside `active_month`.
- Profile switcher in the header, next to the month switcher.
- Zero-data-loss migration backfilling all existing rows into a default profile ("General").
- Contract tests proving cross-profile leakage is impossible.

### Out of Scope
- Cross-profile totals or any global "all budgets" view — every number stays profile-scoped.
- Per-profile memory of last active month; month selection stays global across a switch.
- Moving records between profiles; profile deletion (archive only).
- Auth, users, multi-tenancy, sharing. Single user, just named buckets.

## Capabilities

### New Capabilities
- `budget-profiles`: profile entity, active-profile selection, isolation guarantee, default-profile invariant.

### Modified Capabilities
- `budget-persistence`: `profile_id` scoping; FK integrity and uniqueness become profile-composite.
- `budget-api`: every endpoint scopes by active profile; settings exposes `activeProfile`.
- `legacy-data-import`: imported records land in the default profile.

## Approach

Add `budget_profiles` plus a `profile_id` column on `categories`, `months`, `category_budgets`, and `transactions`, making `(profile_id, month_key)` the month identity. `getMonthPayload()` scopes its aggregate SQL by profile. The server resolves the active profile from `settings`, never trusting the client. `state.js` keeps its synchronous cached-read surface by re-bootstrapping the cache on switch, so `render.js` stays untouched.

Migration `002_budget_profiles.js` follows the `001_init.js` style (ESM `up`/`down`, `knex.schema`): create table, insert the default profile, add nullable `profile_id`, backfill every row, then enforce `NOT NULL` + FK. Nothing is deleted; `down()` reverses to today's shape.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server/migrations/002_*.js` | New | Profiles table, backfill, composite keys |
| `server/routes/profiles.js` | New | List/create/rename |
| `server/services/months.js` | Modified | Payload + materialize scoped by profile |
| `server/routes/{months,categories,transactions}.js` | Modified | Scope all reads/writes; carry-forward stays in-profile |
| `server/routes/{settings,index,import}.js` | Modified | `active_profile` key, bootstrap payload, import target |
| `src/{state,api,main}.js`, `index.html` | Modified | Switcher, active-profile state, cache reset on switch |
| `src/render.js` | Unchanged | Stays a pure synchronous read layer |
| `tests/contract/` | Modified | Isolation + backfill coverage |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migration on the real production DB loses or orphans rows | High | `pg_dump` first; backfill in one transaction; row counts asserted before/after |
| A query misses its profile filter and leaks data | High | Server-resolved profile; per-endpoint leakage tests |
| `months` PK → composite breaks dependent FKs | Med | Design phase picks surrogate key vs. composite FK before code |
| Cache retains another profile's data after switch | Med | Full cache reset, not a merge |
| `ON DELETE RESTRICT` blocks column reshaping | Med | Add → backfill → constrain; never drop and recreate |

## Rollback Plan

1. `pg_dump` immediately before migrating; tag the pre-change build.
2. `002` `down()` drops `profile_id` and `budget_profiles`, restoring the `001` shape — safe because every row belongs to the default profile.
3. Redeploy the tagged build against the rolled-back schema; restore the dump only if `down()` itself fails.

## Dependencies

- None new (Knex/Postgres/Vitest). A verified database backup before the migration runs.

## Success Criteria

- [ ] Two profiles coexist, each showing only its own income, categories, budgets, transactions.
- [ ] Switching profiles swaps all data without changing the selected month.
- [ ] Post-migration counts and totals match the pre-migration dump, all under the default profile.
- [ ] No endpoint returns a record from a non-active profile; carry-forward copies only in-profile.
- [ ] `npm test` and `npm run build` pass.

## Effort

Medium-to-large: 1 migration, ~7 server files, 4 frontend files, new contract tests. Likely exceeds the 400-line review budget — `sdd-tasks` should forecast chained slices (schema → server scoping → profile CRUD/API → UI switcher).

## Open Questions for design.md

1. `months` identity: composite PK `(profile_id, month_key)` with composite FKs from `category_budgets`/`transactions`, vs. a surrogate `months.id`. Affects every dependent FK and the `getMonthPayload` aggregate.
2. How the active profile reaches the server: implicit from `settings.active_profile` on every request, or an explicit path/query segment. Implicit is simpler and leak-proof but makes endpoints stateful.
3. Whether a new profile starts empty or is seeded with default categories.
4. Client cache shape: keep one flat `months` map re-bootstrapped per switch, or key the cache by `profileId`.
5. Whether `settings.currency` stays global or becomes per-profile.
