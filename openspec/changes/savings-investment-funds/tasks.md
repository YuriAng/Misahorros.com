# Tasks: Savings and Investment Funds

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400–1,600 (1 migration, ~3 server files, ~7 client files, ~8 test files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 |
| Delivery strategy | ask-on-risk (orchestrator will ask before apply) |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migration + table schema + RED tests | PR 1 | `npm test -- tests/contract/invariant.test.js tests/contract/migration.test.js` | `npx knex migrate:latest` against ephemeral Postgres | Revert `server/migrations/003_*.js`; no application code yet depends on tables |
| 2 | Server services + routes + deposit/withdrawal logic | PR 2 | `npm test -- tests/contract/funds.test.js` | Same server + Postgres as PR 1 | Remove `server/services/funds.js`, `server/routes/funds.js`, router mount in `server/routes/index.js` |
| 3 | Month totals revision + bootstrap integration | PR 3 | `npm test -- tests/contract/{months,parity,health-bootstrap}.test.js` | Same as above; services+routes now in place | Revert `server/services/months.js` and `server/services/bootstrap.js` changes; totals shape reverted |
| 4 | Client state + critical cache-leak fix + API | PR 4 | `npm test -- tests/unit/state.test.js` | Same server + `npm run build` | Revert `src/state.js`, `src/api.js`, `src/storage.js`; cache leak unfixed; state readers missing |
| 5 | Client UI rendering + event handlers + full integration | PR 5 | `npm test` (full suite) | `npm run build && npm run preview` against running API | Revert `src/render.js`, `src/main.js`, `index.html`, `src/style.css` |

---

## Phase 1: Migration & Schema Foundation

Implement `server/migrations/003_savings_investment_funds.js` with two tables (`funds` and `fund_movements`), composite FKs, and constraints. Update `tests/contract/invariant.test.js` to expect the new tables and forbid balance columns. This phase must complete first — all downstream tasks depend on the schema.

- [x] 1.1 Write RED test: `tests/contract/invariant.test.js` — add `balance`, `fund_balance`, `total_deposited`, `total_withdrawn` to `FORBIDDEN_COLUMN_NAMES` array; update pinned table list `toEqual` to include `fund_movements` and `funds` (8-table assertion, exact alphabetical order); **run to confirm RED**
- [x] 1.2 Create `server/migrations/003_savings_investment_funds.js`: `funds` table with `id` (PK), `profile_id` (FK to `budget_profiles`), `name` (non-blank check), `archived` (bool, default false), `created_at`, and `UNIQUE(profile_id, id)` composite FK target; `funds_live_name_unique` partial index on live funds only
- [x] 1.3 Extend `003`: `fund_movements` table with `id` (PK), `profile_id`, `fund_id`, `month_key`, `type` (TEXT check constraint for 'deposit'/'withdrawal' only), `amount` (NUMERIC, positive check), `note`, `date`, `created_at`; two composite FKs to `funds(profile_id, id)` and `months(profile_id, month_key)` with `ON DELETE RESTRICT`; two indexes per design.md
- [x] 1.4 Implement `down()` in migration: refuse with error message if any `fund_movements` rows exist (lossless recovery path post-deployment); drop `fund_movements` then `funds` on empty ledger
- [x] 1.5 GREEN: update `tests/contract/migration.test.js` — verify `003` up/down behavior (up succeeds on `002` schema, down refuses with movements present, down succeeds on empty); verify table count and schema shape post-migration
- [x] 1.6 GREEN: run all invariant tests; confirm forbidden columns are now correctly enforced for funds; verify pinned 8-table list passes

---

## Phase 2: Server Services & Routes

Implement fund services (balance computation, listing) and full CRUD/deposit/withdraw route handlers. This phase delivers the server-side business logic and API surface.

- [x] 2.1 Create `server/services/funds.js`: `listFundsWithBalance(executor, profileId, { includeArchived })` query with LEFT JOIN and SUM(CASE) aggregate; `computeFundBalance(executor, profileId, fundId)` locked-safe balance read for guards; `archiveFund(profileId, id)` with `forUpdate()` lock, balance check, and `409 fund_has_balance` guard per design.md; `serializeFund()` and `serializeFundMovement()` shape converters
- [x] 2.2 Create `server/routes/funds.js`: mount under `requireActiveProfile`; implement `GET /api/funds` (with optional `?includeArchived=1`); `POST /api/funds` with id generation and `409 duplicate_name` (check live names per profile only)
- [x] 2.3 Extend `funds.js` routes: `PATCH /api/funds/:id` (rename with duplicate check); `DELETE /api/funds/:id` (call `archiveFund`, return 204 on success)
- [x] 2.4 Add single `/api/funds/:id/movements` endpoint to `funds.js`: `GET` returns list with optional `?limit=` (default 50, max 200); `POST` handles both `type: 'deposit'` and `type: 'withdrawal'` via hidden input pattern (not separate `/deposits`/`withdrawals` routes)
- [x] 2.5 Implement movement POST: parse request, derive `month_key` via `monthKeyFromDate()` (never from client), `forUpdate()` lock fund, reject if archived (`409 fund_archived`), `computeFundBalance()` for withdrawal check (`409 insufficient_funds`), `materializeMonth()`, insert, recompute balance, return `201 { movement, balance }`
- [x] 2.6 Write RED test: `tests/contract/funds.test.js` — fund CRUD (create, list, rename, list again); duplicate live name `409`; archive succeeds at zero balance; archive with balance `409 fund_has_balance`; movements in derived balance order; movement type validation; cross-profile access returns `404`
- [x] 2.7 Write RED test: fund movement isolation — two profiles with funds, movements recorded in profile A do not appear in profile B's balance or movement list; cross-profile fund id returns `404`; insufficient-funds guard blocks withdrawal; archived fund blocks movement insert
- [x] 2.8 GREEN: run `tests/contract/funds.test.js`; all CRUD and movement scenarios pass; balance re-derived correctly across three months; archive/insufficient guards trigger on correct conditions
- [x] 2.9 Mount `fundsRouter` in `server/routes/index.js`: `router.use('/funds', requireActiveProfile, fundsRouter)` after other scoped routers, before unscoped ones

---

## Phase 3: Month Totals & Bootstrap Integration

Integrate fund movements into the month payload, revise `totalAvailable` formula, and add funds to the shared bootstrap builder. This phase connects funds to the rest of the server.

- [ ] 3.1 Modify `server/services/months.js:getMonthPayload()`: add fund-movements query after the transactions read, scoped by `(profile_id, month_key)`, ordered by `date DESC, id DESC`; map rows with `serializeFundMovement()`; assign `fundMovements` array
- [ ] 3.2 Extend getMonthPayload: compute `fundDeposits` and `fundWithdrawals` sums via JavaScript reduce over the same `fundMovements` array (not a second SQL aggregate); add both fields to the returned `totals` object
- [ ] 3.3 Revise `totalAvailable` formula in `getMonthPayload`: change from `income.amount - totalSpent` to `income.amount - totalSpent - fundDeposits + fundWithdrawals`; comment that deposits reduce available money, withdrawals increase it
- [ ] 3.4 Create `server/services/bootstrap.js` (new file): export `buildBootstrapPayload(executor, { profileId, monthKey })` — shared builder called by both `GET /api/bootstrap` and `PUT /api/profiles/active` (design.md §"Bootstrap Decision"); gather settings, profiles, categories, and funds via `listFundsWithBalance()` in one `Promise.all` with existing queries; return exact shape with `funds` array (no separate round trip)
- [ ] 3.5 Modify `server/routes/index.js:GET /api/bootstrap` handler: call `buildBootstrapPayload` instead of inline aggregation; response now includes `funds` array with balances
- [ ] 3.6 Write RED test: `tests/contract/parity.test.js` — extend existing fixture to include `fundMovements: [{...deposit...}, {...withdrawal...}]` with nonzero amounts; verify `server.body.totals.fundDeposits > 0` and `server.body.totals.fundWithdrawals > 0` so an empty fixture cannot make test pass vacuously (critical parity-vacuum risk mitigation)
- [ ] 3.7 Write RED test: `tests/contract/months.test.js` — a 200 deposit dated this month lowers `totalAvailable` by exactly 200 and raises `fundDeposits` by 200; a 50 withdrawal raises `totalAvailable` by exactly 50 and raises `fundWithdrawals` by 50; combined 200 deposit + 200 withdrawal in one month leaves `totalAvailable` unchanged but both terms at 200 (not zero)
- [ ] 3.8 Write RED test: `tests/contract/health-bootstrap.test.js` — `GET /api/bootstrap` includes `funds` array with expected structure; switching active profile via `PUT /api/profiles/active` returns funds scoped to the new profile
- [ ] 3.9 GREEN: run months, parity, and bootstrap tests; all month-scoped totals reflect fund movements; balance verified by direct SQL sum; parity assert with nonzero fund terms passes

---

## Phase 4: Client Critical Fix & State Management

Implement client-side cache management, the critical cache-leak fix in `setActiveProfile()`, fund readers/mutators, and API wrappers. This phase must run before UI rendering to ensure state integrity.

- [ ] 4.1 Modify `src/storage.js:defaultData()`: add `funds: []` to cached structure; add `fundMovements: []` to `EMPTY_MONTH` shape and `ensureCacheMonth()` initialization; add `fundMovements: []` to `monthFromPayload()` mapping
- [ ] 4.2 Modify `src/api.js`: add `getFunds()`, `createFund(payload)`, `renameFund(id, name)`, `archiveFund(id)`, `getFundMovements(id, { limit })`, `createFundMovement(id, body)` — follow existing `request()` pattern with proper encodeURIComponent() on id
- [ ] 4.3 Modify `src/state.js:bootstrap()`: assign `cache.funds = initial.funds.map(f => ({ ...f }))` alongside existing category/month cache population
- [ ] 4.4 **CRITICAL CACHE-LEAK FIX** — modify `src/state.js:setActiveProfile()` (around line 196-203): add `cache.funds = {}` alongside existing `cache.months = {}` reset. **This task MUST include a unit test** (`tests/unit/state.test.js`): "replaces settings/profiles/categories/funds and empties cache.months, so a stale fund from the previous profile is unrepresentable" — assert `cache.funds === {}` after switching, and assert that pre-population with another profile's funds leaves zero funds in cache after switch
- [ ] 4.5 Implement fund readers in `src/state.js`: `getFunds()` returns live (non-archived) funds; `getFundBalance(fundId)` returns cached balance for a given fund; `getFundMonthMovements(monthKey, fundId)` returns movements in that month for that fund filtered from `readMonth(monthKey).fundMovements`
- [ ] 4.6 Implement fund mutators in `src/state.js`: `addFund(name)` calls API, pushes to `cache.funds`, returns new fund; `renameFund(id, name)` calls API, replaces in-place in `cache.funds`; `archiveFund(id)` calls API, sets `archived: true` in-place
- [ ] 4.7 Implement `addFundMovement(fundId, { type, amount, note, date })`: call API, update `cache.funds[i].balance` from response (no re-fetch), call `ensureCacheMonth(movement.monthKey)` (the SERVER's month, not the viewed month), `unshift()` movement to that month's `fundMovements` array (per design.md sequence)
- [ ] 4.8 Modify `src/state.js:getMonthTotals(monthKey)`: compute `fundDeposits` and `fundWithdrawals` from `month.fundMovements || []` (defensive `|| []` protects against stale client caches); use identical reduce logic as server; return object with both fund terms plus revised `totalAvailable: income - totalSpent - fundDeposits + fundWithdrawals`
- [ ] 4.9 Write RED test: `tests/unit/state.test.js` — `setActiveProfile()` replaces funds wholesale; pre-loading cache with profile B's funds followed by `setActiveProfile(profileA)` leaves cache empty; `getMonthTotals()` over a literal month with deposits only, withdrawals only, both, and absent `fundMovements` key (must return zeros, not throw)
- [ ] 4.10 GREEN: run state unit tests; cache-leak fix verified; fund readers/mutators work; `getMonthTotals()` parity with server confirmed

---

## Phase 5: Client Rendering & Event Binding

Implement client-side UI rendering and event handlers. This phase connects server state to visual output.

- [ ] 5.1 Modify `index.html`: add `.funds-section` between `#summaryCard` and `.categories-section`; section has `#addFundBtn` ("+ Nuevo") and `#fundsList` container (empty state handled by render function)
- [ ] 5.2 Add `#fundFormOverlay` to `index.html`: form with `#fundId` (hidden), `#fundName` input, `#fundFormTitle` (dynamic), `#deleteFundBtn` (hidden until edit mode), cancel/save buttons; copy structure exactly from `#categoryFormOverlay`
- [ ] 5.3 Add `#fundMovementFormOverlay` to `index.html`: form with `#movementFundId` (hidden), `#movementType` (hidden, set by opener), `#movementAmount` (decimal), `#movementDate` (date picker), `#movementNote` (optional), `#movementBalanceHint` (display only), cancel/save buttons; title dynamic per type
- [ ] 5.4 Modify `src/render.js`: add `renderFunds()` function called from `renderApp()` between `renderSummary()` and `renderCategories()`. Function renders list of live funds; each fund-card shows name, balance, this-month net deposits/withdrawals (or "Sin movimientos"), edit/deposit/withdraw buttons. Empty state message if no funds.
- [ ] 5.5 Modify `src/render.js:renderSummary()`: extract `fundDeposits` and `fundWithdrawals` from `getMonthTotals()`; change `pctUsed` and `status` computation to use `outflow = totalSpent + fundDeposits` and `inflow = income + fundWithdrawals` instead of spending-only ratio; add conditional `fundMeta` div showing "A fondos: $X / Desde fondos: $Y" when either term is nonzero
- [ ] 5.6 Modify `src/main.js`: add delegated click listener on `#fundsList` for `.edit-fund` button (opens form for editing), `.fund-deposit` button (opens movement form for deposit), `.fund-withdraw` button (opens movement form for withdrawal); disable withdraw button if balance <= 0 (UX hint only, server enforces `409`)
- [ ] 5.7 Wire form handlers in `src/main.js`: `#addFundBtn` opens `#fundFormOverlay` in create mode (clear inputs); `#fundForm` submit branches create/rename based on hidden `#fundId` content; `#deleteFundBtn` visible only in edit mode, archives on click after `confirm()`
- [ ] 5.8 Wire movement form in `src/main.js`: `#fundMovementForm` submit handler wraps `addFundMovement()` in `withBusy()`, extracts type/amount/note/date from inputs, calls state.js mutator, closes overlay on success; error banner on failure (existing `showError()` path); set `#movementDate` default to `toDateInputValue(new Date())` on open
- [ ] 5.9 Verify overlay closing works: ensure `#fundFormOverlay` and `#fundMovementFormOverlay` have `data-close` buttons that trigger existing `closeAllOverlays()` wiring (no changes to `src/main.js:25-38`)
- [ ] 5.10 Modify `src/style.css`: add `.funds-section` (flex column, spacing), `.fund-card` (card-like div with fund-header/name/balance/meta/actions), `.fund-balance` (large text, currency), `.fund-meta` (small text, month summary), `.fund-actions` (button row). Reuse existing `.btn-link` and `.btn-icon-sm` classes; balance styling similar to `.transaction-amount`

---

## Phase 6: Contract & Integration Tests

Write comprehensive contract tests for isolation, interactions with existing features, and design risks.

- [ ] 6.1 Modify `tests/contract/isolation.test.js`: add fund-isolation matrix — seed two profiles with funds, switch profile, verify `GET /api/funds` returns zero funds from other profile; `GET /api/funds/:id/movements` for a foreign fund returns `404`; a foreign `fundId` in `POST /api/funds/:id/movements` returns `404`
- [ ] 6.2 Write RED test: `tests/contract/isolation.test.js` — verify `totals.fundDeposits` and `totals.fundWithdrawals` in `GET /api/months/:k` are zero for any movements from profile B; profile A's balance is unaffected by profile B's movements to its own funds
- [ ] 6.3 Write RED test: fund-movement-materializes-month interaction (`tests/contract/funds.test.js` or new subsection) — recording a movement calls `materializeMonth`, which disables carry-forward banner; assert `GET /api/months/{k}` returns `carryForward.available = false` after a movement is recorded (this is correct behavior per design.md's "materialization" risk, but must be pinned as a contract so the interaction stays documented)
- [ ] 6.4 Write RED test: `tests/contract/migration.test.js` — `003` creates both tables; `DOWN` fails on movements; DOWN succeeds on empty ledger and restores exact `002` shape (row counts, column names, constraint list)
- [ ] 6.5 GREEN: run full contract test suite (`npm test -- tests/contract/`); all funds, isolation, months, parity, health-bootstrap tests pass; no cross-profile leakage; all guards (`409` codes) trigger correctly
- [ ] 6.6 GREEN: run migration tests; verify up/down contract; verify no data loss on empty down

---

## Phase 7: Final Verification & Documentation

Verify end-to-end flows, full build, and document any open decisions.

- [ ] 7.1 GREEN: run full test suite `npm test`; all unit + contract tests pass with no modifications to unrelated test files
- [ ] 7.2 GREEN: run build `npm run build`; no TypeScript/linting errors; frontend assets generated successfully
- [ ] 7.3 Manual smoke test: start dev server; verify empty funds state renders; create fund; deposit; verify balance and available money change; withdraw; verify month totals update; create second fund; switch between them; verify isolation; archive empty fund (succeeds); attempt archive with balance (409)
- [ ] 7.4 Document decision log: fund-card ordering default is `created_at ASC` (not balance DESC); append-only movements (no edit/delete — compensating entries used instead); both open questions from design.md are resolved per design rationale
- [ ] 7.5 Verify deliverable checklist: migration creates tables with exact schema; all constraints enforce derived-balance invariant; server-computed balances ship in bootstrap and month payloads; client cache-leak fixed in `setActiveProfile()`; parity test guards against vacuous pass; fund-movement-materializes-month interaction documented

---

## Key Implementation Notes

- **Month-keying**: `monthKeyFromDate()` and `startOfDayInTz()` are SERVER duties — never accept `month_key` from client. Movements record in their date's month, not the viewed month.
- **Balance derives at read time**: no `balance` column anywhere; server computes via `SUM(deposits) - SUM(withdrawals)` per fund; client does not re-derive (it caches the server value).
- **Composite FKs**: `funds(profile_id, id)` and months `(profile_id, month_key)` make cross-profile and orphan-month movements unrepresentable in the database, not just in application logic.
- **Archive guard**: both the archive check and movement insert take `forUpdate()` lock on the same `funds` row; they serialize, so the invariant "archived → balance zero forever" holds under concurrency.
- **Parity invariant**: `getMonthTotals()` in client and server reduce over the same `fundMovements` rows; shape must stay in lockstep or parity test fails. Fixture must assert nonzero fund terms.
- **Cache-leak fix**: `setActiveProfile()` must reset `cache.funds` wholesale alongside `cache.months`, else previous profile's funds render under new profile name (composite FK in DB cannot prevent client-cache mistakes).

