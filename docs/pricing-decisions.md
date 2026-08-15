# Pricing decision log — Storyjar

The written record of pricing and packaging decisions: what was decided, when,
and why. Companion to [`docs/dpo-decisions.md`](./dpo-decisions.md) — same
purpose, different hat. It exists so a future reader (or a customer asking "why
am I on this plan?") can see these were deliberate calls.

Market context and the launch reasoning live in [`LAUNCH_PLAN.md`](../LAUNCH_PLAN.md);
the competitive rationale in [`COMPETITIVE_POSITIONING.md`](../COMPETITIVE_POSITIONING.md).

---

## 2026-08-15 — Two tiers: free for a teacher, £299/yr flat for a school

**Decision:** Storyjar ships with **two** plans.

| Plan | Price | What it is |
|---|---|---|
| **Teacher** | **Free, permanently** | One teacher, **all of their own classes**. Capture, approval queue, parent sharing, export. No card, no trial clock. |
| **School** | **£299 / year, flat** | Everything above for every teacher in the school, plus admin oversight, staff continuity, year-end transfer, and the DPA with the school as data controller. |

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
instead of introducing Storyjar to their head for £299 — cannibalising the school
sale with exactly the users most likely to convert. With free now uncapped, the
plan also has nothing left to sell.

**Consequence for the pricing page:** two tiers, one sentence — "free for a
teacher, £299 a year for a school, every feature included." That is what makes
the launch plan's *one honest price* proof point true rather than aspirational.

**Decided by:** the founder. **Recorded:** 2026-08-15.

---

## 2026-08-15 — The school plan is flat, not per-seat

**Decision:** School billing moves from **£40 per teacher/year (Stripe quantity =
seats)** to a **single flat £299/year** price with no quantity.

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
