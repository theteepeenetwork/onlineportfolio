# Pricing decision log — StoryJar

The written record of pricing and packaging decisions: what was decided, when,
and why. Companion to [`docs/dpo-decisions.md`](./dpo-decisions.md) — same
purpose, different hat. It exists so a future reader (or a customer asking "why
am I on this plan?") can see these were deliberate calls.

Market context and the launch reasoning live in [`LAUNCH_PLAN.md`](../LAUNCH_PLAN.md);
the competitive rationale in [`COMPETITIVE_POSITIONING.md`](../COMPETITIVE_POSITIONING.md).

---

## 2026-09-02 — Promo codes are wanted, and are switched off on the new purchase route until a free purchase means something

**Decision:** `allow_promotion_codes` is removed from the school-claim checkout
(`startClaimCheckout`). It stays on the existing route, which a school that
already has an account uses, and which predates this work. Promo codes are
wanted eventually; this is a deliberate absence, not an oversight, and the thing
to design first is named below.

**What is actually broken, which is narrower than it looked.** Stripe sets
`payment_status: "no_payment_required"` only when the amount due is **zero**.
Any discount below 100% still charges, so the status is `"paid"` and the claim
transaction runs unchanged. **Promo codes already work on this route at any real
discount. A free purchase does not** — the webhook's claim branch withholds on
anything that is not `"paid"`, correctly, because creating a verified school on
an uncleared payment is worse than creating none.

**Why the obvious patch was refused.** Adding a `no_payment_required` branch that
treats free as paid would have closed a safeguarding-review condition in an
afternoon. It would also have settled, silently and in a webhook branch, every
question nobody has asked: whether a comped school counts as **verified** when
no payment ever confirmed the claim; what happens at renewal when the code
lapses and Stripe bills a school that has never paid; whether a comped school is
identifiable in the operator console or looks exactly like a paying one; and
whether comping should exist at all. Those are pricing decisions. A branch in a
payment handler is the wrong place to take them, and taking them as a side
effect of a review fix is how a product acquires behaviour nobody chose.

**Why removal costs nothing today.** The claim route is new on this branch and
has never run in production, so switching the flag off takes no capability away
from anybody. The existing route keeps it and keeps working.

**What has to be decided before it goes back on.** What a free purchase *is* —
verified or not, renewing or not, visible as comped or not — and then the
webhook branch follows from that answer rather than standing in for it.

**Decided by:** the founder. **Recorded:** 2026-09-02.

---

## 2026-09-01 — No trial on a new purchase. A 42-day refund instead

**Decision:** a school that buys StoryJar is a paying customer from the moment
it buys. New purchases do not open on TRIAL. In its place, a school may ask for
a **full refund within 42 days** of the start of the paid year, no reason
needed. The 42 days are unchanged; what changes is which side of the money
they sit on.

**Why.** The trial existed to give a school something to evaluate before its
finance office raises a purchase order. But a trial is a countdown, and a
countdown is a thing a school can lose track of and be cut off by in the middle
of a term — the same objection recorded on 15 Aug 2026 against putting free
teacher accounts on a clock. It also made every new school an unverified school
for its first six weeks, which forced a gate on `assignClassToStaff` and left a
window in which a claim on a school's identity cost nothing.

A refund is the same reassurance without the countdown. The school is never cut
off by a date it forgot, and StoryJar is never running an unpaid school it
cannot identify.

**What this makes true on the card route.** Nothing is created when the button
is pressed. Teacher picks a band, pays, and the Stripe webhook creates the
`School`, the `Subscription` (ACTIVE, not TRIAL), sets `schoolId` and
`role = "ADMIN"`, stamps `verifiedAt` and writes the audit row, in one
transaction. An abandoned checkout creates nothing, so a half-finished purchase
cannot squat on a URN. The purchase intent travels in Stripe Checkout metadata —
purchasing teacher, band, school name and URN — because there is no local row to
hang it on until payment confirms.

**The invoice route still has an unpaid window, and that is accepted.** An
invoice with 30-day terms is unpaid by definition, and the decision of 30 Aug
2026 that `requestSchoolInvoice` activates immediately stands: finance sitting
on an invoice must not be able to freeze a school. So a PO school is created
ACTIVE and unverified, and `verifiedAt` is stamped on `invoice.paid`. The only
way to close that window is to give PO schools nothing for 30 days, which would
end self-serve purchase for most UK primaries. The safeguarding gates on an
unverified school are what holds the line instead
([`dpo-decisions.md`](./dpo-decisions.md), 1 Sep 2026).

**The refund is manual, deliberately.** A school asks; the founder actions it in
the Stripe dashboard. There is no refund button and there does not need to be at
this volume. The cancellation path already exists —
`customer.subscription.deleted` → `freezeSubscription`.

**A refunding buyer goes back to free, not to frozen.** The person who bought
usually had a free teacher account with their own classes before they paid.
Freezing the school on refund would make their own classes read-only and leave
them worse off than if they had never bought, which is not a refund. So the
freeze detaches the buyer back to a free teacher plan — recreating the free
`Subscription` row, which joining a school deletes — and the school and any
remaining staff are frozen read-only, because they did not pay.

**Copy this obliges.** "We do not refund part of a paid year" in the Terms and
"42-day trial for schools evaluating before a purchase order is raised" on the
landing page were both true when written and are both false the moment this
ships. Changed in the same shipment.

**Not removed:** the `TRIAL` status itself. `prisma/seed.ts`, `seed-test.ts`,
the frozen-school persona and `scripts/freeze-expired.mjs` all depend on it,
and the admin billing pane still renders a trial countdown for a row that has
one. New purchases simply never enter that state. Removing the status is a
separate cleanup, not a condition of this decision.

**Decided by:** the founder. **Recorded:** 2026-09-01.

---

## 2026-08-30 — Buying is self-serve. There is no gatekeeper

**Decision:** a school that wants to buy StoryJar must be able to do so without
a person at StoryJar being involved, at any hour, on the day it decides. No
manual onboarding step, no operator approval, no "email us to get set up".

**Why this had to be said out loud.** The design already assumed it:
`docs/school-identity.md` §4 lists "No operator approval queue" as a deliberate
absence, because payment replaces it and keeps a human out of the onboarding
critical path. But the half of that design which creates a `School` was
scheduled for late September, and until it lands `db.school.create` exists only
in seeds. A real teacher therefore cannot reach the admin console or checkout at
all, and a school wanting to pay in September would have had to be onboarded by
hand. A founder-shaped bottleneck in front of the only revenue path is worse
than any feature gap in this plan, and it fails at exactly the moment it costs
most: a head deciding on a Tuesday evening.

**What follows:** steps 4 to 7 of `school-identity.md` stop being late-September
work and become the first thing built. The route is item 0 of
`docs/paid-tier-plan.md`: any signed-in teacher reaches checkout, and the
`School` is created in the Stripe webhook's claim transaction.

**The PO route is included, not excepted.** Most UK primaries pay by invoice, so
"self-serve" that only means card is not self-serve. `requestSchoolInvoice`
already activates immediately rather than waiting on a webhook, so finance
holding an invoice cannot freeze a school; it must also be reachable without an
existing school.

**Teachers without a URN can buy.** The whole-school entry point may not require
a stored `urn`. Null is a real answer for every teacher outside England and for
any English school missing from the register, and requiring one would quietly
route those schools back to the founder's inbox. Accepted consequence: schools
created from free text have no uniqueness protection and a duplicate is possible,
which is an operator merge at low volume.

**The safeguarding condition** on all of this, because buying is what makes
somebody a school admin, is recorded separately in
[`docs/dpo-decisions.md`](./dpo-decisions.md) (30 Aug 2026): the school exists
from trial start but is unverified until payment lands, and `assignClassToStaff`
is refused until it is verified.

**What is still done by hand, and should be:** welcoming the first schools that
buy. That is a follow-up, never a gate.

**Decided by:** the founder. **Recorded:** 2026-08-30.

---

## 2026-08-15 — Two tiers: free for a teacher, a paid plan for a school

**Decision:** StoryJar ships with **two** plans.

| Plan | Price | What it is |
|---|---|---|
| **Teacher** | **Free, permanently** | One teacher, **all of their own classes**. Capture, approval queue, parent sharing, export. No card, no trial clock. |
| **School** | **£199–£649 / year, banded by pupils on roll** | Everything above for every teacher in the school, plus admin oversight, staff continuity, year-end transfer, and the DPA with the school as data controller. |

**Why free is uncapped, not "one class":** a class cap builds a wall in front of
the most engaged free users — a supply teacher, PPA cover, a job-share — and
"you've hit your limit" is exactly the price-creep our positioning attacks. It
also puts the upgrade conversation at the wrong moment and about the wrong thing.

**What the school tier therefore sells:** not capacity — *oversight, continuity
and the data relationship*. A school's DPO is generally uncomfortable with staff
holding children's work in personal accounts; the school plan is what makes
StoryJar the school's system of record rather than a teacher's private tool. That
makes the upgrade a safeguarding conversation, which is on-brand, rather than a
capacity one, which isn't.

**The risk, stated honestly:** a twelve-teacher primary could run entirely on free
accounts and never pay. The counterweight is the controller/DPA relationship, not
a feature lock. If conversion is poor by the October–November subscription-review
window, revisit — but revisit by strengthening what a *school* needs, never by
capping a teacher's classes.

**Decided by:** the founder. **Recorded:** 2026-08-15.

---

## 2026-08-15 — The paid Individual plan is retired

**Decision:** The **Individual** plan (£3.99/month, £40/year) is withdrawn. It is
not offered to new accounts and no new Stripe subscription is created against it.

**Why:** it sat between the free tier and the school tier and undercut the only
revenue path we have. A teacher who had outgrown free could pay £40 personally
instead of introducing StoryJar to their head — cannibalising the school
sale with exactly the users most likely to convert. With free now uncapped, the
plan also has nothing left to sell.

**Consequence for the pricing page:** two tiers, one sentence — "free for a
teacher, from £199 a year for a school, every feature included." That is what
makes the launch plan's *one honest price* proof point true rather than
aspirational.

**Decided by:** the founder. **Recorded:** 2026-08-15.

---

## 2026-08-15 (revised) — The school plan is BANDED by pupils on roll

> **This supersedes the flat-£299 decision recorded below on the same day.** The
> flat decision is kept rather than deleted, because the reason it was wrong is
> the useful part of the record.

**Decision:** the school plan is priced in **four bands by pupils on roll**:

| Pupils on roll | Shape of school | Price / year |
|---|---|---|
| Up to 105 | Village, infant or small rural primary | **£199** |
| Up to 210 | One-form-entry primary | **£299** |
| Up to 420 | Two-form-entry primary | **£449** |
| Over 420 | Large primary or all-through | **£649** |

Band boundaries follow **form entry** (1FE ≈ 210 pupils, 2FE ≈ 420) because that
is how UK primaries describe themselves — a business manager can place their
school at a glance without doing arithmetic.

**Why flat was wrong.** Two reasons, one of them factual:

1. **The evidence was wrong.** `LAUNCH_PLAN.md` justified flat pricing by citing
   Tapestry as "proof UK schools respond to simple flat pricing… ~£99/yr for 40
   children". Tapestry is **not flat**: it is banded by child count across roughly
   fifteen tiers — £164 for 40 children, £290 for 90, £900 for 300, £1,200 for 400
   (checked 2026-08-15, tapestry.info/pricing). The market leader has banded by
   size for years and UK schools accept it. The plan's central evidence for flat
   pricing in fact argued against it.
2. **Flat penalises the wrong school.** At £299 flat, a 100-pupil school pays
   ~£3/pupil and a 500-pupil school pays £0.60. It does not overcharge large
   schools; it overcharges **small** ones — the most budget-squeezed segment, a
   large share of the UK primary market, and the schools most likely to try
   something new. Meanwhile a 300-pupil school being quoted £900 by Tapestry would
   pay £449 without blinking, so flat forfeited that margin for nothing.

**The three rules that keep "no price creep" true** (break any one and the promise
goes with it):

1. The band is chosen **once, at purchase**, from the school's published roll.
2. It is **fixed for the paid year** — a school that grows mid-year pays nothing
   more until renewal.
3. **Every feature is in every band.** The band buys capacity, never
   functionality. That is the line Seesaw crosses and we do not.

**Honesty note for the comparison table:** Tapestry is usually bought for EYFS
only, so its bands often cover a Reception cohort rather than a whole school.
Comparing whole-school StoryJar to EYFS-only Tapestry flatters us and a sharp
business manager will notice. **Seesaw is the honest whole-school comparator**
(~£1,700/yr at 300 pupils). Lead with Seesaw; use Tapestry only for the
"simple, no per-pupil metering" point.

**The trade, stated plainly:** banding may *lower* near-term revenue against flat
£299, because the earliest adopters are likely to be small schools landing in the
£199 band. It is made back on every school above 210 pupils. Accepted: small
schools are the beachhead.

**Decided by:** the founder. **Recorded:** 2026-08-15.

---

## 2026-08-15 — VAT: not registered, so no VAT is shown

**Decision:** StoryJar is **not VAT registered** (taxable turnover is far below
the £90,000 threshold — at £199–£649 a school that is well over 150 schools away).
Published prices are therefore simply the price, and **no surface may show
"+ VAT" or "ex VAT"** — implying VAT is charged when you are not registered is not
permitted.

**Why not register voluntarily:** input VAT on StoryJar's costs (hosting, domain,
a little software) is small, so the reclaim is negligible, while registering adds
20% to price or takes it off margin, plus quarterly MTD filing forever. Most
school buyers are VAT-neutral anyway — maintained schools reclaim through the
local authority and academies through their own refund scheme — so charging VAT
would be administration in exchange for nothing.

**How this is implemented:** a single flag, `VAT_REGISTERED` in
`src/lib/billing-plans.ts`, drives every price string via `priceNote()` and
`formatPrice()`. No price copy anywhere hard-codes a VAT stance, so the day
registration completes this is a one-line change.

**To revisit:** as turnover approaches the threshold, or on an accountant's
advice. *(This entry records a commercial decision; it is not tax advice and was
not taken with professional input.)*

**Decided by:** the founder. **Recorded:** 2026-08-15.

---

## 2026-08-15 (superseded) — The school plan is flat, not per-seat

**Decision:** School billing moves from **£40 per teacher/year (Stripe quantity =
seats)** to a **single flat £299/year** price with no quantity. *(The flat part of
this was revised the same day — see the banded decision above. Everything below
about removing per-seat quantity still stands.)*

**Why:** flat pricing is what UK schools already trust — Tapestry's flat model is
the proof — and it removes the per-pupil/per-teacher creep that Seesaw is losing
teachers over. It also removes a whole class of billing friction: no seat counts
to reconcile, no mid-year proration when staff join or leave, no awkward
conversation when a school hires a TA.

**Consequences that follow (not incidental — these are the work):**

- `Subscription.seatLimit` and `School.seatLimit` stop governing billing. A school
  plan covers every teacher attached to the school.
- The **invoice / PO route stays** (most UK primaries cannot pay by recurring
  card) but bills the flat price — no seat quantity to agree first, which makes
  the PO simpler, not harder.
- `convertIndividualToSchoolSeat` loses its reason to exist as written: there is
  no individual subscription to pro-rate. A teacher joining a school is now just
  an attachment — their free plan is superseded by the school's. **No refund
  logic is needed because nobody on the free tier has paid anything.**

**Decided by:** the founder. **Recorded:** 2026-08-15.

---

## 2026-08-15 — Founding teachers are recorded permanently

**Decision:** Every account created **before launch day (1 Sept 2026)** is marked
a **Founding teacher** and keeps free, unlimited access permanently. The mark is
stored (`Teacher.foundingMember`), not inferred from a signup date.

**Why stored, not derived:** a promise you cannot identify the beneficiaries of is
a promise you will break. Deriving it from `createdAt` looks equivalent today and
quietly stops being so the first time rows are migrated, backfilled or imported.
This is the cheapest possible insurance on a promise made publicly to the people
who backed the product earliest.

**What it grants today:** under the two-tier model, free is already uncapped, so
the *practical* benefit is that a founding teacher is never moved onto a paid
teacher plan if one is ever introduced. The mark also identifies the pilot cohort
for the launch plan's testimonial and case-study asks.

**What it does not grant:** it is a *teacher* mark, not a school one. If a
founding teacher's school later buys the school plan, the school pays. The launch
plan's separate promise — **pilot schools get year one free** — is a distinct
commitment, tracked per school, and is not what this flag means.

**Open:** whether founding status survives a teacher moving schools. Current
answer is yes (it attaches to the person, who is who we made the promise to).

**Decided by:** the founder. **Recorded:** 2026-08-15.

---

## 2026-08-15 — Free accounts have no trial clock

**Decision:** A teacher account is never on a countdown. The 42-day trial
(`TRIAL_DAYS`) applies **only** to a school plan being evaluated before a PO is
raised. A free teacher account is `ACTIVE` from signup and never lapses to
`FROZEN` on its own.

**Why:** September adopters churn in October when a trial expires mid-term — the
single most avoidable failure mode for an autumn-term launch. A permanently free
tier keeps a teacher in until their school buys, which is the whole growth model.

**Safeguarding/retention consequence:** the `FROZEN` → 12-month deletion lifecycle
in [`RETENTION.md`](../RETENTION.md) now only ever begins for a **lapsed school
plan**. A free teacher's account is never frozen for non-payment, so children's
work in a free account is not on a deletion clock. This *narrows* the
circumstances in which data is deleted for billing reasons, so it needs no
retention-schedule change — but `RETENTION.md` must say so explicitly rather than
leaving a reader to infer it.

**Decided by:** the founder. **Recorded:** 2026-08-15.
