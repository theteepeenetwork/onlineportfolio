# Storyjar — Moderated Usability Testing Kit

A short, printable kit for running a moderated usability session with **3–5
colleagues** (ideally teachers). One page per task. Print double-sided; the
moderator keeps the script pages, the observer fills the results template.

**Goal:** watch real teachers attempt the core jobs and find where they hesitate,
misread, or get stuck — the things automated tests can't feel.

**Time:** ~30 minutes per participant. **You need:** a laptop *and* an iPad
(classroom reality), this kit, and the seed/demo data loaded (`npm run db:seed`).

> ⚠️ Use **demo/seed data only** — never a real class. Reset before each
> participant with `npm run db:reset` so everyone starts identically.

---

## Before you start (moderator checklist)

- [ ] App running and reset to demo data (`teacher@school.uk` / `password`, class code `SUN123`).
- [ ] Both devices open to the Storyjar sign-in page.
- [ ] Recording consent agreed (if recording). Screen + audio only; no faces.
- [ ] Remind the participant: **"We're testing the software, not you. There are
      no wrong answers. Please think aloud."**

### The think-aloud protocol (read once, aloud)

> "As you work, please say what you're looking at, what you're trying to do, and
> what you expect to happen — like narrating your thoughts. If you get stuck,
> that's useful for us; try what you'd naturally do. I can't help you during a
> task, but I'll answer questions at the end."

When a participant goes quiet, nudge gently: *"What are you thinking now?"* /
*"What did you expect there?"* Never lead: don't point, don't hint.

Record for each task: **completed?** (yes / with difficulty / no), **time**,
**errors/wrong turns**, **quotes**, and a **severity** for each problem:

| Severity | Meaning |
|---|---|
| **1 · Critical** | Blocks the task or risks a safeguarding/data mistake. Fix before launch. |
| **2 · Serious** | Completes but with real frustration or a wrong turn most users hit. |
| **3 · Minor** | Cosmetic or occasional; annoyance, not a blocker. |
| **0 · Note** | Idea or preference, not a problem. |

---

## Task 1 — Capture a piece of work and get it into a child's jar

*Context to read aloud:* "You've just taken a photo of Amara's number work on
this iPad. Add it to her Storyjar journal so her family will be able to see it
once you've approved it."

**Device:** iPad. **Start:** signed in as the demo teacher, on the dashboard.

**Success =** a photo is added to a child's journal and the teacher understands
it is now visible (published) / awaiting nothing further.

Watch for:
- Do they find where to add work? (dashboard → child → add, or the queue?)
- Do they understand teacher-added work publishes immediately vs a child's needs approval?
- Do they successfully attach/take a photo on the iPad?
- Any moment of "is it saved? did it work?"

Moderator notes / severity: ______________________________________________

---

## Task 2 — Review and approve what the children have sent

*Read aloud:* "Some children have added work today. Check what's waiting, approve
the ones that look good, and send one back to a child asking them to add a label."

**Device:** laptop. **Start:** dashboard.

**Success =** finds the approval queue, approves at least one item, returns one
with a note.

Watch for:
- Do they find the queue / "waiting" area unprompted?
- Is the approve vs send-back distinction clear?
- Do they trust that approving is what makes it visible to family? (safeguarding mental model)
- Bulk approve — discovered? understood?

Moderator notes / severity: ______________________________________________

---

## Task 3 — Add a new child to the class

*Read aloud:* "A new child, Priya, has joined your class. Add them to your class
list. You can also paste your whole register if that's easier."

**Device:** laptop. **Start:** dashboard.

**Success =** the child appears on the class roster.

Watch for:
- Do they find class/roster management?
- Do they understand **first names only** (and why)? Any surprise that surnames are dropped?
- Paste-a-list: discovered? Did the result match their expectation?

Moderator notes / severity: ______________________________________________

---

## Task 4 — Set up a new class and get pupils signing in

*Read aloud:* "You're setting up a second class. Create it, and find what you'd
put on the classroom wall so the children can sign in themselves."

**Device:** laptop, then iPad to test the code.

**Success =** creates a class, locates the class code / printable sign-in sheet,
and (bonus) a child signs in on the iPad with the code + name.

Watch for:
- Is the class code's purpose obvious?
- Do they find the printable sheet / QR?
- On the iPad: is the child sign-in (code → tap name) something they'd trust 4–11s to do alone?

Moderator notes / severity: ______________________________________________

---

## Task 5 — See it as a parent

*Read aloud:* "A parent asks what they'll see. Sign in as a family using the
family code from the letter, and describe what's visible to them."

**Device:** iPad. **Start:** signed out, family sign-in page. Family code `FAM123`.

**Success =** signs in as the family and correctly states they see **only their
own child's approved work**, read-only.

Watch for:
- Is the separation (family vs teacher) clear?
- Do they correctly believe pending/other children's work is not visible?

Moderator notes / severity: ______________________________________________

---

## After the tasks — SUS questionnaire

Ask the participant to rate each statement **1 (strongly disagree) → 5 (strongly
agree)**. Don't explain the items; first instinct is best.

| # | Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|:-:|:-:|:-:|:-:|:-:|
| 1 | I think I would like to use Storyjar frequently. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | I found Storyjar unnecessarily complex. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | I thought Storyjar was easy to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | I think I would need support from a technical person to use Storyjar. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | I found the various functions in Storyjar were well integrated. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | I thought there was too much inconsistency in Storyjar. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | I imagine most teachers would learn Storyjar very quickly. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | I found Storyjar very cumbersome to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | I felt very confident using Storyjar. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | I needed to learn a lot before I could get going with Storyjar. | ☐ | ☐ | ☐ | ☐ | ☐ |

**Scoring (0–100):** odd items → (score − 1); even items → (5 − score); sum, × 2.5.
A SUS of **68 is average**; aim **> 75**. Record: **SUS = ______**

Two open questions to close:
- *"What was the most confusing moment?"* __________________________________
- *"If you could change one thing, what?"* ________________________________

---

## Results template (one row per problem, across all participants)

| ID | Task | Problem (what happened) | Participants hit | Severity (1–3) | Suggested fix |
|---|---|---|:-:|:-:|---|
| U1 |  |  |  |  |  |
| U2 |  |  |  |  |  |
| U3 |  |  |  |  |  |

**Session summary**

- Participants: ____ | Dates: ____ | Devices: laptop ☐ iPad ☐
- Task completion (✓ / difficulty / ✗): T1 ___ T2 ___ T3 ___ T4 ___ T5 ___
- Mean SUS: ____
- Top 3 issues to fix first:
  1. ______________________________________________
  2. ______________________________________________
  3. ______________________________________________

> Feed severity-1 and -2 issues into `FINDINGS.md` (usability section) and, where
> a flow can be pinned down, add or extend a Playwright test in
> `tests/battery/ux/` so the fix is protected against regression.
