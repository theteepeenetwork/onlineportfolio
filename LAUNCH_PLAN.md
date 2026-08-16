# StoryJar Launch Plan — September 2026

> **Revised 15 August 2026.** Three things changed: pricing is decided and shipped
> (free teacher tier + banded school plan); the Tapestry claim this plan was built
> on turned out to be factually wrong; and the July timeline has been rewritten for
> the 17 days actually left. The original Phase 1 dates are gone — they passed.

**Goal:** Convert Seesaw-fatigued UK teachers into StoryJar users for the autumn
term (starts ~Tue 1 Sept 2026, pupils in by 2–3 Sept).
**Wedge:** Individual teachers, bottom-up. **Budget:** £0–500, solo.
**Product status:** Beta. Feature-frozen as of 15 Aug — nothing new before launch.

---

## 1. Positioning

**One-liner:** *StoryJar — the simple way to capture children's learning. No AI
push, no bloat, no per-pupil price creep. Just photos, voices and work, shared with
parents in seconds.*

### Market context (re-checked 15 Aug 2026 — the July version of this section was wrong)

**Seesaw** does not publish prices at all. Every tier ends in "Talk to Sales". Its
three tiers are **Seesaw LMS**, **Instruction & Insights**, and **Seesaw + AI** —
AI is bundled into the premium tiers, and a school reaching for basic capture is
routed through an AI-led ladder. *That is publicly verifiable and it is the drift
argument, in Seesaw's own words.* Lead with it.

> The "~$7/student/year plus $0.85 for AI" figure in the July version of this plan
> was a consortium rate heard second-hand. It cannot be verified from any public
> source. **Do not put it on the landing page or in the comparison table.** Use it
> privately for sizing only, and say "schools tell us they pay four figures" rather
> than quoting a number you can't stand behind.

**Tapestry** is **not** flat-priced — the July claim that it proved "UK schools
respond to simple flat pricing" was simply incorrect. It is banded across roughly
fifteen tiers by child count: £164 for 40 children, £290 for 90, £900 for 300,
£1,200 for 400 (tapestry.info/pricing, checked 15 Aug 2026). What Tapestry actually
proves is that **UK schools happily buy size-banded pricing** — which is why our
school plan is banded too.

**The honesty rule for every comparison we publish:** Tapestry is usually bought
for **EYFS only**, so its £164 often covers a Reception cohort, not a school.
Comparing whole-school StoryJar against EYFS-only Tapestry flatters us and a sharp
business manager will catch it. **Seesaw is the honest whole-school comparator.**
Use Tapestry only for the "simple, no per-pupil metering" point.

**The angle:** don't attack Seesaw's size, attack its *drift*. "Remember when
Seesaw just let you record learning? That's all StoryJar does — brilliantly."

Three proof points to repeat everywhere: capture in under 10 seconds; parents see
work without app friction; one honest price, every feature in every band.

## 2. Pricing — decided and shipped

| Plan | Price | What it is |
|---|---|---|
| **Teacher** | **Free, permanently** | One teacher, **all of their own classes**. No card, no trial clock. |
| **School** | **£199** up to 105 pupils · **£299** up to 210 · **£449** up to 420 · **£649** over 420 | Everything above for every teacher, plus leadership oversight, staff continuity, year-end transfer, and the DPA naming the school as controller. |

Three rules make banding compatible with "no price creep", and breaking any one
breaks the promise: the band is set **once at purchase** from the published roll;
it is **fixed for the paid year** (growing mid-year costs nothing); and **every
feature is in every band** — the band buys capacity, never functionality.

- **No VAT.** StoryJar is not VAT registered, so the price is the price. Never
  write "+ VAT" or "ex VAT" anywhere. Note that Tapestry quotes ex-VAT, so restate
  their figures inclusive before comparing.
- **The paid Individual plan is retired.** A cheap personal plan let the most
  engaged teachers pay £40 instead of introducing us to their head.
- **Founding teachers** — everyone who signs up before 1 Sept keeps free unlimited
  access permanently, and is recorded (`Teacher.foundingMember`) so the promise is
  keepable. Pilot *schools* get year one free; that is a separate promise, tracked
  per school.

Full reasoning: [`docs/pricing-decisions.md`](docs/pricing-decisions.md).

## 3. Timeline — 17 days

### Where we actually are (15 Aug)

**Done:** the product. Capture (photo/video-less/audio/note/drawing), three age
registers including EYFS, activities, approval queue, parent view, export, free
tier and banded school pricing — all on `main`, full test battery green.

**Not done and blocking:** the four Stripe prices don't exist, so **the school plan
cannot currently be bought**. Compliance pages are still marked "Draft". No DPIA.
ICO registration unconfirmed. No pilot teachers recruited. Landing page still
describes the old product and the old price.

### Phase A — unblock selling (now → Wed 20 Aug)

Nothing here is optional; all of it gates a school being able to say yes.

- **Create the four Stripe prices** and set the env vars. One hour. Without this
  there is no revenue path at all.
- **Compliance, in this order:** privacy notice, terms and DPA out of "Draft";
  plain-English retention summary; "where is your data stored" page; DPIA on file;
  confirm ICO registration. A single DPO rejection story in a Facebook group can
  stall adoption for the whole term — this is the highest-leverage work left.
- **Landing page** rebuilt on *"Seesaw got complicated. StoryJar didn't."*, with the
  new pricing table and a **"Switching from Seesaw?"** page (comparison, cost
  calculator, migration notes). Best long-term SEO asset you'll build.

### Phase B — pilots and drumbeat (Thu 21 → Sun 31 Aug)

Teachers plan their September setup in late August. This is the decision window.

- **Recruit 10–15 pilot teachers** from your existing following — personal DMs, not
  a broadcast. Free school tier for year one in exchange for feedback and a
  quotable testimonial by 31 Aug. Start this the day the compliance pages are up.
- **Content, 3–4 posts/week:** classroom-ready capture ideas, "Seesaw vs StoryJar
  in 30 seconds" screen recordings, honest build-in-public posts ("why I'm not
  adding AI"). Short video outperforms everything else with teachers.
- **Communities — useful first, StoryJar second:** UK primary teacher Facebook
  groups, r/TeachingUK, TES forums, eyfs.info, #edutwitter, teacher TikTok. One
  genuinely helpful post per community per week.
- **Email list:** "Get the September setup guide" capture, and ship the free
  *Evidence-capture setup checklist for September* PDF — useful whatever tool they
  pick, StoryJar-branded.
- **Paid (optional, £150–300):** small Facebook/Instagram test, 24–31 Aug only,
  driving to the switcher page. Kill it above ~£5 per signup.

### Phase C — launch window (Tue 1 → Sat 20 Sept)

- **Launch day (Tue 1 or Wed 2 Sept):** coordinated push across all channels,
  pilot teachers posting the same day, email to the list, personal DMs to everyone
  who engaged in August.
- **Weeks 1–2:** daily quick-win content; reply to every comment and DM within
  hours. Responsiveness is a feature Seesaw structurally cannot match.
- **Onboarding obsession:** watch every signup's first session. First-week goal —
  5+ captures and one parent share. That's the activation metric.
- **Ask for the school conversation early:** any teacher active two weeks gets a
  personal note offering a one-pager for their head. Write that one-pager (cost
  comparison front and centre, honest sources only).

### Phase D — convert and compound (21 Sept → half term)

- Follow up every active teacher; October–November is when schools review annual
  subscriptions.
- Publish 2–3 SEO articles: "Seesaw alternatives UK 2026", "What does Seesaw
  actually cost a primary school?", "Simple learning journals for EYFS".
- Monthly "StoryJar in the classroom" email. Ask happy users for reviews on EdTech
  Impact and Capterra UK, where switchers research.

## 4. Budget (£500 max)

Domain/hosting/email ~£100 · optional paid social £150–300 · design and screen
recording ~£50 · reserve £50–200. Everything else is time: ~15 hrs/week to 1 Sept,
~15 hrs/week through the launch fortnight.

## 5. Metrics

Revised down from the July targets, which assumed a Phase 1 that didn't happen.

- **By 31 Aug:** 10 pilot teachers active · 100+ email signups · landing page live
  with at least two testimonials · compliance pages published.
- **By 20 Sept:** 100 teacher signups · 40% activated (5 captures + 1 parent share
  in week one).
- **By half term:** 250 teachers · 5 school conversions · 3 case studies.

If activation is under 25%, stop marketing and fix onboarding. With a free tier,
retention is the whole game.

## 6. Risks

- **Compliance not finished in time.** Now the biggest risk, because it blocks the
  school sale rather than the teacher signup. Mitigation: Phase A does nothing else
  until it's done.
- **No pilots, no proof.** Two weeks of recruitment lost to the summer. Launching
  with zero testimonials is survivable; launching with zero *users* is not.
  Mitigation: DM ten people this week, before the landing page is perfect.
- **Beta isn't ready:** launch anyway with the narrow feature set. "Simple" is the
  pitch, so a small surface area is on-brand. **Do not slip past 1 Sept** — the
  window shuts within days.
- **Seesaw switching costs:** teachers fear losing history. Offer the "fresh start
  for a new year" frame in September, and promise easy export *out* of StoryJar.
  Trust cuts both ways.
- **Free tier never converts.** A twelve-teacher primary could run entirely free.
  The counterweight is the DPA/controller relationship, not a feature lock. If
  conversion is poor by November, strengthen what a *school* needs — never cap a
  teacher's classes.
- **Solo bandwidth.** The plan front-loads asset creation so September is
  responsive work, not production work.
