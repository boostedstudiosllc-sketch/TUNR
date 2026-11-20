# Prompts that get the most out of Claude on TUNR

Copy, paste, fill in the brackets. Short is fine; these work because they say
what "done" looks like.

## Every change (already automatic)

The test gate (`scripts/test-gate.sh`) and the `test-guardian` agent update and
run the tests at the end of every turn. You don't need to ask.

## Helper agents (in `.claude/agents/`)

| Say | What happens |
|---|---|
| "Run the **ux-checker** on [screen / today's changes]" | Screenshots every changed screen on a phone, dark and light, and lists what's broken or confusing. |
| "Run the **security-auditor** on [feature / everything new this week]" | Hunts for privacy and abuse holes and proves each with a failing test. |
| "Run the **test-guardian**" | Brings tests up to date and runs them all. |
| "/code-review high" | A second pass over the latest changes for bugs. |
| "/security-review" | Security review of the pending changes. |

## Prompts

**Build something new**
> Build [feature]. Who it's for: [members / hosts / admins]. It's done when [what someone can do]. Check it on a phone in dark and light, and run the ux-checker and security-auditor before you push.

**Fix a bug from a screenshot**
> [screenshot] This is wrong: [what you expected]. Find why, fix it, add a test so it can't come back.

**Weekly health check** (good on Mondays)
> Weekly check: run the security-auditor and ux-checker over everything that changed in the last 7 days, fix anything small, and list anything bigger for me to decide.

**Before telling people about a feature**
> I'm about to announce [feature]. Walk through it as a brand-new member on an iPhone, fix anything rough, and write me a Home banner slide and a 2-line Instagram caption for it.

**Make it faster / simpler**
> /simplify, then tell me which screens feel slow on a phone and fix the worst one.

**Copy from what works (without copying)**
> [screenshots of another app] I like how this does [thing]. Build TUNR's own version that fits car culture and doesn't look like theirs.

**Money**
> Pick the next item from docs/REVENUE_PLAN.md, build it end to end (payments in test mode), and tell me exactly what I need to sign up for.

**Explain it to me**
> Explain [feature / error] to me in 5 plain bullets, no jargon.

## Tips

- One feature per message gets the best result; a list of 6 gets done more shallowly.
- Screenshots beat descriptions.
- Say what NOT to change ("keep the colours", "don't touch the games").
- Ask for a ux-checker run after anything visual, and a security-auditor run after anything with money, location, photos or private info.
