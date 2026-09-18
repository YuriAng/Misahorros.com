# Proposal: Automatic Release Deployment

## Intent

Deploy each published GitHub Release tag to the single production EC2 host safely, preserving PostgreSQL data through preventive backups and a documented operational baseline.

## Scope

### In Scope
- Release-published GitHub Actions deployment of the exact tag through Tailscale SSH.
- Serialized host-side Compose deployment with preventive verified `pg_dump` backups, migrations, health gates, and application rollback.
- Guarded one-time initial SQL-dump restore; remove/remediate the tracked dump; provide basic operations documentation.

### Out of Scope
- Zero-downtime, multi-host, or environment promotion deployment.
- Application authentication or database/schema redesign.
- Advanced or manual PostgreSQL recovery automation, including a recovery command, compatibility-acknowledgment workflow, and automated database restore after a failed release. This is follow-up work.

## Capabilities

### New Capabilities
- `release-deployment`: Release-triggered, secure, recoverable production deployment.

### Modified Capabilities
- `self-hosted-deployment`: Preserve durable-volume, migration, and localhost application-port requirements during automated releases.

## Approach

The workflow runs only for `release.published`, checks out and packages that exact tag, and sends a minimal immutable release bundle (application, Compose files, and versioned deploy script) to `/opt/misahorros.com/releases/<tag>`. A small host-owned launcher validates the tag, holds `flock`, switches the current release, and runs Compose; it contains no application bundle or GitHub credentials.

Before every deploy, create and verify a compressed `pg_dump` in `/opt/misahorros.com/backups`, owned by `ubuntu`, mode `0700`, retaining the last 7 successful-deploy backups. The launcher records previous known-good release/config and backup IDs. On failure, rollback restores only the prior application release; it never restores PostgreSQL automatically. Basic operations documentation identifies backups and escalation boundaries; advanced/manual database recovery automation is deferred.

On an empty volume only, restore the supplied dump before normal startup and atomically write a protected restore marker containing dump checksum and timestamp. Later releases refuse re-import. Remove the dump from the working tree and add an ignore rule; separately rewrite public Git history and rotate any exposed credentials before release.

GitHub uses a minimal `GITHUB_TOKEN` (contents read) plus an environment-scoped, short-lived Tailscale OAuth/auth secret authorized only to tag the hosted runner `tag:ci`; no long-lived SSH key is used. Tailscale SSH permits `tag:ci` to `tag:server` only as `ubuntu`. The host exposes Caddy HTTPS at `misahorros.guarotech.com`; app `8080` and PostgreSQL remain localhost/private Docker only. Secrets stay in GitHub/environment or root-owned host `.env` (`0600`), never bundles or logs.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `.github/workflows/` | New | Exact-tag release workflow and Tailscale connection |
| `deploy/`, `.gitignore` | New/Modified | Bundle, launcher contract, initial restore, backup policy, and operations guide |
| `backups/`, Git history | Removed | SQL dump removal and exposure remediation |
| `/opt/misahorros.com`, Caddy, Tailscale | Modified | Host release, security, backup, and rollback configuration |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Irreversible migration | Med | Verified pre-deploy backup; manual maintainer escalation is follow-up work |
| Secret or dump exposure | Med | Least privilege, permissions, history rewrite, rotation |
| Partial deploy | Med | Lock, health gates, retained release, runbook |

## Rollback Plan

Stop the failed stack, select the recorded prior application release, restart Compose, and validate local/public health. Retain failed-release evidence and backups; do not automate PostgreSQL restoration in this change.

## Dependencies

- EC2 Docker/Compose, Caddy, Tailscale ACL/SSH policy, GitHub environment secrets, DNS/TLS.

## Success Criteria

- [ ] A published tag alone deploys that exact tag, once, and passes Compose, `/api/health`, and public HTTPS checks.
- [ ] Data persists across releases; the first restore runs once; preventive backups and application rollback are exercised without database restore.
- [ ] PostgreSQL and port 8080 are not publicly reachable, and dump/secret remediation is complete.
- [ ] The single PR remains within the approved 1600-authored-line absolute budget under its approved size exception.
