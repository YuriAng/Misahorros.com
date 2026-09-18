// Vitest `globalSetup`: spins up an ephemeral Postgres container (Docker),
// migrates it, and points every test worker at it via `DATABASE_URL`.
//
// It runs before workers so each receives DATABASE_URL; an existing URL is
// migrated without Docker lifecycle management.
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

// PostgreSQL can restart immediately after `pg_isready`, so require two probes.
export function hasStableConnection(successfulProbes) {
  return successfulProbes >= 2;
}

async function waitForRealConnection(timeoutMs = 30000) {
  const { default: knexLib } = await import('knex');
  const { default: knexConfig } = await import('../../knexfile.js');
  const start = Date.now();
  let lastError;
  let successfulProbes = 0;
  // eslint-disable-next-line no-constant-condition
  while (Date.now() - start < timeoutMs) {
    const probe = knexLib(knexConfig);
    try {
      await probe.raw('select 1');
      await probe.destroy();
      if (hasStableConnection(++successfulProbes)) return;
      await sleep(400);
    } catch (err) {
      lastError = err;
      successfulProbes = 0;
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
