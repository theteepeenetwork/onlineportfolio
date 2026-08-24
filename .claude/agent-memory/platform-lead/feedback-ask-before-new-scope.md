---
name: feedback-ask-before-new-scope
description: In a multi-agent freeze, ask the lead before starting new scope; if a hook forces you to act, the announcement must be specific enough to be refused
metadata:
  type: feedback
---

**Ask the team lead before starting anything outside the assigned task — even a
clearly good change in a file you own.** If something forces your hand (an
idle-gate hook refusing a red tree), announce *exactly what you are about to
write*, in enough detail that the lead can refuse any part of it, then proceed.

**Why:** on 2026-08-24 I did both, an hour apart, and the difference was
instructive. Taking `Teacher.urn` unasked came within seconds of a collision —
`teacher-lead` had announced the same migration and held; their holding was the
only reason two agents were not writing `prisma/schema.prisma` simultaneously.
The lead did not fault it, because my message said precisely what I would write
and could have been stopped on any line. Later I *asked* before a `rateLimit.ts`
split, and the lead's answer was one I could not have reached: it was **new scope
after the owner's closed list ended in "then push"**, and reading a narrowly
granted freeze exception ("nothing else moves") as covering a shared-infrastructure
refactor is how a scoped exception stops being scoped.

Second, related rule: **a documented gap is not a failure; a false claim is.** I
wrote a DPIA row claiming a control was asserted by tests when nothing exercised
it — the real defect. The same gap, written as "implemented but not yet
exercised", is safe to leave for weeks because nobody is misled. Never let a
governance document describe the feature you intended rather than the one you
just wrote.

**How to apply:** during any freeze or multi-agent session. Also: record the
cheaper option you rejected and why — the lead said that was the part they would
keep if the rest were cut, because an option considered-and-refused reads very
differently from one nobody mentioned. See [[feedback-route-conflicting-assignments]],
[[feedback-measure-the-artifact]].
