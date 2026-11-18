# Trading strategy — Robinhood "MCP" account

Owner's rules for Claude when it trades through the Robinhood connector ("Robin").
Not financial advice. Every order still needs the owner's approval in the app.

## Goal
- Start: $60.61 (Nov 2026). Target: $100 in 2 weeks (high risk, high reward).
- Honest odds: that's +65%. A stock's typical 2-week swing is about ±10–15%, so the
  target is a long shot. Expect anything from roughly -20% to +25%.

## How picks are made (each Monday)
1. Use the newest `Stock_Rankings_<date>.xlsx` the owner uploads.
2. Main signal: the **P-E vs History** tab. Prefer stocks whose current P/E is far
   below their own average ("Current / average" under 0.55).
3. Keep only stocks that are also in the **Top 50** or the **Next-day outlook** list
   (the model still likes them), and favour the biggest "Typical swing", because the
   goal needs big moves.
4. Hold 1–2 stocks at most. Buy in dollars (fractional shares).

## Selling
- Take profit: sell a position once it's up **+20%**.
- Stop loss: sell a position once it's down **-12%**.
- End of week 2: review. Hit $100 → stop. Otherwise the owner decides whether to keep going.

## Never
- No options, no margin, no leveraged ETFs, no crypto (unless the owner changes this file).
- Never spend more than the cash in the account. Never place an order without approval.

## Week 1 picks (from the Nov 16 2026 file)
| Stock | Amount | Why |
|---|---|---|
| NVDA (NVIDIA) | ~$30 | P/E 20.6 vs 10-yr average 54.9 (0.38×, rank 10). Top 50 #7. #1 on next-day outlook. Swings ~4%/day. |
| MU (Micron) | ~$30 | P/E 10.5 vs 10-yr average 20.6 (0.51×, rank 30). On next-day outlook. Biggest swing on the list (~4.9%/day). |

Check live prices before buying: the file shows different prices on different tabs
(NVDA $156–163, MU $719–778).
