# Exploration: savings-investment-funds

User request (Spanish, paraphrased): the user keeps a *fondo de ahorro* (savings fund) and a *fondo de inversión* (investment fund) outside the monthly budget, and sometimes withdraws money from them. They want this reflected in the app, and confirmed (via direct clarification) that a withdrawal should increase the money available to spend in the month it happens.

## Confirmed Requirements (not open — resolved via direct questions)

1. Funds are scoped per profile, with the same isolation as categories/budgets (not shared across `budget_profiles`).
2. A fund has a balance that persists and **accumulates across months** — it must NOT reset monthly the way category budgets do.
3. Two movement types:
   - **Depósito** (money into the fund): reduces that month's available money, the same way an expense against a category does today.
   - **Retiro** (money out of the fund): **increases** that month's available money and decreases the fund's balance.
4. The existing `transactions` model cannot represent a withdrawal as-is (see constraints below) — any design must explain concretely how a withdrawal increases the month's available total without corrupting category-budget math.

## Current State

**Available-total formula** (`server/services/months.js:95-189`, `getMonthPayload`): `totals.totalAvailable = income.amount - totalSpent`. `totalSpent` sums `transactions.amount`. Amounts are constrained to be non-negative only at the API layer (`server/routes/transactions.js:48-50`), not via a DB `CHECK` — intentional, to keep legacy data import lossless. Category `remaining = budget - spent` comes from one raw SQL aggregate joining `category_budgets`/`transactions`, `GROUP BY` category.

**No balance is ever stored anywhere in this schema.** `tests/contract/invariant.test.js` queries `information_schema.columns` for forbidden names (`spent`, `remaining`, `total_spent`, `total_budgeted`, `total_available`, `available`, …) across the *entire* public schema and asserts zero matches, and pins the exact set of expected tables. This is a documented "Derived-Balance Invariant" in `openspec/specs/budget-persistence/spec.md`. A stored fund-balance column would break this existing test and the spec it enforces.

**Profile scoping precedent** (`server/migrations/002_budget_profiles.js`, from the archived `multiple-budgets` change): every domain table got a `profile_id` column; `categories` additionally got `UNIQUE(profile_id, id)` so dependents reference `(profile_id, id)` rather than bare `id`, turning a cross-profile reference into a database constraint violation instead of a missed `WHERE` clause. `requireActiveProfile` middleware (`server/services/profiles.js:39-50`) resolves `req.profileId` server-side per request; no endpoint accepts a client-supplied `profileId` for scoping.

**Month-keying precedent**: `month_key` is always computed server-side from a row's own `date`, via `monthKeyFromDate()`/`startOfDayInTz()` (`server/services/months.js:19-29`), never trusted from the client or an "active month" concept (code comment references this as "Bug Fix B"). Any fund-movement dating should reuse these exact functions.

**Carry-forward precedent** (`server/routes/months.js:83-137`) copies the previous month's income + category budgets into a newly materialized month, and is explicitly scoped together with `getMonthPayload`'s `carryForward` hint field (the prior design called out drift risk if only one side were scoped). This precedent does **not** apply to fund balances — the confirmed requirement is that a fund balance persists and accumulates, it never resets or gets copied forward.

**Archive-don't-delete precedent**: `categories.archived` (never hard-deleted) and `budget_profiles.archived` with `409 profile_is_active` / `409 last_profile` guards taken under a `forUpdate()` row lock (`server/services/profiles.js:68-87`).

**Bootstrap**: `server/services/bootstrap.js: buildBootstrapPayload` returns `{ settings, profiles, categories, month }` from one shared builder used by both `GET /api/bootstrap` and `PUT /api/profiles/active`. Any fund summary the UI needs on load likely flows through here too.

**UI**: `renderSummary()` (`src/render.js:41-82`) builds `#summaryCard` (income, "Disponible", progress bar, spent/budgeted). No funds UI exists anywhere today — this is a net-new surface, not an extension of an existing one.

**Testing**: supertest + ephemeral Postgres (`tests/contract/`), `strict_tdd: true` in `openspec/config.yaml`, honored end-to-end by the prior `multiple-budgets` change.

## Affected Areas

- `server/migrations/00X_savings_investment_funds.js` (new) — `funds` + `fund_movements` tables, profile-scoped, following the composite-FK pattern from `002_budget_profiles.js`.
- `server/services/months.js` — `getMonthPayload()` needs a new fund-movements-this-month aggregate and a revised `totals.totalAvailable`.
- `server/routes/funds.js` (new) — CRUD + deposit/withdraw endpoints, mounted with `requireActiveProfile`.
- `server/services/bootstrap.js` — likely needs fund balances in the shared bootstrap payload.
- `src/state.js` — new fund readers/mutators; `getMonthTotals()` body changes in lockstep with any server-side formula change.
- `src/render.js` / `src/main.js` / `index.html` — net-new UI; no existing surface to extend.
- `tests/contract/` — new `funds.test.js`; likely extensions to `isolation.test.js`, `invariant.test.js`, `parity.test.js`.

## Candidate Approaches

1. **Derived balance via a `fund_movements` ledger (recommended)** — balance = `SUM(deposits) − SUM(withdrawals)` over all time, computed at read time, never stored; `getMonthPayload` adds a third aggregate (this month's movements, grouped by type) feeding a revised `totalAvailable`.
   - Pros: consistent with the codebase's one documented invariant and its existing contract test (zero changes needed to `invariant.test.js` itself); auditable history for free; mirrors how category totals are already computed.
   - Cons: `getMonthPayload` gains a third query; the `totals` shape grows, so client/server parity must move together (the same lesson as the carry-forward hint/endpoint pairing).
   - Effort: Medium.

2. **Stored running-balance column on `funds`, updated transactionally per movement.**
   - Pros: no aggregation cost at read time; simpler `getMonthPayload` query.
   - Cons: directly violates the documented Derived-Balance Invariant and breaks the existing `invariant.test.js` (which asserts zero balance/available-like columns across the *whole* schema) unless that test and its spec are explicitly amended — a much larger, precedent-breaking decision than this feature needs.
   - Effort: Low to build, but high risk/invariant-break cost. **Not recommended.**

3. **Model withdrawals as negative-amount `transactions` rows (reuse the existing table).**
   - Pros: zero schema change.
   - Cons: corrupts category-level aggregates (the `category_budgets`/`transactions` join assumes categorized, non-negative expense semantics), breaks the API's `amount >= 0` validation intent, and gives a fund no identity of its own (no fund list, no per-fund history). Rejected by the explicit requirement that the existing model "cannot represent a withdrawal as-is."
   - Effort: Low, but wrong — not a real candidate.

## Recommendation

**Approach 1** — new `funds` + `fund_movements` tables with a derived balance, profile-scoped using the exact composite-FK / `requireActiveProfile` pattern from `002_budget_profiles.js`, and a third aggregate in `getMonthPayload()` feeding a revised `totals.totalAvailable`. This is the only approach consistent with the codebase's strongest existing architectural convention (derived, never-stored balances, enforced by a contract test) and reuses three already-established patterns — profile scoping, server-side month-keying, archive-don't-delete — rather than inventing new ones.

## Ready for Proposal

**Yes.** The four confirmed requirements are unambiguous; the remaining open items are technical/design decisions, not product-scope ambiguity:

- Exact naming/shape of new `totals` fields exposed by `getMonthPayload` (and the matching client-side `getMonthTotals()` change).
- Whether a per-fund monthly movement view is needed, or only a running balance + full history list.
- Archive semantics for a fund with a nonzero balance (categories archive freely; a fund holding money may need a different rule).

## Risks

- Storing any persisted fund-balance column would break `tests/contract/invariant.test.js` and the documented Derived-Balance Invariant spec requirement — must stay derived.
- If `getMonthPayload`'s `totals` object gains new fields, `src/state.js: getMonthTotals()` must change in the same change, or server/client parity breaks (same class of risk the `multiple-budgets` design flagged for the carry-forward hint/endpoint pair).
- Fund archiving semantics are undecided for nonzero-balance funds; needs resolution in design, not here.
- No test coverage currently exists for any fund scenario; this change needs new contract tests from scratch.
