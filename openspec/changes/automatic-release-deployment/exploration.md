# Exploration: automatic-release-deployment

Automated production deployment from a published GitHub Release to a single EC2 Ubuntu host over Tailscale SSH, while preserving PostgreSQL data and providing operational recovery controls.

## Current State

The repository already contains the application-side deployment foundation, but no release workflow or host deployment automation. `Dockerfile` builds the Vite frontend and runs the Express server in a production Node image; `docker-compose.yml` defines exactly two services (`app` and `postgres`), publishes the app on host port 8080, uses a durable named `pgdata` volume, and health-checks both database/API readiness. `docker-entrypoint.sh` runs `npx knex migrate:latest` with `set -e` before starting Express, so migration failure prevents API startup.

The API serves static assets and `/api/*` from one process, and `/api/health` is suitable for post-deploy verification. Existing OpenSpec specs define durable storage, startup migrations, idempotent legacy import, and history-preserving foreign keys. The existing legacy dump `backups/budgetpwa-2026-09-01.sql` is tracked by Git and must be treated as sensitive migration material: import it once into a fresh PostgreSQL volume, verify it, remove it from Git, and prevent reintroduction. There is no `.github` workflow and no authentication layer in the Express API; deployment access therefore must be isolated to GitHub Actions over Tailscale SSH, with secrets never written to the repository or logs.

## Affected Areas

- `.github/workflows/` — new GitHub Actions workflow triggered only by `release.published`, requiring the exact published tag and the `ci` runner tag.
- `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` — existing build, Compose, migration, health, volume, and port contracts that the deployment must preserve.
- `server/index.js`, `/api/health`, `server/migrations/` — post-deploy readiness and migration compatibility checks; no application code changes are required by exploration.
- `backups/budgetpwa-2026-09-01.sql`, `.gitignore`, Git history — one-time restore and secret/data-retention cleanup; removal must include Git tracking/history policy, not merely deleting a working-tree file.
- `/opt/misahorros.com` on EC2 Ubuntu 24.04 — immutable-ish release checkout/layout, `.env` ownership/permissions, Compose project, backup staging, deployment lock, and retained rollback state.
- EC2 host Caddy configuration — HTTPS for `misahorros.guarotech.com` forwarding to `localhost:8080`; Caddy should remain outside Compose and be validated independently.
- Tailscale ACL/SSH policy and GitHub Actions runner configuration — destination `tag:server` (device `ec2-personal`, 100.88.55.113) and source runner tag `tag:ci`; policy must constrain SSH user to `ubuntu` and required commands/paths.
- OpenSpec deployment specs (future proposal/spec phases) — requirements for exact release triggering, atomic/serialized deployment, backup/restore, rollback, health verification, and operational failure handling.

## Approaches

1. **SSH-driven in-place Compose deployment** — The tagged GitHub runner checks out the exact release tag, connects to `ubuntu@100.88.55.113` through Tailscale SSH, transfers a small deployment bundle or invokes a host-side script, then runs `docker compose build/up` under `/opt/misahorros.com`.
   - Pros: fits the approved infrastructure, minimal components, preserves the existing two-service topology, simple rollback by selecting a retained prior tag.
   - Cons: host scripts and SSH policy become production control-plane code; failed builds or migrations need explicit locking and recovery; brief downtime remains during replacement.
   - Effort: Medium

2. **Host-side release agent pulling GitHub Releases** — The workflow publishes a release signal and a preinstalled EC2 agent downloads the exact tag/artifacts and performs deployment locally.
   - Pros: less remote shell logic in Actions; deployment behavior can be versioned on the host.
   - Cons: introduces an always-running privileged agent and another trust/update surface; complicates observability and is unnecessary for one host.
   - Effort: High

## Recommendation

Use Approach 1 with a versioned, non-interactive host deployment script executed over Tailscale SSH. The workflow MUST gate on `release.published`, verify the event tag is the intended exact release tag, use a pinned action/runtime and least-privilege repository secrets, and serialize deployments with a host lock. Deploy into `/opt/misahorros.com` using the release tag, preserve the named PostgreSQL volume, run Compose health checks and `/api/health`, and retain the previous known-good tag/config for rollback.

The first fresh-volume deployment should perform a guarded, explicitly detectable restore of `backups/budgetpwa-2026-09-01.sql` before normal operation, verify row counts/API health, and then remove the dump from the repository and host staging area. Subsequent releases MUST NOT re-import it. Before replacing a running release, create a verified PostgreSQL dump in a protected backup location; rollback restores only the previous application tag and preserves the backup for maintainer-led recovery. Caddy should continue proxying HTTPS to `localhost:8080`, with deployment verification checking the public hostname as well as local health.

## Risks

- Release events can be replayed or arrive concurrently; exact-tag validation, idempotency, and a deployment lock are required.
- SSH keys, Tailscale auth, database credentials, and dump contents are production secrets; avoid command-line leakage, broad ACLs, and world-readable `/opt` files.
- Running migrations forward may make database rollback impossible; migrations need compatibility review and backups must precede risky changes.
- A failed `docker compose build/up`, migration, health check, or Caddy route can leave partial state; the script needs bounded retries, clear failure output, and a documented recovery path.
- `docker compose down`/volume handling must never use `-v` in normal deployment; accidental volume deletion is irreversible without a verified backup.
- The one-time SQL dump is currently tracked, so deleting it in a release commit does not alone remove historical exposure; repository history and credential rotation must be assessed.
- Brief downtime is accepted, but old containers should remain available until the new stack is built and the cutover is validated where feasible.
- Host disk exhaustion, stale locks, Docker daemon failure, Tailscale offline state, expired certificates, DNS drift, timezone mismatch, and insufficient PostgreSQL readiness can all fail an otherwise valid release.
- The API has no user authentication; this change must not accidentally expose PostgreSQL or the app's internal port beyond the intended Caddy localhost boundary and Tailscale administration path.

## Ready for Proposal

Yes. The next phase should turn this exploration into a proposal and delta specs, explicitly deciding the deployment script/bundle boundary, backup retention/location, rollback semantics after migrations, GitHub/Tailscale secret model, and the precise one-time restore marker. Keep the approved single-PR strategy and 800-line review budget visible in task planning.
