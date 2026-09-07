---
name: project-prisma-like-wildcards
description: Prisma contains/startsWith do not escape LIKE wildcards; this repo is safe only because every other search is ownership-scoped, so any new PUBLIC search must strip input
metadata:
  type: project
---

Prisma's `contains` / `startsWith` compile to SQL `LIKE` and **do not escape the
value**. A query of `%` returns every row of the table; `_` matches any single
character. Verified against SQLite on 2026-08-24: `contains: "%"` returned all 35
seeded `Student` rows.

**Why:** this has never bitten because every other search in `src/` is scoped by
ownership before the `LIKE` runs. The team lead swept the codebase on 2026-08-24 —
`src/app/uploads/[...path]/route.ts` has ~18 of them and its `SAFE_NAME` blocks
`%` but permits `_`, yet each `canAccess` branch is already scoped to the
requester (the F17 fix), so a wildcard can only broaden matching inside the
caller's own rows; `src/lib/api/activities.ts` is scoped by `teacherId` with a
bounded `take`. **The repo is safe by accident of scoping, not by escaping.** The
establishment search is the first genuinely public, unscoped search in StoryJar,
which is exactly where this bites.

**How to apply:** any new search reachable without a session, or not scoped by
`teacherId` / `classId` / parent link, must **drop** disallowed characters rather
than escape them — restrict input to an allow-list, which removes `%`, `_` and the
backslash that would escape them at once, without the caller having to know which
metacharacters matter. Assert it in `npm run check` rather than only in a lane;
`scripts/check-establishments.ts` is the pattern, and prove the assertions are
load-bearing by weakening the strip and watching them fail.
See [[feedback-verify-without-the-battery]] and [[feedback-measure-the-artifact]].
