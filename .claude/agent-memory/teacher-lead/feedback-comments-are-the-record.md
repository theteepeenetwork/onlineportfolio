---
name: feedback-comments-are-the-record
description: In this repo a comment is the record — check the factual claims in one before endorsing it, and justify a guard by the honest case it serves rather than the adversarial one
metadata:
  type: feedback
---

Two rules about prose in this codebase, both from the safeguarding review of the
signup school picker on 2026-08-24.

**Check the factual claims in a comment before you endorse it, not just its
argument.** I read another agent's `Teacher.urn` schema comment, judged its
reasoning better than mine, and told the lead so. It cited "the same decision
taken for `School.urn`" — and `School.urn` does not exist, in the model or in
any migration. The reviewer found it because they had been told not to take
these comments as evidence. Reading for the argument and reading for the facts
are two different passes and I had only done the first.

**Justify a guard by the honest case it serves, not the adversarial one.** My
comment on the URN check said "the only way to arrive here with a bad one is a
tampered client; a real teacher cannot reach this branch." False: the register
is replaced wholesale on import, so a school can leave it between step 2 and
step 4 of a signup. The reviewer's verdict was that this correction mattered
more than the test that found it — a guard whose stated justification is false
is one somebody deletes later on the strength of the false justification.

**Why:** `AGENTS.md`, `SAFEGUARDING.md`, `RETENTION.md`, `docs/DPIA.md` and the
schema comments are read as the record by a school's due diligence and by every
future agent, and several agents write to them concurrently from different
moments in the same decision. A wrong sentence in one is not a typo; it is the
thing the next person reasons from.

**How to apply:** before repeating or approving an inherited comment, grep for
whatever it names — a column, a file, a flag, a date. When correcting one, leave
the trace ("an earlier version said X, and no such thing exists") rather than
quietly deleting the clause, which is what the reviewer called the right
instinct for a file people read as the record. Related:
[[feedback-findings-writing]], [[project-shared-tree-git]].
