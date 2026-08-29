# Exploration: server-persistence

localStorage → Node/Express + PostgreSQL, self-hosted via Docker.

## Current State

**Data model** (`src/storage.js` `defaultData()` + `src/state.js`):

```js
{
  version: 1,
  settings: { currency: 'USD', activeMonth: 'YYYY-MM' | null },
  categories: [{ id, name, icon, color, archived: bool, createdAt: ISOString }],
  months: {
    'YYYY-MM': {
      income: { amount, updatedAt: ISOString },
      budgets: { [categoryId]: number },
      transactions: [{ id, categoryId, amount, note, date: ISOString }]
    }
  }
}
```

- IDs (`src/utils.js` `generateId`): `${prefix}_${8-char-hex}` (truncated `crypto.randomUUID()`, or `Math.random` fallback) — not full UUIDs, acceptable only because there's one user.
- `storage.js` is a 2-function boundary (`loadData`/`saveData`) around `localStorage['budgetpwa_data_v1']`; failures are caught and only `console.error`'d, never surfaced.
- `state.js` loads `data` **once, synchronously**, at module top level, and every mutator mutates it in place and calls `saveData(data)` synchronously. The whole app has zero promises today.
- Documented invariant in a state.js comment: balances are **always derived, never persisted** (`getCategorySpent`, `getCategoryRemaining`, `getMonthTotals`). This must be preserved somewhere in the new architecture (SQL aggregate vs. Express service vs. client).
- Hidden side effect: `ensureMonth()` is called from read paths (e.g. `getMonthTotals`) and can create+persist a new month record as a side effect of what looks like a getter — a real API-design hazard if ported naively (a "GET" that writes).
- Month-bucket/date mismatch: `addTransaction(monthKey, {...})` always stamps `date: new Date().toISOString()` while filing the txn under whatever month is currently active — so the stored month bucket and the stored `date` can diverge if the user navigated to a past month first. A relational schema needs an explicit `month_key` column, not one derived from `date`, to preserve this exact current behavior.
- No manifest/service worker exist yet (just a comment placeholder in `index.html`), so there's no offline-caching complexity to reconcile with server-backed persistence right now.

**Call sites**: `main.js` wires ~9 synchronous DOM handlers → `state.js` mutator → synchronous `renderApp()`. `render.js` is a pure read-only layer over `state.js`'s in-memory object and never touches `storage.js` directly. The single biggest mechanical migration cost is converting this entire synchronous chain to async (fetch-based) without breaking `render.js`'s "pure sync render" contract.

## Affected Areas

- `src/storage.js` — sole persistence boundary; becomes/is-replaced-by an API-client module.
- `src/state.js` — every mutator becomes async; top-level sync bootstrap needs an async init sequence; `ensureMonth`-on-read needs explicit redesign.
- `src/main.js` — every handler becomes async with loading/error states (today's silent-failure model can't survive network errors).
- `src/render.js` — likely unaffected internally if state.js keeps exposing a synchronous "current cached state" read surface.
- New, not yet existing: `server/` Express app, DB migrations, `Dockerfile`, `docker-compose.yml`.
- `package.json` — needs `express`, a Postgres client, Vitest (per `openspec/config.yaml`'s existing directive), Docker-related scripts.

## Approaches Considered (backend data-access layer)

1. **Plain `pg` (node-postgres)** — Pros: minimal dependency, full control. Cons: no built-in migrations, more boilerplate as schema evolves. Effort: Low/Medium.
2. **Knex.js (query builder + migrations)** — Pros: plain-JS friendly (no TS required, matches current stack), built-in migration CLI that fits a Docker entrypoint step, thin enough to still feel like SQL. Cons: one more dependency. Effort: Low-Medium.
3. **Prisma** — Cons: native query-engine binary historically causes Docker/Alpine friction; value proposition is strongest with TypeScript, which this project doesn't use. Effort: Medium-High for the value delivered here.
4. **Drizzle** — Cons: same TS-first value proposition mismatch; less mature plain-JS migration story than Knex. Effort: Medium.

**Recommendation: Knex.** It threads the needle between "too raw" (`pg` with no migration tracking) and "too heavy for a plain-JS single-user app" (Prisma's binary/TS-centric tooling or Drizzle's TS-first DSL), staying in the same vanilla-JS idiom as the rest of the codebase while still giving proper schema migrations for Docker deploys.

## Schema Sketch

- `categories(id, name, icon, color, archived, created_at)`
- `settings` — single-row/key-value table for `currency` / `active_month`
- `months(month_key, income_amount, income_updated_at)`
- `category_budgets(month_key, category_id, amount)` — composite PK
- `transactions(id, month_key, category_id, amount, note, date)` — `month_key` stored explicitly, not derived from `date`

Recommend keeping client-generated `prefix_hexstring` TEXT PKs for the simplest `defaultData()`-shape-compatible continuity story.

## Docker Shape

2 containers, matching the user's stated deployment expectation:

- **app** — Node/Express container serving both the built Vite static assets and `/api/*` routes (no separate nginx container needed at this scale). Multi-stage Dockerfile: build Vite in stage 1, slim Node runtime in stage 2.
- **postgres** — named volume (`pgdata:/var/lib/postgresql/data`) + healthcheck.

Simplest migration strategy at single-instance scale: run `knex migrate:latest` from the app container's entrypoint before starting Express — no separate migrate container needed.

## Risks / Open Decisions

1. **Undecided data-migration path** — existing localStorage data (`budgetpwa_data_v1`) needs an explicit decision at proposal time: one-time import tool, accept data loss, or out-of-scope/fast-follow.
2. **Sync→async rewrite risk** — zero promises exist in the codebase today; converting `state.js`/`main.js` while keeping `render.js` synchronous is real regression risk with no test safety net.
3. **`ensureMonth`-on-read hazard** — must be redesigned explicitly (implicit upsert-on-read vs. explicit "ensure month" call) or REST "GET" endpoints become non-idempotent.
4. **"Balances always derived" invariant** is only comment-documented today, not enforced — the new architecture must pick one explicit home for this logic (SQL, service layer, or client) and must not accidentally start persisting computed totals.
5. **No test runner exists at all** — confirmed no test script/devDependency in `package.json` — compounding risk with a brand-new Express+Postgres layer. Recommend Vitest first, starting coverage at (a) the already-pure calculation functions in `state.js`, and (b) contract/integration tests for new REST endpoints via `supertest` against a real/ephemeral Postgres — not raw-SQL unit tests as the starting point.
6. **ORM choice affects Docker risk directly** — Prisma's native binary is a known source of Alpine/Docker image friction; Knex avoids this class of risk.

## Ready for Proposal

Yes for content. Two open decisions should be surfaced explicitly at proposal time:

1. localStorage migration strategy (import tool vs. accept data loss vs. out-of-scope).
2. Whether to preserve or intentionally fix the `ensureMonth`-on-read and month/date-mismatch behaviors.
