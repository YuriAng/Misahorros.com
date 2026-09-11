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
and `transactions` (id, profile_id, month_key, category_id, amount,
note, date). `budget_profiles` has no `is_default` column: the default
profile is an identity fact (id `prof_default`, name "General")
established once by the migration, not a queryable flag.
(Previously: no `budget_profiles` table and no `profile_id` column on
any table; `category_budgets`' composite key was `month_key` +
`category_id` only.)

#### Scenario: Applying migrations to a fresh database

- GIVEN an empty PostgreSQL database
- WHEN the migration runner executes
- THEN `budget_profiles`, `categories`, `settings`, `months`, `category_budgets`, and `transactions` tables exist with their specified columns
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

### Requirement: Foreign Key Integrity

`categories.profile_id`, `months.profile_id`, `category_budgets.profile_id`,
and `transactions.profile_id` MUST reference `budget_profiles.id`.
`transactions.category_id` and `category_budgets.category_id` MUST
reference a category belonging to the SAME `profile_id` as the
referencing row. Deleting a category or profile that has budgets or
transactions MUST be rejected or require an explicit archive instead of
a hard delete, so historical financial data is never silently lost.
(Previously: only `transactions.category_id` and
`category_budgets.category_id` referencing `categories.id` were
covered; no profile scoping or same-profile constraint existed.)

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

## ADDED Requirements

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
