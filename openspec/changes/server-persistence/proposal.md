# Proposal: Server-Backed Persistence (PostgreSQL + Express, Self-Hosted)

> **Persistence-boundary change** (`openspec/config.yaml` rule): replaces `src/storage.js` as the sole persistence boundary.

## Intent

Budget data lives only in one browser's localStorage: it vanishes on cache clear or device change, can't be backed up or inspected, and can't be reached from a second browser. The owner wants the app self-hosted so their financial history is durable and reachable across their own devices. Two quirks get fixed while the boundary is rewritten: reading a month must not create it, and a transaction belongs to the month of its own date.

## Scope

### In Scope
- Express REST API over PostgreSQL, replacing localStorage.
- Knex schema + migrations (exploration recommendation; no blocker found).
- `docker-compose`: app container (Express + built Vite assets) + postgres with named volume.
- One-time "import my existing data" path reading `budgetpwa_data_v1` and POSTing it.
- Fix A: no writes on GET (`ensureMonth` removed from read paths).
- Fix B: transaction month bucket derived from its own date.
- Vitest as test runner (pure calculations + API contract tests).

### Out of Scope
- Auth, login, sessions, multi-user, multi-tenant/cloud hosting.
- Offline-first, service worker, optimistic sync.
- TLS, CI/CD, UI or budgeting-rule redesign.

## Capabilities

### New Capabilities
- `budget-api`: REST contract for settings, categories, months, budgets, transactions; reads are side-effect free.
- `budget-persistence`: Postgres schema, migrations, derived-balance invariant (spent/remaining computed, never stored).
- `legacy-data-import`: one-time idempotent import of `budgetpwa_data_v1`.
- `self-hosted-deployment`: docker-compose app + postgres, migrations on entrypoint, data volume.

### Modified Capabilities
- None (`openspec/specs/` is empty).

## Approach

Express owns persistence. `state.js` becomes an async API client that keeps a synchronous cached read surface, so `render.js` stays untouched. `main.js` handlers become async with explicit loading/error states, replacing today's silent-failure model. Knex migrations run from the app container entrypoint. `month_key` is stored explicitly but always computed from the transaction date.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/storage.js` | Replaced | localStorage boundary → API client; kept only to read legacy data once |
| `src/state.js` | Modified | Async mutators + bootstrap, cached sync reads |
| `src/main.js` | Modified | Async handlers, loading/error surfaces |
| `src/render.js` | Unchanged | Stays a pure synchronous read layer |
| `server/` | New | Express routes, Knex config, migrations |
| `Dockerfile`, `docker-compose.yml` | New | App + postgres deployment |
| `package.json` | Modified | express, pg, knex, vitest, supertest, scripts |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sync→async rewrite regressions with no tests today | High | Vitest first; cover calculations + API contract before rewiring UI |
| Swallowed failures become visible network errors | High | Explicit error/loading states; no silent catches |
| Import run twice duplicates data | Med | Idempotent on record IDs, single transaction, reports counts |
| Derived-balance invariant erodes into columns | Med | No spent/remaining columns; contract tests enforce |
| Volume misconfig loses data on redeploy | Med | Named volume + `pg_dump` before cutover |

## Rollback Plan

1. Tag/branch the current localStorage-only build before work lands; it stays deployable.
2. Import only reads `budgetpwa_data_v1` — never clears it. Client-side cleanup is a later, separate change.
3. Import reports counts; owner verifies totals against the old build before relying on the server.
4. On failure post-deploy, redeploy the tagged build — original browser data is intact.
5. `pg_dump` before migrations; `docker compose down` without `-v` so the volume survives.

## Dependencies

- Docker + docker-compose on the target host.
- npm: `express`, `pg`, `knex`, `vitest`, `supertest`.

## Success Criteria

- [ ] `docker compose up` runs the app; data survives container restarts.
- [ ] All budget operations work against the API.
- [ ] Existing localStorage data imports once, verified by matching totals.
- [ ] No GET endpoint creates or mutates records.
- [ ] A transaction added while viewing a past month files under its own date's month.
- [ ] No spent/remaining column exists; balances are computed.
- [ ] `npm test` runs Vitest with passing calculation and contract tests.
