---
name: feedback-verify-without-the-battery
description: When several leads share one working tree the Playwright battery is forbidden; verify pure logic by running it under tsx instead of shipping it unrun
metadata:
  type: feedback
---

In a multi-lead session (two or more agents editing the same working tree on one
branch), the lead forbids `test:changed`, `test:gate`, `test:battery` and the
individual suites. The suites share one SQLite database, so concurrent runs
produce garbage. `npm run check` (~2s) is the loop; the lead runs the cold
battery at each item boundary.

**Why:** two leads running Playwright at once corrupts the shared fixture
database and produces failures that point nowhere near the code that caused
them. This is a coordination rule, not a quality one — the battery still has to
pass, just not from inside a lead's session.

**How to apply:** don't ship logic unverified just because the battery is off
limits. Split the part carrying the judgement into a pure function, then
exercise it directly:

```
DATABASE_URL="file:$CLAUDE_JOB_DIR/tmp/throwaway.db" npx tsx --tsconfig tsconfig.json <script>
```

Setting `DATABASE_URL` explicitly matters: it stops the corrupt local `.env`
being read and keeps any stray SQLite file out of the repo. Importing a module
that imports `@/lib/db` is safe — the Prisma client is constructed but never
connects until a query.

This caught two real copy faults in `schoolMailHealth.ts` that a typecheck could
not see. Report to the lead that the spec is written but unrun by you, and say
so plainly rather than implying it passed. See
[[project-mailcounter-cannot-be-per-school]].
