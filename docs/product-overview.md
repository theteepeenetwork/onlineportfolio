# StoryJar: what it is and what it does

The one-page orientation. Read this first for product context, then
[`README.md`](../README.md) for how the thing is built and run, and
[`COMPETITIVE_POSITIONING.md`](../COMPETITIVE_POSITIONING.md) for the market
argument. Written 19 August 2026, moved into the repo 24 August 2026 so that
every session, human or agent, works from the same page.

## One line

A UK primary school learning journal and digital portfolio for children aged 3
to 11, built by a solo founder. "A learning journal that grows up with the
child" is the protected line, and it is a product fact (three age modes), not an
adjective. See [`brand-and-copy.md`](./brand-and-copy.md).

## The idea

Every child has their own journal. The child makes the work, the teacher
approves each piece before it appears, and over the year the journal becomes a
dated, skill-tagged evidence base. The positioning follows from that: it is the
child's jar, not the teacher's evidence file. Competitors are built around an
adult observing a child.

## Audience

Primary schools in England. EYFS, KS1 and KS2 are English statutory stages, so
the product is England-shaped rather than UK-wide. Individual teachers get a
permanently free tier. Parents get read-only access to approved work.

## What a child can do

Four capture routes, all one tap: photo (camera or upload), voice note, typed
own words, and a drawing on a full-screen canvas. The canvas is the
differentiator: tools rising from the bottom edge, text boxes, rainbow colour
slider, brush sizes, undo and redo, a multi-page filmstrip, and a ＋ button that
drops photos, PDFs and shapes in as movable, resizable, rotatable, grid-snapping
objects with fill and line colours and labels locked inside the shape.

Children sign in with a class code then tap their name. No child passwords, no
child email addresses.

## What a teacher can do

Multiple classes with codes and pasteable rosters (see
[`admin-billing-and-import.md`](./admin-billing-and-import.md)). Reusable
activity templates, canvas-drawn or uploaded as PDF and picture worksheets. A
maths kit on the template canvas: number lines, arrows, jump arrows, braces,
base 10, place value counters, ten frames, hundred squares, arrays, fractions
and a clock face, with apparatus markable as "endless". Assign a template as a
run, to a whole class or to chosen children, reassign it to other classes or
next year, past responses kept. An approval queue: approve and publish with
skill tags, or send back with a note. Add work on a child's behalf. A per-child
timeline, a needs-attention strip and a per-run response grid.

## Age modes

EYFS, KS1 and KS2. NULL falls back to EYFS as the most protective default. EYFS
gets an icon-only pre-reader home. The copy for each register is
[`AGE_MODE_COPY.md`](./AGE_MODE_COPY.md).

## Pricing

Teacher free permanently. School £199 to £649 a year, banded by pupils on roll
(105, 210, 420, above). Every feature in every band, band fixed for the year.
A 42-day trial for schools only. Not VAT registered. Pre-1-September signups are
stamped `foundingMember`. The reasoning is
[`pricing-decisions.md`](./pricing-decisions.md); the code is
`src/lib/billing-plans.ts`.

## Deliberately excluded

Two-way parent messaging, behaviour points, public class feeds, and any AI that
touches children's work or data. Parents can send a heart, and that is the whole
channel. AI is welcome only on teacher-authored content that saves prep time
with the teacher in control, the flagship being worksheet PDF to draft quiz.
The internal line: AI that does your prep, not AI that watches your kids. What
that connector can and cannot reach is [`claude-connector.md`](./claude-connector.md).

## Build queue

Video, which is the number one switcher ask. A light from-home reaction.
Translation for EAL families. Framework tagging (Development Matters, Birth to 5
Matters, National Curriculum) and cohort monitoring are conditional on choosing
to fight Tapestry for EYFS assessment.

## Competitors, honestly

Seesaw is the fair whole-school comparator, around £1,700 a year at 300 pupils.
Tapestry is banded across roughly 15 tiers and is usually bought EYFS-only, so
comparing whole-school StoryJar against it flatters us. ClassDojo is the
behaviour-points player. The strategy is a shorter feature list held with
conviction rather than parity. Hosting is Amsterdam, so the honest claim is
"never leaves Europe", not "stays in the UK".

## Stack

Next.js 16 and TypeScript, Prisma with SQLite, Tailwind, Railway, Stripe (hosted
Checkout and Customer Portal, no child data ever sent to Stripe). Account states
TRIAL, ACTIVE and PAST_DUE are writable, FROZEN is read-only, all gated by
`requireWritableAccount()`. A free plan can never freeze, which is what keeps
children's work in a free account off the retention clock in
[`RETENTION.md`](../RETENTION.md).
