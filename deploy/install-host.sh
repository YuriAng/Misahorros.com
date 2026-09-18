#!/usr/bin/env bash
set -euo pipefail
root=${MISA_ROOT:-/opt/misahorros.com}
compose_project=misahorros
owner=${MISA_OWNER:-ubuntu}
group=${MISA_GROUP:-ubuntu}
host_owner=${MISA_HOST_OWNER:-root}
host_group=${MISA_HOST_GROUP:-root}
bin_dir=${MISA_BIN:-/usr/local/sbin}
caddyfile=${MISA_CADDYFILE:-/etc/caddy/Caddyfile}
install -d -o "$owner" -g "$group" -m 0700 "$root/backups" "$root/staging"
install -d -o "$host_owner" -g "$host_group" -m 0750 "$root"/{releases,state/deployments,state/config,evidence,bootstrap,shared}
install -m 0644 "$(dirname "$0")/Caddyfile" "$caddyfile"
install -m 0600 -o "$host_owner" -g "$host_group" /dev/null "$root/shared/production.env"
install -d -m 0755 "$bin_dir"
cat >"$bin_dir/misahorros-host-bootstrap" <<'BOOTSTRAP'
#!/usr/bin/env bash
set -euo pipefail
root=${MISA_ROOT:-/opt/misahorros.com}; compose_project=misahorros; marker="$root/bootstrap/restore-complete.json"
[[ ! -f "$marker" ]] || { echo 'one-time restore already completed'; exit 0; }
dump=${1:?one-time dump path is required}; expected=${2:?dump checksum is required}; compose=${3:?bootstrap Compose file is required}
[[ "$(sha256sum "$dump" | awk '{print $1}')" == "$expected" ]] || { echo 'restore dump checksum mismatch' >&2; exit 65; }
set -a; source "$root/shared/production.env"; set +a
: "${POSTGRES_DB:?POSTGRES_DB is required}"; : "${POSTGRES_USER:?POSTGRES_USER is required}"
docker compose -p "$compose_project" -f "$compose" up -d postgres
for _ in $(seq 1 30); do docker compose -p "$compose_project" -f "$compose" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 && break; sleep 1; done
docker compose -p "$compose_project" -f "$compose" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 || { echo 'postgres did not become ready before restore' >&2; exit 70; }
tables=$(docker compose -p "$compose_project" -f "$compose" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1")
[[ -z "$tables" ]] || { echo 'PostgreSQL volume is not empty' >&2; exit 65; }
docker compose -p "$compose_project" -f "$compose" exec -T postgres pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" <"$dump"
tmp=$(mktemp "$marker.XXXXXX"); printf '{"sha256":"%s","restoredAt":"%s"}\n' "$expected" "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" >"$tmp"; mv "$tmp" "$marker"
BOOTSTRAP
chmod 0750 "$bin_dir/misahorros-host-bootstrap"
cat >"$bin_dir/misahorros-deploy" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
root=${MISA_ROOT:-/opt/misahorros.com}; compose_project=misahorros
export COMPOSE_PROJECT_NAME="$compose_project"
command=${1:?command is required}; tag=${2:?tag is required}; bundle=${3:?bundle is required}; manifest=${4:?manifest is required}
[[ "$command" == deploy && "$tag" =~ ^v[0-9][0-9A-Za-z.-]*$ ]] || { echo 'invalid deployment command or tag' >&2; exit 64; }
[[ -f "$bundle" && -f "$manifest" ]] || { echo 'bundle or manifest missing' >&2; exit 66; }
expected=$(awk '{print $1}' "$manifest")
handoff=$(mktemp "$root/staging/release-$tag.XXXXXX"); chmod 0600 "$handoff"; cp "$bundle" "$handoff"
actual=$(sha256sum "$handoff" | awk '{print $1}')
[[ "$expected" == "$actual" ]] || { echo 'manifest checksum mismatch' >&2; exit 65; }
exec 9>"$root/state/deploy.lock"; flock 9
record="$root/state/deployments/$tag.json"
if [[ -f "$record" ]]; then
  old_hash=$(sed -n 's/.*"manifestSha256":"\([^"]*\)".*/\1/p' "$record")
  old_status=$(sed -n 's/.*"status":"\([^"]*\)".*/\1/p' "$record")
  [[ "$old_status" == succeeded && "$old_hash" == "$actual" ]] && { echo 'succeeded no-op success'; exit 0; }
  [[ "$old_hash" != "$actual" ]] && { echo 'different manifest hash' >&2; exit 65; }
  echo 'in_progress or terminal state is a non-zero refusal' >&2; exit 75
fi
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
redact() { printf '%s' "$1" | sed -E 's/(password|secret|token)=[^ ]+/\1=[REDACTED]/Ig'; }
atomic_record() { local tmp; tmp=$(mktemp "$record.XXXXXX"); printf '%s\n' "$1" >"$tmp"; mv "$tmp" "$record"; }
validate_bundle_paths() { tar -tzf "$1" | while IFS= read -r path; do path=${path#./}; [[ -z "$path" ]] && continue; case "$path" in index.html|Dockerfile|docker-compose.yml|docker-entrypoint.sh|package.json|package-lock.json|knexfile.js|deploy/|deploy/release-deploy.sh|deploy/install-host.sh|deploy/Caddyfile|server/|server/*|src/|src/*|public/|public/*) [[ "$path" != *'..'* ]] || return 1 ;; *) printf 'unexpected bundle path: %s\n' "$path" >&2; return 1 ;; esac; done; }
validate_bundle_paths "$handoff"
started=$(now); started_epoch=$(date +%s); attempt_id="$(date +%s)-$$"; previous=$(readlink "$root/current" 2>/dev/null || true)
duration() { echo $(( ($(date +%s) - started_epoch) * 1000 )); }
snapshot="$root/state/config/$tag"; mkdir -p "$snapshot"
if [[ -f "$root/shared/production.env" ]]; then install -m 0600 "$root/shared/production.env" "$snapshot/production.env"; fi
config_sha=$(sha256sum "$snapshot/production.env" 2>/dev/null | awk '{print $1}' || true)
printf '{"productionEnvSha256":"%s"}\n' "$config_sha" >"$root/state/config/$tag.json"
set -a; source "$root/shared/production.env"; set +a
: "${POSTGRES_DB:?POSTGRES_DB is required}"; : "${POSTGRES_USER:?POSTGRES_USER is required}"
if [[ -z "$previous" && ! -f "$root/bootstrap/restore-complete.json" ]]; then echo 'bootstrap marker is required for the first release' >&2; exit 70; fi
atomic_record "{\"tag\":\"$tag\",\"manifestSha256\":\"$actual\",\"status\":\"in_progress\",\"attemptId\":\"$attempt_id\",\"previousTag\":\"${previous:-null}\",\"previousConfigSha256\":\"$config_sha\",\"startedAt\":\"$started\",\"finishedAt\":null,\"durationMs\":null,\"backupId\":null,\"backupSha256\":null,\"failureReason\":null,\"rollback_reason\":null,\"rollback_failure_reason\":null,\"rollback\":null}"
backup=''; backup_sha=''
if [[ -n "$previous" ]]; then
  atomic_record "{\"tag\":\"$tag\",\"manifestSha256\":\"$actual\",\"status\":\"in_progress\",\"attemptId\":\"$attempt_id\",\"previousTag\":\"$previous\",\"previousConfigSha256\":\"$config_sha\",\"startedAt\":\"$started\",\"finishedAt\":null,\"durationMs\":null,\"backupId\":null,\"backupSha256\":null,\"failureReason\":null,\"rollback_reason\":null,\"rollback_failure_reason\":null,\"rollback\":null}"
  docker compose -p "$compose_project" -f "$previous/docker-compose.yml" exec -T postgres pg_isready || { echo 'postgres unavailable before backup' >&2; exit 70; }
  backup="$root/backups/$tag-$attempt_id.dump"; docker compose -p "$compose_project" -f "$previous/docker-compose.yml" exec -T postgres pg_dump --format=custom --compress=9 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >"$backup"
  pg_restore --list "$backup" >/dev/null; backup_sha=$(sha256sum "$backup" | awk '{print $1}')
  docker compose -p "$compose_project" -f "$previous/docker-compose.yml" down
fi
backup_id=${backup:+$(basename "$backup")}
[[ "$(sha256sum "$handoff" | awk '{print $1}')" == "$actual" ]] || { echo 'bundle changed during handoff' >&2; exit 65; }
release="$root/releases/$tag"; mkdir -p "$release"; tar -xzf "$handoff" -C "$release"
if DEPLOY_ATTEMPT_ID="$attempt_id" RELEASE_BUNDLE="$handoff" PUBLIC_HOST="misahorros.guarotech.com" "$release/deploy/release-deploy.sh" "$release" "$tag"; then
  if compgen -G "$root/backups/*.dump" >/dev/null; then ls -1t "$root/backups"/*.dump | tail -n +8 | xargs -r rm -f; fi
  finished=$(now); atomic_record "{\"tag\":\"$tag\",\"manifestSha256\":\"$actual\",\"status\":\"succeeded\",\"attemptId\":\"$attempt_id\",\"previousTag\":\"$previous\",\"previousConfigSha256\":\"$config_sha\",\"backupId\":\"$(basename "$backup")\",\"backupSha256\":\"$backup_sha\",\"health\":\"complete\",\"startedAt\":\"$started\",\"finishedAt\":\"$finished\",\"durationMs\":$(duration),\"failureReason\":null,\"rollback_reason\":null,\"rollback_failure_reason\":null}"
else
  reason=$(redact 'deployment health gate failed'); atomic_record "{\"tag\":\"$tag\",\"manifestSha256\":\"$actual\",\"status\":\"rolling_back\",\"attemptId\":\"$attempt_id\",\"previousTag\":\"$previous\",\"backupId\":\"$(basename "$backup")\",\"backupSha256\":\"$backup_sha\",\"failureReason\":\"$reason\",\"rollback\":{\"status\":\"in_progress\"}}"
  if [[ -n "$previous" ]]; then docker compose -f "$release/docker-compose.yml" down || true; [[ ! -f "$snapshot/production.env" ]] || install -m 0600 "$snapshot/production.env" "$root/shared/production.env"; ln -sfn "$previous" "$root/current"; docker compose -f "$previous/docker-compose.yml" up -d --build --wait --wait-timeout 60; atomic_record "{\"tag\":\"$tag\",\"manifestSha256\":\"$actual\",\"status\":\"rolled_back\",\"attemptId\":\"$attempt_id\",\"previousTag\":\"$previous\",\"backupId\":\"$(basename "$backup")\",\"backupSha256\":\"$backup_sha\",\"failureReason\":\"$reason\",\"rollback_reason\":\"$reason\",\"rollback\":{\"status\":\"succeeded\"},\"durationMs\":$(duration)}"; else atomic_record "{\"tag\":\"$tag\",\"manifestSha256\":\"$actual\",\"status\":\"failed\",\"attemptId\":\"$attempt_id\",\"previousTag\":null,\"backupId\":\"$(basename "$backup")\",\"backupSha256\":\"$backup_sha\",\"failureReason\":\"$reason\",\"rollback_reason\":\"$reason\",\"rollback_failure_reason\":null,\"durationMs\":$(duration)}"; fi
  exit 1
fi
LAUNCHER
chmod 0750 "$bin_dir/misahorros-deploy"
echo 'Tailscale prerequisite: ACL must permit tag:ci to tag:server only as ubuntu.'
