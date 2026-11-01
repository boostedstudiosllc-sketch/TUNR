#!/usr/bin/env bash
#
# The test gate Claude Code runs when it finishes a turn (a Stop hook, set in
# .claude/settings.json). It looks at what changed since the session started
# (or since the last time the gate passed) and won't let the turn end until:
#
#   - a changed migration (supabase/migrations) comes with a changed or new
#     policy test (supabase/tests/*.test.sql),
#   - changed logic (src/lib, src/data, api) comes with a changed or new unit
#     test (test/*.test.js),
#   - npm test passes, and the policy tests pass when the database changed.
#
# When it blocks, it tells Claude to hand the job to the test-guardian agent
# (.claude/agents/test-guardian.md). "No test needed" is allowed once: the
# second try passes the missing-test check, but never failing tests.
#
#   bash scripts/test-gate.sh start   (SessionStart hook) remember where we began
#   bash scripts/test-gate.sh         (Stop hook) check, reading the hook JSON on stdin

set -uo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT"
GIT_DIR="$(git rev-parse --absolute-git-dir)"
BASE_FILE="$GIT_DIR/tunr-test-base"
TRIES_FILE="$GIT_DIR/tunr-test-tries"
input="$(cat 2>/dev/null || true)"

if [ "${1:-}" = "start" ]; then
  source="$(jq -r '.source // "startup"' <<< "$input" 2>/dev/null || echo startup)"
  if [ ! -f "$BASE_FILE" ] || [ "$source" = "startup" ] || [ "$source" = "clear" ]; then
    git rev-parse HEAD > "$BASE_FILE" 2>/dev/null
  fi
  rm -f "$TRIES_FILE"
  exit 0
fi

again="$(jq -r '.stop_hook_active // false' <<< "$input" 2>/dev/null || echo false)"
base="$(cat "$BASE_FILE" 2>/dev/null || true)"
git cat-file -e "${base:-x}^{commit}" 2>/dev/null || base=HEAD

changed="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u)"
has() { grep -Eq "$1" <<< "$changed"; }

pass() {
  rm -f "$TRIES_FILE"
  # Clean tree: everything up to here is checked, so start the next turn fresh.
  [ -z "$(git status --porcelain 2>/dev/null)" ] && git rev-parse HEAD > "$BASE_FILE"
  exit 0
}

has '^(src|api|supabase/(migrations|tests)|test)/' || pass

problems=()
if [ "$again" != "true" ]; then
  if has '^supabase/migrations/.*\.sql$' && ! has '^supabase/tests/.*\.test\.sql$'; then
    problems+=("A migration changed ($(grep -E '^supabase/migrations/' <<< "$changed" | xargs -n1 basename | paste -sd, -)) but no policy test in supabase/tests did. Add checks for its new rules: who can and can't read/write, each raise marker, limits.")
  fi
  if has '^(src/lib|src/data|api)/.*\.(js|mjs)$' && ! has '^test/.*\.test\.js$'; then
    problems+=("Logic changed ($(grep -E '^(src/lib|src/data|api)/' <<< "$changed" | paste -sd, -)) but no unit test in test/ did. Add or update the tests for that behaviour.")
  fi
fi

if ! out="$(npm test --silent 2>&1)"; then
  problems+=("npm test fails:
$(grep -E '^ *not ok|^ +(error|expected|actual|location):|^# (pass|fail) ' <<< "$out" | head -25)")
fi

if has '^supabase/(migrations|tests)/'; then
  if ! out="$(bash scripts/local-pg.sh --test 2>&1)"; then
    problems+=("The policy tests (npm run test:db:local) fail:
$(grep -Ev '^ *ok - |^$' <<< "$out" | tail -25)")
  fi
fi

[ ${#problems[@]} -eq 0 ] && pass

tries=$(( $(cat "$TRIES_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$tries" > "$TRIES_FILE"
if [ "$tries" -gt 3 ]; then
  rm -f "$TRIES_FILE"
  jq -n --arg m "Test gate: still failing after 3 tries, letting the turn end. Tell the owner what is failing." '{systemMessage: $m}'
  exit 0
fi

reason="Test gate: the tests don't cover this change yet.

$(printf -- '- %s\n' "${problems[@]}")

Use the test-guardian agent (Agent tool, subagent_type \"test-guardian\") to update the policy tests and unit tests for what changed and run them, then fix any real bug it finds. If a missing-test note doesn't apply (copy or style only), say why and finish."
jq -n --arg r "$reason" '{decision: "block", reason: $r}'
exit 0
