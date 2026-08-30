# Budget API Specification

## Purpose

REST contract exposed by the Express server for settings, categories,
months, budgets, and transactions, replacing the localStorage boundary.

## ADDED Requirements

### Requirement: Side-Effect-Free Reads

GET endpoints MUST NOT create, mutate, or delete any record as a side
effect of serving a read. A month, category, or budget row MUST exist
only as a result of an explicit write operation (POST/PUT/PATCH), never
because it was queried.

#### Scenario: Reading a month with no data yet

- GIVEN no transactions, budgets, or month record exist for `2026-03`
- WHEN a client sends `GET /api/months/2026-03`
- THEN the response returns zero-valued totals (income 0, spent 0 per category, remaining equal to budget)
- AND no `months` row is created in the database

#### Scenario: Repeated reads stay idempotent

- GIVEN a month has been read via `GET /api/months/2026-03` once
- WHEN the same endpoint is requested again
- THEN the response is identical
- AND the database row count for `months` is unchanged between the two requests

### Requirement: Transaction Month Derived From Date

A transaction's month bucket MUST be computed from the transaction's own
`date` field at write time, never from a client-supplied "active month"
or any other out-of-band state.

#### Scenario: Adding a transaction while viewing a different month

- GIVEN the client's UI is currently displaying month `2026-08`
- WHEN the client sends `POST /api/transactions` with `date: "2026-05-15"`
- THEN the server stores the transaction with `month_key: "2026-05"`
- AND `GET /api/months/2026-05` includes the transaction in its totals
- AND `GET /api/months/2026-08` does not include it

#### Scenario: Editing a transaction's date moves it between months

- GIVEN a transaction exists with `date: "2026-05-15"` under month `2026-05`
- WHEN the client sends `PUT /api/transactions/{id}` with `date: "2026-06-01"`
- THEN the transaction's `month_key` is updated to `2026-06`
- AND it no longer appears in `GET /api/months/2026-05` totals

### Requirement: Response Shapes

The API MUST return JSON response bodies for settings, categories,
months, budgets, and transactions that preserve the field names and
types used by the existing client data model (currency, activeMonth,
category id/name/icon/color/archived/createdAt, income amount, per-
category budget amounts, transaction id/categoryId/amount/note/date).

#### Scenario: Fetching categories

- GIVEN two categories exist, one archived and one active
- WHEN a client sends `GET /api/categories`
- THEN the response is a JSON array where each item includes `id`, `name`, `icon`, `color`, `archived`, and `createdAt`

### Requirement: Validation and Not-Found Errors

The API MUST reject malformed or invalid write requests with a `4xx`
status and a structured JSON error body describing the problem, and
MUST return `404` when a referenced resource does not exist.

#### Scenario: Creating a transaction with a missing amount

- GIVEN a client sends `POST /api/transactions` without an `amount` field
- WHEN the server validates the request
- THEN it responds `400` with a JSON body identifying `amount` as invalid

#### Scenario: Updating a non-existent transaction

- GIVEN no transaction with id `txn_deadbeef` exists
- WHEN a client sends `PUT /api/transactions/txn_deadbeef`
- THEN the server responds `404`

#### Scenario: Referencing an unknown category on a transaction

- GIVEN no category with id `cat_ffffff` exists
- WHEN a client sends `POST /api/transactions` with `categoryId: "cat_ffffff"`
- THEN the server responds `400` identifying `categoryId` as invalid
