# Self-Hosted Deployment Delta

## MODIFIED Requirements

### Requirement: Two-Service Topology

The deployment SHALL define exactly two Compose services: `app` (Express plus Vite) and `postgres`, on a shared network with PostgreSQL data stored on a durable volume. Host Caddy SHALL be the HTTPS boundary; app `8080` and PostgreSQL MUST be private.
(Previously: Compose lacked an explicit Caddy boundary and durable-volume contract.)

#### Scenario: Stack and boundary
- GIVEN Docker, Compose, and Caddy are installed
- WHEN the selected release starts Compose
- THEN both services run on the shared network, data uses the durable volume, Caddy serves HTTPS, and `8080`/PostgreSQL are not externally reachable

### Requirement: Automatic Migrations on Startup

Migrations MUST run during app startup and complete before Express serves requests. Failure MUST block promotion and leave the prior application release selectable; rollback MUST NOT automatically restore PostgreSQL.
(Previously: Failure only prevented API startup.)

#### Scenario: Fresh volume
- GIVEN a new PostgreSQL volume
- WHEN the app starts
- THEN migrations complete before requests are accepted

#### Scenario: Failed release rollback
- GIVEN migration succeeded but release health failed
- WHEN the launcher rolls back
- THEN the prior application release restarts without implicit database restoration
