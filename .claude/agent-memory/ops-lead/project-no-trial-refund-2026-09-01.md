---
name: project-no-trial-refund-2026-09-01
description: The 2026-09-01 no-trial/42-day-refund decision is copy-complete but not code-complete; purchase code still opens TRIAL rows
metadata:
  type: project
---

The owner decided on 2026-09-01 that a new school purchase has **no trial** and
a **42-day full refund** instead (`docs/pricing-decisions.md`). The copy was
brought in line across the terms, landing page, ops handbook, product overview
and the `TRIAL_DAYS` comment. **The code was not.** The purchase path still
creates school subscriptions on `TRIAL`, and the ACTIVE-on-purchase behaviour is
item 0 of `docs/paid-tier-plan.md`, unbuilt as of 2026-09-01.

**Why:** the decision was recorded and the false copy fixed the same day,
deliberately ahead of the self-serve purchase work it depends on — no real
account can create a `School` yet, so nothing user-reachable is affected.

`ensureSchoolSubscription` opening a TRIAL row is **deliberate and is staying**,
not debt, and it is not a contradiction because *it is not the purchase*. It is
the pre-payment holding row for a school that exists with no subscription. TRIAL
is the only status that keeps every teacher writable in that gap while still
leaving a route to FROZEN if the money never arrives: `settleStatus` can only
freeze a TRIAL row with a null `stripeSubscriptionId`, so opening it ACTIVE would
mint a free-forever school. The purchase itself completes ACTIVE either way — the
card webhook creates it ACTIVE, the invoice route writes ACTIVE immediately so
finance sitting on a PO cannot freeze a school.

**How to apply:** if asked why the copy and the code disagree, this is the
reason and it is known, not a bug to file. Never "tidy" that TRIAL to ACTIVE.
Two separate 42s now exist —
`TRIAL_DAYS` (only governs rows already on TRIAL: seeds, fixtures,
`scripts/freeze-expired.mjs`) and the refund window in customer copy. They must
never be treated as one constant. The `TRIAL` status itself stays in the schema
and seeds; removing it is explicitly out of scope. Verify against
`docs/paid-tier-plan.md` before assuming the code is still unbuilt.
See [[feedback-scoped-copy-tasks]].
