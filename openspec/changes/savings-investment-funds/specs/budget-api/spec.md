# Delta for Budget API

## MODIFIED Requirements

### Requirement: All Reads and Writes Scoped by Active Profile

Every endpoint under `/api/categories`, `/api/months`,
`/api/transactions`, and `/api/funds` MUST scope its query and
mutation to the server-resolved active profile, via the same
`requireActiveProfile` server-side resolution used by every other
resource. A client MUST NOT be able to override this scope via
request body, query string, or header.
(Previously: did not include `/api/funds`.)

#### Scenario: Listing categories only returns active-profile data

- GIVEN categories exist under both profile A and profile B, and A is active
- WHEN a client sends `GET /api/categories`
- THEN only profile A's categories appear

#### Scenario: Client-supplied profile override is ignored

- GIVEN profile A is the server-resolved active profile
- WHEN a request includes a `profileId` field or header naming profile B
- THEN the server still scopes the operation to profile A and ignores the client-supplied value

#### Scenario: Listing funds only returns active-profile data

- GIVEN funds exist under both profile A and profile B, and A is active
- WHEN a client sends `GET /api/funds`
- THEN only profile A's funds appear, resolved via `requireActiveProfile`, never from a client-supplied `profileId`

## ADDED Requirements

### Requirement: Fund Management Endpoints

The API MUST expose `POST /api/funds` (create; `400` blank name),
`GET /api/funds` (list, including each fund's derived balance),
`PATCH /api/funds/:id` (rename/archive), `POST
/api/funds/:id/deposits` (record a deposit), and `POST
/api/funds/:id/withdrawals` (record a withdrawal). All five endpoints
MUST be mounted under `requireActiveProfile` and MUST reject a
request for a fund id belonging to another profile with `404`,
identically to a non-existent fund.

#### Scenario: Creating a fund

- WHEN a client sends `POST /api/funds` with `name: "Fondo de ahorro"`
- THEN the response includes a new fund id, `name: "Fondo de ahorro"`, `archived: false`, and `balance: 0`

#### Scenario: Recording a deposit via the API

- GIVEN a fund exists with balance 0
- WHEN a client sends `POST /api/funds/:id/deposits` with `amount: 100, date: "2026-03-10"`
- THEN the fund's balance becomes 100 and the movement is stored with `month_key: "2026-03"`

#### Scenario: Referencing a fund from another profile returns 404

- GIVEN fund `fund_x` belongs to a profile other than the active one
- WHEN a client sends `POST /api/funds/fund_x/deposits`
- THEN the server responds `404`, indistinguishable from a non-existent fund

### Requirement: Month Totals Include Fund Movement Terms

`GET /api/months/:monthKey` MUST include this month's total deposits
and total withdrawals (scoped by the active profile and this
month's `month_key`, derived the same way every other transaction is
month-keyed: from each movement's own `date` via
`monthKeyFromDate()`/`startOfDayInTz()`, never a client-trusted
month) and MUST compute `totals.totalAvailable` as
`income.amount - totalSpent - totalDeposits + totalWithdrawals`. A
deposit reduces `totalAvailable` by its amount; a withdrawal
increases it by its amount, in the month the movement is dated, not
the month currently displayed in the client UI.
(Previously: `totals.totalAvailable` was `income.amount -
totalSpent`, with no fund-movement terms.)

#### Scenario: A deposit reduces this month's available total

- GIVEN a month has `income.amount: 1000` and `totalSpent: 200`, with no fund movements
- WHEN a deposit of 150 dated within that month is recorded
- THEN `totals.totalAvailable` for that month becomes 650 (1000 - 200 - 150 + 0)

#### Scenario: A withdrawal increases this month's available total

- GIVEN a month has `income.amount: 1000` and `totalSpent: 200`, with no fund movements
- WHEN a withdrawal of 150 dated within that month is recorded
- THEN `totals.totalAvailable` for that month becomes 950 (1000 - 200 - 0 + 150)

#### Scenario: A movement dated in a different month does not affect the viewed month

- GIVEN the client UI is currently displaying month `2026-08`
- WHEN a client records a deposit dated `2026-05-15`
- THEN `GET /api/months/2026-05` reflects the deposit in its `totalAvailable`
- AND `GET /api/months/2026-08` is unaffected by it
