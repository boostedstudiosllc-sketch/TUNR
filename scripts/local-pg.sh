#!/usr/bin/env bash
#
# A throwaway local Postgres for the policy tests, created on first use.
#
#   bash scripts/local-pg.sh          start it; prints the PG* settings to use
#   bash scripts/local-pg.sh --test   start it and run the policy tests
#   npm run test:db:local             same as --test
#
# Lives in /var/lib/postgresql/tunr-test (port 54390) when run as root, else in
# ~/.tunr-pg. Needs PostgreSQL 15+ installed (apt-get install postgresql).

set -euo pipefail

BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$BIN" ] && command -v pg_ctl > /dev/null; then BIN="$(dirname "$(command -v pg_ctl)")"; fi
if [ -z "$BIN" ]; then
  echo "no_postgres: PostgreSQL isn't installed here (apt-get install postgresql)" >&2
  exit 1
fi

PORT="${TUNR_PG_PORT:-54390}"
if [ "$(id -u)" = 0 ]; then
  DIR="${TUNR_PG_DIR:-/var/lib/postgresql/tunr-test}"
  run() { su postgres -c "$*"; }
else
  DIR="${TUNR_PG_DIR:-$HOME/.tunr-pg}"
  run() { bash -c "$*"; }
fi

if [ ! -f "$DIR/data/PG_VERSION" ]; then
  mkdir -p "$DIR"
  [ "$(id -u)" = 0 ] && chown postgres "$DIR"
  run "'$BIN/initdb' -D '$DIR/data' -A trust -U postgres" > /dev/null
fi
if ! run "'$BIN/pg_isready' -q -h '$DIR' -p $PORT"; then
  run "'$BIN/pg_ctl' -D '$DIR/data' -o \"-p $PORT -k $DIR\" -l '$DIR/log.txt' -w start" > /dev/null
fi

if [ "${1:-}" = "--test" ]; then
  PGHOST="$DIR" PGPORT="$PORT" PGUSER=postgres bash "$(dirname "${BASH_SOURCE[0]}")/db-test.sh"
else
  echo "PGHOST=$DIR PGPORT=$PORT PGUSER=postgres"
fi
