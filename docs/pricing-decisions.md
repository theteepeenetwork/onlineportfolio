# Pricing decision log — Storyjar

The written record of pricing and packaging decisions: what was decided, when,
and why. Companion to [`docs/dpo-decisions.md`](./dpo-decisions.md) — same
purpose, different hat. It exists so a future reader (or a customer asking "why
am I on this plan?") can see these were deliberate calls.

Market context and the launch reasoning live in [`LAUNCH_PLAN.md`](../LAUNCH_PLAN.md);
the competitive rationale in [`COMPETITIVE_POSITIONING.md`](../COMPETITIVE_POSITIONING.md).

---

## 2026-08-15 — Two tiers: free for a teacher, a paid plan for a school

**Decision:** Storyjar ships with **two** plans.

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
Storyjar the school's system of record rather than a teacher's private tool. That
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
instead of introducing Storyjar to their head — cannibalising the school
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
Comparing whole-school Storyjar to EYFS-only Tapestry flatters us and a sharp
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

**Decision:** Storyjar is **not VAT registered** (taxable turnover is far below
the £90,000 threshold — at £199–£649 a school that is well over 150 schools away).
Published prices are therefore simply the price, and **no surface may show
"+ VAT" or "ex VAT"** — implying VAT is charged when you are not registered is not
permitted.

**Why not register voluntarily:** input VAT on Storyjar's costs (hosting, domain,
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
