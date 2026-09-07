# StoryJar — competitive positioning & feature verdicts

> Working strategy note, drafted 2026-07-19. Purpose: decide which competitor
> features to **build**, which to **reject on purpose**, and which are
> **positioning** (a limitation we sell as a virtue). The thesis: our edge is a
> *shorter* feature list held with conviction, not parity. Half of what
> competitors ship is the bloat teachers are tired of. Market context and pricing
> per [`LAUNCH_PLAN.md`](./LAUNCH_PLAN.md).

## Feature matrix

Legend — ✅ has it · ⚠️ partial/weak · ❌ none. Verdict is StoryJar's call.

| Feature | Seesaw | Tapestry | ClassDojo | StoryJar today | Verdict |
|---|---|---|---|---|---|
| Photo capture | ✅ | ✅ | ✅ | ✅ | Table stakes — have it |
| Child-led drawing canvas | ⚠️ | ⚠️ | ⚠️ | ✅ **(our strength)** | Differentiator — deepen |
| Voice / audio | ✅ | ✅ | ✅ | ✅ (just shipped) | Table stakes — have it |
| Video | ✅ | ✅ | ✅ | ❌ | **BUILD** (post-launch; #1 ask) |
| Typed words / notes | ✅ | ✅ | ✅ | ✅ | Table stakes — have it |
| Parent views approved work | ✅ | ✅ | ✅ | ✅ (read-only) | Table stakes — have it |
| Parent reaction (a "like") | ✅ | ✅ | ✅ | ❌ | **BUILD** (light: "❤️ from home" → teacher) |
| Two-way parent messaging / DMs | ✅ | ✅ | ✅ | ✅ *held to school-set office hours* | **BUILT, on our terms** (2026-09-07; was REJECT — see below) |
| Behaviour points / rewards | ❌ | ❌ | ✅ | ❌ | **REJECT** → positioning |
| Public whole-class feed | ✅ | ⚠️ | ✅ | ❌ | **REJECT** → positioning |
| AI — per-pupil upsell / auto-feedback on kids' work | ✅ | ⚠️ | ⚠️ | ❌ | **REJECT** the fluff → positioning |
| AI — teacher prep (e.g. worksheet PDF → multi-page quiz) | ⚠️ | ❌ | ❌ | ❌ | **BUILD** — our *considered* AI, no child data |
| Framework tagging (Dev Matters / B25M / NC) | ⚠️ | ✅ **(their moat)** | ❌ | ⚠️ (generic skill tags) | **LATER** — only if we chase EYFS |
| Cohort monitoring / "areas of concern" | ✅ | ✅ | ❌ | ❌ | **LATER** — pairs with framework tagging |
| Translation for EAL families | ✅ (101 langs) | ⚠️ | ✅ | ❌ | **BUILD** (post-launch; on-brand — serves families) |
| Approval queue before publish | ✅ | ✅ | ✅ | ✅ | Table stakes — have it |
| Activities / assignable templates | ✅ | ✅ | ⚠️ | ✅ | Table stakes — have it |
| Export / data portability out | ⚠️ | ✅ | ⚠️ | ✅ | Trust feature — keep loud |
| European-hosted, UK-GDPR, no child data to 3rd parties | ❌ (US) | ✅ | ❌ (US) | ✅ (Amsterdam) | **Positioning** — wedge vs Seesaw/Dojo |
| Free teacher tier | ✅ | ❌ | ✅ | ✅ (planned) | Growth engine — keep |

## The three verdict buckets

**BUILD — gaps that make the core loop work.** Video (the first thing a switcher
asks for; audio covers pre-readers for launch, video is next). A single from-home
reaction that surfaces to the teacher (the payoff moment).
Translation for EAL families (serves parents, doesn't surveil children — fits the
brand). Framework/cohort tagging is *conditional* — build it only if we decide to
fight Tapestry for EYFS assessment; our launch targets Seesaw-fatigued KS1/KS2, so
it's a later wedge, not a launch gap.

**REJECT — parity that would betray the pitch.** Behaviour points (public
gamification of children — against our no-profiling safeguarding stance). Public
class feeds.

> **Messaging, reversed on 2026-09-07 — and why that is not a betrayal.** This
> document rejected two-way messaging on two grounds: scope creep and "an adult
> in a child's space". What shipped answers both structurally rather than by
> absence. **The school, not the teacher, sets office hours inside StoryJar's caps
> (at most ten hours a day, 06:00–20:00), and nothing is delivered outside them in
> either direction** — a parent writing at 21:40 is told it reaches the teacher at
> 8:00am, and a teacher replying at 22:00 is held the same way, so "your evenings
> stay yours" is now enforced rather than promised. **No child can read or write a
> message, and nothing from a conversation appears in the jar**, so it is not an
> adult in the child's space; it is two adults in a room the child is not in. It
> is off by default, school-plan only, text only, closable by the school, and the
> parent can always see which staff can read it. The commercial reason is the one
> `docs/pricing-decisions.md` already gave for the school tier — it sells
> *oversight* — and this is the first feature that makes that concrete. Recorded
> in `SAFEGUARDING.md` (rule 21 and the amendment) and `docs/DPIA.md` (R18). **AI *theatre*** — per-pupil AI upsells, auto-generated
feedback on a child's work, anything that profiles children or runs their data
through a model. These are exactly the "drift" and "bloat" our positioning attacks
— adding them makes us the thing teachers are leaving.

**POSITIONING — limitations sold as virtues.** "No AI *fluff*, no bloat." "No
behaviour scores." "Messages only in school hours — the school sets them, not the
app." "UK-built, your data never leaves
Europe, and no child data ever goes to a payment processor." Our safeguarding rules
are a product *philosophy*, not just compliance — say so out loud.

> **Say Europe, not the UK.** StoryJar is hosted in Amsterdam (Railway has no UK
> region). "Your data stays in the UK" was in this document and it was wrong. The
> honest line is just as strong against the US incumbents: *your data never leaves
> Europe.* Say where the data **is**, not where it isn't — a claim about where it
> never goes is one you'd have to caveat, since Railway is US-incorporated and may
> support the service from outside the EEA. A business manager who checks and finds
> we overstated it costs us far more than the word "Europe" ever will.

## Where AI fits — and where it doesn't

We are **not** anti-AI; we are anti-*unconsidered* AI. Most competitor AI is
fluff bolted on to justify a price rise. Ours earns its place by one test: **does
it remove drudgery from the teacher's prep, without ever touching a child's data
or judgement?** If yes, build it. If it watches, scores, or auto-marks children,
reject it.

The line, concretely:

- **AI is welcome when it** acts on *teacher-authored* content (a worksheet, a
  text, instructions), *saves the teacher real prep time*, and *keeps the teacher
  in control* — nothing an AI produces reaches a child until the teacher has
  reviewed it. Flagship example: a teacher uploads a comprehension PDF and AI
  drafts a multi-page quiz they can edit — a natural extension of the activities
  builder, which already stores quizzes (`quizJson`).
- **AI is refused when it** processes children's work or data, auto-marks or
  auto-comments on a child, profiles or ranks children, or shows up as a per-pupil
  upsell. That is the drift we're differentiating against.

Compliance note: any AI provider is a **sub-processor** and needs a line in the
sub-processors page + DPA, and the feature must clear
[`SAFEGUARDING.md`](./SAFEGUARDING.md) before it ships. Keeping AI on
teacher-authored inputs (never child data) is what keeps that review short.

The messaging stays consistent with the launch plan's "no AI *push*" — the promise
is no upsell and no fluff, **not** no intelligence. Better slogan than "no AI":
**"AI that does your prep, not AI that watches your kids."**

## The differentiation, in one line each

1. **The calm one** — no points, no feeds, no AI, and the only parent channel
   your staff cannot be reached through at 10pm. In a market gamifying behaviour
   and upselling AI, "we just capture the work, beautifully, and keep it private"
   is ownable.
2. **It's the child's jar, not the teacher's evidence file** — competitors are
   built around the adult observing the child; ours around the child making the
   work in their own space. The canvas and the approval-reward loop make that real.
3. **UK-first data trust** — a concrete reason a head or DPO picks us over Seesaw.

## "Why we don't have X" — scripts for when teachers ask

**"Can parents message me?"**
> Only in school hours — and your school sets those, not you and not the app.
> A parent who writes at nine at night is told their message reaches you when
> the school opens; if you reply at ten, it's held the same way. So yes, families
> can message you, and no, your evenings don't change. It's off until your school
> switches it on, it never shows a child anything, and there are no attachments —
> a child's journal stays about the child's work. On the free plan there's no
> school to set the hours, so there's no messaging; that's the school-plan
> conversation.

**"Does it have behaviour points / dojo points?"**
> No. We don't score or rank children, publicly or privately — our safeguarding
> rules forbid profiling children, and we think a learning journal should celebrate
> what a child made, not tally their behaviour.

**"Is there AI / does it write feedback for me?"**
> AI where it does real work for you, never where it watches your class. It won't
> auto-mark children, score them, or arrive as a per-pupil add-on to pay for. Where
> it *does* help: drop in a worksheet or comprehension text and it drafts a quiz you
> can edit — prep done in seconds, and nothing reaches a child until you've
> approved it. AI that does your prep, not AI that watches your kids.

**"Where's our data stored?"**
> In Europe — Amsterdam, in the EU. StoryJar is UK-built and UK-GDPR-first, your
> children's data never leaves Europe, deletion is real (rows *and* files), and no
> child's data ever touches our payment processor. We publish a plain-English
> privacy notice, a sub-processor list, and a DPA your DPO can read in five minutes.

**"Can it do video?"** *(honest, for now)*
> Voice is in today — a child can record themselves explaining their thinking,
> which matters most for younger children. Video is on the near-term roadmap.

## The through-line

Our competitive edge is **subtraction and trust**. Close video and a from-home
reaction because they make the core capture-and-share loop fire; reject the rest
loudly, because rejecting it *is* the product.
