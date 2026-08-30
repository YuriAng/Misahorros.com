# Self-Hosted Deployment Specification

## Purpose

Docker-based deployment running the Express API (serving built Vite
assets) and PostgreSQL together on a single host, with durable data
storage across restarts and redeploys.

## ADDED Requirements

### Requirement: Two-Service Compose Topology

The deployment SHALL define exactly two services in `docker-compose`:
an `app` service (Express server plus built Vite static assets) and a
`postgres` service, connected on a shared network.

#### Scenario: Starting the stack

- GIVEN a host with Docker and docker-compose installed
- WHEN `docker compose up` is run
- THEN both the `app` and `postgres` containers start
- AND the app serves the built frontend and responds to `/api/*` requests

### Requirement: Durable Postgres Storage

The `postgres` service MUST use a named volume mounted at PostgreSQL's
data directory so that data survives container restarts and redeploys.

#### Scenario: Data survives a container restart

- GIVEN the app has written budget data to PostgreSQL
- WHEN the `postgres` container is stopped and restarted
- THEN previously written data is still queryable after restart

#### Scenario: Data survives a redeploy without volume removal

- GIVEN the stack is running with existing data in the named volume
- WHEN `docker compose down` (without `-v`) followed by `docker compose up` is run
- THEN the named volume is reattached
- AND all previously stored data is intact

### Requirement: Automatic Migrations on Startup

Database migrations MUST run automatically as part of the `app`
container's startup sequence, and the API MUST NOT begin serving
requests until migrations have completed successfully.

#### Scenario: Fresh deployment runs migrations before serving

- GIVEN a brand-new `postgres` volume with no schema
- WHEN the `app` container starts
- THEN migrations run to completion first
- AND only after that does the Express server begin accepting requests

#### Scenario: Migration failure blocks API startup

- GIVEN a migration fails during `app` container startup (e.g. unreachable database)
- WHEN the entrypoint detects the failure
- THEN the Express server does not start
- AND the container exits or reports an unhealthy state instead of serving traffic
