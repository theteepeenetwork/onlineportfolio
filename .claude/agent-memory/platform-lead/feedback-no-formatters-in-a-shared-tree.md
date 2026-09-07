---
name: feedback-no-formatters-in-a-shared-tree
description: Never run prisma format (or any whole-file formatter) when other agents share the working tree; verify with git diff -w --stat if you slip
metadata:
  type: feedback
---

**Do not run `npx prisma format` — or any formatter that rewrites a whole file —
in a working tree other sessions are editing.** It realigns columns across every
model, producing churn that belongs to nobody's change and that lands in someone
else's uncommitted work.

**Why:** on 2026-08-24 two agents did this within hours of each other on
`prisma/schema.prisma`. The first realigned the `School` model inside my
uncommitted block; I read their report, agreed with it, and then did the same
thing myself an hour later, churning `School` and `JournalItem` by 33 lines. It
is a reflex after a schema edit, which is exactly why a rule is needed rather
than an intention.

**How to apply:** hand-align new fields to the surrounding model instead. If you
slip, the repair is `git show HEAD:<file>` rebuilt with your own blocks
re-applied verbatim — never `git checkout`, `reset` or `stash`, which take other
people's work with them. **The proof is that `git diff --stat` and
`git diff -w --stat` report identical counts**: same numbers with and without
whitespace means no whitespace-only change survived. Check that before saying it
is clean. See [[feedback-ask-before-new-scope]].
