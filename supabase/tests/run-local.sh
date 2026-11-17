#!/usr/bin/env bash
# Sanad: tests that need a database, run on a LOCAL Supabase only (never the live project etaetoflotynlmgrehuu).
#
#   supabase/tests/run-local.sh          database permission tests (pgTAP, supabase/tests/database)
#   supabase/tests/run-local.sh --web    the same, then the web panel smoke tests (apps/admin/e2e-local)
#
# Needs Docker and the Supabase CLI (set SUPABASE_BIN to use a CLI that is not on PATH).
# The local stack is left running; stop it with `supabase stop`.
set -euo pipefail

cd "$(dirname "$0")/../.."
SUPABASE="${SUPABASE_BIN:-supabase}"
WEB=0
[[ "${1:-}" == "--web" ]] && WEB=1

echo "== Starting the local Supabase (only the services the tests need)"
"$SUPABASE" start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta,realtime

# Read the local URLs and keys. These are the CLI's fixed local values, not secrets.
while IFS='=' read -r key value; do
  value="${value%\"}"; value="${value#\"}"
  case "$key" in
    API_URL) API_URL="$value" ;;
    DB_URL) DB_URL="$value" ;;
    PUBLISHABLE_KEY) PUBLISHABLE_KEY="$value" ;;
    SECRET_KEY) SECRET_KEY="$value" ;;
  esac
done < <("$SUPABASE" status -o env)

# Hard stop if anything points away from this machine.
case "${API_URL:-}" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Refusing: API_URL '${API_URL:-}' is not local." >&2; exit 1 ;; esac
case "${DB_URL:-}" in *@127.0.0.1:*|*@localhost:*) ;; *) echo "Refusing: DB_URL is not local." >&2; exit 1 ;; esac

run_sql_file() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$1"
  else
    docker exec -i "supabase_db_$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' supabase/config.toml)" \
      psql -U postgres -v ON_ERROR_STOP=1 -q < "$1"
  fi
}

echo "== Preparing the local database (no cron jobs, no calls to the live project, test helpers)"
run_sql_file supabase/tests/local/prepare.sql

echo "== Database permission tests (pgTAP)"
"$SUPABASE" test db supabase/tests/database

if [[ "$WEB" == 1 ]]; then
  echo "== Web panel smoke tests (Playwright) against the local database"
  export SANAD_LOCAL_SUPABASE_URL="$API_URL" SANAD_LOCAL_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SANAD_LOCAL_SECRET_KEY="$SECRET_KEY"
  cd apps/admin
  if [[ "${SMOKE_BUILT:-}" == 1 ]]; then
    # A production build with the LOCAL values baked in (NEXT_PUBLIC_* are fixed at build time).
    NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SUPABASE_SECRET_KEY="$SECRET_KEY" \
      npx next build
  fi
  npx playwright test -c playwright.local.config.ts
fi
echo "== All local tests passed"
