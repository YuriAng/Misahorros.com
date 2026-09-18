# SSH host verification

## Scope

Protect release deployment SSH transport with a GitHub protected-environment known-hosts secret and document the out-of-band verification procedure. Do not modify existing deployment targets or secrets.

## Tasks

- [x] Map the release workflow, deployment contract test, and operations guidance.
  - Observed: the workflow runs Tailscale before `scp`/`ssh`, keeps `StrictHostKeyChecking=yes`, and the focused deploy test reads the workflow as text.
- [x] Add a focused failing workflow contract test for securely materialized known-hosts data.
  - Observed RED: `./node_modules/.bin/vitest run tests/deploy/release-deploy.test.js` failed because `DEPLOY_SSH_KNOWN_HOSTS` was absent from the workflow.
- [x] Implement protected-environment known-hosts materialization after Tailscale and before transport, and document trusted provisioning.
  - Observed GREEN: the focused contract test passed all 10 tests after the workflow and operations updates.
- [x] Run final focused verification.
  - Observed: `npm test -- tests/deploy/release-deploy.test.js` passed 10/10; static contract and whitespace checks passed.

## Work-unit evidence

- Runtime harness: N/A — this change is static GitHub Actions configuration and operational guidance; the focused Vitest contract test is the executable boundary.
- Rollback boundary: revert only `.github/workflows/release-deploy.yml`, `deploy/OPERATIONS.md`, and the matching workflow assertions in `tests/deploy/release-deploy.test.js`.
