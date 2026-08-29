# Data-protection decision log — StoryJar

StoryJar is a one-person operation; the founder is the **data protection lead**.
StoryJar is **not required to appoint a Data Protection Officer** — it does not
process special category data on a large scale as a core activity, and it does no
regular systematic monitoring (see SAFEGUARDING rule 19). We deliberately do not
call the role "DPO": appointing one voluntarily imports the full statutory
requirements, including independence and freedom from conflict of interest, which
a sole trader who is also the decision-maker cannot satisfy. This file is the
written record of data-protection decisions taken in that capacity — what was decided, when, and why. It exists so a school's data
lead, an auditor, or a future colleague can see that these calls were made
deliberately, not by default.

> This is an internal record, not a substitute for professional legal advice.
> Items worth an outside check are flagged in the relevant entry.

---

## 2026-07-18 — Stated age range widened 3–7 → 3–11

**Decision:** Approved changing the stated age range of StoryJar's data subjects
from **3–7** to **3–11** across every customer-facing surface: the Privacy
policy, Terms, the Data Processing Agreement (data-subjects clause), the
Safeguarding statement, the Policies landing page, and the two marketing/metadata
mentions (landing hero, site description).

**Why:** the product was deliberately widened to serve the full primary phase
(Nursery–Year 6); the legal instruments must name the actual data subjects. The
engineering docs and product had already moved to 3–11; the legal copy was the
remaining inconsistency.

**Data-protection assessment:** widening the age band introduces **no new data
category** — the same data is held for an older child as a younger one (first
name; the moments they create; optional teacher-added skill tags and dates). No
new processing, no new third party, no change to retention. So no other legal
text required changing at the same time.

**Deliberately not changed:** the Policies page keeps its "Draft — under review"
status (the wider policy set is not yet finalised — see RETENTION.md, still
pending review); "first name only" stands (true at every age).

**Noted for later (not actioned):** if the optional KS2 PIN (SAFEGUARDING rule 1
amendment) is ever built, the Privacy policy will need a line describing it, as a
PIN hash is data held about the child. No action until that ships.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-07-18.

---

## 2026-07-18 — Retention schedule reviewed and approved

**Decision:** Reviewed every period in `RETENTION.md` and approved the schedule
**as written** — no periods changed:

- **Frozen (lapsed) account: 12 months** before permanent deletion, kept. The
  data-minimisation pull toward a shorter window was weighed against the school
  being the data controller, the 6/9/11-month warning emails, and the parent
  download reminder; 12 months with those safeguards was judged proportionate.
- **Audit logs: 2 years rolling; the bare deletion record: 6 years**, kept.
- **In-progress drafts and returned/rejected moments: 30 days**, approved.
- **Child-PIN row:** retention treatment confirmed (hash deleted immediately when
  a teacher turns PINs off; never exported or shown). *The full PIN feature
  sign-off is still required before any PIN reaches a child* — this entry covers
  only its retention handling.
- The `ageMode` row (a teacher display setting, not child data) confirmed.

**Explicit caveat carried into the doc, not signed away:** the
frozen → deletion **automation** is not built yet (a tracked P2 gap). This review
approves the *schedule*; it does not claim the lapsed-account lifecycle is
enforced automatically today — it is carried out manually until the pipeline
ships. Erasure **on request** already works (deletion cascades exist). Recorded
so no one reads the approval as "the system does all this automatically."

**Still open after this review (not signed off here):** automating the
frozen→deletion pipeline; the full child-PIN feature review; and surfacing this
schedule in plain language in the customer-facing privacy notice / DPA
(Children's Code transparency).

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-07-18.

---

## 2026-07-18 — KS2 PIN deliberately parked (not built)

**Decision:** The optional KS2 PIN permitted by the SAFEGUARDING rule 1 amendment
is **deliberately not being built for now.** The amendment stands (the PIN
remains a *permitted, optional* future feature); this is a decision not to
implement it yet.

**Why (the data-protection reasoning):** the PIN would be the **only** place
StoryJar asks a child for a credential, and a PIN hash is the first per-child
data field beyond a first name. Data minimisation says don't add that surface
without a concrete need, and there isn't one today — every child can already
reach their own work without it. Parking it is the more protective choice.

**Consequences / what this keeps true:**
- No PIN schema, no `pinHash`, no PIN sign-in stage exists — nothing to review or
  secure until a real need appears.
- The `RETENTION.md` child-PIN row and the rule 1 amendment remain as written, so
  the ground is prepared if the decision is ever revisited.
- **Trigger to revisit:** a concrete safeguarding request from a school to stop
  name-borrowing between classmates. At that point the full feature review
  (still listed open in RETENTION.md) must happen *before* any PIN reaches a child.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-07-18.

---

## An admin holds a removed colleague's classes, temporarily

**The question.** SAFEGUARDING rule 5 says admins are not all-seeing: an admin
must not see a child's work unless they personally teach that class, and the
enforcement is the same `teacherId` scoping every teacher gets. Fixing FINDINGS
F59 means a removed teacher's classes have to go *somewhere*, and the only
somewhere available is a person — so the admin who performs the removal
acquires those children's journals, approval queues, photographs and voice
notes. That is a widening of rule 5, and an agent should not decide it.

**The decision: accept it, with three conditions, and set it to expire.**

**Why there is no better option.** `Class` has no `schoolId`. A class belongs to
a school only through its teacher, so there is no institutional custodian to
hand a class to — only another individual. Every alternative is worse:

- *Leave them with the removed teacher.* That is F59, measured: a suspended
  teacher signing back in to fourteen pupils and two items in their approval
  queue.
- *Orphan them.* Children lose their jar mid-term, and nobody can approve work.
- *Make the admin pick a recipient first.* The scenario that makes F59 critical
  is a **suspension**, and a head teacher cannot be made to complete a
  reassignment wizard before revoking access. Friction on that path is the one
  cost that is not payable.

And in a suspension the head is already the accountable adult for those pupils.
The widening tracks a responsibility they already hold.

**The three conditions, all shipped in the same change rather than promised.**

1. **The holding is visibly temporary.** The admin console flags every class
   that arrived this way, in words on the row — *"Came to you when a colleague
   was removed — hand it on to whoever teaches it now."* Without the flag the
   widening is permanent in practice, because nobody looks. The flag reads the
   audit log, so it cannot drift from the record a school would be shown.
2. **The admin is told before they press.** The confirm step names the classes,
   the number of pupils, and that the class codes will be reissued. One press,
   not a wizard — the urgent path stays one press.
3. **Every move is audited per class.** One `CLASS_ASSIGNED` row per class, so a
   school asking "who held this class and when did that change" can filter by
   the class and read the custody history in order.

**Expiry.** This decision is superseded the day `Class.schoolId` lands with the
school-identity work (`docs/school-identity.md`, late September 2026). At that
point a class belongs to the school, a removal needs no custodian, and this
widening should be removed rather than left in place because it works.

**Related.** The same change rotates the class code on every handover, because
the code is a bearer credential that no session or password handling can reach
(F66). That is a safeguarding fix rather than a rule 5 decision, and it is
recorded in FINDINGS.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-08-29.

---

## 2026-08-29 — Child PIN stays parked; the impersonation problem gets a non-credential answer

**Context: the trigger fired, and it was checked.** The 2026-07-18 entry parked
the optional KS2 PIN and named the condition for revisiting it: *a concrete
safeguarding request from a school to stop name-borrowing between classmates.*
That condition is now partly met. The founder, a serving primary teacher, reports
a first-hand classroom incident on another service: a child signed in as a
classmate and wrote bad language under that child's name. This is observed
practice, not anticipation, and it is the kind of thing a teacher would feed back
to a supplier. It is one report from the product owner rather than a request from
a customer school, which is why this entry revisits the question rather than
treating the trigger as fully discharged.

**Decision:** the PIN **remains parked and unbuilt.** The impersonation problem is
answered first with classroom-management features that ask a child for no secret.
The rule 1 amendment and the `RETENTION.md` PIN row stand unchanged, so the
ground stays prepared if this answer proves insufficient.

**Why (the reasoning, including the part that argues the other way).**

1. **The promise is not one marketing line.** "Children never have logins, emails
   or passwords" is asserted as unconditional fact in four places a school or a
   parent relies on: the privacy notice (`src/app/legal/privacy/page.tsx`), the
   family privacy page (`.../privacy-for-families/page.tsx`), the safeguarding
   page (`.../safeguarding/page.tsx`), and the **data processing agreement**
   (`.../data-processing/page.tsx`), which is contractual. The landing-page FAQ
   carries the only flat "No" left in the marketing copy. A caveat of the form
   *"no, never, unless you want to"* was considered and **rejected**: it
   contradicts itself inside one sentence, and it is addressed to parents who do
   not hold the toggle. If the PIN is ever built, those pages get rewritten
   honestly rather than caveated.
2. **Optionality does not shrink the disclosed surface.** The promise is about
   capability, not usage. Once a `pinHash` column and a PIN sign-in stage exist,
   the privacy notice must disclose that StoryJar can hold a child credential
   whether or not any class switches it on. "Off by default" keeps the field
   unused; it does not keep it off the page. This is why DPIA **R13** counts
   *deliberately not built* as the mitigation rather than *off by default*.
3. **A PIN would reduce these incidents without closing the door.** The
   impersonating child usually sits beside the child impersonated, and four
   digits on a shared iPad are shoulder-surfable. SAFEGUARDING rule 1 already
   says this in terms: it raises the effort of casual name-borrowing, and that is
   its entire claim. Casual is most of it, so the reduction is real. It is not
   protection, and it does not tell a teacher who actually did it.
4. **In StoryJar, the queue already contains the harm in the reported incident.**
   Rule 3 means nothing a child makes reaches any jar before a teacher approves
   it, so inappropriate content cannot land silently in the impersonated child's
   evidence base. What remains is teacher time, awkwardness, misattribution, and
   uncertainty about who was responsible. Those are the things to fix, and a PIN
   fixes none of them directly.

**What gets built instead (autumn term 2026).** Each of these leaves rule 1, rule
2, the four legal pages and the DPIA risk table untouched.

- **Attendance gate.** The teacher marks who is present; the name list shows only
  those children. Fewer names to tap for a laugh, and a register the teacher
  already keeps.
- **Device assignment for the lesson, off by default.** iPad 7 is Amelia's until
  released. This is the item that supplies **attribution**, which the PIN does
  not: it tells a teacher which device a moment came from. **Opt-in per class and
  never nudged in the UI.** Most teachers will not bother, and a class that
  ignores it works exactly as it does today. It is there so that a teacher who
  raises impersonation can be pointed at a documented answer, which is why it
  needs a support FAQ explaining how to use it rather than a prompt in the
  product.
- **Persistent identity banner** on every child screen, so borrowing is visible
  to any adult walking past.
- **One-tap reassign of a misfiled moment**, turning a mis-tap from a permanent
  assessment problem into a thirty-second correction.

**Consequences / what this keeps true.**

- No PIN schema, no `pinHash`, no PIN sign-in stage. Nothing new to review,
  secure, disclose or retain.
- DPIA R13 keeps its current mitigation wording and stays **Low**.
- The open item in `RETENTION.md` (line 121, the data-protection review of the
  child PIN) remains open and unstarted, which is correct: it must complete
  *before* any PIN reaches a child, and no PIN is being built.
- **Sales answer.** When a school raises impersonation, the answer is now the
  four features above rather than "we do not do that."
- **Support FAQ required** before device assignment counts as shipped: a page
  explaining how a teacher assigns devices for a lesson and when it is worth
  doing. The feature stays quiet in the product and the FAQ is where a teacher
  who asks the question gets sent.

**Next trigger to revisit.** A customer school reporting impersonation *after*
the four features above are live. At that point the argument that a credential is
necessary has evidence behind it that a non-credential answer failed, which is
the only basis on which those four legal pages should be rewritten.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-08-29.
