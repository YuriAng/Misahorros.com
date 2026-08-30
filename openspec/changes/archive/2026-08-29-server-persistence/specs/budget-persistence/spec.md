# Budget Persistence Specification

## Purpose

PostgreSQL schema and migrations backing the budget API, including the
derived-balance invariant carried over from the localStorage model.

## ADDED Requirements

### Requirement: Relational Schema

The database SHALL define the following tables, managed by versioned
migrations: `categories` (id, name, icon, color, archived, created_at),
`settings` (single-row key/value for currency and active_month),
`months` (month_key, income_amount, income_updated_at),
`category_budgets` (month_key, category_id, amount; composite key on
month_key + category_id), and `transactions` (id, month_key,
category_id, amount, note, date).

#### Scenario: Applying migrations to a fresh database

- GIVEN an empty PostgreSQL database
- WHEN the migration runner executes
- THEN the `categories`, `settings`, `months`, `category_budgets`, and `transactions` tables exist with their specified columns

#### Scenario: Category budgets are unique per month

- GIVEN a `category_budgets` row exists for `month_key: "2026-01"` and a given category
- WHEN an insert is attempted for the same `month_key` and `category_id` pair
- THEN the database MUST reject the duplicate via the composite key constraint

### Requirement: Derived-Balance Invariant

The schema MUST NOT contain persisted columns for spent or remaining
amounts. Spent and remaining values SHALL always be computed at read
time from `category_budgets` and `transactions` rows.

#### Scenario: Schema has no spent/remaining columns

- GIVEN the full database schema after migrations
- WHEN the schema is inspected
- THEN no table contains a `spent` or `remaining` column

#### Scenario: Spent amount reflects current transactions

- GIVEN a category has a budget of 200 and two transactions of 30 and 20 in the same month
- WHEN the month's totals are computed
- THEN spent for that category is 50 and remaining is 150
- AND this value exists only as a query result, never as a stored column

### Requirement: Foreign Key Integrity

`transactions.category_id` and `category_budgets.category_id` MUST
reference `categories.id`. Deleting a category that has budgets or
transactions MUST be rejected or require an explicit archive instead of
a hard delete, so historical financial data is never silently lost.

#### Scenario: Deleting a category with existing transactions

- GIVEN a category has at least one associated transaction
- WHEN a hard delete of that category is attempted
- THEN the database rejects the operation via foreign key constraint

#### Scenario: Archiving a category preserves history

- GIVEN a category has existing transactions
- WHEN the category is archived (`archived: true`) instead of deleted
- THEN its past transactions and budgets remain queryable
