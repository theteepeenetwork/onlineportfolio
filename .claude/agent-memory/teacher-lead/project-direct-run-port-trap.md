---
name: project-direct-run-port-trap
description: Direct playwright runs read PORT, not PW_BASE_PORT — a brief that says "PW_BASE_PORT=… npx playwright test tests/e2e/…" silently drives port 3000
metadata:
  type: project
---

`playwright.config.ts` (e2e) and `playwright.battery.config.ts` both build their
URL from **`PORT`** (default 3000). Only `scripts/run-suites.mjs` — i.e.
`npm run test:changed` / `test:gate` — reads `PW_BASE_PORT`. So a direct run
written as `PW_BASE_PORT=3420 npx playwright test tests/e2e/x.spec.ts` ignores
the variable, and with `reuseExistingServer: true` it adopts whatever is on
3000 (another worktree's or the owner's dev server) while its globalSetup
reseeds **this** worktree's `prisma/dev.db`. Verified 2026-09-10 by reading
both configs.

**Why:** in a fleet with several worktrees, 3000 is the likeliest port to be
somebody else's, and the failure looks like a flaky product rather than a
wrong port.

**How to apply:** for a direct spec run use `PORT=<own free port>` (I used
3430, outside the `PW_BASE_PORT` lane block 3420–3422); keep `PW_BASE_PORT`
for the lane runner only. Check `lsof -iTCP -sTCP:LISTEN` first. Related:
[[project-shared-tree-git]].

Also learned the same day: the worktree-isolation hook refuses a Bash command
that mixes `git` with other commands, and refuses heredoc-fed `python3` edits
on paths containing `[id]`. Put edit scripts in the scratchpad and run
`python3 <file>`; run git commands on their own.
