#!/usr/bin/env bash
#
# Database policy tests: builds the whole schema from supabase/migrations in a
# throwaway Postgres database, then runs supabase/tests/*.test.sql against it.
# Each test signs in as a made-up user and checks what they can and can't do
# (row-level security, triggers, the points functions).
#
#   npm run test:db
#
# Needs a Postgres 15+ server you can create databases on, picked with the
# usual PG* variables, e.g.  PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres
# (GitHub runs it on every push: .github/workflows/db-tests.yml).
# Never point it at the real Supabase database: it creates and drops its own.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${TEST_DB_NAME:-tunr_policy_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" > /dev/null

echo "Building the schema..."
"${PSQL[@]}" -f "$ROOT/supabase/tests/_supabase_stub.sql" > /dev/null 2>&1
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! out="$("${PSQL[@]}" -1 -f "$f" 2>&1 > /dev/null)"; then
    echo "Migration failed: $(basename "$f")"
    echo "$out" | grep -v "NOTICE" | head -20
    exit 1
  fi
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/_helpers.sql" > /dev/null

passed=0
failed=0
for f in "$ROOT"/supabase/tests/*.test.sql; do
  echo
  echo "# $(basename "$f")"
  if out="$("${PSQL[@]}" -f "$f" 2>&1 > /dev/null)"; then status=0; else status=1; fi
  oks="$(echo "$out" | grep -o 'ok - .*' || true)"
  [ -n "$oks" ] && echo "$oks" | sed 's/^/  /'
  passed=$((passed + $(echo -n "$oks" | grep -c '^' || true)))
  if [ $status -ne 0 ]; then
    failed=$((failed + 1))
    echo "$out" | grep -E 'ERROR|FAIL' | sed 's/^psql:[^ ]* /  /' | head -5
  fi
done

psql -X -q -d postgres -c "drop database if exists $DB" > /dev/null
echo
echo "$passed checks passed, $failed file(s) failed."
[ $failed -eq 0 ]
