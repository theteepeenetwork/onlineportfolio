---
name: feedback-scoped-copy-tasks
description: On narrow copy/comment tasks from the lead, edit only the named lines, then grep for the same falsehood elsewhere and report rather than fix
metadata:
  type: feedback
---

On a narrowly scoped task the lead names exact files and lines, plus an explicit
"do not touch" list. Change only what is named. Then run the wider grep the lead
asks for and **report** every other place the same claim appears — do not extend
the diff to cover them.

**Why:** the lead is co-ordinating several sessions on one tree. A diff that
matches the brief line-for-line can be read and merged in seconds; one that
quietly fixes three more places has to be re-reviewed against the decision doc,
and may collide with another lead's file. The lead explicitly asked to be told
about a fourth place rather than have it fixed.

**How to apply:** when the brief names files outside my ownership list
(`src/app/ops/**`, `src/lib/ops/**`, `docs/ops-*.md`, `tests/battery/*/ops-*`),
the lead assigning them is the boundary owner's own direction — edit them, but
say in the report which ones were outside my list so the boundary stays visible.
Report with the actual diffs, the gate I ran and its exit code, plus anything
adjacent that is now stale. See [[project-no-trial-refund-2026-09-01]].
