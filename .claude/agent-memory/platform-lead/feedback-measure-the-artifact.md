---
name: feedback-measure-the-artifact
description: Before implementing a filter or parser from a plan's description, download the real artifact and count — plan numbers in this repo have been right about totals and wrong about rules
metadata:
  type: feedback
---

When a plan specifies a rule over an external data set ("filter to open
establishments in primary-facing phases, about 20k rows"), **fetch the real file
and count before writing the filter**. Report the deviation with the numbers
rather than either following the stated rule or silently widening it.

**Why:** on 2026-08-24 the school-identity plan's stated GIAS filter (phase in
Primary/Infant/Junior) yielded 16,836 rows, not the ~20,000 it predicted, because
GIAS records `PhaseOfEducation` as "Not applicable" for every independent school
and most special schools. Following the stated rule would have silently dropped
~1,500 prep schools and ~1,300 special schools — whose teachers would then hit
the free-text fallback and manufacture exactly the URN-less rows the launch
existed to prevent. Widening to "overlaps ages 3–11" gave 20,296, which is the
number the plan predicted. **The plan's arithmetic was right and its rule was
wrong**, and only measuring showed which.

The same session, two other plan claims were wrong in the same direction:
`postcode` does trip `SENSITIVE_NAME_PATTERNS` (on `/code$/i`) where the plan said
no new field did, and the GIAS Downloads page is a CSRF-token form posting to
`/Downloads/Collate`, not a page with a link to resolve.

**How to apply:** for any import, filter or parser specified in prose, spend the
ten minutes to fetch and count. Quote counted numbers in comments, never
estimated ones, and date them. When the measurement contradicts the plan, say so
to the lead with both numbers before landing, and state which you built.
Under-inclusion is usually the expensive error for a picker; a bounded result set
makes over-inclusion nearly free. See [[feedback-verify-without-the-battery]].
