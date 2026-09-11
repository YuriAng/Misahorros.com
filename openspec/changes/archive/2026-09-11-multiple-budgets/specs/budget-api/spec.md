# Delta for Budget API

## MODIFIED Requirements

### Requirement: Response Shapes

The API MUST return JSON response bodies for settings, profiles,
categories, months, budgets, and transactions that preserve the field
names and types used by the existing client data model (currency,
activeMonth, activeProfile, category id/name/icon/color/archived/
createdAt, income amount, per-category budget amounts, transaction
id/categoryId/amount/note/date).
(Previously: settings response did not include an active profile
identifier; there was no `profiles` resource.)

#### Scenario: Fetching categories

- GIVEN two categories exist under the active profile, one archived and one active
- WHEN a client sends `GET /api/categories`
- THEN the response is a JSON array where each item includes `id`, `name`, `icon`, `color`, `archived`, and `createdAt`

#### Scenario: Fetching settings includes the active profile

- GIVEN profile "Negocio" is the active profile
- WHEN a client sends `GET /api/settings`
- THEN the response includes `activeProfile` equal to "Negocio"'s id alongside `activeMonth`

### Requirement: Validation and Not-Found Errors

The API MUST reject malformed or invalid write requests with a `4xx`
status and a structured JSON error body describing the problem, and
MUST return `404`/`400` when a referenced resource does not exist or
does not belong to the active profile, treating the two cases
identically so cross-profile existence is never leaked.
(Previously: did not address resources belonging to a different profile.)

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

#### Scenario: Referencing a category from another profile

- GIVEN category `cat_x` belongs to a profile other than the active one
- WHEN a client sends `POST /api/transactions` with `categoryId: "cat_x"`
- THEN the server responds `400` identifying `categoryId` as invalid, indistinguishable from a non-existent category

## ADDED Requirements

### Requirement: All Reads and Writes Scoped by Active Profile

Every endpoint under `/api/categories`, `/api/months`, and
`/api/transactions` MUST scope its query and mutation to the
server-resolved active profile. A client MUST NOT be able to override
this scope via request body, query string, or header.

#### Scenario: Listing categories only returns active-profile data

- GIVEN categories exist under both profile A and profile B, and A is active
- WHEN a client sends `GET /api/categories`
- THEN only profile A's categories appear

#### Scenario: Client-supplied profile override is ignored

- GIVEN profile A is the server-resolved active profile
- WHEN a request includes a `profileId` field or header naming profile B
- THEN the server still scopes the operation to profile A and ignores the client-supplied value

### Requirement: Profile Management Endpoints

The API MUST expose `POST /api/profiles` (create; `400` blank name,
`409` duplicate live name), `PATCH /api/profiles/:id` (rename; `404`
unknown, `409` duplicate live name), `GET /api/profiles` (list),
`DELETE /api/profiles/:id` (archive; `204`, `409 profile_is_active`,
`409 last_profile`, `404` unknown), and a dedicated
`PUT /api/profiles/active` endpoint (switch; body `{ profileId }`,
`404` unknown, `409` archived) that returns the same full bootstrap
payload shape as `GET /api/bootstrap` for the newly active profile.
`PUT /api/settings` MUST reject a request body containing an
`activeProfile` field with `400`, directing the caller to
`PUT /api/profiles/active`; switching the active profile is never a
plain settings write, because it requires foreign-key validation and
a full-payload response the client can render atomically.

#### Scenario: Creating and switching to a new profile

- WHEN a client creates a profile "Negocio" and then sends `PUT /api/profiles/active` with `{ profileId: "<Negocio's id>" }`
- THEN the response is a full bootstrap payload for "Negocio", and subsequent `GET /api/settings` reports `activeProfile` as "Negocio"'s id

#### Scenario: Setting active profile to an archived profile is rejected

- GIVEN profile "Old" is archived
- WHEN a client sends `PUT /api/profiles/active` with `{ profileId: "<Old's id>" }`
- THEN the server responds `409` and the active profile is unchanged

#### Scenario: PUT /api/settings rejects an active profile field

- GIVEN profile "Personal" is currently active
- WHEN a client sends `PUT /api/settings` with a body containing `activeProfile: "<some other id>"`
- THEN the server responds `400`, and the active profile is unchanged
