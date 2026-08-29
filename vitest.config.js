import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Contract tests (tests/contract/) need a real Postgres. This global
    // setup spins up an ephemeral `postgres:16-alpine` Docker container
    // (or reuses an existing DATABASE_URL if the caller already set one),
    // migrates it, and tears it down after the run — see
    // tests/contract/global-setup.js for the full rationale.
    globalSetup: ['tests/contract/global-setup.js'],
    // Contract tests do real HTTP + SQL round trips; the 5s default can be
    // tight on a cold Docker/Postgres connection pool.
    testTimeout: 15000,
    hookTimeout: 30000,
    // Every contract test file shares ONE physical ephemeral Postgres
    // (started once in globalSetup) and each file's `beforeEach` truncates
    // every table. Running test FILES in parallel would let one file's
    // truncate wipe rows another file's concurrently-running test depends
    // on. This suite is small, so sequential files cost little; disabling
    // parallelism here trades a bit of wall-clock time for correctness.
    fileParallelism: false
  }
});
