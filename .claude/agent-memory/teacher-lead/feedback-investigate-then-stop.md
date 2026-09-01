---
name: feedback-investigate-then-stop
description: On this project, investigation items report before building, and every report says what was verified rather than assumed
metadata:
  type: feedback
---

When an item is framed as "investigate first", produce the finding and **stop**
— do not roll straight into the fix, even when the fix looks small. Report per
item as it lands, not in one batch at the end. Every report names what was
*verified against the code* (file:line) versus what was assumed, and what I am
not confident about.

**Why:** an investigation can reveal that the product's actual behaviour is not
what it implies, which is a different and more expensive decision than the
surfacing job it was booked as. Building first forecloses that decision. The
"verified vs assumed" split exists because the leads work in parallel on a
shared tree and cannot re-run each other's checks — a claim without a line
number cannot be trusted by the person who has to merge it.

**A test that is awkward to write is evidence about the product, not an
obstacle in the test.** Both of us hit this on 2026-08-25: I could not write the
picker's `busy` spec honestly because the component never mapped a failed
request to that state, and the lead nearly worked around a limiter in a spec
before realising the limiter keyed on IP alone, so one school behind one NAT was
a single throttle key. Reach for "the spec is hard to write" as a finding before
reaching for a workaround.

**How to apply:** applies to any item whose brief contains "investigate",
"establish", "find out what the true answer is", or "report before building".
Also applies when a warning or a piece of guidance is being written: establish
the real behaviour first, because copy that states the wrong behaviour is worse
than no copy. See [[project-ta-role-gap]] for an item where stopping was right.
