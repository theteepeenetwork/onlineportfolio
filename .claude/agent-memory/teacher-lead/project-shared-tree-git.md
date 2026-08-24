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
- **Do not edit another lead's file to fix their red typecheck.** Send them the
  exact fix and line numbers instead. A transient red tree while somebody is
  mid-item is normal, not an incident — the signal that matters is red *after*
  someone reports an item done.

**Why:** an additive edit to a file another agent has open can be clobbered or
can clobber, and git-internal state is shared by sessions this one cannot see.
The cost of waiting is a minute; the cost of a collision is somebody's evening.

**How to apply:** any multi-lead batch on a shared branch. Confirm with the lead
before touching anything outside your declared file list, and prefer reporting
over fixing when the fix is in someone else's territory. Related:
[[feedback-findings-writing]].
