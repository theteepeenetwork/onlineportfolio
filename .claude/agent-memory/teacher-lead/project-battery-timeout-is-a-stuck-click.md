---
name: project-battery-timeout-is-a-stuck-click
description: A 120s timeout in the security/a11y/e2e projects is almost always a click that never became actionable, and the line it blames is usually the cleanup
metadata:
  type: project
---

A test that fails with "Test timeout of 120000ms exceeded" in the battery is a
`click()` (or `goto`) that never became actionable — not a slow machine. Only
the `personas` project sets `actionTimeout`; everywhere else Playwright's
default is "wait forever", so an un-clickable element burns the whole test
timeout. The stack trace then names whatever line the abort landed on, which is
often a `finally` block doing direct Prisma writes ("Response from the Engine
was empty") — three files away from the real cause.

**Why:** on 2026-09-03 a staff-row popover that closed on scroll made
Playwright's scroll-into-view close the panel it was about to click, so the
click retried forever. The failure surfaced as a Prisma error in
`unverified-school-gates.spec.ts`'s cleanup, and nothing in the message pointed
at the layout change that caused it.

**How to apply:** read the `test-failed-1.png` screenshot FIRST — it shows the
page at the moment of the timeout, and "no menu open, page slightly scrolled"
told the whole story. Then confirm the cause by restoring the file you changed
to its committed copy and re-running the same spec:
`git show HEAD:path > /tmp/x && cp /tmp/x path` — a copy rather than
`git stash`, which is the safe move in a shared tree ([[project-shared-tree-git]]).
A spec that passes at HEAD and hangs on your branch is yours, whatever suite it
lives in.
