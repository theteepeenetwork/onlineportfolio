---
name: feedback-dont-close-the-half-that-asks
description: When only part of a finding is fixed, don't close it — the unfixed half is often the only thing in the repo still asking that question
metadata:
  type: feedback
---

When a finding has been partly fixed, write the status as the split ("fixed on
X; the sweep is still open") rather than closing it. Before closing anything,
ask: is this entry the only place the outstanding question is being asked?

**Why:** F32 was fixed on the operator bar and its entry also asked for a sweep
of the same inline-colour pattern across the child and teacher surfaces.
Verified: `forced-colors` appeared in exactly one file in all of `src/`, while 46
files under `src/app/student`, `src/app/teacher` and `src/components` painted
with inline `style={{…}}` and none had been assessed. Closing on the operator fix
would have retired the only artefact still carrying the child-surface question —
and the unfixed half had more people behind it than the fixed half. The owner
endorsed keeping it as one finding rather than splitting it.

**How to apply:** applies to findings, runbook steps, and any doc whose status is
a claim. Measure the outstanding half and put the number in the entry — "46 files
unassessed" is a costing nobody had done. Related failure this repo keeps
producing: a question stops being asked because the artefact carrying it was
tidied away. See [[feedback-verify-without-the-battery]] for the sibling habit of
measuring rather than asserting.

Corollary the same week: when facts in an entry are wrong but the *status* is a
judgement (is this Critical finding closed?), correct the facts and write the
status as an explicit proposal for the owner. Correcting an untrue statement is
routine; deciding a finding is closed is not an agent's call.
