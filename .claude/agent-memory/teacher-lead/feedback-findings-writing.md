---
name: feedback-findings-writing
description: How FINDINGS.md entries must be written here — standing risk not claimed incidents, verify a second-hand diagnosis before carving it in, and the summary table is the part people read
metadata:
  type: feedback
---

Three rules for writing a `FINDINGS.md` entry on this project, all learned the
hard way in one evening:

**Argue from standing risk, never from an incident that did not happen.** I once
justified a deletion with "somebody grepped and was misled by the stale copy" —
it had not occurred, and the lead caught it. A finding citing a fictional
incident is exactly what the file gets audited to remove. If the hazard is real
but unrealised, say so in the entry's own words.

**Reproduce a second-hand diagnosis before writing it down.** A teammate's
correction to my F52 diagnosis was right, but I verified all four of their claims
myself first — and my *original* diagnosis had been confidently wrong, which is
the argument for it. A finding written from a diagnosis nobody re-ran is how a
wrong one gets carved into a file.

**Every entry needs a row in the summary table.** The table is what a
due-diligence reader (a school's questionnaire) actually reads; an entry with no
row is invisible to the only person who arrives cold. The row is a judgement
about what the finding *is*, not a formatting chore — so the finding's author
writes it, not a teammate.

**Why:** these three failures all have the same shape as the findings themselves
— a signal that is technically present and functionally unread (see F18, F37,
F44, F52, F53). The file is only as true as the last person to look at it, and
several agents write to it concurrently.

**How to apply:** whenever logging or amending a finding. Also: whoever owns a
finding closes it; anybody else **adds** rather than replaces, because concurrent
edits from different moments in the same decision collided three times in one
evening. Related: [[feedback-investigate-then-stop]], [[project-shared-tree-git]].
