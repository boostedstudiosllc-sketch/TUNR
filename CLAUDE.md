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
