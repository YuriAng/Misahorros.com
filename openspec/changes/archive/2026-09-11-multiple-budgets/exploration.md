# Exploration: multiple-budgets

User request (verbatim, Spanish): "Ayudame a crear varios presupuestos, quiero poder crear mas de un presupuesto" ("Help me create several budgets, I want to be able to create more than one budget").

## Current State

**What "budget" means today**: a `category_budgets` row = one decimal amount tied to exactly one `(month_key, category_id)` pair (`server/migrations/001_init.js:42-48`). There is no standalone "Budget" entity — a budget is just an attribute of a category for a given month.

**Confirmed capabilities that already exist**:
- A user can already create unlimited categories, each with its own per-month budget amount. `addCategory({name, icon, color, budget})` in `src/state.js:99-108` and `POST /api/categories` in `server/routes/categories.js:41-68` both accept a `budget` at creation time; `applyBudget()` (`server/routes/categories.js:24-31`) upserts into `category_budgets` on `(month_key, category_id)` conflict.
- Editing a category's budget for the active month: `updateCategory()` (`src/state.js:110-124`) via `PATCH /api/categories/:id` with `budget`+`monthKey`, or directly `PUT /api/months/:monthKey/budgets/:categoryId` (`server/routes/months.js:58-79`).
- Budgets are per-month: navigating months (`prevMonth`/`nextMonth`, `src/main.js:102-110`, backed by `setActiveMonth` in `src/state.js:84-91`) shows a different `category_budgets` row set per `month_key`. A "carry-forward" endpoint (`server/routes/months.js:81-126`) copies the previous month's income + all category budgets into a newly materialized month.
- Multiple simultaneous category budgets are summed for the month total: `getMonthTotals()` (`src/state.js:212-223`) and the server's equivalent aggregate in `getMonthPayload()` (`server/services/months.js:77-99`, raw SQL `LEFT JOIN category_budgets ... GROUP BY c.id`).

**What does NOT exist**:
- No concept of multiple independent "budget plans/profiles/workspaces" (e.g., "Personal" vs "Negocio") coexisting for the same month. `categories` is a single global table (`server/migrations/001_init.js:18-26`) shared across the entire app — not scoped to any higher-level "budget" grouping.
- `settings` is a single global key/value table (`server/migrations/001_init.js:30-33`; keys: `currency`, `active_month`, `legacy_import_at`) — i.e., ONE global `activeMonth`, not "one active month per budget/workspace." `src/storage.js:11-21` (`defaultData()`) confirms the same singular shape client-side.
- No UI or data path exists for switching between named budget sets — the month prev/next switcher (`index.html:15-19`) is the ONLY "switcher" UI in the app.
- No versioning/history of budget amounts within a category-month pair — `category_budgets` uses `.onConflict(['month_key','category_id']).merge()` (upsert), so editing a category's budget for a month overwrites it.
- App branding/copy is singular: `index.html:8,14` says "Mi Presupuesto" / "💰 Mi Presupuesto", reinforcing the product was designed around one implicit household budget.

**Architectural constraint discovered**: `categories` has no FK to any higher-level grouping entity and no `owner`/`profile_id`/`workspace_id` column. Introducing an interpretation that needs isolated category sets is a genuine schema change (new table + FK + migration of existing `categories`/`category_budgets`/`transactions` rows into a default profile). `transactions` also references `category_id` directly (`server/migrations/001_init.js:50-61`) with `ON DELETE RESTRICT`, so any new grouping level cascades through 3 tables plus the derived-aggregate SQL in `server/services/months.js:77-87`.

## Affected Areas (by interpretation)

- `server/migrations/001_init.js` — schema; only interpretation (b) requires changes here.
- `server/services/months.js` — `getMonthPayload()` aggregate query; (b) and (d) would need to scope/extend this.
- `server/routes/categories.js`, `server/routes/months.js` — API surface; (b) needs a new resource + scoping param, (d) needs new read endpoints for history.
- `src/state.js`, `src/main.js`, `src/render.js`, `index.html` — UI; (a) needs zero code changes, (b) needs a new switcher analogous to the month switcher, (c) needs zero schema changes, (d) needs a history view.

## Interpretations of the Request

1. **(a) Discoverability gap, not a code gap** — the user doesn't realize each category already has its own independent budget amount and that they can add as many categories as they want. Effort: Low (copy/UX only).
2. **(b) Multiple independent named budget plans/profiles per month** — e.g. a whole separate set of categories + income + transactions under "Personal" vs "Negocio", switchable like the month switcher. Requires a new `budget_profiles` table, FK propagation through `categories`/`category_budgets`/`transactions`, a new "active profile" concept, a new switcher UI, and a data migration to backfill existing rows into a default profile. Effort: High.
3. **(c) Multiple budget lines within one category** (e.g. splitting "Alimentación" into "Supermercado" + "Restaurantes") — already achievable today by creating two separate categories. A real parent/child grouping between categories would be a smaller schema addition (self-referencing FK) than (b). Effort: Low if "just create more categories" satisfies it; Medium if real parent/child grouping is wanted.
4. **(d) Historical/versioned budget tracking** — comparing budget amounts set over time for the same category. Partially possible today by reading past months' `category_budgets` rows; no intra-month revision history exists. Effort: Low (cross-month report) to Medium (true version history).

## Ready for Proposal

**No — this is a product-scope ambiguity, not a technical unknown.** The current code equally well supports reading the request as "nothing to build" (a), "significant new schema + UI" (b), "already achievable, maybe needs better UX" (c), or "small reporting feature" (d). Proceeding to `sdd-propose` without resolving this risks designing the wrong thing.

**Clarifying question relayed to the user:** whether per-category budgets (already supported) solve the request, or whether fully separate/switchable budget profiles (e.g. "Personal" vs "Negocio") are wanted — and if the latter, whether those profiles need fully isolated income/categories or just lighter grouping of existing categories.

## Risks

- Building interpretation (b) speculatively without confirmation risks a large, unwanted schema migration.
- Building nothing (assuming (a)) risks under-delivering if the user genuinely wants isolated budget profiles.
- No test coverage currently exists for any multi-profile scenario; whichever interpretation is chosen will need new contract tests.
