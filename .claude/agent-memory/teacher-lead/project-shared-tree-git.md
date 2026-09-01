---
name: project-shared-tree-git
description: This working tree is edited by several Claude sessions at once and there are five worktrees on the machine — never touch git internals or another agent's file unilaterally
metadata:
  type: project
---

When working as one of several leads on a branch, the working tree is shared and
uncommitted: other agents are mid-edit in it, and there are additional worktrees
under `.claude/worktrees/` plus other Claude sessions on the same machine.

Three rules that follow, each of which came up for real:

- **Never `git checkout`, `reset`, `stash` or `clean`** — the standing
  instruction, because it destroys teammates' uncommitted work.
- **Do not remove `.git/index.lock` either**, even when it is plainly stale (zero
  bytes, hours old, no git process). Confirmed as the right call by the lead. If
  `git rm` is blocked by it, a plain `rm` of the file gives an unstaged deletion
  and touches no git internals. Report the lock rather than clearing it.
- **Two agents can hold the same name and the same brief at once.** On
  2026-08-24 "teacher-lead" and "teacher-lead-2" were both given step 3 of the
  school register and edited `SignupWizard.tsx` within seconds of each other: a
  duplicate import, and one reverting the other's call-site change. The tell is
  a file changing under you with comments in your own voice that you did not
  write. Do not re-apply your edit in a loop — read the file fresh from disk,
  keep whichever version is coherent, fix only the line you yourself added, and
  say so in the message so the other agent does not undo the same line.
- **Do not edit another lead's file to fix their red typecheck.** Send them the
  exact fix and line numbers instead. A transient red tree while somebody is
  mid-item is normal, not an incident — the signal that matters is red *after*
  someone reports an item done.
- **Re-run `npm run check` immediately before reporting a red tree**, and quote
  the timestamp. In a shared tree the owner may fix it in the minutes between
  the idle hook firing and the report being written, so the lead checks, finds
  green, and concludes the report was wrong. A false red costs somebody a
  diagnosis; a stale-but-true red costs your next report its credibility.

**Why:** an additive edit to a file another agent has open can be clobbered or
can clobber, and git-internal state is shared by sessions this one cannot see.
The cost of waiting is a minute; the cost of a collision is somebody's evening.

**How to apply:** any multi-lead batch on a shared branch. Confirm with the lead
before touching anything outside your declared file list, and prefer reporting
over fixing when the fix is in someone else's territory. Related:
[[feedback-findings-writing]].
