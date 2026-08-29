# Legacy Data Import Specification

## Purpose

One-time import of existing browser `localStorage` data
(`budgetpwa_data_v1`) into the new PostgreSQL-backed API, safe to run
more than once and safe to abandon without losing the original data.

## ADDED Requirements

### Requirement: Idempotent Import

Running the import operation more than once with the same source data
MUST NOT create duplicate categories, months, budgets, or transactions.
Records SHALL be matched by their existing client-generated ids.

#### Scenario: Import run twice with identical data

- GIVEN `budgetpwa_data_v1` contains 3 categories, 2 months, and 10 transactions
- WHEN the import endpoint is called twice in a row with the same payload
- THEN the database contains exactly 3 categories, 2 months, and 10 transactions after both runs

#### Scenario: Import run twice after a partial failure

- GIVEN a first import call inserted 2 of 3 categories before failing
- WHEN the import is retried with the full original payload
- THEN the missing category is created
- AND the 2 already-imported categories are not duplicated

### Requirement: Import Reports Counts

The import operation MUST return a summary reporting how many
categories, months, budgets, and transactions were imported (or
skipped as already-existing) so the caller can verify totals.

#### Scenario: Successful import returns a summary

- GIVEN a valid `budgetpwa_data_v1` payload with 3 categories and 10 transactions
- WHEN the import completes
- THEN the response includes counts of imported categories and transactions matching the source data

#### Scenario: Re-running import reports zero new records

- GIVEN the import has already been run successfully once
- WHEN it is run again with the same payload
- THEN the response reports 0 newly-created records and the original counts as already-imported

### Requirement: Source Data Is Never Deleted

The import operation MUST only read `budgetpwa_data_v1` from the
client. It MUST NOT clear, delete, or modify the browser's localStorage
data, preserving it as a rollback source.

#### Scenario: localStorage untouched after import

- GIVEN `budgetpwa_data_v1` exists in the browser with the full budget history
- WHEN the client completes a successful import
- THEN `budgetpwa_data_v1` is still present and unchanged in localStorage

### Requirement: Malformed Source Rejected

If the submitted payload does not match the expected `budgetpwa_data_v1`
shape, the import MUST reject it with a validation error instead of
partially importing malformed records.

#### Scenario: Import called with an invalid payload shape

- GIVEN a payload missing the required `categories` array
- WHEN the import endpoint receives it
- THEN the server responds `400` and no records are created
