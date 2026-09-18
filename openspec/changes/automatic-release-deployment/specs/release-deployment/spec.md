# Release Deployment

## Requirements

### Requirement: Exact Trigger and Bundle

The workflow MUST run only for `release.published`, deploy that event's exact tag once, and send a checksum-verifiable immutable bundle containing the application, Compose files, and versioned deployment script to `/opt/misahorros.com/releases/<tag>`.

#### Scenario: Published tag
- GIVEN GitHub publishes `v1.2.3`
- WHEN the workflow runs
- THEN it deploys `v1.2.3`, never a branch or mutable ref

### Requirement: Tailscale and Secret Policy

The workflow MUST use a read-only `GITHUB_TOKEN` and short-lived, environment-scoped Tailscale credentials. Tailscale SSH MUST allow only `tag:ci` to `tag:server` as `ubuntu`; long-lived SSH keys are prohibited. Host secrets MUST be root-owned with mode `0600` and MUST NOT be bundled or logged.

#### Scenario: Unauthorized connection
- GIVEN a runner or destination lacks its required tag
- WHEN SSH authorization is evaluated
- THEN access is denied

### Requirement: Host Serialization

The host launcher MUST validate the tag, hold exclusive `flock`, record the prior release/configuration and backup ID, and contain neither application content nor GitHub credentials.

#### Scenario: Concurrent deployment
- GIVEN two jobs invoke the launcher
- WHEN both change deployment state
- THEN one is serialized and no state is interleaved

### Requirement: Preventive Backups and One-Time Initial Restore

Before every deployment, the launcher MUST verify a compressed `pg_dump` in an `ubuntu`-owned mode `0700` backup directory and retain the seven latest successful-deploy backups. On an empty volume only, it MUST restore the supplied dump before startup and atomically write a protected marker containing its checksum and timestamp; later releases MUST NOT re-import it.

#### Scenario: First versus later volume
- GIVEN an empty volume and a valid dump checksum
- WHEN deployment starts and a later release starts
- THEN the restore and marker writing occur once and later data is preserved

### Requirement: Migrations, Health Gates, and Application Rollback

Migrations MUST finish before traffic. Deployment MUST verify Compose health, `/api/health`, and public HTTPS health. On failure, automatic rollback MUST select the recorded prior application release and MUST NOT restore PostgreSQL.

#### Scenario: Failed health gate
- GIVEN migration or a required health check fails
- WHEN deployment evaluates promotion
- THEN it preserves evidence, leaves the prior application release selectable, and does not restore PostgreSQL

### Requirement: Security Boundaries, Records, and Operations Documentation

Caddy MUST be the public HTTPS boundary; PostgreSQL and app port `8080` MUST remain private. The tracked dump MUST be removed from the tree and public history, ignored thereafter, and exposed credentials rotated. Records MUST include tag, backup identity/checksum, state, health, duration, and redacted failure or rollback reason. Basic operations documentation MUST describe bootstrap, backups, application rollback, security boundaries, and escalation limits.

#### Scenario: Boundary and documentation audit
- GIVEN production is deployed
- WHEN external ports, deployment records, and operations documentation are inspected
- THEN only Caddy is public, records contain no secrets, and the documented rollback boundary is application-only
