#!/usr/bin/env bash
# Stack mínima do Supabase para testes (podman ou docker): Postgres + GoTrue (auth) + PostgREST.
# Uso: scripts/test-db.sh [up|down]. Imprime a URL do Postgres.
set -euo pipefail
ENGINE=${CONTAINER_ENGINE:-$(command -v podman || command -v docker)}
POD=mb-test
DB_PORT=${TEST_DB_PORT:-54329}
REST_PORT=${TEST_REST_PORT:-54330}
AUTH_PORT=${TEST_AUTH_PORT:-54331}
JWT_SECRET=${TEST_JWT_SECRET:-mb-test-jwt-secret-with-at-least-32-chars}
DIR=$(cd "$(dirname "$0")/.." && pwd)

down() { "$ENGINE" rm -f mb-db mb-auth mb-rest >/dev/null 2>&1 || true; "$ENGINE" pod rm -f "$POD" >/dev/null 2>&1 || true; }
[[ ${1:-up} == down ]] && { down; exit 0; }
down

psql() { "$ENGINE" exec -i mb-db psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# Pod: os três containers compartilham localhost.
"$ENGINE" pod create --name "$POD" -p "$DB_PORT:5432" -p "$REST_PORT:3000" -p "$AUTH_PORT:9999" >/dev/null
"$ENGINE" run -d --pod "$POD" --name mb-db -e POSTGRES_PASSWORD=postgres docker.io/supabase/postgres:15.8.1.060 \
  postgres -c config_file=/etc/postgresql/postgresql.conf >/dev/null
until psql -tAc "select 1 from pg_roles where rolname='authenticator'" 2>/dev/null | grep -q 1; do sleep 1; done
psql -c "alter role supabase_auth_admin with password 'postgres'; alter role authenticator with password 'postgres';"

"$ENGINE" run -d --pod "$POD" --name mb-auth \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL="http://localhost:$AUTH_PORT" \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@localhost:5432/postgres" \
  -e GOTRUE_SITE_URL=http://localhost -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 \
  -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_RATE_LIMIT_EMAIL_SENT=10000 \
  docker.io/supabase/gotrue:v2.164.0 >/dev/null
until curl -sf -m 3 "http://127.0.0.1:$AUTH_PORT/health" >/dev/null; do sleep 1; done # migrations do auth rodaram

for f in "$DIR"/supabase/migrations/*.sql; do psql < "$f" >/dev/null; done

"$ENGINE" run -d --pod "$POD" --name mb-rest \
  -e PGRST_DB_URI="postgres://authenticator:postgres@localhost:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
  docker.io/postgrest/postgrest:v12.2.3 >/dev/null
until curl -sf -m 3 "http://127.0.0.1:$REST_PORT/" >/dev/null; do sleep 1; done

echo "postgres://postgres:postgres@localhost:$DB_PORT/postgres"
