# Savings Funds Specification

## Purpose

Fund entity, deposit/withdrawal movements, derived balance, profile
isolation, and archive semantics for savings/investment funds held
outside the monthly budget.

## Requirements

### Requirement: Fund Entity

A `funds` record MUST have a unique id, a `profile_id`, a display
`name`, and an `archived` flag (default `false`), plus a
`created_at` timestamp. Each profile MAY own multiple funds. A fund
has no identity-bearing field beyond these; it carries no balance
column.

#### Scenario: Creating a fund

- GIVEN no fund named "Fondo de ahorro" exists under the active profile
- WHEN a client creates a fund with `name: "Fondo de ahorro"`
- THEN the response includes a new fund id, the given name, and `archived: false`

#### Scenario: Multiple funds coexist per profile

- GIVEN a profile already owns a fund named "Fondo de ahorro"
- WHEN the same profile creates a second fund named "Fondo de inversión"
- THEN both funds are listed for that profile independently

### Requirement: Fund Movements

A `fund_movements` record MUST reference exactly one fund, belong to
exactly one profile, carry a movement `type` of either `deposit` or
`withdrawal`, a positive `amount`, and a `date` used to derive its
`month_key`. Every movement MUST belong to the same `profile_id` as
the fund it references.

#### Scenario: Recording a deposit

- GIVEN a fund "Fondo de ahorro" exists with no prior movements
- WHEN a client records a `deposit` of amount 100 dated `2026-03-10`
- THEN the movement is stored with `month_key: "2026-03"` and `type: "deposit"`

#### Scenario: Recording a withdrawal

- GIVEN a fund "Fondo de ahorro" has a deposit of 100
- WHEN a client records a `withdrawal` of amount 40 dated `2026-03-15`
- THEN the movement is stored with `month_key: "2026-03"` and `type: "withdrawal"`

### Requirement: Derived Fund Balance

A fund's balance MUST be computed at read time as the all-time sum of
its `deposit` movements minus the all-time sum of its `withdrawal`
movements. The balance MUST NOT be persisted as a stored column, MUST
NOT reset at any month boundary, and MUST NOT be copied forward
between months, consistent with the Derived-Balance Invariant in
`budget-persistence`.

#### Scenario: Balance reflects all-time movements

- GIVEN a fund has deposits totaling 300 and withdrawals totaling 120 across several months
- WHEN the fund's balance is read
- THEN the balance equals 180
- AND this value exists only as a query result, never as a stored column

#### Scenario: Balance is unaffected by month rollover

- GIVEN a fund has a balance of 180 at the end of `2026-03`
- WHEN a new month `2026-04` is viewed or materialized
- THEN the fund's balance is still computed as 180 from the same movement history, with nothing copied or reset

### Requirement: Profile Isolation For Funds

Every fund and fund movement MUST belong to exactly one profile. Reads
and aggregates under one active profile MUST NOT include, sum, or
expose funds or movements belonging to any other profile. A
cross-profile fund or movement reference MUST be rejected at the
database level, not only by application logic.

#### Scenario: Fund isolation

- GIVEN a fund "Fondo de ahorro" is created while profile A is active
- WHEN profile B becomes active and a client lists funds
- THEN "Fondo de ahorro" does not appear in the response

#### Scenario: Cross-profile fund reference is rejected

- GIVEN a fund `fund_x` belongs to profile B, and profile A is active
- WHEN a client attempts to record a movement against `fund_x` while scoped to profile A
- THEN the write is rejected by a database constraint, not only by an application check

### Requirement: Archiving a Fund With a Nonzero Balance

Archiving a fund MUST NOT allow a nonzero balance to silently
disappear from view. A fund whose derived balance is nonzero MUST
remain discoverable (directly or through an explicit guard) after an
archive attempt, so money it holds is never rendered invisible or
unaccounted for. The exact guard mechanism (for example, blocking the
archive, or allowing it while keeping balance and history visible) is
an open design decision deferred to `sdd-design`.

#### Scenario: Archiving a fund with zero balance succeeds

- GIVEN a fund has equal total deposits and withdrawals, a balance of 0
- WHEN a client archives the fund
- THEN the fund's `archived` flag becomes `true`

#### Scenario: A fund holding money cannot silently disappear

- GIVEN a fund has a nonzero derived balance
- WHEN a client attempts to archive it
- THEN the system either rejects the archive attempt or keeps the fund's balance and movement history visible after archiving
- AND no outcome results in the fund's money becoming unaccounted for or impossible to find
