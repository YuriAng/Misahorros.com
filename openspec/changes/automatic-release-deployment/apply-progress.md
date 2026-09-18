# Apply Progress: Automatic Release Deployment
## Status
Authorized remediation is complete under strict TDD. Host transfer staging, pre-extraction archive rejection, guarded bootstrap, success-only backup pruning, application rollback, durable records, and PostgreSQL readiness now have behavioral evidence; full-suite re-verification passes.
## Cumulative Completed Tasks
- [x] Prior tasks 1.1–5.1: lockfile repair, deployment contracts, workflow/launcher, Compose/Caddy boundaries, dump removal, and baseline operations documentation.
- [x] 1.2–2.2: runtime archive selection, whitelist alignment, and removal of deferred recovery automation.
- [x] 3.1: correct the PostgreSQL readiness race that caused the months contract socket hang-up and carry-forward 404; focused months and full Vitest pass.
- [x] 3.2: focused checks, offline bundle rehearsal, disposable health rehearsal, and budget audit.
- [x] Authorized remediation: verification findings 1–9, bootstrap documentation, test-total reconciliation, and exploration rollback-scope correction.
## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Prior 1.1–3.2 | `tests/deploy/release-deploy.test.js` | Process | ✅ 14/14 | ✅ Written | ✅ Passed | ✅ archive variants | ✅ Replaced source assertions |
| Remediation 1–6 | `tests/deploy/release-deploy.test.js` | Process integration | ✅ 14/14 | ✅ Written: 4 initial failures plus credentials-target RED | ✅ Passed: 5/5 | ✅ unsafe archive, empty/non-empty bootstrap, success/failure release | ✅ Compact disposable-root harness |
| Remediation 7–8 | `tests/deploy/release-deploy.test.js` | Process integration | ✅ 5/5 | ✅ Written | ✅ Passed: 5/5 | ✅ terminal success and rollback records | ✅ No source-text-only assertions |
| Remediation 9 | `git diff --numstat` plus untracked line audit | Process | N/A (artifact audit) | ✅ Written budget assertion | ✅ Passed: 1,587 | ➖ Single numeric boundary | ➖ None needed |
| 3.1 Months-contract readiness correction | `tests/contract/global-setup.test.js` | Process integration | ✅ months baseline: 9/9 | ✅ Written first: missing readiness policy failed (1/1) | ✅ Passed: 1/1 | ✅ one probe rejected; two consecutive probes accepted | ✅ Removed redundant setup comments; behavior unchanged |
## Work Unit Evidence
| Work unit | Focused test command and result | Runtime harness | Rollback boundary |
|---|---|---|---|
| Host safety remediation | `npm test -- tests/deploy/release-deploy.test.js` → exit 0, 1 file / 5 tests | Temporary host root executes installed bootstrap and launcher with fake Docker/Curl: rejects archive before extraction, rejects non-empty volume, records success, stops failed stack before rollback; exit 0 | Revert `deploy/install-host.sh`, `deploy/release-deploy.sh`, `deploy/OPERATIONS.md`, workflow, and deployment tests |
| Full local regression | Focused test → exit 0, 1 file / 5 tests; latest full `npm test` → exit 1, 10 files / 56 tests, two unrelated months-contract failures; build → exit 0 | `docker compose config --quiet` → exit 0; protected-release/ACL/public HTTPS N/A by authorization | Revert verification evidence only |
| Months-contract readiness correction | `npm test -- tests/contract/global-setup.test.js` → exit 0, 1 file / 1 test; `npm test -- tests/contract/months.test.js` → exit 0, 1 file / 9 tests | Real ephemeral PostgreSQL contract path executes income materialization and carry-forward: exit 0, 9/9; `npm test` → exit 0, 12 files / 59 tests | Revert only `tests/contract/global-setup.js` and `tests/contract/global-setup.test.js`; deployment behavior is untouched |
## Verification and Delivery
- `bash -n deploy/install-host.sh deploy/release-deploy.sh`, `docker compose config --quiet`, and `git diff --check` exited 0.
- No production host, secret, database, backup import, Git history, commit, or PR was accessed or changed.
- Mode: approved `size:exception`; the correction adds a compact readiness policy while removing redundant setup commentary; the user-authorized delivery remains within the 1,600-line absolute budget (verification report excluded as generated evidence).
