#!/usr/bin/env bash
#
# Applies any migration in supabase/migrations that this database hasn't run.
#
# Which ones have run is tracked in public.schema_migrations, keyed on the
# filename. Each migration runs inside a single transaction together with the
# row that records it, so a failure leaves nothing half-applied and nothing
# falsely marked as done.
#
#   SUPABASE_DB_URL   required. Session-pooler connection string from
#                     Supabase → Project Settings → Database.
#   BASELINE          optional. Marks every migration up to and including this
#                     filename as applied *without running it* — for a database
#                     where those were already applied by hand.

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set — add it as a repository secret}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
BASELINE="${BASELINE:-}"

# -qtAX: quiet, tuples only, unaligned, ignore any local .psqlrc.
query() {
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"
}

query "create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);" > /dev/null

applied="$(query "select version from public.schema_migrations;")"

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "No migrations found in $MIGRATIONS_DIR"
  exit 0
fi

ran=0
for path in "${files[@]}"; do
  version="$(basename "$path")"

  if grep -Fxq "$version" <<< "$applied"; then
    echo "  = $version"
    continue
  fi

  # Filenames are zero-padded, so a plain string comparison orders them the
  # same way the numbering does.
  if [ -n "$BASELINE" ] && [[ ! "$version" > "$BASELINE" ]]; then
    query "insert into public.schema_migrations (version) values ('$version')
           on conflict (version) do nothing;" > /dev/null
    echo "  ~ $version (baselined, not run)"
    continue
  fi

  echo "  + $version"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qX --single-transaction \
    -f "$path" \
    -c "insert into public.schema_migrations (version) values ('$version');"
  ran=$((ran + 1))
done

echo "Done — $ran migration(s) applied."
