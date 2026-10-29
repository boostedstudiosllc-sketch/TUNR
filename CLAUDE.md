# TUNR conventions

## Errors always say what went wrong
Every error the user sees must state its cause, not just "Couldn't do that."
- In `src/lib/store.js`, wrap failures with `withReason("Couldn't …", error)` or
  `friendlyWriteError(error, "Couldn't …")` from `src/lib/errors.js`. Both append
  the real reason, e.g. "Couldn't save that car. (permission denied for table vehicles)".
- Never swallow an error with a bare `catch {}` and a generic message; catch it as
  `catch (e)` and show `e.message`.
- API routes return a specific error code (`bad_key`, `rate_limit_flyers`, …) and the
  client shows either a message for that code or the code itself.

## Light mode
Screens use theme colours, not raw greys: `var(--n-1a1a1a)` style variables from
`src/theme.css`. After adding or changing a screen, run `npm run theme`; it swaps new
greys for variables and rebuilds `theme.css`. Games and 3D screens stay dark.

## Talking to the owner
End every reply with a short **Summary**: a few plain bullets covering what was done
or decided, anything the owner needs to do (marked clearly), and what's next. Keep the
important details, skip the jargon.
