# Design: Server-Backed Persistence (PostgreSQL + Express, Self-Hosted)

## Technical Approach

Express owns persistence behind `/api/*` and also serves the built Vite assets. Knex provides the query builder and versioned migrations, run from the app container entrypoint before the server binds. `src/storage.js` stops being the persistence boundary and becomes a legacy-read + API-client module; `src/state.js` keeps an in-memory cache in the **exact `defaultData()` shape**, so `src/render.js` is not modified at all.

Two hidden behaviors are corrected: reads never write (`ensureMonth` disappears from read paths), and a transaction's month is derived from its own `date`.

Implements `specs/budget-api`, `specs/budget-persistence`, `specs/legacy-data-import`, `specs/self-hosted-deployment`.

## Architecture Decisions

### Decision: Express as the API layer

**Choice**: Express 4 serving `/api/*` JSON routes plus `express.static` for `dist/`.
**Alternatives considered**: Fastify; bare `node:http`; keeping a static host + separate API.
**Rationale**: Single-user, single-instance scale makes raw throughput irrelevant, so Fastify's advantage does not pay for a less familiar plugin/serialization model. Bare `node:http` would mean hand-rolling routing, body parsing and error handling — exactly the boilerplate this change should not invent. One process serving both assets and API removes CORS, a second container, and a reverse proxy from the deployment (`self-hosted-deployment` requires exactly two services).

### Decision: Knex as data-access and migration layer

**Choice**: Knex with `pg`, migrations in `server/migrations/`.

| Option | Tradeoff | Decision |
|---|---|---|
| Plain `pg` | Full control, but no migration tracking — schema drift across redeploys is unmanaged | Rejected |
| **Knex** | One dependency; plain-JS idiom; CLI migrations fit a Docker entrypoint; stays close to SQL | **Chosen** |
| Prisma | Native query-engine binary is a known Alpine/Docker friction source; value is TS-centric | Rejected |
| Drizzle | TS-first DSL mismatch with vanilla JS; weaker plain-JS migration story | Rejected |

**Rationale**: The codebase is vanilla ES modules with no TypeScript and no build step on the server side. Knex is the only option that adds tracked, repeatable migrations (required by `self-hosted-deployment`) without importing a type-system-shaped toolchain or a native binary into the image.

### Decision: Balances derived in SQL; client re-derives from cached rows

**Choice**: No `spent`/`remaining` column exists in any table. The API computes totals with SQL aggregates. The client cache stores only raw rows, and `state.js` keeps its existing pure calculation functions.
**Alternatives considered**: Persist running totals; compute only server-side and cache the numbers client-side.
**Rationale**: Persisted totals are the exact failure mode the original code comment guards against. Computing only server-side would force `render.js` to become async, breaking its pure-synchronous-reader contract. Two derivation sites is the accepted cost; a Vitest parity test asserts server aggregates equal client functions over the same fixture, so drift fails the build rather than silently corrupting balances.

### Decision: `months` row is required, but only writes create it

**Choice**: A `months` row MUST exist for a month that has income, budgets, or transactions — `category_budgets.month_key` and `transactions.month_key` are foreign keys to it. It is created **only** by a write (`PUT income`, `PUT budget`, `POST/PUT transaction`, `POST carry-forward`), inside the same DB transaction as that write. GETs never create it.
**Alternatives considered**: Drop the `months` table and compute everything from `category_budgets` + `transactions`.
**Rationale**: Three reasons the row must exist. (1) `income_amount` has no other home, and income is not derivable. (2) Without a row there is no way to distinguish "month never touched" from "income deliberately set to 0" — a rowless design would let a zeroed month silently re-inherit the previous month's income on the next read. (3) As an FK target it makes "orphan budget/transaction in a nonexistent month" unrepresentable. It stores zero derived data, so the derived-balance invariant is untouched: totals still come from `category_budgets` and `transactions` alone, and a month with a row but no activity still returns zeros.

### Decision: Carry-forward becomes an explicit endpoint, not a read side effect

**Choice**: `ensureMonth`'s implicit copy of the previous month's income and budgets is replaced by `POST /api/months/{monthKey}/carry-forward`. Reads return true zeros plus a `carryForward` hint.
**Alternatives considered**: Keep carry-forward as a read-time projection (no write, inherited values shown).
**Rationale**: A read-time projection contradicts `budget-api`'s "Reading a month with no data yet returns zero-valued totals" whenever any earlier month exists, and reintroduces the hidden-magic problem in a new form (values appearing without a write). Making it a user-triggered action preserves the multi-month convenience the original comment describes, satisfies the spec literally, and converts an invisible side effect into explicit intent.

### Decision: `month_key` computed server-side from `date` in a configured timezone

**Choice**: `date` is `timestamptz`; the API computes `month_key` from it using `APP_TZ` (default `America/Caracas`). Clients never supply `month_key`.
**Alternatives considered**: Client-supplied `month_key`; a DB generated column; UTC-only derivation.
**Rationale**: Client-supplied is the bug being fixed. A generated column is impossible because timezone conversion is not `IMMUTABLE` in Postgres. UTC-only would misfile a late-evening expense into the next month for a UTC-4 user — the same class of bug. Server derivation with one configured zone is the only option that is single-sourced and correct; a contract test pins it.

## Data Flow

```
main.js (async handler)
   │ await
   ▼
state.js  ── fetch ──▶  Express route ──▶ Knex ──▶ Postgres
   │  ◀── JSON ──────────────────────────────────────┘
   │ update cache (defaultData() shape)
   ▼
render.js (pure sync read of cache) ──▶ DOM
```

`render.js` never awaits and never sees a promise.

## Postgres Schema (DDL)

```sql
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  icon       TEXT NOT NULL DEFAULT '💸',
  color      TEXT NOT NULL DEFAULT '#4F8EF7',
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one logical settings record, key/value so new keys need no migration
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,   -- 'currency' | 'active_month' | 'legacy_import_at'
  value TEXT
);

CREATE TABLE months (
  month_key         TEXT PRIMARY KEY
                    CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  income_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  income_updated_at TIMESTAMPTZ
);

CREATE TABLE category_budgets (
  month_key   TEXT NOT NULL REFERENCES months(month_key) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES categories(id)    ON DELETE RESTRICT,
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (month_key, category_id)
);

CREATE TABLE transactions (
  id          TEXT PRIMARY KEY,
  month_key   TEXT NOT NULL REFERENCES months(month_key) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES categories(id)    ON DELETE RESTRICT,
  amount      NUMERIC(14,2) NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  date        TIMESTAMPTZ NOT NULL
);
CREATE INDEX transactions_month_idx     ON transactions (month_key);
CREATE INDEX transactions_month_cat_idx ON transactions (month_key, category_id);
```

**Derived-balance invariant**: there is **no `spent`, `remaining`, `total_spent`, `total_budgeted` or `available` column in any table.** Every balance is a query result.

```sql
-- per-category derivation for one month
SELECT c.id,
       COALESCE(b.amount, 0)                        AS budget,
       COALESCE(SUM(t.amount), 0)                   AS spent,
       COALESCE(b.amount, 0) - COALESCE(SUM(t.amount), 0) AS remaining
FROM categories c
LEFT JOIN category_budgets b ON b.category_id = c.id AND b.month_key = :monthKey
LEFT JOIN transactions     t ON t.category_id = c.id AND t.month_key = :monthKey
GROUP BY c.id, b.amount;
```

Notes:
- `NUMERIC` is returned as a **string** by `pg`; register `pg.types.setTypeParser(1700, parseFloat)` once in `server/db.js` or every amount reaches JSON as `"12.00"` and breaks `render.js`'s arithmetic.
- `transactions.amount` intentionally has **no** `>= 0` CHECK so legacy import is lossless; the API layer rejects negative amounts on new writes with `400`.
- IDs stay client-generated `prefix_hex8` TEXT, preserving `defaultData()` continuity and making import keyable on existing ids.
- No `DELETE /api/categories` exists; `ON DELETE RESTRICT` plus archiving enforces `budget-persistence`'s history-preservation requirement.

## REST API Contract

All responses JSON. Errors: `{ "error": { "code", "message", "field?" } }`.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/health` | — | `{ status, db }` (compose healthcheck) |
| GET | `/api/bootstrap?month=YYYY-MM` | — | `{ settings, categories, month }` — one call fills the cache |
| GET | `/api/settings` | — | `{ currency, activeMonth }` |
| PUT | `/api/settings` | `{ currency?, activeMonth? }` | updated settings; **never creates a month** |
| GET | `/api/categories` | — | `[{ id, name, icon, color, archived, createdAt }]` |
| POST | `/api/categories` | `{ id?, name, icon?, color?, budget?, monthKey? }` | `201` category; `budget`+`monthKey` applied atomically |
| PATCH | `/api/categories/{id}` | `{ name?, icon?, color?, archived?, budget?, monthKey? }` | category; `404` if unknown |
| GET | `/api/months/{monthKey}` | — | month payload (below); **side-effect free** |
| PUT | `/api/months/{monthKey}/income` | `{ amount }` | `{ amount, updatedAt }`; materializes month |
| PUT | `/api/months/{monthKey}/budgets/{categoryId}` | `{ amount }` | `{ categoryId, amount }`; materializes month |
| POST | `/api/months/{monthKey}/carry-forward` | — | `{ copiedFrom, income, budgetCount }`; `409` if already materialized |
| POST | `/api/transactions` | `{ id?, categoryId, amount, note?, date? }` | `201` txn incl. server-computed `monthKey` |
| PUT | `/api/transactions/{id}` | `{ categoryId?, amount?, note?, date? }` | txn with recomputed `monthKey`; `404` if unknown |
| DELETE | `/api/transactions/{id}` | — | `204`; `404` if unknown |
| GET | `/api/import/legacy/status` | — | `{ imported: bool, importedAt }` |
| POST | `/api/import/legacy` | raw `budgetpwa_data_v1` object | import summary (below) |

Month payload:

```json
{
  "monthKey": "2026-03",
  "materialized": false,
  "income": { "amount": 0, "updatedAt": null },
  "budgets": {},
  "transactions": [],
  "totals": { "income": 0, "totalBudgeted": 0, "totalSpent": 0, "totalAvailable": 0 },
  "categoryTotals": { "cat_ab12cd34": { "budget": 0, "spent": 0, "remaining": 0 } },
  "carryForward": { "available": true, "sourceMonth": "2026-02" }
}
```

`transactions` is ordered `date DESC, id DESC`, matching today's `unshift` ordering that `render.js` relies on.

**No-write-on-read guarantee**: only the four routes marked *materializes* (plus import) may `INSERT INTO months`. `GET /api/months/2026-03` on an untouched month returns the payload above and leaves `SELECT count(*) FROM months` unchanged.

## Frontend Migration Path (away from `storage.js`)

`state.js` today: loads once synchronously at module top level, mutates in place, calls `saveData` synchronously. Target: **async writes, synchronous reads over a cache**.

1. **`src/api.js` (new)** — thin `fetch` wrapper; throws `ApiError` on non-2xx. No silent catches.
2. **`src/storage.js` (modified)** — loses `saveData`. Keeps `STORAGE_KEY`, `defaultData()` (now the *cache* shape factory) and `loadData()`, used **only** to read legacy data for import. It never writes.
3. **`src/state.js` (modified)** — holds `let cache = defaultData()`.
   - New `export async function bootstrap()`: `GET /api/bootstrap` → fills `cache.settings`, `cache.categories`, `cache.months[monthKey]`.
   - Every read path replaces `ensureMonth(monthKey)` with a pure lookup:
     ```js
     const EMPTY_MONTH = Object.freeze({
       income: { amount: 0, updatedAt: null }, budgets: {}, transactions: []
     });
     function readMonth(monthKey) { return cache.months[monthKey] || EMPTY_MONTH; }
     ```
     `getCategorySpent`, `getCategoryBudget`, `getCategoryRemaining`, `getMonthTotals` keep their **existing bodies verbatim** apart from that one substitution — which is why they stay unit-testable as pure functions.
   - Every mutator becomes `async`: `await api.x(...)` then merge the response into `cache`. `setActiveMonth(k)` awaits `GET /api/months/k` (loading it into the cache) plus `PUT /api/settings`, and no longer creates the month.
4. **`src/main.js` (modified)** — handlers become `async`; each write is wrapped in a `withBusy(fn)` helper that disables the submit control, awaits, calls `renderApp()`, and renders an error banner on `ApiError`. Bottom of file becomes `await bootstrap(); renderApp();`.
5. **`src/render.js` — unchanged.**

Shape compatibility (`defaultData()` → API):

| Cache path | Source | Note |
|---|---|---|
| `settings.currency` | `settings.currency` | identical |
| `settings.activeMonth` | `settings.activeMonth` | may be `null` on first run; client sets it |
| `categories[]` | `GET /api/categories` | field-for-field identical |
| `months[k].income.{amount,updatedAt}` | month `.income` | identical |
| `months[k].budgets[catId]` | month `.budgets` | identical map |
| `months[k].transactions[]` | month `.transactions` | `{id,categoryId,amount,note,date}`, newest first |
| `version: 1` | — | dropped; schema version lives in `knex_migrations` |

Because every field name and nesting level survives, `render.js`'s `getData().months[monthKey]` (already `null`-tolerant) and `main.js`'s `month?.income.amount` keep working unchanged.

## Sequence: Legacy Data Import (one-time, idempotent)

```mermaid
sequenceDiagram
    participant UI as main.js (import banner)
    participant LS as localStorage
    participant API as Express /api/import/legacy
    participant DB as Postgres

    UI->>API: GET /api/import/legacy/status
    API->>DB: SELECT value FROM settings WHERE key='legacy_import_at'
    DB-->>API: null
    API-->>UI: { imported: false }
    UI->>UI: show "Import my existing data" banner
    UI->>LS: loadData('budgetpwa_data_v1')   %% READ ONLY
    LS-->>UI: legacy payload
    UI->>API: POST /api/import/legacy (payload)
    API->>API: validate shape → 400 + zero writes if malformed
    API->>DB: BEGIN
    API->>DB: INSERT categories ... ON CONFLICT (id) DO NOTHING
    API->>DB: INSERT months ... ON CONFLICT (month_key) DO NOTHING
    API->>DB: INSERT category_budgets ... ON CONFLICT (month_key,category_id) DO NOTHING
    API->>DB: INSERT transactions ... ON CONFLICT (id) DO NOTHING
    API->>DB: UPSERT settings['legacy_import_at'] = now()
    API->>DB: COMMIT
    DB-->>API: rowCounts
    API-->>UI: { imported:{categories,months,budgets,transactions}, skipped:{...}, importedAt }
    UI->>UI: render counts; hide banner permanently
    Note over LS: budgetpwa_data_v1 is never cleared — rollback source
```

Idempotency comes from `ON CONFLICT DO NOTHING` on client-generated ids, so a retry after a partial failure inserts only what is missing and reports `0` new on a clean re-run. `month_key` for each imported transaction is recomputed from its own `date` (Fix B applies to history too), and every legacy month key present in the payload is materialized first so the FKs hold. The "already imported" state is server-side (`settings.legacy_import_at`), so it survives a browser change and cannot be lost with the localStorage flag it replaces.

## Sequence: Add Transaction While Viewing a Past Month (Fix A + Fix B)

```mermaid
sequenceDiagram
    participant U as User (UI shows 2026-08)
    participant S as state.js
    participant API as Express
    participant DB as Postgres

    U->>S: submit expense (amount, categoryId)
    S->>API: POST /api/transactions { categoryId, amount, date: now }
    API->>API: monthKey = format(date, APP_TZ) → "2026-05"
    API->>DB: BEGIN
    API->>DB: INSERT INTO months('2026-05') ON CONFLICT DO NOTHING
    API->>DB: INSERT INTO transactions(..., month_key='2026-05')
    API->>DB: COMMIT
    API-->>S: 201 { id, monthKey: "2026-05", ... }
    S->>S: cache.months['2026-05'] updated (not '2026-08')
    S-->>U: renderApp() — 2026-08 totals unchanged
    Note over API,DB: GET /api/months/2026-08 inserted nothing at any point
```

## File Changes

| File | Action | Description |
|---|---|---|
| `server/index.js` | Create | Express app, static `dist/`, `/api` router, error middleware |
| `server/db.js` | Create | Knex instance, `NUMERIC` type parser |
| `server/routes/{settings,categories,months,transactions,import}.js` | Create | Route handlers |
| `server/services/months.js` | Create | Materialization + aggregate queries (single home for derivation) |
| `server/migrations/001_init.js` | Create | Full schema above |
| `knexfile.js` | Create | Env-driven connection config |
| `docker-entrypoint.sh` | Create | `knex migrate:latest` then `node server/index.js` |
| `Dockerfile` | Create | Multi-stage build |
| `docker-compose.yml` | Create | `app` + `postgres`, named volume |
| `.env.example` | Create | `POSTGRES_*`, `DATABASE_URL`, `APP_TZ`, `PORT` |
| `src/api.js` | Create | fetch client |
| `src/storage.js` | Modify | Legacy read only; `saveData` removed |
| `src/state.js` | Modify | Async mutators, sync cached reads, `ensureMonth` → `readMonth` |
| `src/main.js` | Modify | Async handlers, `withBusy`, bootstrap, import banner |
| `src/render.js` | Unchanged | Pure sync reader |
| `package.json` | Modify | `express`, `pg`, `knex`; dev `vitest`, `supertest`; `test`/`start`/`migrate` scripts |
| `vitest.config.js` | Create | Node environment, `tests/` include |

## Docker / Deployment

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data      # named volume: survives `down` without -v
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  app:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      APP_TZ: ${APP_TZ:-America/Caracas}
      PORT: 3000
    ports:
      - "${APP_PORT:-8080}:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

Dockerfile outline:

```dockerfile
# stage 1 — build frontend
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build                 # → /app/dist

# stage 2 — runtime
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev             # express, pg, knex only
COPY server ./server
COPY knexfile.js docker-entrypoint.sh ./
COPY --from=build /app/dist ./dist
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
```

`docker-entrypoint.sh` is `set -e; npx knex migrate:latest; exec node server/index.js` — a failed migration exits non-zero and Express never starts, satisfying "migration failure blocks API startup". No Prisma-style native binary is copied, which is why the Knex choice keeps this image simple.

## Testing Strategy

No test runner exists today, so Vitest lands first and coverage starts where risk is highest.

| Layer | What to test | Approach |
|---|---|---|
| Unit (first) | `getCategorySpent`, `getCategoryBudget`, `getCategoryRemaining`, `getMonthTotals` against a literal cache object; `readMonth` returns zeros for an unknown month without mutating | Vitest, pure functions, no DOM, no network |
| Unit | `getMonthKey`/`shiftMonthKey`; server `monthKeyFromDate(date, APP_TZ)` incl. the UTC-4 month-boundary case | Vitest with fixed instants |
| Contract | Every endpoint in the table: shapes, `400` on missing `amount`, `400` on unknown `categoryId`, `404` on unknown transaction | `supertest` against the Express app + ephemeral Postgres (compose service or testcontainer), migrations applied per run |
| Contract (bug fix A) | `SELECT count(*) FROM months` identical before/after `GET /api/months/{new}`; two identical GETs return identical bodies | supertest + direct SQL count assertion |
| Contract (bug fix B) | `POST /api/transactions` with `date` in a different month files under that month; `PUT` with a new date moves it between months | supertest + `GET` both months |
| Contract (import) | Double import yields identical counts; retry after partial failure fills the gap; malformed payload → `400` with zero rows created | supertest, count assertions between runs |
| Invariant | Query `information_schema.columns` and assert no column named `spent`/`remaining` exists | supertest/Knex against migrated schema |
| Parity | Server `categoryTotals` equals client pure functions over the same fixture | Shared fixture, both derivations asserted equal |
| Manual | `docker compose up` on a clean host; restart and `down`/`up` without `-v` preserve data | Documented checklist in the change |

`openspec/config.yaml` sets `verify.test_command: ""` and `apply.tdd: false` because no runner existed; this change should update them to `npm test` once Vitest is wired.

## Threat Matrix

N/A — this change introduces no agent routing, shell-command construction from user input, subprocess orchestration, VCS/PR automation, or executable-file classification boundary.

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A — no file-classification or execution-by-extension logic |
| Git repository selection | N/A — no VCS invocation |
| Commit state | N/A — no VCS invocation |
| Push state | N/A — no VCS invocation |
| PR commands | N/A — no PR automation |

The one subprocess (`knex migrate:latest` in the entrypoint) takes a fixed argument list from a build-time script with no user-controlled input, so it introduces no injection surface.

## Migration / Rollout

1. Tag the current localStorage-only build; it stays deployable (rollback target).
2. `pg_dump` before any migration run on an existing volume.
3. Deploy the stack; migrations run on entrypoint.
4. Owner opens the app in the browser holding `budgetpwa_data_v1` and runs the import once; verifies reported counts and month totals against the tagged build.
5. `budgetpwa_data_v1` is **never cleared** by this change. Removing it is a separate, later change.
6. On failure, redeploy the tagged build; browser data is intact and `docker compose down` (no `-v`) preserves the volume.

## Open Questions

- [ ] `APP_TZ` default is `America/Caracas` (inferred from `es-VE` formatting in `utils.js`) — confirm with the owner.
- [ ] Should the import banner also appear on a second device that has its own older `budgetpwa_data_v1`? Current design hides it globally once `legacy_import_at` is set; a second device's divergent data would need a manual merge.
- [ ] `POST /api/months/{k}/carry-forward` returns `409` when the month is already materialized; confirm the UI should instead offer an explicit "overwrite budgets from previous month" action rather than silently no-op.
