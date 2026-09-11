# Budget Profiles Specification

## Purpose

Independent, switchable budget profiles (e.g. "Personal", "Negocio")
providing full data isolation of income, categories, category budgets,
and transactions, analogous to the existing active-month concept.

## Requirements

### Requirement: Profile Entity

A `budget_profiles` record MUST have a unique id, a display `name`,
and an `archived` flag (default `false`). The default profile is
established once, by the migration that introduces this table, as the
profile with id `prof_default` and name "General" — there is no
separate `isDefault`/`is_default` column; "the default profile" is an
identity fact set at migration time, not a queryable flag.

#### Scenario: Creating a profile

- GIVEN no profile named "Negocio" exists
- WHEN a client sends `POST /api/profiles` with `name: "Negocio"`
- THEN the response includes a new profile id, `name: "Negocio"`, `archived: false`

#### Scenario: Profile names must be unique among active profiles

- GIVEN an active (non-archived) profile named "Personal" exists
- WHEN a client sends `POST /api/profiles` with `name: "Personal"`
- THEN the server responds `409` identifying a duplicate live name

### Requirement: Create, Rename, List Profiles

The API MUST support creating, renaming, and listing profiles.

#### Scenario: Renaming a profile

- GIVEN a profile exists with `name: "Personal"`
- WHEN a client sends `PATCH /api/profiles/:id` with `name: "Personal 2026"`
- THEN subsequent `GET /api/profiles` shows the updated name

#### Scenario: Listing profiles

- GIVEN two active profiles and one archived profile exist
- WHEN a client sends `GET /api/profiles`
- THEN the response includes all three with their `archived` flag set correctly

### Requirement: Default Profile and Minimum-One Invariant

At least one non-archived profile MUST exist at all times. Archiving
the last remaining non-archived profile MUST be rejected with
`409 last_profile`.

#### Scenario: Archiving the only remaining profile is rejected

- GIVEN exactly one non-archived profile exists
- WHEN a client sends `DELETE /api/profiles/:id` (archive) for it
- THEN the server responds `409` identifying `last_profile`, and the profile remains non-archived

#### Scenario: Archiving a non-last profile succeeds

- GIVEN two non-archived profiles exist and neither is currently active
- WHEN a client archives one of them
- THEN that profile's `archived` flag becomes `true` and its data remains in the database

### Requirement: Server-Resolved Active Profile

The server MUST resolve the active profile from persisted `settings`
(key `active_profile`), analogous to `active_month`, and MUST NOT trust
a client-supplied profile id for scoping reads or writes. The migration
that introduces `budget_profiles` MUST create exactly one profile and
set `settings.active_profile` to its id within the same migration
transaction, so `active_profile` is always set for every request served
after that migration; the server MUST NOT rely on runtime fallback
logic for an unset value.

#### Scenario: Active profile is set immediately after migration

- GIVEN the profile migration has just completed
- WHEN a client sends `GET /api/settings`
- THEN the response's `activeProfile` equals the migration-seeded default profile's id

#### Scenario: Switching the active profile persists across requests

- WHEN a client sends `PUT /api/profiles/active` with `{ profileId: "<Negocio's id>" }`
- THEN a subsequent, unrelated `GET /api/settings` request still reports `activeProfile` as "Negocio"'s id

#### Scenario: Switching profile does not change active month

- GIVEN `active_month` is `2026-08` while profile "Personal" is active
- WHEN the client switches the active profile to "Negocio" via `PUT /api/profiles/active`
- THEN `active_month` remains `2026-08`

#### Scenario: Switching to an archived profile is rejected

- GIVEN profile "Old" is archived
- WHEN a client sends `PUT /api/profiles/active` with `{ profileId: "Old"'s id }`
- THEN the server responds `409`, and the active profile is unchanged

### Requirement: Archiving the Active Profile Is Rejected

The server MUST reject an attempt to archive the currently active
profile with `409 profile_is_active`. The user MUST explicitly switch
to a different profile first, via `PUT /api/profiles/active`; the
server MUST NOT silently reassign the active profile as a side effect
of an archive request.

#### Scenario: Archiving the active profile is blocked

- GIVEN profile "Negocio" is both active and non-archived
- WHEN a client sends `DELETE /api/profiles/:id` for "Negocio"
- THEN the server responds `409` identifying `profile_is_active`, and "Negocio" remains non-archived and active

#### Scenario: Archiving succeeds after switching away first

- GIVEN profile "Negocio" is active
- WHEN a client sends `PUT /api/profiles/active` to switch to another profile, and then sends `DELETE /api/profiles/:id` for "Negocio"
- THEN the archive succeeds and "Negocio"'s `archived` flag becomes `true`

### Requirement: Full Data Isolation Across Profiles

Every category, month/income record, category budget, and transaction
MUST belong to exactly one profile. Reads and aggregates under one
active profile MUST NOT include, sum, or expose records belonging to
any other profile.

#### Scenario: Category isolation

- GIVEN a category "Comida" is created while profile A is active
- WHEN profile B becomes active and a client sends `GET /api/categories`
- THEN "Comida" does not appear in the response

#### Scenario: Transaction and income isolation

- GIVEN profile A has income and transactions recorded for `2026-06`
- WHEN profile B is active and a client requests `GET /api/months/2026-06`
- THEN income is 0, spent is 0, and no transaction from profile A appears

#### Scenario: Cross-profile category reference is rejected

- GIVEN category `cat_x` belongs to profile B, and profile A is active
- WHEN a client sends `POST /api/transactions` referencing `categoryId: "cat_x"`
- THEN the server responds `400` identifying `categoryId` as invalid, identically to a non-existent category

### Requirement: Carry-Forward Stays Within the Active Profile

Carry-forward MUST copy the previous month's income and category
budgets only from the same profile as the active profile performing the write.

#### Scenario: Carry-forward does not leak across profiles

- GIVEN profile A has a "Renta" budget in July and profile B has no "Renta" category
- WHEN carry-forward is triggered for August while profile B is active
- THEN August under profile B contains no "Renta" budget, because profile B has no such category
