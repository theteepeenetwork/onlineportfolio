# Age-mode copy — the older-child register (SJ-06)

> **✅ APPROVED by the product owner 2026-07-18 — no changes requested.** Every
> "Older" value below (including "journal", the "Added ✓" celebration, and the
> five locked strings) is signed off as written. This is the build spec for PR 11:
> `studentCopy(mode)` is built from these tables verbatim. The **Younger** column
> is unchanged from what ships today.

## How to read it

Every child-facing string is one of three kinds:

- **🔒 Locked** — five strings carry a safeguarding promise. You may *reword*
  them for an older child, but the meaning must survive and they must never
  become jargon ("Pending review", "Invalid"). They are called out inline.
- **= Neutral** — same words for every age. Mostly the sign-in **code** screen,
  which runs *before* we know which class (and therefore which register) is
  coming, so it can't be age-aware. Listed once, at the end.
- **↔ Swaps** — the ones that actually change between registers. This is the
  work: about 15 strings. The table below.

**The brief for "Older":** calm, not corporate. A Year 6 disowns "Bye bye 👋",
but they also disown "Submission received". Aim for how you'd speak to an
eleven-year-old you respect — plainer and a touch drier than the younger voice,
never babyish, never a form. Roughly 15% terser reads as respect.

---

## ↔ The strings that swap

| # | Where | Younger (ships today) | Older (draft — **redline me**) | Note |
|---|-------|-----------------------|--------------------------------|------|
| 1 | Sign out button (home) | `Bye bye 👋` | `Sign out` | The audit's own example. |
| 2 | Name wall heading | `Tap your name!` | `Tap your name` | Older loses the exclamation, keeps the instruction. |
| 3 | "It saved" celebration | `Popped in!` | `Added ✓` | |
| 4 | …its subtitle | `Your teacher will see it soon.` | `Your teacher will see it first.` | Aligns with the locked promise 🔒#1 below; calmer. |
| 5 | Saving spinner | `Popping it in…` | `Adding…` | |
| 6 | Just-arrived tile | `This went in your jar!` | `Added to your jar` | Statement, not a cheer. |
| 7 | Returned strip | `Have another go — your teacher sent it back` | `Sent back — have another go` | Same words, older leads with the fact. |
| 8 | Returned tag (short) | `Have another go` | `Redo` | The tiny kraft tag; older can be terser. |
| 9 | Submit button (add work) | `Add to my jar` | `Add to my jar` | Draft: keep. Or `Add to my journal` if "jar" reads young to a Y6 — **your call.** |
| 10 | Waiting status | `Waiting for your teacher to see it` | `Waiting for your teacher` | Already calm; older just trims. |
| 11 | Words-capture heading | `My words` | `My words` | Draft: keep. `Your words`? |
| 12 | Photo caption example | `I made a tower with the big blocks…` | `What is this? Where were you?` | A prompt, not a toddler's example. |
| 13 | Words example | `Today I…` | `Today I…` | Draft: keep — works at any age. |
| 14 | Activities: handed-in state | `Handed in` → becoming `In the jar ✓` (SJ-08) | `Handed in ✓` | SJ-08 already restyles this; older keeps the plainer word. |
| 15 | "Wrong class" link | `← Wrong class?` | `← Not your class?` | Draft; both fine. |

---

## 🫙→📓 jar → journal (older register) — DECIDED 2026-07-17

The product grows up with the child: little ones keep the **jar**, older classes
get a **journal**. Two calls made:

- **The jar PICTURE goes for older, not just the word.** A journal has no rim for
  a tile to balance on and nothing "drops into" it, so keeping the jar SVG while
  the words say "journal" would read as unfinished to a Y6 — the exact thing this
  feature fixes. Older classes get a plain journal (moments in a grid), and the
  status still reads because SJ-04 was built so every state carries a **tag + a
  sentence + read-aloud**, never the jar alone. The M2 "it dropped in" moment
  becomes a quieter **"Added ✓"**. *This is the one piece of real build in SJ-06
  beyond copy: a second status display for KS2. The status LOGIC is unchanged.*
- **The product NAME stays "storyjar" everywhere** — header, landing, legal. Only
  the in-app metaphor matures. One product, one name.

| # | Where | Younger | Older |
|---|-------|---------|-------|
| J1 | Add-work submit / home tile | `Add to my jar` | `Add to my journal` |
| J2 | Back link (capture screens) | `Back to my jar` | `Back to my journal` |
| J3 | Status "in" | `In your jar` | `In your journal` |
| J4 | Just-arrived (see swap #6) | `This went in your jar!` | `Added to your journal` |
| J5 | Empty state | `Your jar is empty` | `Your journal is empty` |
| J6 | Header title | `{name}'s jar` | `{name}'s journal` |
| J7 | Count line | `{n} moments` *(+ jar SVG)* | `{n} in your journal` *(no jar SVG)* |
| J8 | Celebration heading | `Popped in!` | `Added ✓` |
| J9 | M2 aria / drop label | `Your moment dropping into your jar` | `Added to your journal` |

**Redline these too** — "journal" is my draft; if you'd rather "portfolio",
"book", or something else for the older word, change J1–J9 in one go.

---

## 🔒 Locked — reword for age, but the meaning must survive

These five carry the safeguarding promise. **Redline the wording, not the
substance.** If a rewrite loses the meaning, I'll flag it back rather than ship.

| # | Where | Current (both ages today) | Must always mean | Older (draft) |
|---|-------|---------------------------|------------------|----------------|
| 🔒1 | Before you hand work in | `Your teacher will see it first.` | *nothing is public until your teacher approves it* | `Your teacher checks it first.` |
| 🔒2 | Caption is optional | `You don't have to.` | *you are not stuck; this field is skippable* | `Optional.` |
| 🔒3 | Empty name wall | `No names here yet — ask your teacher to add you.` | *not your fault; the fix is to ask the teacher* | `No names here yet — ask your teacher.` |
| 🔒4 | Wrong class code | `We couldn't find that class code. Have another go!` | *you did nothing wrong; try again, no blame* | `We couldn't find that code. Try again.` |
| 🔒5 | Disabled keypad key | `{X} is never in a class code` | *this key is intentionally dead, here's why* | `{X} isn't used in codes` |

---

## = Neutral — same for every age (no redline needed)

The sign-in **code** screen runs before the class (and its register) is known,
so it stays one voice for everyone. Also a few labels that read fine at any age.

`What's your class code?` · `Your teacher will show you.` · `Next` ·
`Delete the last letter` · `Hear it` · `Take a photo` · `Tell us about your
work` · `Back to my jar` · `My activities` · `My moments` · `All done ✓` ·
`{n} to do` · `Add {letter}` · `Letter {i} of {total}`

*(If any of these strike you as too young for a Y6, move them up into the swap
table and I'll make them age-aware.)*

---

## What happens after you redline

1. You mark up the **Older** columns above.
2. I turn `studentCopy` into `studentCopy(mode)` — one object per register,
   sharing the neutral strings — and thread the class's `ageMode` through.
   (This is PR 11; it also seeds the `data-ks` attribute that drives the ~15%
   type-scale tightening and the halved motion durations, so the register,
   the size and the pace all move together off one switch.)
3. The five 🔒 strings get a test asserting both registers still contain the
   promised meaning, so a future copy edit can't quietly drop it.

**Nothing here is built yet** — this doc is the input, and it's the artefact a
reviewer (and a DPO, for the 🔒 five) will want anyway.
