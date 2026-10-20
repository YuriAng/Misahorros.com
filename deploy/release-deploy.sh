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
# Data guard: a release that started on an empty database must not go live when the previous one held rows.
if [[ "${PRE_DEPLOY_ROWS:-0}" =~ ^[0-9]+$ && "${PRE_DEPLOY_ROWS:-0}" -gt 0 ]]; then
  row_query="SELECT COALESCE(SUM((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint),0) AS row_total FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'knex\\_%'"
  post_rows=$(docker compose -p misahorros --env-file "$root/shared/production.env" exec -T postgres psql -U "${POSTGRES_USER:?POSTGRES_USER is required}" -d "${POSTGRES_DB:?POSTGRES_DB is required}" -Atc "$row_query") || post_rows=''
  [[ "$post_rows" =~ ^[0-9]+$ && "$post_rows" -gt 0 ]] || fail "data guard: database empty after deploy (pre-deploy rows: $PRE_DEPLOY_ROWS)"
fi
docker compose -p misahorros --env-file "$root/shared/production.env" ps --status running | grep -q healthy || fail 'compose health gate failed'
curl --fail --silent --show-error http://127.0.0.1:8080/api/health >"$evidence_dir/local-health.json" || fail 'local health gate failed'
curl --fail --silent --show-error "https://${PUBLIC_HOST:?public host is required}/api/health" >"$evidence_dir/public-health.json" || fail 'public health gate failed'
ln -sfn "$release_dir" "$root/current"
