---
name: worktree-node-modules-trap
description: A hand-cut worktree with no node_modules still passes npm run check and npx tsc, because npx resolves up to the parent repo; only Turbopack fails, 120s later
metadata:
  type: project
---

A worktree under `.claude/worktrees/` that was cut by hand may have **no
`node_modules` at all**, and almost nothing tells you. `npx` walks up the
directory tree, finds the parent checkout's `node_modules`, and runs from there
— so `npm run check`, `npx tsc --noEmit`, `npx prisma generate` and
`npx playwright test` all start normally.

The first thing that actually breaks is the dev server the battery starts, and
it breaks unhelpfully: Turbopack resolves from the worktree root, not upward, so
you get

```
Error: Could not find the Next.js package (next/package.json)
Resolved from: <worktree>/src/app
```

buried in `[WebServer]` output, followed by a wall of `PageNotFoundError` and
`build-manifest.json` ENOENT, and finally
`Timed out waiting 120000ms from config.webServer`. The ENOENT lines look like a
corrupt `.next`, so the instinct is to `rm -rf .next` and re-run — which costs
another two minutes and changes nothing.

**Why:** `npx`'s upward resolution is per-binary and unrelated to how Turbopack
computes a workspace root, so the two disagree about whether the tree is
installed.

**How to apply:** in a worktree, run `ls -d node_modules` before anything else
and `npm ci && npm run postinstall` if it is missing — do not infer from a green
`npm run check` that the tree is installed. `npm ci` here may print
`npm warn allow-scripts` and skip `@prisma/engines`/`esbuild` postinstall
scripts; that was harmless in practice (prisma generate and tsx both worked),
but it is the next thing to suspect if they do not. See
[[agent-worktrees-can-be-stale]] for the other worktree check, and
[[a-green-run-is-not-a-run]] for why "it passed" needs a count behind it.
