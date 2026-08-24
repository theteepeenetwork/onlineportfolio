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
| Parent reaction (a "like") | ✅ | ✅ | ✅ | ❌ | **REJECT** → positioning |
| Two-way parent messaging / DMs | ✅ | ✅ | ✅ | ⏳ | **BUILD (autumn)** — school-switched, office-hours only, text only, SAFEGUARDING rule 21 |
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
reaction that surfaces to the teacher (the payoff moment, no chat channel).
Translation for EAL families (serves parents, doesn't surveil children — fits the
brand). Framework/cohort tagging is *conditional* — build it only if we decide to
fight Tapestry for EYFS assessment; our launch targets Seesaw-fatigued KS1/KS2, so
it's a later wedge, not a launch gap.

**REJECT — parity that would betray the pitch.** Behaviour points (public
gamification of children, against our no-profiling safeguarding stance). Parent
reactions and likes. Public class feeds. **AI *theatre*** — per-pupil AI upsells,
auto-generated feedback on a child's work, anything that profiles children or runs
their data through a model. These are exactly the "drift" and "bloat" our
positioning attacks: adding them makes us the thing teachers are leaving.

> **Two-way messaging moved out of this bucket on 2026-08-24.** The verdict was
> right about **direct messaging**: an always-open channel between an adult and a
> teacher, which is what makes the competitors' version a workload problem for
> teachers and a safeguarding problem for schools. What was wrong was the
> assumption that a DM was the only available shape. A thread a school switches
> on, that cannot be sent outside office hours, that carries text alone, that no
> child can reach, and that a teacher can escalate to the safeguarding lead, is a
> different feature wearing a similar name. Governed by SAFEGUARDING rule 21,
> which was written before a line of it was built.

> **Replies to feedback, from either direction: rejected 2026-08-24.** A parent
> sees their child's approved work and that is the whole of it. A child sees the
> sticker and the note their teacher sent and sends nothing back. The reason is
> workload, not safeguarding. A reply is only free for the person sending it: a
> class of thirty replying to feedback is thirty more things a teacher has to
> open, and a school adopting StoryJar should not acquire an obligation it did not
> ask for. Same argument as DMs, one order of magnitude smaller and therefore much
> easier to add without noticing. A considered "respond to feedback" feature may
> earn its place later. A heart button does not.

**POSITIONING — limitations sold as virtues.** "No AI *fluff*, no bloat." "No
behaviour scores." "Messages that keep school hours." "UK-built, your data never leaves
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

1. **The calm one** — the work, the child who made it, and the people who care
   about them. In a market gamifying behaviour and upselling AI, "we capture the
   work, beautifully, and keep it private" is ownable.
2. **It's the child's jar, not the teacher's evidence file** — competitors are
   built around the adult observing the child; ours around the child making the
   work in their own space. The canvas and the approval-reward loop make that real.
3. **UK-first data trust** — a concrete reason a head or DPO picks us over Seesaw.

## "Why we don't have X" — scripts for when teachers ask

**"Can parents message me?"**
> Not today, and a parent's view stays a view. They see their child's approved
> work, which keeps a family close to what their child is making while your
> evenings stay yours. A school-governed message thread is designed and written
> up: your head would switch it on, it would run to your office hours, and it
> would hold anything sent outside them until the next morning. Text only, one
> thread per child, and anything about a child's welfare goes straight to your
> safeguarding lead. It ships when it is right rather than to hit a date.

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
