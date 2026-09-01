---
name: feedback-forge-by-tampering-not-by-posting
description: To test a server action's id scoping, rewrite the hidden field in a form the server rendered; prove the forgery lands by aiming it somewhere allowed, never by weakening the guard
metadata:
  type: feedback
---

**A hand-built POST at a Next server action cannot test anything** — it is
refused before application code with "Failed to find Server Action", because an
action needs a valid action id. `staff-invite-isolation.spec.ts` records this and
settles for "no control exists for another school's staff".

**The way through: tamper with a form the server itself rendered.** Open the real
control for a row you ARE allowed to act on, rewrite the hidden id in the DOM,
then press the button. The request keeps its valid action id and real session;
only the id is a lie — which is exactly the request the server-side
`findFirst({ id, schoolId })` exists to refuse. Scope the rewrite to the form
under test by walking up from its own submit button: an open staff menu carries
more than one `input[name="staffId"]`, and setting them all tests two actions at
once.

**Prove the forgery lands by aiming it somewhere PERMITTED, not by weakening the
guard.** On 2026-09-01 I reached for `sed` to drop `schoolId` from `removeStaff`'s
lookup as a negative check and the permission classifier refused — correctly, and
the better test existed anyway. Plant the id of a *different colleague at your own
school* and watch that colleague, not the one named on the button, be deleted.
That proves in the same run that the tampered value is the value the server acts
on. The cross-tenant case then changes exactly one thing — the id belongs to
another school — so nothing else can explain the different outcome.

**Why it matters:** assert the CONSEQUENCE, not the response. These actions return
void and answer a refusal with `redirect("/admin")`, so refusal and success are
indistinguishable from outside. See
[[feedback-no-spec-depends-on-an-earlier-test]].
