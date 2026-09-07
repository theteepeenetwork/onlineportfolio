---
name: feedback-prove-a-state-gate-by-changing-state
description: How to test a server gate that depends on a database column in this repo — render the control while the state allows it, flip the column, then press; and make the positive control differ by that column alone
metadata:
  type: feedback
---

When a server action refuses on the strength of a **database column** (rather
than on who you are), the test has to send a real request. Two things make that
possible here, and both are worth reaching for before writing anything else:

**Forge by tampering with a form the server rendered, never by building a POST.**
A hand-built POST to a server action is refused by Next before any application
code runs, so the assertion holds against a request that could never have done
anything. `tests/battery/security/class-handover.spec.ts` records the technique;
`staff-invite-isolation.spec.ts` records the lesson that produced it.

**For a state gate, the tamper is the STALE TAB.** Stamp the column, load the
page so it renders the genuine control, clear the column, then press. The request
carries a valid action id and a real session and only the screen is out of date —
which is also the honest case the gate exists for, so the test is not contrived.
Used for `assignClassToStaff` on an unverified school, where the console renders
no such form at all and there was otherwise nothing to tamper with.

**Make the positive control differ by that column and nothing else.** Same
school, same admin, same session, same form, `verifiedAt` set → it works; cleared
→ it refuses. That is stronger evidence than commenting the guard out (which the
sandbox classifier blocks anyway, correctly), and it rules out the failure mode
where the negative passes because the request never arrived.

**A void action can still prove it was reached.** These actions return nothing
and answer with `redirect("/admin?blocked=verify")`, so `waitForURL` on that
query parameter is the proof the server processed the request — better than a
`waitForTimeout` that a dropped request would also satisfy.

**Why:** three of the four gate tests in `unverified-school-gates.spec.ts` would
have passed against a typo without these. **How to apply:** any gate keyed on a
column — verification, freeze, publication, retention. Related:
[[feedback-investigate-then-stop]].
