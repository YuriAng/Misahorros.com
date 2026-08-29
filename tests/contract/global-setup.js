// Vitest `globalSetup`: spins up an ephemeral Postgres container (Docker),
// migrates it, and points every test worker at it via `DATABASE_URL`.
//
// Why globalSetup and not a per-file beforeAll: Vitest runs globalSetup once
// in the main process BEFORE spawning the workers/forks that actually run
// test files. Node copies `process.env` into a new worker/child process at
// creation time, so setting `process.env.DATABASE_URL` here — synchronously,
// before this function returns — is exactly what every contract test file's
// own `server/db.js` import (via `knexfile.js`) picks up. No IPC needed.
//
// Design choice (documented per the task brief): tests ASSUME a disposable
// Postgres for the `vitest` run itself rather than requiring a manually
// started one, because `npm test` must be runnable by a fresh clone with
// only Docker installed — matching this repo's Docker-first deployment
// story (design.md "Self-Hosted Deployment"). An already-running test
// database remains supported: set `DATABASE_URL` yourself before `npm test`
// and this file skips Docker entirely, only running migrations against it.
import { execSync, spawnSync } from 'node:child_process';

const CONTAINER_NAME = `budget-pwa-test-pg-${process.pid}-${Date.now()}`;
const PG_USER = 'test';
const PG_PASSWORD = 'test';
const PG_DB = 'budgetpwa_test';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDockerAvailable() {
  const result = spawnSync('docker', ['version'], { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error(
      'Docker is required to run the contract test suite (no DATABASE_URL was ' +
        'provided). Start Docker (e.g. OrbStack) and re-run `npm test`, or set ' +
        'DATABASE_URL to point at an already-running, disposable test Postgres ' +
        'to skip the automatic container.'
    );
  }
}

function startContainer() {
  execSync(
    `docker run -d --rm --name ${CONTAINER_NAME} ` +
      `-e POSTGRES_USER=${PG_USER} -e POSTGRES_PASSWORD=${PG_PASSWORD} -e POSTGRES_DB=${PG_DB} ` +
      `-p 127.0.0.1::5432 postgres:16-alpine`,
    { stdio: 'ignore' }
  );
}

function stopContainer() {
  // `docker run --rm` already removes the container on stop, but `rm -f` is
  // the belt-and-suspenders path: it also cleans up if the container never
  // fully started, and it never throws when the container is already gone.
  spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'ignore' });
}

function getMappedPort() {
  const out = execSync(`docker port ${CONTAINER_NAME} 5432/tcp`).toString().trim();
  if (!out) throw new Error('not mapped yet');
  const line = out.split('\n')[0];
  const port = Number(line.split(':').pop());
  if (!port) throw new Error('could not parse mapped port');
  return port;
}

async function waitForContainerPort(timeoutMs = 15000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return getMappedPort();
    } catch {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Timed out waiting for Docker to publish the Postgres container port.');
      }
      await sleep(200);
    }
  }
}

async function waitForPostgresReady(timeoutMs = 30000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = spawnSync(
      'docker',
      ['exec', CONTAINER_NAME, 'pg_isready', '-U', PG_USER, '-d', PG_DB],
      { stdio: 'ignore' }
    );
    if (result.status === 0) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for the ephemeral test Postgres to become ready.');
    }
    await sleep(300);
  }
}

// The official `postgres` image performs an internal restart during first
// boot (initdb, then a brief shutdown/restart to apply server config).
// `pg_isready` can report success during that first, short-lived startup
// window, right before the restart drops the connection — so a real TCP
// connect-and-query retry loop is required in addition to `pg_isready`.
async function waitForRealConnection(timeoutMs = 30000) {
  const { default: knexLib } = await import('knex');
  const { default: knexConfig } = await import('../../knexfile.js');
  const start = Date.now();
  let lastError;
  // eslint-disable-next-line no-constant-condition
  while (Date.now() - start < timeoutMs) {
    const probe = knexLib(knexConfig);
    try {
      await probe.raw('select 1');
      await probe.destroy();
      return;
    } catch (err) {
      lastError = err;
      await probe.destroy().catch(() => {});
      await sleep(400);
    }
  }
  throw new Error(
    `Timed out waiting for a stable Postgres connection: ${lastError ? lastError.message : 'unknown error'}`
  );
}

async function migrate() {
  // Dynamic imports so `knexfile.js` reads `process.env.DATABASE_URL` AFTER
  // we set it above — a static top-of-file import would bind the connection
  // config before this function ever runs.
  const { default: knexLib } = await import('knex');
  const { default: knexConfig } = await import('../../knexfile.js');
  const db = knexLib(knexConfig);
  try {
    await db.migrate.latest();
  } finally {
    await db.destroy();
  }
}

export default async function setup() {
  process.env.NODE_ENV = 'test';
  process.env.APP_TZ = process.env.APP_TZ || 'America/Caracas';

  if (process.env.DATABASE_URL) {
    // Caller already provided a live test database (e.g. CI-managed) — only
    // migrate it, and never touch it in teardown since we did not create it.
    await migrate();
    return async () => {};
  }

  ensureDockerAvailable();
  startContainer();

  try {
    const port = await waitForContainerPort();
    process.env.DATABASE_URL = `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${port}/${PG_DB}`;
    await waitForPostgresReady();
    await waitForRealConnection();
    await migrate();
  } catch (err) {
    // Never leave a stray container behind on a failed startup/migration.
    stopContainer();
    throw err;
  }

  return async function teardown() {
    stopContainer();
  };
}
