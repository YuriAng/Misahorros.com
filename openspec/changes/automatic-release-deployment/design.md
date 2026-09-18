# Design: Automatic Release Deployment

## Technical Approach

For `release.published`, Actions checks out only `github.event.release.tag_name`, builds a checksum-verifiable bundle, and sends it through Tailscale SSH. The root-owned host launcher serializes deployment, verifies a preventive backup, invokes the bundle-local Compose/migration/health sequence, and promotes only after all gates pass. A failed release restores the prior application/configuration only; PostgreSQL is never restored automatically or through a command in this change.

## Architecture Decisions

| Decision | Alternatives / trade-off | Choice and rationale |
|---|---|---|
| Immutable delivery | Branch deployment risks ref drift. | Exact tag plus manifest SHA-256; per-tag GitHub concurrency and host `flock` prevent duplicate/interleaved mutations. |
| Privileged boundary | Letting a bundle own host policy increases privilege and drift. | `/usr/local/sbin/misahorros-deploy` validates, records, snapshots, backs up, extracts, and promotes; `releases/<tag>/deploy/release-deploy.sh` only runs release-local Compose steps. No `misahorros-recover-db` is installed. |
| Database safety | Automated restore can apply an incompatible backup or hide migration damage. | Require healthy PostgreSQL, `pg_dump --format=custom --compress=9`, SHA-256, and `pg_restore --list` before mutation; retain seven successful-deploy backups. The bootstrap helper alone restores the supplied initial dump once and writes its checksum/timestamp marker. |
| Failure handling | Database rollback is unsafe after a migration. | Preserve evidence and atomically restore the saved `production.env` and prior `current` target, then restart prior Compose. Operations documentation states escalation is manual and outside this change. |

## Data Flow

```text
published tag -> exact checkout + manifest -> tag:ci SSH -> staging
 -> launcher + flock -> config snapshot + verified pg_dump -> release script
 -> migrate -> Compose/local/public health -> current + evidence
                                      Caddy HTTPS -> 127.0.0.1:8080
```

`/opt/misahorros.com/{releases,staging,backups,state/{deployments,config},evidence,bootstrap,shared}` remains the host layout. `backups` is `ubuntu:ubuntu 0700`; `shared/production.env` is `root:root 0600`. Tailscale permits only `tag:ci` to `tag:server` as `ubuntu`; Caddy is the sole public endpoint.

## File Changes

| File | Action | Description |
|---|---|---|
| `.github/workflows/release-deploy.yml` | Create | Exact event/tag, manifest, `production`, Tailscale, non-cancelling concurrency. |
| `deploy/release-deploy.sh` | Create | Whitelist archive paths; migrate, health-gate, and promote a release. |
| `deploy/install-host.sh` | Modify | Install launcher/bootstrap, backup/marker/config rollback contracts; remove recovery-command and acknowledgement code. |
| `deploy/Caddyfile`, `deploy/OPERATIONS.md` | Create/Modify | HTTPS boundary; bootstrap, backup, application rollback, and escalation-only documentation. |
| `docker-compose.yml`, `.gitignore` | Modify | Localhost app binding and ignored backup material. |
| `backups/budgetpwa-2026-09-01.sql` | Delete | Remove tracked sensitive dump. |
| `tests/deploy/release-deploy.test.js` | Modify | Contract tests, including recovery-feature absence. |

## Interfaces / Contracts

`misahorros-deploy deploy <tag> <bundle> <manifest>` accepts only safe tags. Under `flock`, it writes `state/deployments/<tag>.json` via temporary file and rename. The record includes tag, manifest hash, attempt ID, prior release/configuration, backup ID/hash, status, health, UTC timestamps/durations, and redacted failure/rollback reason. Same-tag/same-hash success is a no-op; different hash, in-progress, failed, or rolled-back records refuse non-zero. No record, launcher path, workflow path, or release-local failure path invokes `pg_restore`; only `misahorros-host-bootstrap <dump> <sha256>` may do so before releases on an empty volume and atomically write `bootstrap/restore-complete.json`.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Process/unit | Exact tag/hash, lock/replay, atomic records, backup verification/retention, initial marker, config/application rollback, and redaction. | Vitest temporary-layout command stubs; assert no recovery command, acknowledgement variable, or failed-release `pg_restore`. |
| Integration | Durable volume, migration-before-traffic, Compose/local `/api/health`, Caddy/public HTTPS, and private ports. | Disposable Compose/PostgreSQL rehearsal. |
| Manual security | Tailscale ACL, GitHub environment, dump-history remediation, credential rotation. | Protected rehearsal-tag checklist. |

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior and RED test |
|---|---|---|
| Documentation-like paths | Applicable: archive members precede shell execution. | Whitelist only runtime paths; reject `requirements.txt`, `CMakeLists.txt`, executable Markdown/MDX, `README.sh`, and unexpected files before extraction; one fixture per class. |
| Git repository selection | N/A: launcher never invokes Git. | — |
| Commit state | N/A: no commits or index mutation. | — |
| Push state | N/A: no pushes. | — |
| PR commands | N/A: no PR automation. | — |

## Migration / Rollout

Single PR, approved `size:exception`: **900–1,180 authored lines** (correction tests, whitelist/workflow alignment, recovery-scope cleanup, and full verification), within the approved 1,600-authored-line absolute budget. Bootstrap host prerequisites, restore the initial dump once, remediate history/credentials, then enable protected releases. No database recovery rollout is included.

## Open Questions

None.
