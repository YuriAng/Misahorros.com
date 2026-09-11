# Delta for Legacy Data Import

## ADDED Requirements

### Requirement: Import Targets the Default Profile

The legacy `budgetpwa_data_v1` import MUST create all categories,
months, budgets, and transactions under the default profile — id
`prof_default`, name "General" — regardless of which profile is
currently active in the client UI at import time. The import targets
that profile id unconditionally; it MUST NOT resolve the target from
the server-resolved active profile, and no `is_default` flag is
queried or required to locate it.

#### Scenario: Import while a different profile is active

- GIVEN profile "Negocio" is the currently active profile
- WHEN the legacy import endpoint is called
- THEN all imported records are created under the "General" default profile
- AND none of them appear when listing "Negocio"'s categories or transactions

#### Scenario: Idempotent import stays scoped to the default profile

- GIVEN the import already ran once, creating records under "General"
- WHEN it is run again with the same payload
- THEN duplicate-matching by client-generated id occurs within "General" only, and no records are created in any other profile
