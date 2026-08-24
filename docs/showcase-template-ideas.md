# Showcase templates for StoryJar

Fifteen activity templates, five each for EYFS, KS1 and KS2, written from a
teacher's point of view and checked against what the canvas can do today.

They are aimed at demos and pilot recruitment: the ones you open in front of a
head teacher or a prospective pilot teacher. Every one of them is also a real
activity a teacher could assign, because a demo that a teacher can picture
using on Monday is the one that converts.

Draft for review, 19 August 2026. Nothing here is built yet. Once you pick, each
becomes an entry in `content/shared-activities/index.json` and publishes through
`scripts/ops/publish-shared-activities.mjs`.

---

## What the canvas actually gives us to show off

Worth naming, because most of these ideas are built from the same six moves and
it helps to see the palette before the recipes.

**Locked and unlocked objects.** A teacher places pictures, shapes and text on
the template and sets a padlock per object. Locked objects are the worksheet.
Unlocked objects are the answer: the child picks them up and moves them. This is
the single most under-appreciated thing in the product and it turns a static
worksheet into a manipulable one with one tap in the builder.

**Infinite sources.** Mark a counter, a base 10 rod or a jump arrow as endless
and the child drags off as many copies as they need, straight from the page. The
original stays put. This is how the physical apparatus behaves on a classroom
table, and it means a child never opens a palette or reads a menu.

There is a useful difference between the two. A piece the teacher placed and left
unlocked is move-only in a child's hands, so a word card lands where the child
puts it and keeps its size. A piece a child pulls off an endless source becomes
their own object, fully resizable and deletable. Worth knowing when you decide
which mechanic an activity wants: sorting wants unlocked cards, building wants an
endless source.

**The maths kit.** Around thirty buttons on the template builder: number lines,
double-headed and jump arrows, braces, base 10 ones, rods, flats and thousand
cubes, colour-coded place value counters, ten frames, double ten frames, hundred
squares, arrays, fraction bars, fraction circles, fraction rings and a clock face
with numerals. A teacher builds with these. A child receives them already on the
page.

**The quiz layer.** Floating multiple choice boxes that sit on top of the canvas
and stay interactive rather than being flattened into the picture. Two to four
options each, and an option can be a picture rather than words, which is what
makes it usable below reading age. Marked automatically, and it lives happily on
the same page as drawn working.

**Multi-page.** A template can carry several pages in a filmstrip. The child moves
between them and hands the whole set in as one piece of work. Template pages stay
put, so a child keeps the structure the teacher gave them.

**Four capture routes.** Photo, voice note, own typed words and drawing. Voice is
the one that surprises people in a demo, because it turns "explain your method"
into something a seven-year-old will actually do.

**Approval and skill tags.** Everything below ends in the teacher's queue, gets a
tag, and lands in the child's journal with a date on it. That is the part that
makes the year add up to something.

---

## How they will look

The visual side is specified separately in `docs/template-design-sheet.html`, which
carries the house palette, the eight furniture components drawn at real canvas scale,
three fully dressed template mockups and the scaffolding ladder.

**This is a house style for the activities StoryJar publishes.** It keeps our own
library coherent, the way a publisher's books look like each other. It is not a scheme
for schools. Schools have their own systems for scaffolding, challenge levels and
success criteria, built over years and shared with parents, and ours would conflict
with theirs rather than help. So the meanings live in that document and never in the
product: no legend, no tooltip, no recommended colour, and a teacher who copies a
library activity gets a full editable copy to recolour however their school works.

The short version of the house style:

**Colour is used consistently rather than decoratively.** One colour, one job, across
everything we author. Honey tint is a hint a child may take. Glass light is a reminder
of something already learned. Kraft tag is words they may borrow. Jam is their turn.
Cream is empty space to fill. Ink is everything the teacher fixed in place.

**The apparatus colours are spoken for.** Blue ones, teal tens, honey hundreds, jam
thousands. Template furniture uses the tints and never the solids, so a hint box can
never be mistaken for a counter.

**Eight reusable parts.** Hint box, learning reminder, word bank, step markers,
apparatus tray, work zone, speech prompt, success strip. Every one is a locked rounded
rectangle plus locked text in `objectsJson`, so a template that looks designed costs the
same to build as one that does not.

**Constants, decided once.** Ink outline at stroke width 4, corner radius 18, body text
20 to 21 units, box padding 22, page margin 30. Support along the top, the thing being
worked on in the middle, tools and words along the bottom where hands rest.

**Every text pairing hits WCAG AA.** Checked, with the numbers on the sheet. The one
exception is white on kraft twine at 3.42, which is large text only, so kraft twine is
used for borders rather than body copy.

**Instructions are written to be read by a child, or read aloud to one.** Verb first,
one action per line, eight words or fewer for EYFS and KS1, twelve for KS2, speaking to
one child rather than to a class.

**Scaffolding is visible and fades.** Each template can publish three times: full
support with a worked example, partial with the rule and the word bank, and open with a
prompt and space. A teacher assigns the rung the group needs, and one piece of design
work yields three library entries.

---

## EYFS

Age mode EYFS gets the icon-only home, so the rule for this band is that nothing
in the activity requires reading. Every template here works if the child never
reads a word, with the adult reading the instruction aloud at the point of
setting it going.

Worth noting while these are being built: the read-aloud button exists today on
the teacher's send-back note and nowhere else. Extending it to activity
instructions would make this whole band self-serve, and it is a small piece of
work next to the value it unlocks for Reception.

### 1. Where does it live?

**Shows:** locked and unlocked objects, drag-to-sort, picture-only working.

Two big locked rings sit on the page, one with a farm picture, one with a sea
picture. Around the edge, eight unlocked animal pictures. The child drags each
animal into the right hoop, then taps the microphone and says why.

It looks like the sorting hoops already on the carpet, and that is the point. In
a demo, drag one animal with your finger and watch the room understand what
"unlocked object" means in a second and a half.

**Build cost:** ten small SVGs plus an objects payload. No new code.

### 2. Trace it, then make it yours

**Shows:** brush sizes, rainbow colour slider, undo and redo, drawing over a
locked layer.

The week's letter or number sits huge and pale in the middle of the page, locked
so it cannot be nudged. The child traces it with the fat brush, then fills the
rest of the page with things that start with that sound.

The demo line is the rainbow slider. Hand the iPad to whoever is watching and let
them drag it. It is the moment people stop evaluating and start playing.

**Build cost:** one text object per letter, or one SVG for a set. Trivial.

### 3. How I am today

**Shows:** the quiz layer with picture options, and voice on the same page.

One question: "How are you feeling today?" with four faces as the options, no
words. The child taps a face, then records a few seconds saying why.

Assign it as a run that stays live, and a class has a term of mood check-ins with
dates on them, all sitting in individual journals rather than a shared feed. Say
that part out loud in the demo, because it is a pastoral story as much as a
teaching one.

**Build cost:** four face SVGs plus a one-question quiz payload. Small.

### 4. Feed the teddy: ten frame

**Shows:** infinite sources, the ten frame, maths apparatus in the hands of a
child who has no maths palette.

A locked ten frame fills the page. Beside it, one counter marked endless. The
child drags out counters to match the number of berries in the picture, and can
take as many as they need because the source never runs out.

This is the best answer to "is this just a drawing app". A four-year-old is doing
manipulative maths with one finger and no menus.

**Build cost:** pure objects payload, no artwork needed beyond the picture prompt.
Cheapest strong template on the list.

### 5. Our welly walk

**Shows:** photo capture, voice notes, and what the timeline looks like after a
term.

Take a photograph of one thing you found outside. Tell us where you found it.

Deliberately plain, and it earns its place because it is the one you assign in
the demo, then flick to a seeded journal showing the same activity run in
September, January and June. The child's own handwriting and voice, three points
in a year, one page. That is the product in one screen.

**Build cost:** instructions only. Assign it to the demo class and seed three
past responses.

---

## KS1

### 6. Number line hops

**Shows:** the number line group, jump arrows as an infinite source, working shown
rather than written.

A locked number line from 0 to 20 runs across the page with its ticks labelled.
One jump arrow sits below it, marked endless. The child drags hops onto the line
to show 8 add 5, and can label each hop with the canvas text tool if they are
ready for that.

The maths lead in the room will ask whether the hops can be different widths.
They can, because the child resizes them, and that is worth demonstrating rather
than saying.

**Build cost:** objects payload only. No artwork.

### 7. Build me two hundred and forty seven

**Shows:** base 10 and colour-coded place value counters, aspect-locked apparatus,
three infinite sources at once.

A locked place value chart with hundreds, tens and ones columns. Below it, one
hundred flat, one ten rod and one unit cube, each marked endless. The child builds
the number, then records a voice note reading it aloud.

The apparatus keeps its proportions when a child resizes it, so a hundred flat is
always ten rods wide. Point that out. It is the sort of detail that tells a
maths lead the product was built by somebody who has taught.

**Build cost:** objects payload only.

### 8. Story mountain in three pages

**Shows:** the multi-page filmstrip, drawing and typing on the same piece of work,
template pages the child keeps.

Three pages: beginning, middle, end. Each carries a locked prompt and a locked
speech bubble waiting to be filled. The child draws each part and types or
dictates a sentence underneath.

One piece of work, three pages, handed in together and approved as one. For a
Year 1 teacher this is a whole literacy sequence in a single assignment.

**Build cost:** three-page objects payload. No artwork.

### 9. Label the minibeast

**Shows:** a photograph used as a locked object, arrows, and unlocked text labels
the child moves.

A large photograph of a beetle sits locked in the centre with five locked arrows
pointing at head, thorax, abdomen, legs and antennae. Five unlocked word cards sit
along the bottom. The child drags each word to its arrow.

Then flip to the teacher view and show the approval queue marking it against a
science tag. Sorting activity in, evidence out.

**Build cost:** one photograph plus an objects payload. Small.

### 10. What time do we do that?

**Shows:** the clock face, four apparatus pieces on one page, drawing as the
answer.

Four locked clock faces with numerals, each captioned with a moment in the school
day: register, playtime, lunch, home time. The child draws the hands on each.

Simple, familiar, and the clock face renders properly rather than being a picture
of a clock, which is worth saying to anybody who has fought a worksheet generator.

**Build cost:** objects payload only.

---

## KS2

### 11. The fraction wall detective

**Shows:** fraction bars, and the quiz layer sharing a page with drawn working.

A fraction wall built from locked bars in halves, quarters and eighths, stacked
and aligned. Two quiz questions float beside it asking which fractions are
equivalent. The child shades the wall with the highlighter to prove it, then
answers.

The pitch: the multiple choice is marked for you, and the reasoning is right there
underneath it in the child's own hand. Auto-marking and evidence, on one page,
which most products make you choose between.

**Build cost:** objects payload plus a two-question quiz. No artwork.

### 12. Explain your method

**Shows:** voice notes as mathematical reasoning, and the send-back loop.

One long division question, locked, filling the top third of the page. The child
works it out on the canvas, then records themselves explaining what they did.

In the demo, send one back with the note "tell me why you exchanged there" and
show the child's screen with the teacher's note on it, and its own listen button.
The send-back loop is a strong feature and it is invisible until somebody shows
it to you.

**Build cost:** trivial. One page, one locked text object.

### 13. Sort the arguments

**Shows:** unlocked cards as a thinking tool, plus typing, for a subject that is
not maths.

Two locked columns headed "for" and "against" on a question the class is debating.
Twelve unlocked statement cards below. The child sorts them, then types a
conclusion in their own words at the bottom.

This one matters in a demo because it breaks the assumption that a canvas product
is for art and early maths. Same six mechanics, Year 6 humanities.

**Build cost:** objects payload only. Reskinnable for any topic, so publish it
twice with different statements and it reads as two activities.

### 14. Design a Roman shield, then defend it

**Shows:** two pages doing two different jobs, symmetry with a locked guide, and
what a finished art page looks like in a journal.

Page one: a locked shield outline with a centre line down the middle, and the
child draws a symmetrical design. Page two: a locked prompt asking them to explain
their colour and symbol choices in writing.

The showpiece screenshot for the website probably comes from this one.

**Build cost:** one shield SVG plus a small objects payload.

### 15. Rounding rollercoaster

**Shows:** braces, double-headed arrows, and apparatus used to make a rule visible.

A locked number line from 200 to 300 with a brace under it and its midpoint
marked. Five unlocked number cards sit above. The child drops each one onto the
line and rounds it, then uses the highlighter to show which way it fell.

Pairs naturally with a quiz box asking for the rounded answers, so you can show a
teacher the same activity with and without auto-marking and let them choose.

**Build cost:** objects payload only.

---

## A ten minute demo running order

If the fifteen become a library, these five in this order tell the whole story
without anybody having to be told it.

1. **Feed the teddy** (EYFS). Drag one counter. Nobody expected apparatus.
2. **Number line hops** (KS1). Same mechanic, real maths, endless source.
3. **The fraction wall detective** (KS2). Auto-marked and hand-worked together.
4. **Explain your method** (KS2). Play a child's voice note. Send it back.
5. **Our welly walk** (EYFS). The journal in September, January and June.

Then the approval queue, and stop talking.

---

## What to build first

If the answer is five rather than fifteen, build the ones with no artwork
dependency and the loudest demo moment: **Feed the teddy**, **Number line hops**,
**Build me two hundred and forty seven**, **The fraction wall detective** and
**Explain your method**. All five are pure objects and quiz payloads in the
manifest, which means they are a JSON change and a publish, and the whole set is
a day rather than a week.

The artwork-dependent ones (**Where does it live?**, **How I am today**, **Label
the minibeast**, **Roman shield**) are worth doing next because they are the ones
that photograph well for the landing page.

## Things to keep out of the demo for now

**Video.** Top of the switcher ask list and top of the build queue, and until it
ships it should not appear in a template's instructions.

**AI worksheet to quiz.** The flagship AI idea, and there is no code for it in the
repo yet, so no template here assumes it. When it lands, template 11 is the one to
rebuild as the demo of it, because turning an uploaded fraction worksheet into
those two questions in front of a teacher is a strong thirty seconds.

**Framework tagging.** Every template above uses free teacher tags. If Development
Matters or National Curriculum tagging is ever built, this library becomes the
natural place to show it, and the tags in the manifest would need revisiting
together rather than one at a time.

---

## Engineering notes for whoever builds these

Added 24 August 2026, moved in from session memory so the build notes sit beside
the ideas.

**The canvas mechanic these templates trade on.** An unlocked object the teacher
placed is **move only** in a child's hands. An object a child pulls off an
**endless source** loses `fromTemplate` and becomes fully theirs: resize, delete,
label. So sorting activities want unlocked cards, and building activities want an
endless source. See `objCapabilities` and `spawnFromSource` in
`src/components/DrawingCanvas.tsx`.

**Product gaps some of these templates depend on.**

- **Read-aloud is only on the teacher's send-back note**
  (`src/app/student/TeacherNote.tsx`, `src/lib/readAloud.ts`), not on activity
  instructions. Extending it is what makes the EYFS band self-serve.
- **No AI worksheet-to-quiz code exists in the repo yet.** When it lands, the
  fraction wall template is the one to rebuild as its demo.
- Nice to have: a neutral, recolourable furniture group in the builder's shape
  kit, named for form rather than for our colour meanings. See section 6 of
  [`template-design-sheet.html`](./template-design-sheet.html).

**Publishing route.** Each pick becomes an entry in
`content/shared-activities/index.json` and publishes through
`scripts/ops/publish-shared-activities.mjs`, which upserts on slug. The five with
no artwork dependency go first, so each is a JSON change and a publish.
