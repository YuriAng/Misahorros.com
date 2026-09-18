#!/usr/bin/env bash
set -euo pipefail
release_dir=${1:?release directory is required}
tag=${2:?tag is required}
root=${MISA_ROOT:-/opt/misahorros.com}
evidence_dir="$root/evidence/${tag}-${DEPLOY_ATTEMPT_ID:?attempt id is required}"
mkdir -p "$evidence_dir"

redact() { printf '%s' "$1" | sed -E 's/(password|secret|token)=[^ ]+/\1=[REDACTED]/Ig'; }
fail() { redact "$1" >"$evidence_dir/failure.txt"; return 1; }

cd "$release_dir"
docker compose -p misahorros --env-file "$root/shared/production.env" up -d --build --wait --wait-timeout 60 postgres
docker compose -p misahorros --env-file "$root/shared/production.env" run --rm --entrypoint npx app knex migrate:latest
docker compose -p misahorros --env-file "$root/shared/production.env" up -d --build --wait --wait-timeout 60 app
docker compose -p misahorros --env-file "$root/shared/production.env" ps --status running | grep -q healthy || fail 'compose health gate failed'
curl --fail --silent --show-error http://127.0.0.1:8080/api/health >"$evidence_dir/local-health.json" || fail 'local health gate failed'
curl --fail --silent --show-error "https://${PUBLIC_HOST:?public host is required}/api/health" >"$evidence_dir/public-health.json" || fail 'public health gate failed'
ln -sfn "$release_dir" "$root/current"
