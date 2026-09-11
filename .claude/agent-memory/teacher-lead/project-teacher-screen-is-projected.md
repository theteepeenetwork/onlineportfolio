---
name: project-teacher-screen-is-projected
description: Safeguarding-review lens for teacher screens — assume the page is mirrored to the classroom projector; three findings on the board (rule 25) came from it
metadata:
  type: project
---

The safeguarding review of the classroom board (SAFEGUARDING rule 25,
feat/show-on-board, 2026-09-10) found three things my first pass missed, all
from one assumption I had not made: **the teacher's own screen is very often
already mirrored to the projector.**

1. A quiz hand-in's picture (`JournalItem.previewPathsJson`, drawn by
   `drawQuizForPreview`) shows the child's chosen answer, and `workPages()`
   prefers it to the drawing. So "only pictures" was not "no answers".
   Owner decided the same day: quiz hand-ins MAY go up showing chosen
   answers, NEVER score/total/right-wrong (rule 25 amended). The renderer
   never reads `correctOptionId` (checked, and seen on a real wrong-answer
   hand-in). Score/total stay unselected; the run page's viewer gets nulls.
2. A thumbnail of unseen (PENDING) work in the picking list is already on the
   projector before the board opens. Placeholder until opened.
3. Opaque is not inert: Tab / a screen reader walked past the overlay onto the
   pupil list. `ClassCodeReveal` on main has the same gap (no inert, no focus
   return) — reported, not fixed, as of 2026-09-10.

4. (Second review, 2026-09-11.) The "looked at" set was keyed by journal item
   id. A hand-in keeps its id when sent back and handed in again
   (`createJournalItem` updates the RETURNED row in place, new paths), and a
   client component keeps its state across an RSC refresh from any server
   action on the page. So a look at attempt 1 unlocked attempt 2. Fixed by
   keying looks/picks/viewer to `[id, status, pages]` and deriving the pick
   list each render. Lesson: client-held "seen" state must be keyed to the
   content seen, never the row id.

**Why:** "the board is opaque" answered the eye and nothing else; the
reviewer treated the run page itself as public.

**How to apply:** for any teacher-facing overlay or list that shows pupils'
work or names, ask: what does the mirrored screen show before, during and
after; what can a keyboard reach behind it; does any "picture" carry derived
data (answers, scores). Related: [[feedback-prove-a-state-gate-by-changing-state]].
