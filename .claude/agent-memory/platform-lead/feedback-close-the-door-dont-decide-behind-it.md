---
name: close-the-door-dont-decide-behind-it
description: When a fix would silently settle an unanswered design question, remove the path that reaches it rather than adding a branch that answers it
metadata:
  type: feedback
---

When a bug fix would incidentally decide a question nobody has decided, do not
add the branch that decides it. Remove or disable the path that reaches the
undecided state, and leave a comment naming the decision and where it will be
recorded.

**Why:** on 2026-09-02 a webhook fix touched Stripe's `no_payment_required`
status. Adding a branch for it would have answered "does a £0 purchase create a
school, is it verified, what happens at renewal" as a side effect of closing a
review condition — settled silently, in a branch, by whoever happened to be
fixing something else. The founder's answer was to delete
`allow_promotion_codes` from the new checkout route instead, which made the
state unreachable and cost nothing because that route had never run in
production. The existing route kept the flag and kept working.

**How to apply:** the test is "would a reader six months from now think this
question was decided?" If yes and no dated entry in `docs/pricing-decisions.md`
or `docs/dpo-decisions.md` says so, close the door. Two things make it cheap:
the path being new (nothing depends on it yet) and a sibling path that is older
and stays untouched. Say in the comment that the capability is *wanted*, so the
absence reads as deliberate rather than as an oversight somebody should
"tidy up". Related: [[feedback-ask-before-new-scope]].
