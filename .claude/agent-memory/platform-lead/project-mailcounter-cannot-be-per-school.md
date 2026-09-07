---
name: project-mailcounter-cannot-be-per-school
description: A per-school mail figure is a safeguarding change, not a schema convenience — treat any "scope the mail badge to my school" ask on those terms
metadata:
  type: project
---

`MailCounter` holds no school, no recipient and no domain, so no per-school mail
figure is derivable. When someone asks for one (it will be asked again — a
business manager wants to know about *her* school), the answer is not "that's a
migration".

**Why:** the absence is deliberate. FINDINGS F6 requires `requestMagicLink` to
answer identically for an address on file and one that is not, so the public
family form cannot be used to discover who has an account. A per-school or
per-send mail record rebuilds that enumeration signal inside the product. Adding
the dimension is therefore a step toward the thing F6 exists to prevent.

**How to apply:** say the honest thing — "we can tell you whether email is
broken generally, not whether it is broken for your school" — and make the
screen say it too, as a rendered field rather than a comment, so it cannot be
dropped by whoever rebuilds the component. If the ask is pressed, route it as a
safeguarding change needing `SAFEGUARDING.md` review, not as a freeze-gated
schema tweak. Decided 2026-08-23 while building
`src/lib/schoolMailHealth.ts`. See [[feedback-verify-without-the-battery]].
