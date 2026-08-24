---
name: project-ta-role-gap
description: The TA staff role is a label with no access effect; the copy fix (option A) landed 2026-08-23, the underlying gap is deferred to the autumn
metadata:
  type: project
---

`staffRole` TEACHER and TA are behaviourally identical — every gate in the app
asks only `staffRole === "ADMIN"`. Investigated 2026-08-23 (Wave 2, Batch B item
4) and reported to the lead **without building**, because the answer was the
"more serious" branch rather than a surfacing job.

**Option A landed 2026-08-23** — the Guide card, the role submenu, the invite
form and the empty queue/class/dashboard states now say that only ADMIN changes
what somebody may do and that access follows the classes you hold. Logged as
**F47**, status "copy fixed, gap open".

**B and C are deferred to the autumn term and are explicitly not to be started
without Mark:** B (make TA actually restricted) changes the approval queue, so
it needs the DPO; C (many-to-many staff↔class) is a schema change. The agreed
position is that B only becomes meaningful once C exists — a TA restriction
means nothing while a TA can only get a class by taking it off the teacher.

**Why:** the access model (access follows the class you hold, not your title) is
defensible on its own; only the copy around it overclaims. Deciding between "fix
the words" and "fix the behaviour" is a product call, not an engineering one.
Underneath both sits a structural fact: `Class.teacherId` is singular and
`assignClassToStaff` *moves* a class rather than sharing it, so StoryJar cannot
express "a TA supports a class alongside its teacher" at all.

**How to apply:** read F47 in `FINDINGS.md` before touching anything role-shaped
— the copy is already honest, so a request to "explain what a TA can do" is
probably really a request for C. Do not build B without Mark's decision:
restricting the approval queue is [[safeguarding-first]] territory. Related:
[[feedback-investigate-then-stop]].
