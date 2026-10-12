# Delta for Budget Profiles

## MODIFIED Requirements

### Requirement: Full Data Isolation Across Profiles

Every category, month/income record, category budget, transaction,
fund, and fund movement MUST belong to exactly one profile. Reads and
aggregates under one active profile MUST NOT include, sum, or expose
records belonging to any other profile.
(Previously: did not include funds or fund movements.)

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

#### Scenario: Fund and fund-movement isolation

- GIVEN profile A owns a fund "Fondo de ahorro" with recorded deposits and withdrawals
- WHEN profile B becomes active and a client sends `GET /api/funds`
- THEN "Fondo de ahorro" and its movements do not appear, and profile B's own month totals include none of profile A's deposit/withdrawal amounts

#### Scenario: Cross-profile fund reference is rejected

- GIVEN fund `fund_x` belongs to profile B, and profile A is active
- WHEN a client sends `POST /api/funds/fund_x/deposits`
- THEN the server responds `404`, identically to a non-existent fund
