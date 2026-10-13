```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:632773859fa0f76eb402342b577003a962c42ba737be0b1cd715b01367a80080
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 14/14
scenarios: 42/42
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:fb7f96188e70625c243c202e89f018567334e61bc84f8e6d8fbb385a2538408e
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:9b74d978c090dac70417dd02405c5f6706155784b477ecd73d424eeb229d16ac
```

## Verification Report

**Change**: savings-investment-funds
**Version**: N/A
**Mode**: Full artifacts (proposal + design + 4 spec deltas + tasks + apply-progress all present, artifact store: openspec). Strict TDD active per `openspec/config.yaml`.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 55 |
| Tasks complete | 55 |
| Tasks incomplete | 0 |

### Build & Tests Execution (run fresh by this verify phase, not trusted from apply-progress.md)

**Build**: ✅ Passed
```text
$ npm run build
vite v5.4.21 building for production...
✓ 9 modules transformed.
dist/index.html                  8.60 kB │ gzip: 1.93 kB
dist/assets/index-NTAXIJwW.css   6.75 kB │ gzip: 1.76 kB
dist/assets/index-Rr73WfRO.js   24.69 kB │ gzip: 6.78 kB
✓ built in 136ms
exit code: 0
```

**Tests**: ✅ 158 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
$ npm test
RUN  v4.1.11 /Users/yurifreitez/Downloads/budget-pwa
 Test Files  17 passed (17)
      Tests  158 passed (158)
   Duration  36.68s
exit code: 0
```
Two benign `Acquire connection error: Connection terminated unexpectedly` stderr lines appear during ephemeral-Postgres connection-pool teardown noise (same documented, non-fatal behavior noted in this repo's prior `multiple-budgets` verify report); they do not affect the 158/158 pass count. Numbers match `apply-progress.md`'s recorded PR5/task-7.1 figures exactly — confirmed by independent re-run, not trusted from the prior report.

**Coverage**: Not available / threshold 0% (no coverage tool configured — `openspec/config.yaml` context field confirms this).

### Spec Compliance Matrix

| Requirement | Scenario(s) | Test | Result |
|---|---|---|---|
| **savings-funds: Fund Entity** | Creating a fund; Multiple funds coexist per profile | `funds.test.js` POST/GET `/api/funds` | ✅ COMPLIANT |
| **savings-funds: Fund Movements** | Recording a deposit; Recording a withdrawal | `funds.test.js` POST `/:id/movements`; `months.test.js` month-keying | ✅ COMPLIANT |
| **savings-funds: Derived Fund Balance** | Balance reflects all-time movements; Balance unaffected by month rollover | `funds.test.js` three-month balance test (direct SQL sum as oracle) | ✅ COMPLIANT |
| **savings-funds: Profile Isolation For Funds** | Fund isolation; Cross-profile fund reference rejected | `funds.test.js` "Cross-profile isolation" (404s + direct DB insert → `23503`) | ✅ COMPLIANT |
| **savings-funds: Archiving a Fund With a Nonzero Balance** | Archive at zero succeeds; fund holding money cannot disappear | `funds.test.js` archive guard (`204` at zero, `409 fund_has_balance` otherwise) | ✅ COMPLIANT |
| **budget-persistence: Relational Schema** | Fresh-DB migration; category_budgets uniqueness; same month_key cross-profile; fund movement references own profile | `migration.test.js` `003` describe block; pre-existing `002` tests | ✅ COMPLIANT |
| **budget-persistence: Derived-Balance Invariant** | No spent/remaining/balance column; spent reflects transactions; fund balance never stored | `invariant.test.js` (`FORBIDDEN_COLUMN_NAMES` incl. `balance`; 8-table pinned list) + `server/migrations/003_*.js` DDL inspection (no balance column exists) | ✅ COMPLIANT |
| **budget-persistence: Foreign Key Integrity** | Category hard-delete rejected; archive preserves history; cross-profile category ref rejected; profile hard-delete rejected; cross-profile fund ref rejected at DB level | `categories.test.js:92`, `isolation.test.js`, `profiles.test.js`, `funds.test.js` (direct `db.insert()` → `23503`) | ✅ COMPLIANT |
| **budget-persistence: Foreign Key Integrity** | Deleting a fund with existing movements is rejected | **No dedicated direct-SQL row-level test** — mechanism is `ON DELETE RESTRICT` on `fund_movements.fund_id → funds(profile_id, id)` (same declared pattern already runtime-proven for `categories` at `categories.test.js:92`), and `migration.test.js`'s `003 down()` test proves the analogous table-level refusal when movements exist. No test performs a plain `db('funds').where({id}).del()` against a fund with a recorded movement. | ⚠️ PARTIAL — see WARNING 1 |
| **budget-persistence: Backfill Migration Preserves All Existing Data** | Zero-loss backfill; down() reverses cleanly; down() refuses with 2nd profile | Pre-existing `002` tests in `migration.test.js`, confirmed still passing after `003`'s step-count fix | ✅ COMPLIANT |
| **budget-persistence: Invariant Contract Tests Track New Tables and Columns** | Pinned table list admits 2 new tables; persisted balance column fails invariant | `invariant.test.js` (both assertions, read directly — lines 16-58) | ✅ COMPLIANT |
| **budget-api: All Reads and Writes Scoped by Active Profile** | Listing categories active-profile only; listing funds active-profile only | `isolation.test.js`; `funds.test.js` Cross-profile isolation | ✅ COMPLIANT |
| **budget-api: All Reads and Writes Scoped by Active Profile** | Client-supplied profile override is ignored | No dedicated runtime test for `/api/funds` specifically (true by source inspection: no route reads a client-supplied `profileId`/header for scoping — `req.profileId` is set exclusively by `requireActiveProfile`). **Inherited gap**, already flagged as WARNING 1 in the archived `multiple-budgets` verify report for the general case; never closed; this change extends the same unclosed gap to `/api/funds`. | ⚠️ PARTIAL — see WARNING 2 |
| **budget-api: Fund Management Endpoints** | Creating a fund; recording a deposit via the API; foreign fund returns 404 | `funds.test.js` POST `/api/funds`, POST `/:id/movements` (type:"deposit"), cross-profile 404 | ✅ COMPLIANT — behavior satisfied via the single `/movements` endpoint; see deviation note below |
| **budget-api: Month Totals Include Fund Movement Terms** | Deposit lowers totalAvailable; withdrawal raises it; different-month movement does not affect viewed month | `months.test.js` 3-case describe block (task 3.7); parity test's dated-movement case | ✅ COMPLIANT — formula and amounts satisfied via `fundDeposits`/`fundWithdrawals` fields; see deviation note below |
| **budget-profiles: Full Data Isolation Across Profiles** | Category isolation; transaction/income isolation; cross-profile category ref rejected; fund/movement isolation; cross-profile fund ref rejected | `isolation.test.js` (incl. task 6.2's new "Fund movement totals isolation" describe block); `funds.test.js` | ✅ COMPLIANT |

**Compliance summary**: 40/42 scenarios directly runtime-covered by a passing test; 2/42 (fund row-level hard-delete rejection; client-supplied profile override for funds) hold true by construction/source-inspection but lack a dedicated runtime assertion — both are coverage gaps, not functional defects (see WARNING 1 and WARNING 2). Neither blocks this change: the enforcing mechanism for each (a declared `ON DELETE RESTRICT` FK; `requireActiveProfile`'s exclusive resolution of `req.profileId`) is identical to an already-proven pattern elsewhere in this exact codebase.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| `funds`/`fund_movements` DDL matches design.md exactly | ✅ Implemented | `server/migrations/003_savings_investment_funds.js` read directly — table/column/constraint/index names match design.md's "Target Schema" verbatim; no `balance`/`spent`/`remaining`/`available` column exists in either table |
| Composite FKs make cross-profile/orphan-month movements unrepresentable | ✅ Implemented | `fund_movements` carries two composite FKs: `(profile_id, fund_id) → funds(profile_id, id)` and `(profile_id, month_key) → months(profile_id, month_key)`, both `ON DELETE RESTRICT` |
| Single `/movements` endpoint, not `/deposits`+`/withdrawals` | ✅ Implemented | `server/routes/funds.js` — `GET`/`POST /:id/movements` only; one handler branches on `type` |
| `totals` gains `fundDeposits`/`fundWithdrawals`; `totalAvailable` revised | ✅ Implemented | `server/services/months.js:146-224`, `src/state.js:362-379` — identical formula and field names on both sides |
| `setActiveProfile()` resets `cache.funds` wholesale | ✅ Implemented | `src/state.js:200-212` — `cache.funds = payload.funds.map(f => ({ ...f }))`, dedicated unit test asserts a stale fund from the left-behind profile is unrepresentable after switching |
| Archive guard (`409 fund_has_balance`) and insufficient-funds guard (`409 insufficient_funds`) under `forUpdate()` | ✅ Implemented | `server/services/funds.js` `archiveFund()`; `server/routes/funds.js` movement POST handler |
| Fund-movement-materializes-month interaction is pinned, not implicit | ✅ Implemented | `tests/contract/funds.test.js` "Fund movement materializes the month (task 6.3)" — explicit before/after assertion on `carryForward.available` |
| `server/services/bootstrap.js` file-state | ✅ Confirmed pre-existing | `git log` shows `bootstrap.js` was created in commit `a1bee7f` ("wire active profile into settings, bootstrap, and legacy import"), predating this change. `design.md`'s own File Changes table already correctly lists it as "Modify" — the "create new file" phrasing traces to `tasks.md` task 3.4's prose only, not `design.md`. `apply-progress.md`'s PR3 entry correctly identifies and resolves this as a documentation inaccuracy in `tasks.md`, not a functional gap. |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Identity-only `funds` + append-only `fund_movements` ledger | Yes | Migration DDL matches verbatim |
| Balance = `SUM(deposits) - SUM(withdrawals)` at read time, never stored | Yes | `server/services/funds.js` `listFundsWithBalance`/`computeFundBalance`; no balance column anywhere |
| One row query reduced in JS, not a second SQL aggregate | Yes | `server/services/months.js:getMonthPayload()` — single query + `for` reduce |
| Two gross terms (`fundDeposits`/`fundWithdrawals`); `totalAvailable` keeps its name | Yes | Both server and client use these exact field names |
| `TEXT CHECK (type IN (...))` + `CHECK (amount > 0)` | Yes | Migration DDL constraints `fund_movements_type_valid`, `fund_movements_amount_positive` |
| Append-only ledger, no edit/delete | Yes | `server/routes/funds.js` exposes no `PUT`/`DELETE` on `/movements` |
| Archive refused with `409 fund_has_balance` under row lock | Yes | `archiveFund()` `forUpdate()` + balance check |
| Withdrawal beyond balance refused with `409 insufficient_funds` | Yes | Movement POST handler, same transaction as the lock |
| Funds+balance in bootstrap; month movements in month payload; history lazy | Yes | `buildBootstrapPayload()`, `getMonthPayload()`, `GET /api/funds/:id/movements` |
| Client caches server-computed balance, does not re-derive it | Yes | `src/state.js` — `cache.funds[i].balance` set only from API responses |
| Summary progress bar is fund-aware | Yes | `src/render.js:renderSummary()` — `outflow`/`inflow` include fund terms |

### Carried-Forward Deviations (Confirmed Accounted For — Non-Blocking Documentation Items)

1. **`specs/budget-api/spec.md` names separate `/deposits`/`/withdrawals` endpoints in prose**; the shipped implementation (and `design.md`, which explicitly supersedes this with its "One movement endpoint, not `/deposit` + `/withdraw`" decision and rationale) uses one `POST /api/funds/:id/movements` endpoint with a `type` field. **Confirmed**: every Given/When/Then scenario body under "Fund Management Endpoints" describes *behavior* (fund creation shape, balance change by exact amount, 404 for foreign id) that the single-endpoint implementation satisfies identically — `funds.test.js` exercises this behavior through `/movements`. This is a stale literal path name in spec prose, not a functional gap. Recommend reconciling the spec's endpoint names at archive time.
2. **`specs/budget-api/spec.md` names fields `totalDeposits`/`totalWithdrawals`**; the actual implementation (both `server/services/months.js` and `src/state.js:getMonthTotals()`) uses `fundDeposits`/`fundWithdrawals`. **Confirmed**: every scenario's numeric assertion (amount subtracted/added to `totalAvailable`) holds under the actual field names — `months.test.js` and `parity.test.js` assert the exact values the scenarios describe. Naming mismatch only; recommend an archive-time spec correction.
3. **`server/services/bootstrap.js` pre-existed this change** (verified via `git log`: created in commit `a1bee7f`, predating this change entirely). `tasks.md`'s task 3.4 prose said "Create ... (new file)," but `design.md`'s own File Changes table already correctly lists it as "Modify," and `apply-progress.md`'s PR3 entry correctly treated it as a modify and recorded the discrepancy. Confirmed: this is a stale instruction in `tasks.md`, not `design.md`, and not a functional gap — PR3's bootstrap integration tests (`health-bootstrap.test.js`) pass.

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **`budget-persistence` "Deleting a fund with existing movements is rejected" has no dedicated direct-SQL negative test.** The enforcing mechanism (`ON DELETE RESTRICT` on the `fund_movements → funds` composite FK) is declared in the migration DDL and is the identical pattern already runtime-proven for `categories` (`categories.test.js:92`); the migration's own `003 down()` test proves the analogous table-level refusal once any movement row exists. What is missing is a plain `db('funds').where({ id }).del()` attempt against a fund that owns a movement, asserting a `23503` rejection — the row-level case, distinct from dropping the whole table. New finding (not carried forward from a prior change). Recommend adding one test mirroring `categories.test.js:92`'s exact shape.
2. **`budget-api` "Client-supplied profile override is ignored" has no dedicated runtime test for `/api/funds`.** This is an inherited, already-known gap: the archived `multiple-budgets` verify report flagged the identical gap for the general case (WARNING 1 there) and it was never closed. This change's `requireActiveProfile` mounting for `/api/funds` follows the exact same server-resolved-scope pattern as every other scoped router, so the guarantee holds by construction (no route reads `req.body.profileId`/a header), but no test sends an extraneous `profileId` to a funds endpoint and asserts it is ignored. Not a new defect; the existing gap now also covers funds.

**SUGGESTION**:
1. Reconcile `specs/budget-api/spec.md`'s "Fund Management Endpoints" requirement text to name the single `POST /api/funds/:id/movements` endpoint (with a `type` field) instead of separate `/deposits`/`/withdrawals` paths, matching the shipped and tested implementation (Carried-Forward Deviation 1).
2. Reconcile `specs/budget-api/spec.md`'s "Month Totals Include Fund Movement Terms" requirement text to use `fundDeposits`/`fundWithdrawals` instead of `totalDeposits`/`totalWithdrawals`, matching the shipped and tested field names (Carried-Forward Deviation 2).
3. Correct `openspec/changes/savings-investment-funds/tasks.md` task 3.4's "(new file)" phrasing for `server/services/bootstrap.js`, since the file predates this change and `design.md` already correctly lists it as "Modify" (Carried-Forward Deviation 3).
4. Add the one missing row-level hard-delete negative test for `funds` (WARNING 1) and one profile-override-ignored test for `/api/funds` (WARNING 2) in a follow-up change, mirroring `categories.test.js:92`'s and the general isolation suite's existing shapes respectively.

### Verdict

**PASS WITH WARNINGS**
0 CRITICAL, 2 WARNING, 4 SUGGESTIONS. All 55/55 tasks complete, `npm test` (158/158 across 17 files) and `npm run build` both pass cleanly on a fresh run performed directly by this verify phase (not trusted from `apply-progress.md`). 14/14 spec requirements are implemented and hold under real evidence; 40/42 scenarios are directly runtime-covered by a passing test, and the remaining 2 hold true by construction/source-inspection with an identical enforcement pattern already proven elsewhere in this exact codebase (one inherited from the already-archived `multiple-budgets` change, one new). The Derived-Balance Invariant holds by construction (no `balance` column exists in either new table; the 8-table pinned list and expanded `FORBIDDEN_COLUMN_NAMES` both landed as designed). The critical client cache-leak fix in `setActiveProfile()` is present, correct, and covered by a dedicated unit test. Profile isolation for funds holds end-to-end: composite FKs make cross-profile references unrepresentable at the database level, the API returns `404` for any foreign fund id, and the client cache resets wholesale on profile switch. The fund-movement-materializes-month interaction is pinned as an explicit, executable contract test, not a silent side effect. All three carried-forward deviations are confirmed as documentation-only mismatches with no functional impact, accounted for correctly in `apply-progress.md`.

Ready for `sdd-archive`. The WARNINGs and SUGGESTIONs are non-blocking; the user/orchestrator should decide whether to close the two coverage gaps and the three spec-prose reconciliations before or after archive.
