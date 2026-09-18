# Release Deployment Operations
## Bootstrap
Before enabling the workflow, the production maintainer installs Docker Compose,
Caddy, Tailscale SSH, the `postgresql-client` package (required on the host for
`pg_restore --list` backup verification), and this repository's
`deploy/install-host.sh` as root.
Create `/opt/misahorros.com/shared/production.env` as `root:root 0600`; it is
host-owned and must never be placed in a release bundle.

Configure Tailscale ACL/SSH for `tag:ci` to `tag:server` only as `ubuntu`.
Configure GitHub's protected `production` environment with `TS_OAUTH_CLIENT_ID`,
`TS_OAUTH_SECRET`, and `TAILSCALE_HOST`; no long-lived SSH key is permitted.

For the initial empty PostgreSQL volume only, verify the supplied dump checksum
and run `misahorros-host-bootstrap <dump> <sha256> <compose-file>` as root. The
helper requires `POSTGRES_DB` and `POSTGRES_USER` from `production.env`, refuses
a non-empty volume, and writes `bootstrap/restore-complete.json`. Never delete
that marker or rerun the import for a later release.

## Rehearsal, backups, and application rollback
Publish a protected rehearsal tag and confirm the exact tag, manifest checksum,
Compose health, local `/api/health`, and public HTTPS health in evidence. A
failed release automatically selects the previous application release; it never
restores PostgreSQL. Escalate migration or data recovery to the maintainer; no
database recovery command is provided by this deployment.

Backups are verified custom `pg_dump` files retained for the seven latest
successful deployments. Credential rotation: rotate GitHub and Tailscale
credentials before the first release.

## Exposure remediation
Before the first release, freeze releases, remove the tracked SQL dump, rotate
exposed database credentials, perform the public-history rewrite, force-push
the remediated history, and invalidate or reclone old local clones.
