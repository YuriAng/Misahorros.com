# Proposal: Savings and Investment Funds

> **Persistence-boundary change** (`openspec/config.yaml` rule): adds a new migration with two new tables and revises the month-payload totals contract.

## Intent

The owner keeps money in funds outside the monthly budget (*fondo de ahorro*, *fondo de inversión*, and any others they choose to create) and sometimes withdraws from them. Today the app cannot represent either side: `totals.totalAvailable = income.amount - totalSpent` (`server/services/months.js:181`) has no term that can increase available money, and `transactions` rows are categorized non-negative expenses. Confirmed scope: funds are profile-scoped, a fund balance **accumulates across months and never resets or carries forward**, a *depósito* reduces that month's available money, and a *retiro* increases it.

## Scope

### In Scope
- `funds` + `fund_movements` tables in a new `server/migrations/003_savings_investment_funds.js` (only `001_init.js` and `002_budget_profiles.js` exist today).
- Multiple user-named funds per `budget_profiles` row, with the same isolation guarantee as categories.
- `deposit` / `withdrawal` movements, month-keyed server-side from the movement's own `date`.
- Fund balance as an all-time derived aggregate — never a stored column.
- Revised `totals.totalAvailable` (server and client in lockstep) plus fund balances in the shared bootstrap payload.
- New funds UI surface; new contract tests.

### Out of Scope
- Transfers between funds; interest, yield, or return tracking.
- Cross-profile or all-funds aggregate views.
- Per-fund monthly budgeting or goal targets.
- Reclassifying existing `transactions` rows as fund movements.
- Carry-forward of any fund value — explicitly excluded by the confirmed requirement.

## Capabilities

### New Capabilities
- `savings-funds`: fund entity, deposit/withdrawal movements, derived balance, profile isolation, archive semantics.

### Modified Capabilities
- `budget-persistence`: Relational Schema gains two tables; Derived-Balance Invariant extends to fund balances.
- `budget-api`: `/api/funds` surface; month payload `totals` gains fund terms and a revised `totalAvailable`.
- `budget-profiles`: isolation guarantee extends to funds and fund movements.

## Approach

Exploration approach 1, accepted. `funds` carries identity only (`id`, `profile_id`, `name`, `archived`, `created_at`) plus `UNIQUE(profile_id, id)`, so `fund_movements` references `(profile_id, fund_id)` compositely — the exact pattern `002_budget_profiles.js:113-124` used to make a cross-profile reference a constraint violation rather than a missed `WHERE`. Balance is `SUM(deposits) − SUM(withdrawals)` at read time.

`getMonthPayload()` gains a third aggregate: this month's `fund_movements` grouped by type, scoped by `profile_id`, feeding `totalAvailable = income − totalSpent − deposits + withdrawals`. `src/state.js: getMonthTotals()` (line 279) changes in the same change or parity breaks. Routes mount under `requireActiveProfile`; `month_key` comes from `monthKeyFromDate()` / `startOfDayInTz()`, never the client.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server/migrations/003_*.js` | New | `funds` + `fund_movements`, composite FKs |
| `server/routes/funds.js` | New | Fund CRUD + deposit/withdraw |
| `server/services/months.js` | Modified | Third aggregate; revised `totalAvailable` |
| `server/services/bootstrap.js` | Modified | Fund balances in shared payload |
| `server/index.js` | Modified | Mount router with `requireActiveProfile` |
| `src/{state,api,render,main}.js`, `index.html` | Modified | Net-new funds UI; totals in lockstep |
| `tests/contract/invariant.test.js` | Modified | Pinned table list must admit the two new tables |
| `tests/contract/` | New/Modified | `funds.test.js`; isolation + parity extensions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `invariant.test.js:29-31` pins the exact public table list, so adding two tables fails it even though the forbidden-column assertion passes | High | Extend the pinned list in the same change; the exploration's "zero changes" claim applies only to the column assertion |
| `FORBIDDEN_COLUMN_NAMES` (`invariant.test.js:11`) omits `balance`, so a stored fund balance would slip past the test | Med | Add fund-balance names to the list so the invariant stays enforceable, not just documented |
| `totals` shape change breaks server/client parity | High | `getMonthTotals()` and `getMonthPayload()` move together; parity test asserts both |
| A withdrawal inflates available money retroactively in a closed month | Med | Movements are month-keyed from their own date; design fixes display rules |
| Archiving a fund with a nonzero balance | Med | Unresolved — design must choose (categories archive freely; money-holding funds may not) |

## Rollback Plan

1. `pg_dump` before migrating; tag the pre-change build.
2. `003` `down()` drops `fund_movements` then `funds`. Unlike `002`, this migration adds no column to any existing table and backfills nothing, so `down()` is a clean drop that restores the exact `002` shape.
3. `down()` destroys all fund movement history — it is safe for schema shape, not for data. Restore the dump if movements were recorded and must be kept.
4. Redeploy the tagged build; the pre-change `totalAvailable` formula needs no schema state to work.

## Dependencies

- None new (Knex / Postgres / Vitest). A verified database backup before the migration runs.

## Success Criteria

- [ ] Two or more named funds coexist per profile, invisible from any other profile.
- [ ] A deposit reduces that month's `totalAvailable`; a withdrawal increases it, by the exact amount.
- [ ] A fund balance carried from a previous month is unchanged by month rollover and by carry-forward.
- [ ] No table contains a persisted balance, spent, remaining, or available column.
- [ ] Server `totals` and client `getMonthTotals()` agree in the parity test.
- [ ] `npm test` and `npm run build` pass.

## Effort

Medium: 1 migration, ~4 server files, 4 frontend files, new and extended contract tests. `sdd-tasks` should forecast against the 400-line budget and consider slices (schema → server API → month-totals revision → UI).

## Open Questions for design.md

1. Exact `totals` field names for fund deposits/withdrawals, and whether `totalAvailable` keeps its name with new semantics.
2. Whether `fund_movements` is a `type` enum column or two signed-intent columns, and whether a DB `CHECK` guards amount sign (`transactions` deliberately has none, for lossless legacy import).
3. Archive rule for a fund with a nonzero balance: block with a `409`, or allow and keep history readable.
4. Whether the UI needs a per-fund monthly movement view or only a running balance plus full history.
5. Whether fund balances belong in `buildBootstrapPayload` or in a separate `/api/funds` read.
