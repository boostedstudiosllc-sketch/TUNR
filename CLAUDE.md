# TUNR conventions

## Errors always say what went wrong
Every error the user sees must state its cause, not just "Couldn't do that." The cause
is in plain words for members ("you don't have access to that", "no connection",
"TUNR's server is having trouble"), never table, function or code names: `errorReason`
in `src/lib/errors.js` translates them and sends the technical reason to the admins'
app error log (Settings → Admin → App errors, `135_app_errors.sql`).
- In `src/lib/store.js`, wrap failures with `withReason("Couldn't …", error)` or
  `friendlyWriteError(error, "Couldn't …")` from `src/lib/errors.js`. Both append
  the reason in plain words, e.g. "Couldn't save that car. (you don't have access to that)";
  admins see "permission denied for table vehicles" in the app error log.
- Never swallow an error with a bare `catch {}` and a generic message; catch it as
  `catch (e)` and show `e.message`, or `errorReason(e)` for a raw browser or server error.
- API routes return a specific error code (`bad_key`, `rate_limit_flyers`, …) and the
  client shows either a message for that code or the code itself.
- On screens, a failure a member could notice is shown, never only logged: an inline
  line (`LoadError` with TRY AGAIN where a list would be) or a pop-up via
  `failWith("Couldn't load …")`, `orNull(…)`, `showError(…)` from `src/lib/toast.js`.
  Loaders in `src/lib` throw on a database error instead of returning an empty list.
  Something that should stay quiet says why with `// quiet: <why>`; `test/toast.test.js`
  fails otherwise. Anything uncaught still shows ("Something didn't work. (reason)"), and
  a crashed screen shows its reason (`ErrorBoundary.jsx`).

## Light mode
Screens use theme colours, not raw greys: `var(--n-1a1a1a)` style variables from
`src/theme.css`. After adding or changing a screen, run `npm run theme`; it swaps new
greys for variables and rebuilds `theme.css`. Games and 3D screens stay dark.

## Tests move with the code
Every change updates the tests that cover it, in the same commit:
- A migration → policy checks in `supabase/tests/*.test.sql` (who can and can't, each
  raise marker, limits).
- Logic in `src/lib`, `src/data` or `api` → unit tests in `test/*.test.js`.
- Then `npm test`, `npm run test:db:local` (database changes) and `npm run build` pass.
Hand this to the `test-guardian` agent (`.claude/agents/test-guardian.md`). The test
gate (`scripts/test-gate.sh`, a Stop hook in `.claude/settings.json`) checks it at the
end of every turn and sends the work back if tests are missing or failing. Never
skip or weaken a test to get green.

## Helper agents and prompts
`.claude/agents/`: `test-guardian` (tests), `ux-checker` (phone screenshots, dark and
light), `security-auditor` (privacy and abuse holes, proven with failing tests). Run
the ux-checker after visual changes and the security-auditor after anything with
money, location, photos or private info. Prompts for the owner: `docs/PROMPTS.md`;
the money plan: `docs/REVENUE_PLAN.md`.

## Talking to the owner
End every reply with a short **Summary**: a few plain bullets covering what was done
or decided, anything the owner needs to do (marked clearly), and what's next. Keep the
important details, skip the jargon.
