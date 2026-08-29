# Tasks: Server-Backed Persistence (PostgreSQL + Express, Self-Hosted)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,800–1,900 (13+ new files, 3 modified files) |
| 400-line budget risk | High |
| 800-line agreed budget | Exceeded (~2.3x) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7 |
| Delivery strategy | ask-on-risk (default; not overridden by orchestrator) |
| Chain strategy | pending — recommend feature-branch-chain given strict Phase 1→2→3 dependency order |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Test runner wired (Phase 1) | PR 1 | `npm test` | N/A — no server yet, pure-function tests only | Revert `vitest.config.js` + `tests/unit/`; zero behavior change |
| 2 | Postgres schema + migration (Phase 2) | PR 2 | `npx knex migrate:latest` against ephemeral Postgres | `docker compose up postgres` then run migration | Drop `server/migrations/001_init.js`, `knexfile.js`, `server/db.js`; nothing depends on it yet |
| 3 | Express API core + routes (Phase 3) | PR 3 | `curl` smoke tests against each route (contract tests land in PR 7) | `node server/index.js` against local Postgres | Remove `server/index.js`, `server/routes/`, `server/services/`; frontend still on `storage.js` |
| 4 | Legacy import endpoint (Phase 4) | PR 4 | manual `curl -X POST /api/import/legacy` with fixture payload | same Express server as PR 3 | Remove `server/routes/import.js` only |
| 5 | Frontend migration (Phase 5) | PR 5 | `npm test -- tests/unit` | `npm run build && npm run preview` against running API | Revert `src/api.js`, `src/storage.js`, `src/state.js`, `src/main.js` to pre-PR-5 commit |
| 6 | Docker deployment (Phase 6) | PR 6 | N/A — infra only, no test framework applies | `docker compose up` end-to-end | Remove `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `.env.example`; run via `npm run dev` + local Postgres |
| 7 | Contract & integration test suite (Phase 7) | PR 7 | `npm test` (full suite) | ephemeral Postgres via `docker compose` or testcontainer | Remove new files under `tests/contract/` only |

## Phase 1: Test Runner Foundation

- [x] 1.1 Add `vitest`, `supertest` devDependencies; add `test` script to `package.json`.
- [x] 1.2 Create `vitest.config.js`: node environment, `tests/` include glob.
- [x] 1.3 Create `tests/unit/smoke.test.js`: trivial passing test proving the runner works.
- [x] 1.4 Write unit tests for `getCategorySpent`, `getCategoryBudget`, `getCategoryRemaining`, `getMonthTotals` against literal cache fixtures.

## Phase 2: Database Layer

- [x] 2.1 Add `knex`, `pg` dependencies; create `knexfile.js` with env-driven connection config.
- [x] 2.2 Create `server/db.js`: Knex instance + `pg.types.setTypeParser(1700, parseFloat)` NUMERIC fix.
- [x] 2.3 Create `server/migrations/001_init.js`: full DDL — `categories`, `settings`, `months`, `category_budgets`, `transactions`, indexes, checks.

## Phase 3: Express API

- [x] 3.1 Create `server/index.js`: Express app, JSON parsing, `express.static('dist')`, `/api` router, error middleware `{error:{code,message,field?}}`.
- [x] 3.2 Create `server/services/months.js`: `monthKeyFromDate(date, APP_TZ)`, `materializeMonth(trx, monthKey)`, `getMonthPayload(monthKey)` aggregate query.
- [x] 3.3 Create `server/routes/settings.js`: `GET/PUT /api/settings`; PUT never materializes a month.
- [x] 3.4 Create `server/routes/categories.js`: `GET/POST /api/categories`, `PATCH /api/categories/{id}`.
- [x] 3.5 Create `server/routes/months.js`: `GET /api/months/{k}` (Bug Fix A — no writes), `PUT income`, `PUT budgets/{catId}`, `POST carry-forward` (409 if materialized).
- [x] 3.6 Create `server/routes/transactions.js`: `POST/PUT/DELETE /api/transactions`; `month_key` always derived from `date` (Bug Fix B).
- [x] 3.7 Add `GET /api/bootstrap?month=` aggregating settings + categories + month payload; add `GET /api/health`.
- [x] 3.8 Add validation across routes: `400` on missing `amount`/unknown `categoryId`, `404` on unknown transaction.

## Phase 4: Legacy Import

- [x] 4.1 Create `server/routes/import.js`: `GET /api/import/legacy/status` from `settings.legacy_import_at`.
- [x] 4.2 Implement `POST /api/import/legacy`: shape validation (`400`, zero writes on malformed), single DB transaction, `ON CONFLICT DO NOTHING` per table, recompute `month_key` per transaction date, upsert `legacy_import_at`, return summary counts.

## Phase 5: Frontend Migration

- [x] 5.1 Create `src/api.js`: fetch wrapper, `ApiError`, one method per endpoint.
- [x] 5.2 Modify `src/storage.js`: remove `saveData`; keep `STORAGE_KEY`, `defaultData()`, `loadData()` for legacy-read only.
- [x] 5.3 Modify `src/state.js`: `cache = defaultData()`, async `bootstrap()`, `readMonth()` replacing `ensureMonth()` in read paths.
- [x] 5.4 Modify `src/state.js`: convert mutators (`setIncome`, `setBudget`, transaction CRUD, `setActiveMonth`, categories) to async calls into `api.js`.
- [x] 5.5 Modify `src/main.js`: async handlers wrapped in `withBusy()`; bottom-of-file `await bootstrap(); renderApp()`.
- [x] 5.6 Modify `src/main.js`: import banner wired to `GET /api/import/legacy/status` + `POST /api/import/legacy`.

## Phase 6: Docker / Deployment

- [ ] 6.1 Create `Dockerfile`: multi-stage — Vite build stage, runtime stage (`npm ci --omit=dev`).
- [ ] 6.2 Create `docker-compose.yml`: `app` + `postgres`, named volume, healthchecks.
- [ ] 6.3 Create `docker-entrypoint.sh`: `npx knex migrate:latest` then `exec node server/index.js`.
- [ ] 6.4 Create `.env.example`: `POSTGRES_*`, `DATABASE_URL`, `APP_TZ`, `PORT`.
- [ ] 6.5 Update `openspec/config.yaml`: `verify.test_command` → `"npm test"`.

## Phase 7: Contract & Integration Tests

- [ ] 7.1 Contract tests per REST endpoint: shapes, `400`/`404` cases, against Express + migrated ephemeral Postgres.
- [ ] 7.2 Bug Fix A regression test: `months` row count unchanged across repeated `GET`s on an untouched month.
- [ ] 7.3 Bug Fix B regression test: `POST`/`PUT` transaction with a different `date` moves it between months.
- [ ] 7.4 Import idempotency test: double import unchanged counts; partial-failure retry fills gap; malformed payload `400`.
- [ ] 7.5 Invariant test: `information_schema.columns` has no `spent`/`remaining` column.
- [ ] 7.6 Parity test: server `categoryTotals` equals client pure functions over a shared fixture.

## Phase 8: Manual Verification

- [ ] 8.1 `docker compose up` on a clean host; verify `app` + `postgres` start and pass healthchecks.
- [ ] 8.2 Restart `postgres` container and `docker compose down`/`up` (no `-v`); verify data intact both times.
