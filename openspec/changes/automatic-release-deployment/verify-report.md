```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:05f94b3306b836880e7345366435797011f921b451066a027ae84062a9a9ebf2
verdict: fail
blockers: 6
critical_findings: 6
requirements: 1/8
scenarios: 3/9
test_command: "env -u DATABASE_URL -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH npm test"
test_exit_code: 0
test_output_hash: sha256:c656c7bccf284077a1aa03dc671ec057c028b71800be28f0391a98af0da957a4
build_command: "env -u DATABASE_URL npm run build"
build_exit_code: 0
build_output_hash: sha256:dabd8742fa49ca919d62526ba72b122b1ca4d9a0041cc4ddd8b7806bd3766400
```

## Verification Report

**Change**: automatic-release-deployment
**Mode**: Strict TDD
**Artifact mode**: Hybrid (OpenSpec + Engram)
**Verdict**: **FAIL**

### Authorization and Scope

- Read the revised proposal, both delta specs, design, tasks, apply progress, and prior verification report from OpenSpec and Engram.
- Native `sdd-status` reports 7/7 tasks complete, but projects `nextRecommended: resolve-review` because the bounded review transaction and its policy/ledger preimages are absent.
- The supplied active final-verification token was authenticated with `sdd-attempt acquire --token`; it returned `proceed` without acquiring a new attempt.
- No production host, credential, production database, backup import, history rewrite, commit, or PR was accessed. The only runtime environment was a fresh local Unix-socket Docker Compose project, which was removed with its volume.
- Remote GitHub Release, Tailscale ACL/SSH, production Caddy HTTPS, public-history, and credential-rotation rehearsal were unavailable by authorization and were not attempted.

### Artifact Retrieval

| Artifact | OpenSpec | Engram | Result |
|---|---|---|---|
| Proposal | `proposal.md` | `sdd/automatic-release-deployment/proposal` | Read; content agrees |
| Specs | Two delta spec files | `sdd/automatic-release-deployment/spec` | Read; the Engram artifact contains both specs |
| Design | `design.md` | `sdd/automatic-release-deployment/design` | Read; content agrees |
| Tasks | `tasks.md` | current tasks artifact | Read; wording differs on whether prior work is “requiring correction” or already corrected |
| Apply progress | `apply-progress.md` | `sdd/automatic-release-deployment/apply-progress` | Read; current claims were rerun below |
| Prior report | `verify-report.md` | `sdd/automatic-release-deployment/verify-report` | Read; it is superseded by this evidence |

### Completeness

| Metric | Value |
|---|---:|
| Tasks total | 7 |
| Tasks complete | 7 |
| Tasks incomplete | 0 |
| Spec requirements | 8 |
| Spec scenarios | 9 |
| Runtime-compliant scenarios | 3 |
| Fully proven requirements | 1 |

All task checkboxes are complete. Completion does not make the change admissible: six required scenario areas remain incomplete at runtime and the native review-state projection is blocked.

### Canonical Verification Evidence

`evidence_revision` is the SHA-256 of the exact text block below, including its trailing newline.

```text
candidate_identity=sha256:e1199362ba6b6cc54c895756237be353fc2e51d0bb8950b9c144ec5b9376f7d4
candidate_tree=7822b76e562ae5e53e69514153e4a849e8e10826
test_command=env -u DATABASE_URL -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH npm test
test_exit_code=0
test_output_hash=sha256:c656c7bccf284077a1aa03dc671ec057c028b71800be28f0391a98af0da957a4
build_command=env -u DATABASE_URL npm run build
build_exit_code=0
build_output_hash=sha256:dabd8742fa49ca919d62526ba72b122b1ca4d9a0041cc4ddd8b7806bd3766400
focused_deploy_test_exit_code=0
focused_deploy_test_output_hash=sha256:443dd961e52760bd89e5919ae2a8ea26bce30e2486c668acf86d27b91c9a6d12
shell_syntax_exit_code=0
compose_config_exit_code=0
diff_check_exit_code=0
offline_bundle_members=35
offline_bundle_sha256=38aa74865ac5772e79f3691df6399bb55e01dc91a847471be30fa41aabe1cf44
compose_health_exit_code=0
compose_health_output_hash=sha256:839a2081e84c941db13870a3dc4fade70098054247c933892063e300f70ed8fa
remote_rehearsal=unavailable_by_authorization
status_preflight=resolve-review: bounded review transaction missing
attempt_authentication=proceed: existing token reused
```

### Build and Test Execution

**Tests**: ✅ Passed — 12 files, 59 tests, exit 0.

```text
env -u DATABASE_URL -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH npm test
Test Files  12 passed (12)
Tests  59 passed (59)
test_output_hash: sha256:c656c7bccf284077a1aa03dc671ec057c028b71800be28f0391a98af0da957a4
```

The green run emitted four transient PostgreSQL connection-acquisition diagnostics during startup, but Vitest exited 0.

**Focused host deployment test**: ✅ Passed — `npm test -- tests/deploy/release-deploy.test.js`, 1 file, 5 tests, exit 0; output hash `sha256:443dd961e52760bd89e5919ae2a8ea26bce30e2486c668acf86d27b91c9a6d12`.

**Build**: ✅ Passed, exit 0.

```text
env -u DATABASE_URL npm run build
vite v5.4.21: 9 modules transformed; built in 134ms
build_output_hash: sha256:dabd8742fa49ca919d62526ba72b122b1ca4d9a0041cc4ddd8b7806bd3766400
```

**Coverage**: ➖ Not available. `npm ls @vitest/coverage-v8 --depth=0` found no installed coverage provider.

### Local Verification Commands

| Check | Result | Exact evidence |
|---|---|---|
| Shell syntax | ✅ | `bash -n deploy/install-host.sh deploy/release-deploy.sh docker-entrypoint.sh` → exit 0 |
| Compose configuration | ✅ | `env -u DATABASE_URL -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker compose config --quiet` → exit 0; resolved services: `postgres`, `app` |
| Diff integrity | ✅ | `git diff --check && git diff --cached --check` → exit 0 |
| Offline exact bundle | ✅ | Workflow member selection created a 35-member tarball; `sha256sum -c` passed; SHA-256 `38aa74865ac5772e79f3691df6399bb55e01dc91a847471be30fa41aabe1cf44`; every member passed the host whitelist before extraction |
| Pre-extraction rejection | ✅ | Focused temporary-host test rejected `README.md` and confirmed it was absent from the release directory |
| Disposable Compose health | ✅ | Local Unix Docker endpoint only; fresh `app` and `postgres` became healthy; `GET 127.0.0.1:18081/api/health` returned `{"status":"ok","db":"ok"}`; `knex_migrations` exists; project containers and volume were removed |
| Secret/recovery scan | ✅ static | No private-key, GitHub PAT, or AWS access-key signatures found. `misahorros-recover-db` and `RECOVERY_COMPATIBILITY_ACK` appear only in SDD prose asserting their absence. `pg_restore` is limited to bootstrap restore and backup-list validation; rollback test asserts no restore command. `gitleaks` is not installed. |
| Private ports/Caddy | ✅ static | Compose publishes only `127.0.0.1:${APP_PORT:-8080}:3000`; PostgreSQL has no host port; Caddy proxies `127.0.0.1:8080` |
| Candidate budget | ⚠️ | Native prior evidence reports 1,590/1,600 and this active attempt changed 0 lines. Current tracked `git diff --numstat` is 526 additions plus 487 deletions (1,013). Apply progress says 1,587, so the native line-audit preimage must be reconciled before release settlement. |

### Spec Compliance Matrix

| Requirement | Scenario | Passing runtime evidence | Result |
|---|---|---|---|
| Exact Trigger and Bundle | Published tag | Exact-tag checkout, manifest, member list, and host whitelist were inspected and rehearsed offline; no GitHub `release.published` execution reached a host | ⚠️ PARTIAL |
| Tailscale and Secret Policy | Unauthorized connection | No ACL/SSH deny evaluation was authorized | ❌ UNTESTED |
| Host Serialization | Concurrent deployment | Source uses `flock`, but no two-launcher contention test ran | ❌ UNTESTED |
| Preventive Backups and One-Time Initial Restore | First versus later volume | Temporary host test rejects a non-empty volume, restores a valid checksum once, records a marker, and exercises backup records; it does not execute a later release/bootstrap to prove no re-import and preservation | ⚠️ PARTIAL |
| Migrations, Health Gates, and Application Rollback | Failed health gate | Temporary host test makes a health command fail, stops the failed stack, restarts the prior release, records rollback, and asserts no `pg_restore` | ✅ COMPLIANT |
| Security Boundaries, Records, and Operations Documentation | Boundary and documentation audit | Local source, bundle, record, port, and documentation checks pass; public HTTPS, history remediation, and credential rotation were not authorized | ⚠️ PARTIAL |
| Two-Service Topology | Stack and boundary | Disposable Compose proved exactly `app` and `postgres`, durable local volume, migrations, and a localhost-only app port; production Caddy HTTPS was not exercised | ⚠️ PARTIAL |
| Automatic Migrations on Startup | Fresh volume | Fresh disposable Compose volume produced `knex_migrations` before a healthy API response | ✅ COMPLIANT |
| Automatic Migrations on Startup | Failed release rollback | Temporary-host failed-health path restarted the prior application and issued no database restore | ✅ COMPLIANT |

**Compliance summary**: 3/9 scenarios are runtime-compliant. Only 1/8 requirements is completely proven.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Exact trigger and immutable bundle | ⚠️ Partial | Workflow is restricted to `release.published`, checks out `github.event.release.tag_name`, emits a manifest, and the launcher validates archive paths before extraction; GitHub-to-host execution is unproven. |
| Tailscale and secret policy | ⚠️ Partial | `contents: read`, `production`, Tailscale action credentials, `tag:ci`, `ubuntu`, root `0600` production env, and `ubuntu` `0700` staging/backups are present in source; real ACL/environment/host ownership were not inspected. |
| Host serialization | ⚠️ Partial | Safe tag validation, replay refusal, atomic records, and `flock` are implemented; contention has no behavioral evidence. |
| Backup and first restore | ⚠️ Partial | `pg_isready`, compressed custom `pg_dump`, `pg_restore --list`, checksum marker, empty-volume query, and success-only pruning are implemented; the later-volume behavior lacks a direct test. |
| Migrations, health, rollback | ✅ Local behavior | Release script migrates before app startup and gates Compose/local/public health; the host test proves failed-health application rollback without database restore. Public health remains unexercised. |
| Security boundary, records, and docs | ⚠️ Partial | Caddy/private-port source, redacted records, bootstrap, backup, application-only rollback, and escalation documentation are present; remote exposure remediation is unverified. |
| Two-service topology | ⚠️ Partial | Resolved Compose has exactly two services and a named `pgdata` volume; host Caddy validation is unavailable. |
| Startup migrations | ✅ Local behavior | Entrypoint uses `set -e`, runs Knex migration, and the disposable fresh-volume run reached a healthy API only after `knex_migrations` existed. |

### Design Coherence

| Design decision | Followed? | Notes |
|---|---|---|
| Immutable delivery | ✅ Source and offline rehearsal | Exact tag, checksum manifest, and pre-extraction whitelist are present. |
| Privileged host boundary | ✅ Source and host test | Host policy remains in `misahorros-deploy`; staging is configurable for test roots while production defaults are Ubuntu/root-owned. |
| Database safety | ✅ Source, ⚠️ incomplete runtime proof | Backup verification and bootstrap-only restore are implemented; no later-volume behavior test exists. |
| Application-only failure handling | ✅ Source and host test | Failed stack is brought down, saved production env is restored, prior release restarts, and test asserts no database restore. |
| Test strategy | ⚠️ Partial | Temporary-host and disposable Compose layers exist, but the required remote security layer and local concurrency/re-import cases are absent. |
| Review workload guard | ⚠️ Evidence mismatch | Current native and apply-progress totals differ by three lines, although both are below 1,600. |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD evidence reported | ✅ | `apply-progress.md` contains the required TDD Cycle Evidence table. |
| All tasks have executable test mapping | ⚠️ | Six of seven task areas point to live test files; the budget audit row is non-executable and evidence is grouped rather than one row per task. |
| RED confirmed (tests exist) | ✅ | `tests/deploy/release-deploy.test.js` and `tests/contract/global-setup.test.js` exist. |
| GREEN confirmed (tests pass) | ✅ | Focused deployment test passed 5/5; full suite passed 59/59. |
| Triangulation adequate | ⚠️ | Host cases cover unsafe archive, empty/non-empty bootstrap, success, and failed health, but not concurrency or later-volume non-reimport. |
| Safety net for modified files | ⚠️ | Historical safety-net ratios are reported, but grouped evidence cannot be matched precisely to all seven task checkboxes. |

**TDD Compliance**: 3/6 checks fully confirmed; the remaining three have bounded evidence gaps. Strict TDD was not downgraded.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|---|---:|---:|---|
| Unit | 1 | 1 | Vitest (`hasStableConnection`) |
| Process integration | 5 | 1 | Vitest plus temporary host tools and tar subprocesses |
| E2E | 0 | 0 | Not installed / not authorized |
| **Total change-specific tests** | **6** | **2** | |

### Changed File Coverage

Coverage analysis skipped — no Vitest coverage provider is installed. This is informational, not a pass/fail substitute for runtime scenarios.

### Assertion Quality

| File | Line | Assertion | Issue | Severity |
|---|---:|---|---|---|
| `tests/deploy/release-deploy.test.js` | 47-50 | staging directory exists | The test title claims configured identity but does not assert owner or mode. | WARNING |
| `tests/deploy/release-deploy.test.js` | 61-74 | one successful bootstrap marker | It does not invoke bootstrap a second time to prove no re-import. | WARNING |
| `tests/deploy/release-deploy.test.js` | 76-87 | successful backup record | It creates eight candidate backups but does not assert the retained count is exactly seven. | WARNING |

**Assertion quality**: 0 CRITICAL, 3 WARNING. No tautologies, ghost loops, source-text-only checks, or mock-heavy tests were found in the changed deployment test.

### Quality Metrics

**Linter**: ➖ Not configured
**Type Checker**: ➖ Not configured
**Coverage provider**: ➖ Not installed

### Issues Found

**CRITICAL**:
1. Native status remains `resolve-review`: the bounded review transaction and policy/ledger preimages required for final admission are absent, so archive/settlement cannot be treated as authorized final completion.
2. The Published Tag scenario has no authorized GitHub Release-to-host runtime test; offline archive rehearsal cannot prove event delivery or host transfer.
3. The Unauthorized Connection scenario has no Tailscale ACL/SSH deny runtime evidence.
4. The Concurrent Deployment scenario has no two-launcher contention test proving `flock` serialization and non-interleaved records.
5. The First versus Later Volume scenario lacks a passing later-run assertion proving the marker blocks re-import and preserves existing data.
6. Public Caddy HTTPS, external boundary behavior, public-history remediation, and credential rotation remain untested; local static and disposable checks cannot complete their required scenarios.

**WARNING**:
1. OpenSpec and Engram task wording diverges, and apply progress reports 1,587 lines while the native predecessor evidence reports 1,590.
2. The passing full suite emits four transient PostgreSQL connection-acquisition diagnostics, making runtime output noisy.
3. Three deployment assertions are weaker than their test names: ownership/mode, later bootstrap refusal, and exact retained-backup count are not asserted.
4. `actions/checkout@v4` and `tailscale/github-action@v4` are mutable major tags rather than immutable action revisions.

**SUGGESTION**:
1. Resolve the native review-state artifact gap, then run the separately authorized protected-release checklist for the actual tag, ACL deny path, production Caddy HTTPS, history remediation, and credential rotation.
2. Add temporary-host tests that run two launchers concurrently and execute a second bootstrap/later release while asserting no restore and exactly seven retained backups.
3. Pin GitHub Actions by commit SHA and add a coverage provider after the required runtime scenarios are covered.

### Verdict

**FAIL**

Local implementation evidence is materially stronger than the prior report: full tests, build, shell syntax, Compose configuration, exact offline bundle, host failure rollback, and disposable health all pass. It still cannot meet final SDD admission because only 3/9 required scenarios have complete passing runtime coverage and native review authority is missing.
