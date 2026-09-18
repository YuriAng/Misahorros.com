import { describe, expect, it } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const project = resolve(import.meta.dirname, '../..');
const run = (file, args, env) => spawnSync(file, args, { cwd: project, env: { ...process.env, ...env }, encoding: 'utf8' });
const group = spawnSync('id', ['-gn'], { encoding: 'utf8' }).stdout.trim();
function host() {
  const root = mkdtempSync(resolve(tmpdir(), 'release-host-'));
  const bin = resolve(root, 'bin');
  const env = { MISA_ROOT: root, MISA_BIN: bin, MISA_CADDYFILE: resolve(root, 'Caddyfile'), MISA_OWNER: process.env.USER || 'nobody', MISA_GROUP: group, MISA_HOST_OWNER: process.env.USER || 'nobody', MISA_HOST_GROUP: group, PATH: `${bin}:${process.env.PATH}`, MISA_LOG: resolve(root, 'commands.log') };
  const installed = run('bash', ['deploy/install-host.sh'], env);
  expect(installed.status, installed.stderr).toBe(0);
  writeFileSync(resolve(root, 'shared/production.env'), 'POSTGRES_DB=budget\nPOSTGRES_USER=postgres\n');
  writeFileSync(resolve(bin, 'docker'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$MISA_LOG"\ncase "$*" in *"pg_dump"*) printf dump;; *"psql"*) printf "%s" "${MISA_TABLES:-}";; *"ps --status running"*) printf healthy;; esac\n');
  writeFileSync(resolve(bin, 'pg_restore'), '#!/usr/bin/env bash\nexit 0\n');
  writeFileSync(resolve(bin, 'curl'), '#!/usr/bin/env bash\n[[ "${MISA_FAIL_HEALTH:-}" != 1 ]] || exit 22\nprintf "{\\"status\\":\\"ok\\"}"\n');
  writeFileSync(resolve(bin, 'flock'), '#!/usr/bin/env bash\nexit 0\n');
  for (const tool of ['docker', 'pg_restore', 'curl', 'flock']) chmodSync(resolve(bin, tool), 0o755);
  return { root, bin, env };
}
function bundle(root, tag = 'v1.2.3', unsafe) {
  const source = resolve(root, 'bundle-source');
  mkdirSync(resolve(source, 'deploy'), { recursive: true });
  cpSync(resolve(project, 'deploy/release-deploy.sh'), resolve(source, 'deploy/release-deploy.sh'));
  for (const file of ['index.html', 'Dockerfile', 'docker-compose.yml', 'docker-entrypoint.sh', 'package.json', 'package-lock.json', 'knexfile.js']) writeFileSync(resolve(source, file), 'x');
  if (unsafe) writeFileSync(resolve(source, unsafe), 'unsafe');
  const archive = resolve(root, `release-${tag}.tar.gz`);
  expect(run('tar', ['-czf', archive, '-C', source, '.']).status).toBe(0);
  const hash = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const manifest = resolve(root, 'manifest.sha256');
  writeFileSync(manifest, `${hash}  ${archive}\n`);
  return { archive, manifest };
}
function priorRelease(root) {
  const prior = resolve(root, 'releases/v1.2.2');
  mkdirSync(prior, { recursive: true });
  writeFileSync(resolve(prior, 'docker-compose.yml'), 'services: {}\n');
  symlinkSync(prior, resolve(root, 'current'));
  return prior;
}

describe('release deployment host boundary', () => {
  it('preserves the published tag through workflow environment variables', () => {
    const workflow = readFileSync(resolve(project, '.github/workflows/release-deploy.yml'), 'utf8');
    expect(workflow).toContain('RELEASE_TAG: ${{ github.event.release.tag_name }}');
    expect(workflow).not.toContain("tag='${{ github.event.release.tag_name }}'");
  });

  it('uses one stable Compose project and named PostgreSQL volume', () => {
    expect(readFileSync(resolve(project, 'docker-compose.yml'), 'utf8')).toContain('name: misahorros-pgdata');
    expect(readFileSync(resolve(project, 'deploy/release-deploy.sh'), 'utf8')).toContain('docker compose -p misahorros');
  });

  it('permits the first release only after bootstrap completion', () => {
    const { root, bin, env } = host();
    writeFileSync(resolve(root, 'bootstrap/restore-complete.json'), '{}');
    const { archive, manifest } = bundle(root, 'v1.2.3');
    const result = run(resolve(bin, 'misahorros-deploy'), ['deploy', 'v1.2.3', archive, manifest], env);
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(readFileSync(resolve(root, 'state/deployments/v1.2.3.json'), 'utf8')).toContain('"status":"succeeded"');
    expect(readFileSync(env.MISA_LOG, 'utf8')).not.toContain('pg_dump');
  });

  it('hands the revalidated private copy to release execution', () => {
    const launcher = readFileSync(resolve(project, 'deploy/install-host.sh'), 'utf8');
    expect(launcher).toContain('chmod 0600 "$handoff"');
    expect(launcher).toContain('RELEASE_BUNDLE="$handoff"');
    expect(launcher).toContain('sha256sum "$handoff"');
  });

  it('stages transfer bundles as the configured ubuntu identity', () => {
    const { root } = host();
    expect(existsSync(resolve(root, 'staging'))).toBe(true);
  });

  it('rejects a documentation-like member before extracting it', () => {
    const { root, bin, env } = host();
    const { archive, manifest } = bundle(root, 'v1.2.3', 'README.md');
    const result = run(resolve(bin, 'misahorros-deploy'), ['deploy', 'v1.2.3', archive, manifest], env);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('unexpected bundle path');
    expect(existsSync(resolve(root, 'releases/v1.2.3/README.md'))).toBe(false);
  });

  it('restores only an empty volume once with the configured database name', () => {
    const { root, bin, env } = host();
    const dump = resolve(root, 'initial.dump');
    writeFileSync(dump, 'dump');
    const hash = createHash('sha256').update(readFileSync(dump)).digest('hex');
    const compose = resolve(root, 'bootstrap-compose.yml');
    writeFileSync(compose, 'services: {}\n');
    const rejected = run(resolve(bin, 'misahorros-host-bootstrap'), [dump, hash, compose], { ...env, MISA_TABLES: 'public.accounts' });
    expect(rejected.status).not.toBe(0);
    expect(`${rejected.stdout}${rejected.stderr}`).toContain('not empty');
    const restored = run(resolve(bin, 'misahorros-host-bootstrap'), [dump, hash, compose], env);
    expect(restored.status, restored.stderr).toBe(0);
    expect(JSON.parse(readFileSync(resolve(root, 'bootstrap/restore-complete.json'))).sha256).toBe(hash);
  });

  it('records successful backup details and prunes only after promotion', () => {
    const { root, bin, env } = host();
    priorRelease(root);
    for (let i = 0; i < 7; i += 1) writeFileSync(resolve(root, `backups/old-${i}.dump`), 'old');
    const { archive, manifest } = bundle(root);
    const result = run(resolve(bin, 'misahorros-deploy'), ['deploy', 'v1.2.3', archive, manifest], env);
    expect(result.status, result.stderr).toBe(0);
    const record = JSON.parse(readFileSync(resolve(root, 'state/deployments/v1.2.3.json')));
    expect(record).toMatchObject({ status: 'succeeded', previousTag: resolve(root, 'releases/v1.2.2'), backupId: expect.stringContaining('v1.2.3'), health: 'complete' });
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(readFileSync(env.MISA_LOG, 'utf8')).toContain('pg_dump --format=custom --compress=9 -U postgres -d budget');
  });

  it('stops a failed stack before restarting the prior application without restoring PostgreSQL', () => {
    const { root, bin, env } = host();
    priorRelease(root);
    const { archive, manifest } = bundle(root, 'v1.2.4');
    const result = run(resolve(bin, 'misahorros-deploy'), ['deploy', 'v1.2.4', archive, manifest], { ...env, MISA_FAIL_HEALTH: '1' });
    expect(result.status).not.toBe(0);
    const commands = readFileSync(env.MISA_LOG, 'utf8');
    expect(commands.indexOf('down')).toBeLessThan(commands.lastIndexOf(' up -d'));
    expect(commands).not.toContain('pg_restore');
    expect(JSON.parse(readFileSync(resolve(root, 'state/deployments/v1.2.4.json')))).toMatchObject({ status: 'rolled_back', previousTag: resolve(root, 'releases/v1.2.2') });
  });
});
