---
name: agent-worktrees-can-be-stale
description: Agent worktrees in this fleet are not guaranteed to be cut from the lead's current branch — verify HEAD against the brief's premises before any work
metadata:
  type: project
---

An agent worktree under `.claude/worktrees/agent-*` may be created from an
arbitrary older commit rather than from the branch the briefing lead is on. It
arrives on a detached-style local branch (`worktree-agent-<id>`), and the
conversation-start `gitStatus` block can name a *different* branch and commit
again — all three can disagree.

**Why:** on 2026-09-01/02 the same phase-1 webhook task was handed a worktree at
`8490781` twice, ten commits behind `feature/self-serve-purchase-runway` at
`af90df2`. Every premise in the brief (`src/lib/schoolClaim.ts`,
`restoreFreePlan`, `School.urn`) was false there, and the first run apparently
worked around it instead of stopping.

**How to apply:** before touching anything, run `git log --oneline -3`,
`git rev-parse --abbrev-ref HEAD` and `git worktree list` (which shows the main
repo's real HEAD), and existence-check the specific files/exports the brief
names. If they are missing, report and stop — do not merge, rebase or check out
from another branch to rescue it, because the lead may be mid-flight on that
branch and the fix is theirs to make. `git show <sha>:<path>` and
`git merge-base --is-ancestor` let you prove the gap read-only.

Related: [[shared-dev-db]], [[feedback-say-it-before-not-after]]
