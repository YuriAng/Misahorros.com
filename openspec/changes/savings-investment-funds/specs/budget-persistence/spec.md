# Delta for Budget Persistence

## MODIFIED Requirements

### Requirement: Relational Schema

The database SHALL define the following tables, managed by versioned
migrations: `budget_profiles` (id, name, archived, created_at),
`categories` (id, profile_id, name, icon, color, archived,
created_at), `settings` (single-row key/value for currency,
active_month, active_profile), `months` (profile_id, month_key,
income_amount, income_updated_at; primary key on `profile_id` +
`month_key`), `category_budgets` (profile_id, month_key, category_id,
amount; composite key on `profile_id` + `month_key` + `category_id`),
`transactions` (id, profile_id, month_key, category_id, amount,
note, date), `funds` (id, profile_id, name, archived, created_at;
`UNIQUE(profile_id, id)`), and `fund_movements` (id, profile_id,
fund_id, type, amount, date, month_key; composite foreign key on
`(profile_id, fund_id)` referencing `funds(profile_id, id)`).
`budget_profiles` has no `is_default` column: the default profile is
an identity fact (id `prof_default`, name "General") established once
by the migration, not a queryable flag.
(Previously: did not include `funds` or `fund_movements`.)

#### Scenario: Applying migrations to a fresh database

- GIVEN an empty PostgreSQL database
- WHEN the migration runner executes
- THEN `budget_profiles`, `categories`, `settings`, `months`, `category_budgets`, `transactions`, `funds`, and `fund_movements` tables exist with their specified columns
- AND exactly one profile row named "General" (id `prof_default`) exists in `budget_profiles`
- AND `settings.active_profile` equals that profile's id

#### Scenario: Category budgets are unique per profile and month

- GIVEN a `category_budgets` row exists for a given `profile_id`, `month_key: "2026-01"`, and category
- WHEN an insert is attempted for the same `profile_id`, `month_key`, and `category_id`
- THEN the database MUST reject the duplicate via the composite key constraint

#### Scenario: Same month key is independently usable in different profiles

- GIVEN profile A has a `category_budgets` row for `month_key: "2026-01"` and category `cat_a`
- WHEN profile B inserts a `category_budgets` row for the same `month_key: "2026-01"` but its own category `cat_b`
- THEN the insert succeeds because the composite key includes `profile_id`

#### Scenario: Fund movement references the fund's own profile

- GIVEN a fund `fund_a` belongs to `profile_id: A` with `UNIQUE(profile_id, id)` enforced
- WHEN a `fund_movements` row is inserted referencing `(profile_id: A, fund_id: fund_a)`
- THEN the composite foreign key to `funds(profile_id, id)` admits the insert

### Requirement: Derived-Balance Invariant

The schema MUST NOT contain persisted columns for spent, remaining, or
fund-balance amounts. Spent, remaining, and fund-balance values SHALL
always be computed at read time: spent/remaining from
`category_budgets` and `transactions`, and each fund's balance as the
all-time sum of its `deposit` movements minus the all-time sum of its
`withdrawal` movements from `fund_movements`. No fund balance resets
or carries forward between months.
(Previously: covered only spent/remaining columns derived from
`category_budgets` and `transactions`; did not address fund balances.)

#### Scenario: Schema has no spent/remaining/balance columns

- GIVEN the full database schema after migrations
- WHEN the schema is inspected
- THEN no table contains a `spent`, `remaining`, or `balance` column

#### Scenario: Spent amount reflects current transactions

- GIVEN a category has a budget of 200 and two transactions of 30 and 20 in the same month
- WHEN the month's totals are computed
- THEN spent for that category is 50 and remaining is 150
- AND this value exists only as a query result, never as a stored column

#### Scenario: Fund balance reflects current movements, never stored

- GIVEN a fund has deposits totaling 300 and withdrawals totaling 120 across several months
- WHEN the fund's balance is computed
- THEN the balance equals 180
- AND this value exists only as a query result, never as a stored column

### Requirement: Foreign Key Integrity

`categories.profile_id`, `months.profile_id`, `category_budgets.profile_id`,
`transactions.profile_id`, `funds.profile_id`, and
`fund_movements.profile_id` MUST reference `budget_profiles.id`.
`transactions.category_id` and `category_budgets.category_id` MUST
reference a category belonging to the SAME `profile_id` as the
referencing row. `fund_movements.fund_id` MUST reference a fund
belonging to the SAME `profile_id` as the referencing row, via a
composite foreign key on `(profile_id, fund_id)` against
`funds(profile_id, id)`, mirroring the pattern already used for
category references. Deleting a category, fund, or profile that has
budgets, transactions, or movements MUST be rejected or require an
explicit archive instead of a hard delete, so historical financial
data is never silently lost.
(Previously: covered only `categories`/`months`/`category_budgets`/
`transactions`; did not address `funds` or `fund_movements`.)

#### Scenario: Deleting a category with existing transactions

- GIVEN a category has at least one associated transaction
- WHEN a hard delete of that category is attempted
- THEN the database rejects the operation via foreign key constraint

#### Scenario: Archiving a category preserves history

- GIVEN a category has existing transactions
- WHEN the category is archived (`archived: true`) instead of deleted
- THEN its past transactions and budgets remain queryable

#### Scenario: Cross-profile category reference is rejected

- GIVEN a transaction row has `profile_id: A`
- WHEN it is inserted or updated with `category_id` belonging to `profile_id: B`
- THEN the write is rejected

#### Scenario: Profiles with existing data cannot be hard-deleted

- GIVEN a profile has categories or transactions
- WHEN a hard delete of that profile is attempted
- THEN the database rejects the operation via foreign key constraint; archiving is required instead

#### Scenario: Cross-profile fund reference is rejected at the database level

- GIVEN a fund `fund_x` row has `profile_id: B`
- WHEN a `fund_movements` row is inserted or updated with `fund_id: fund_x` but `profile_id: A`
- THEN the write is rejected via the composite foreign key constraint, not only by application logic

#### Scenario: Deleting a fund with existing movements is rejected

- GIVEN a fund has at least one recorded movement
- WHEN a hard delete of that fund is attempted
- THEN the database rejects the operation via foreign key constraint

### Requirement: Backfill Migration Preserves All Existing Data

A migration MUST create a profile named "General" (id `prof_default`)
as the only profile at that point in time, backfill every existing row
in `categories`, `months`, `category_budgets`, and `transactions` with
that profile's id, set `settings.active_profile` to that profile's id
within the same migration transaction, and only then enforce `NOT
NULL` and foreign-key constraints on `profile_id`. No `is_default`
column is created or required; the "General" profile is identifiable
because it is the only profile that exists once the backfill completes.

#### Scenario: Migration backfills existing data with zero loss

- GIVEN a pre-migration database with N categories, M months, and T transactions
- WHEN the profile migration runs
- THEN a "General" profile (id `prof_default`) exists as the only profile, all N/M/T rows reference its id, post-migration counts equal N, M, and T exactly, and `settings.active_profile` equals its id

#### Scenario: Down migration reverses cleanly when no other profile owns data

- GIVEN every row in `categories`, `months`, `category_budgets`, and `transactions` still belongs to the "General" profile
- WHEN the profile migration is rolled back
- THEN `profile_id` columns and the `budget_profiles` table are removed, and remaining data matches the pre-migration schema

#### Scenario: Down migration refuses once a second profile owns data

- GIVEN at least one row in `categories`, `months`, `category_budgets`, or `transactions` belongs to a profile other than "General"
- WHEN the profile migration rollback is attempted
- THEN the rollback throws and makes no schema change, because reversing it would merge two isolated profiles' data

## ADDED Requirements

### Requirement: Invariant Contract Tests Track New Tables and Columns

`tests/contract/invariant.test.js` MUST stay synchronized with the
schema it protects: its pinned table-name assertion MUST include
`funds` and `fund_movements` alongside the six pre-existing tables,
and its `FORBIDDEN_COLUMN_NAMES` list MUST include `balance` alongside
the pre-existing forbidden names, so a persisted fund-balance column
would fail the same invariant test that already protects spent and
remaining values.

#### Scenario: Pinned table list admits the two new tables

- GIVEN migrations have run including the funds migration
- WHEN `invariant.test.js`'s table-name assertion executes
- THEN it expects exactly `budget_profiles`, `categories`, `category_budgets`, `funds`, `fund_movements`, `months`, `settings`, and `transactions`

#### Scenario: A persisted balance column fails the invariant

- GIVEN a hypothetical migration adds a `balance` column to any table
- WHEN `invariant.test.js`'s forbidden-column query executes
- THEN the test fails, because `balance` is in `FORBIDDEN_COLUMN_NAMES`
