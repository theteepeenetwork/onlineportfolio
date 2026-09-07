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

---

## 2026-08-30 — A school is unverified until payment lands, and cannot reassign classes until it is

**Decision:** when a teacher buys the school plan, the `School` row is created at
**trial start** and marked unverified. `verifiedAt` is stamped on the first
successful payment. Until it is stamped, `assignClassToStaff` is **refused**.

> **Amended 1 September 2026.** The trial was removed from new purchases
> (`pricing-decisions.md`, 1 Sep 2026), so the trigger in this entry is stale:
> a card purchase is now created and verified in the same transaction and never
> passes through the unverified state at all, and the state is entered only by
> the invoice route, at the point the invoice is raised. The reasoning below is
> unchanged and still governs; the gates were widened beyond
> `assignClassToStaff` in the entry of 1 September 2026 below.

**Why the question exists.** `docs/school-identity.md` establishes that payment
is what verifies a claim to a school, because becoming a school's admin is a
privilege-escalation path rather than a filing convenience:
`assignClassToStaff` lets an admin move any class in their school to any member
of staff including themselves, and assigning yourself a class is precisely how
you come to see its children's work under SAFEGUARDING rule 5. The commercial
decision of 30 Aug 2026 (`docs/pricing-decisions.md`) removes the founder from
the purchase path entirely, which makes this the only remaining check.

**The conflict it resolves.** The school plan opens on TRIAL before money moves,
deliberately, so that a school evaluating before its finance office raises a PO
has something to evaluate and every teacher stays writable in the gap. If
payment verifies a claim, a trialling school is by definition unverified. Three
options were set out in `school-identity.md` §3: create at trial and gate the
dangerous power; create only on payment; or treat starting a trial as
verification. The second gives an evaluating school nothing to evaluate, which
defeats the reason the trial exists. The third is verification in name only.

**Assessment.** The unverified state grants an admin console, staff invitations
and billing. None of those reveal a child's work: rule 5 already holds that an
admin sees nothing unless they teach the class, and an invitation does nothing
until the invited teacher accepts (§5, invited never migrated). The one action
that *would* widen access to children's work is the one held back. So an
unverified claim, even a false one, reaches no child's data.

**Not a new widening.** This narrows rather than widens: `assignClassToStaff` is
available to any school admin today. The 29 August entry above, on an admin
temporarily holding a removed colleague's classes, is unaffected and its
visibility condition still applies.

**Worth an outside check:** no. No new data category, no new processing, no new
sub-processor.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-08-30.


---

## 2026-09-01 — What an unverified school admin may not do, and why an invitation is required to join one

**Context.** Self-serve purchase (`pricing-decisions.md`, 30 Aug and 1 Sep 2026)
makes buying the act that creates a `School` and makes the buyer its `ADMIN`.
`docs/school-identity.md` names that as a privilege-escalation path rather than a
filing convenience, so the question is what an admin can reach before payment has
confirmed who they are. The 30 August entry above gated one action. Working the
threat through properly, it is not enough.

**The threat, stated plainly.** `createTeacherAccount`
(`src/app/actions/auth.ts:22`) has no email verification and no domain check.
Anyone — a parent, a former employee, anyone at all — can sign up as a teacher
today with any school name and any URN. What self-serve purchase adds is that
they can then claim that URN as a `School` and become its admin. On day one that
school is empty and there is nothing to reach. The damage is on day thirty: a
real teacher at that school signs up, is told "St Bede's Primary is already on
StoryJar, ask <admin> to add you", joins, and the squatter can then remove them
and inherit their classes and their pupils' journals through
`removeStaff` → `handOverClasses`.

The card route prices this out — several hundred pounds, a traceable payment, and
under the 1 September decision the school is verified the instant it exists. **The
invoice route does not.** Raising a PO costs the person raising it nothing up
front and leaves the school unverified for the length of the payment terms. So on
the PO path these gates are not belt-and-braces; they are the whole defence.

**Decision. Until `verifiedAt` is stamped, a school admin may not:**

1. `assignClassToStaff` — as decided 30 August 2026.
2. `removeStaff` **where the staff member's status is ACTIVE**. That is the
   branch that calls `handOverClasses` (`src/lib/classHandover.ts:69`) and moves
   a colleague's classes, and their pupils' work, onto the admin. It is the same
   escalation as (1) wearing a different hat, and the 29 August entry that
   permits it — a head teacher suspending a colleague must meet no friction —
   assumes a school that has been paid for.
3. Set any staff member's role to `ADMIN` via `setStaffRole`. Otherwise an
   unverified admin manufactures a second admin who looks no different from a
   verified one.

**What an unverified admin keeps:** the console, billing, the school name,
inviting staff, the audit log, and their own classes. `removeStaff` where the
staff member is `INVITED` is also kept — that deletes an invitation the admin
sent minutes earlier, they need it to correct a mistyped address, and it moves no
data. None of the retained powers reveal a child's work: SAFEGUARDING rule 5
already holds that an admin sees nothing unless they teach the class.

**Disclosure, because the gates only protect people who are already inside.** An
unverified school's staff invitation emails must say that the school plan is not
yet paid for and name the person who set it up, so a head teacher receiving one
can tell whether it is legitimate. This is the only control that reaches somebody
who has not signed up yet.

**`joinSchoolPlan` requires an invitation.** `src/app/actions/billing.ts:286`
attaches any signed-in schoolless teacher to any school by posted `schoolId`,
with no check that the school asked for them. It has no caller in `src`, `tests`
or `docs`. **Corrected 2 September 2026:** this entry originally said that a
caller-less server action is still a live endpoint with a stable id. It is not.
Next gives an unimported export no action id at all — verified in both
directions, by finding `startCheckout`, `requestSchoolInvoice` and
`openCustomerPortal` in `server-reference-manifest.json` while `joinSchoolPlan`
is absent, and by watching it appear the moment it is imported into a screen.
So it is unreachable today rather than merely harmless. That does not change the
decision, only its urgency: the action becomes dispatchable the moment the
acceptance screen imports it, which is precisely when it must already be safe. It is not deleted, because it
fills a real gap: `inviteStaff` refuses an email that already belongs to a
teacher, so a teacher who signed up free in September cannot be brought into
their school when it buys in January. **It must succeed only against an unspent
invitation for that teacher and that school, which it consumes** — the same shape
as the existing password-token flow. Until that invitation exists in the schema,
the action returns an error unconditionally.

**And it is a controller change, so it must say so.** A teacher joining a school
moves their pupils from their own responsibility to the school's — `RETENTION.md`
"Free teacher plan vs school plan" (the section was renamed; an earlier
name is cited in places). The acceptance screen has to state that in plain words,
not just offer a Join button. The reverse move is the refund detach
(`pricing-decisions.md`, 1 Sep 2026), which returns the buyer to a free plan.

**Logged, not fixed here:** teacher signup has no email verification of any kind.
It undercuts more than this feature and belongs in `FINDINGS.md` as its own item.
These gates are correct whether or not it is fixed; fixing it would raise the cost
of the squat but not remove the need for them.

**Worth an outside check:** no. No new data category, no new processing, no new
sub-processor. This narrows existing admin powers rather than widening any.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-09-01.

---

## 2026-09-01 — Removing a colleague hands their classes over first, and never deletes a child's work

**Decision:** `removeStaff` moves every class a member of staff holds to the
admin performing the removal **before** anything else happens, on both branches,
in one transaction. The acceptance criterion is stated as a fact to be proved
rather than an intention: **no work is deleted in the process.** It is asserted
by counting classes, pupils and journal items either side of a removal driven
through the real console, not by a comment.

**What was wrong.** The `INVITED` branch was a bare `db.teacher.delete`, on the
stated grounds that "an invited teacher never set a password and holds nothing".
Every clause of that was true except the one carrying the weight. Four things,
each individually reasonable:

1. `Class.teacher` is `onDelete: Cascade`, and `Student` and `JournalItem`
   cascade from the class.
2. `assignClassToStaff` resolves its target by id and school with **no status
   filter**, so an invited teacher is a valid one.
3. The console offers invited staff in the class-owner dropdown and in the staff
   row's "Assign classes", labelled `(invited)` — deliberately, because an admin
   setting up in September wants next term's classes placed before everybody has
   accepted.
4. So removing an invited colleague who had been given a class deleted that
   class, its pupils and every piece of work in it. Silently, with no audit row,
   nothing recoverable — **while the confirmation on screen said the classes
   were moving to the admin.**

Measured on the fixtures before the fix: one removal took classes 12 → 11,
pupils 37 → 35 and journal items 31 → 29, in two clicks through the supported
UI. That is the shape the regression test now catches, and it was verified to
fail before it was made to pass.

**The two rejected options, so they are not re-proposed.** *Refuse the
assignment at source* — `assignClassToStaff` rejects an `INVITED` target — is
the more protective option in the abstract and was rejected because it costs the
September workflow that point 3 exists to serve. *Null `schoolId` instead of
deleting* was rejected because it leaves an account nobody can ever sign into,
an invited teacher having no password.

**Not a widening.** This is the 29 August 2026 entry's condition finally holding
on both branches: the per-class `CLASS_ASSIGNED` audit row, which is what makes
an admin's inherited holding *visibly temporary*, is now written for an invited
colleague's classes as well. Before this change that branch wrote nothing,
because there was nothing left to write about.

**A known edge, not reachable today, recorded because the thing that makes it
reachable is already planned.** `Teacher` also cascades to `ActivityTemplate` →
`Assignment` → `AssignmentStudent` and `Draft`, and a `Draft` is a child's
private unfinished work by the schema's own words. `JournalItem.assignmentId`
is `SET NULL`, so a journal item survives that chain and a count of journal
items would not notice it. It cannot fire today: `inviteStaff` refuses an email
that already belongs to a teacher, an `INVITED` row is always freshly created,
and every template-creation path writes to the acting teacher — so an invited
teacher cannot own a template. **It would fire the moment an established account
could carry `status = "INVITED"`**, which is one wrong turn away from the
invitation work in the entry above. That work is designed to keep such a teacher
`ACTIVE` and carry the invitation in its own row precisely so this cannot
happen. The counts in the regression test now include drafts and assignment
records so that a future shortcut is caught rather than reasoned about.

**A change to what a suspension means, and it is deliberate.** Separately and in
the same shipment, a teacher detached from a school is now put back on their own
free plan. Before, they were left with no governing subscription at all: the
write gate denied by default — correctly, rule 8 — while the account screen
reported no plan and no banner explained it, so every save failed silently. That
was an accident, but the effect was real, and the consequence of fixing it is
that **a suspended member of staff now walks away with a fully writable StoryJar
account** in which they can create their own classes and enrol children.

Assessed and accepted. Their password already worked, and anyone may sign up for
a free teacher account without asking, so the marginal risk is close to nil; the
school's own children, classes and work are gone from that account, having been
handed to the admin by the same transaction; and the removal confirmation now
says so in plain words rather than leaving it to be discovered. A designated
safeguarding lead reading "removed from the school" might otherwise assume the
account itself was closed, which is why it is written down here and said on the
screen. **Suspension has never meant, and does not now mean, that StoryJar
closes an adult's personal account.** Only a school can end its own
relationship with a member of staff.

**Worth an outside check:** no. No new data category, no new processing, no new
sub-processor. This stops a deletion and restores a plan; it grants no access to
any child's data that did not exist before.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-09-01.

---

## 2026-09-02 — An unverified school may invite colleagues, but not as admins

**Decision:** `inviteStaff` refuses `role = "ADMIN"` while `School.verifiedAt` is
null. An unpaid school may still add colleagues as a teacher or a TA, and may
make somebody an admin once the invoice is settled.

**This narrows the entry of 1 September 2026**, which lists "inviting staff"
among the powers an unverified school keeps. That list stands; only the admin
role is withheld from it.

**Why the retained power was too wide.** The 1 September entry refuses
`setStaffRole` to ADMIN on the stated grounds that *"otherwise an unverified
admin manufactures a second admin who looks no different from a verified one."*
That reasoning is sound and the gate is correctly built — but `inviteStaff`
accepts a role straight from the form, `ROLES` includes `ADMIN`, and the invite
panel offers it. So the same end was reachable through the door the same entry
holds open, with one extra step. Found by the agent implementing the gates,
which flagged it rather than narrowing a recorded decision on its own authority.

**Why the mitigations were not enough.** Two were real. A second admin at an
unverified school is gated identically to the first, so nothing widens while the
school stays unpaid; and a squatter needs control of the invited mailbox to get
anyone to accept. Both run out at the same moment: **when the invoice is paid,
both admins become fully powered at once**, and `detachBuyer` — the refund
path — detaches only the buyer, so a school that pays, is refunded and freezes
leaves the second admin in place. The window the gates exist to cover is
precisely the window in which the second admin is created.

**What is not done.** Admin stays available to a *verified* school's invite
form. Removing it entirely, so that promotion through `setStaffRole` became the
only route to ADMIN, was considered — one path is easier to reason about and to
test than two — and rejected as a larger change to a working screen for a
benefit this gate already delivers. If a later change makes that road worth
taking, this is the paragraph to reverse.

**Assessment.** This is a narrowing, not a widening: it removes a power an
unverified school had this morning. No new data category, no new processing, no
new sub-processor.

**Worth an outside check:** no.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-09-02.

---

## 2026-09-02 — A URN is released when an unpaid school freezes, and buying requires a proved address

Two decisions taken together, because they close the same gap from opposite
ends: the PO route lets somebody claim a school they have nothing to do with.

### The URN is released on an unpaid freeze

**Decision:** when a school that has never been verified reaches FROZEN, its
`School.urn` is set to null. The school row, its staff and its data are
untouched — only the register claim is given up.

**The gap.** A PO costs the person raising it nothing up front, and until now
nothing ever released a URN afterwards. An unpaid school lapsed to FROZEN and
kept its claim on that register entry **forever**, with no operator action to
clear one. Repeatable across every URN in the register, at no cost, and only the
founder could clean it up. Found in the Rule 1 review of item 0 and recorded
here rather than fixed in that change.

**Why release rather than an operator screen.** An ops action would work and was
rejected: it needs a screen built, and it puts a human back into a path that
`docs/pricing-decisions.md` (30 Aug) exists to keep them out of. Releasing on
freeze is automatic, needs no judgement, and a school that genuinely lapsed
reclaims its own URN by buying again — the same act that claimed it originally.

**Why only an unverified school.** A school that paid and later lapsed has a
real claim on its register entry and keeps it; `verifiedAt` is exactly the
line between the two, which is what that column is for. Nothing is deleted on
either path.

### Buying requires a proved email address

**Decision:** reaching checkout or raising a purchase order requires a confirmed
email address. **Free teacher signup is unchanged** and requires nothing.

**Why not verify every signup.** It would close F67 outright rather than contain
it, and it was rejected on cost: it puts a mail-delivery dependency in front of
every new teacher in the busiest week of the school year, and the people it
fails are the ones who never say so — a teacher whose school filter eats the
link simply does not come back. A teacher blocked at *checkout* is by definition
trying to give StoryJar money and will say so.

**Why this is the right place for it.** The squat costs money and a real mailbox
at the point where it now costs something, and nowhere else. It also makes the
four unverified-school gates defence in depth rather than, as the 1 September
entry had to admit, the whole defence on the PO route.

**Mechanism, so nobody builds a second one.** `TeacherPasswordToken` already
does this job for two purposes: a SHA-256 digest and never the token, a
`purpose` column, a per-purpose TTL in `passwordTokenPolicy.ts`, and spending in
the same transaction as the thing it authorises. Confirmation is a third
`purpose`, one nullable `Teacher.emailConfirmedAt`, a route that consumes the
token, and one template built from the existing helpers. **No new sub-processor
and no new data category** — Mailjet already carries every magic link, reset and
staff invitation.

**F67 stays open** until the confirmation lands, and the gates stay whether or
not it does. They were designed on the assumption it is unfixed and that
assumption should not quietly expire.

**Worth an outside check:** no. No new data category, no new processing, no new
sub-processor. Both decisions narrow what an unproved account can do.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-09-02.

---

## 2026-09-02 — Bringing an existing teacher into a school: in the app, with their consent, and not by an unpaid school

The last gap in self-serve purchase. `inviteStaff` refuses an email that already
belongs to a teacher, so **a teacher who signed up free in September cannot be
brought into their school when it buys in January** — the common case, and the
last thing standing between a school buying and its staff using what it bought.

### The invitation is answered in the app, not by an emailed link

**Decision:** the admin invites; the teacher sees a pending invitation in their
own area next time they sign in, and accepts or declines there. An email tells
them one is waiting and **carries no link that does anything**.

**Why not the shape already used for staff invitations.** That one has to mail a
credential, because the person receiving it has no account to sign in to. This
person does. Mailing a bearer token whose payload is *"attach my pupils to this
school"* would create a third forwardable credential for no gain: the account
holder is authenticated by construction, the acceptance screen — which has to
state a data-controller change in plain words — is naturally in-app, and a
suppressed or filtered address stops being able to block the whole flow.

### Accepting moves the classes, and the screen says so before anything is pressed

**Decision:** every class the accepting teacher holds, and the children's work in
it, becomes the school's. Stated in plain words on the acceptance screen, before
any button.

`RETENTION.md` "Free teacher plan vs school plan" already governs this: the
school is the data controller regardless of who pays, and if the teacher leaves,
the journals belong to the school context and do not travel with them. That is
true today and is not created here — what is created is the **moment it becomes
true for a particular teacher**, and that moment must be a thing they do rather
than a thing done to them. `docs/school-identity.md` §5 puts it as a rule 5
question rather than an onboarding preference, and it is right.

It is also an **access change** and the PR must not claim otherwise: on
acceptance that teacher's classes, pupil counts and audit trail appear in the
school's admin console. Rule 5 still holds — no admin sees a child's *work*
unless they teach the class — but "no new visibility" would be false.

### An unverified school may not invite an existing teacher

**Decision:** the four-case `inviteStaff` branch refuses an existing account
while `School.verifiedAt` is null, and `verifiedAt` is **re-checked at accept**,
because a school can lose verification between the two and acceptance is the
moment children's data changes hands.

**This narrows the entry of 1 September 2026**, which permits an unverified
school to invite staff on the stated ground that *"an invitation does nothing
until the invited teacher accepts."* That ground holds for a brand-new person,
who brings nothing. **It fails here**, because this invitee brings classes,
pupils and journals into a stranger's console. The squatter still could not
*inherit* them — `removeStaff` on an ACTIVE colleague is gated — but the school's
admins would see the class names, the pupil counts and that teacher's audit
trail immediately, which the 1 September assessment did not weigh because this
feature did not exist.

### `joinSchoolPlan` takes an invitation, never a posted school id

**Decision:** the action's input becomes the invitation's id. The school is
derived from that row, which removes the trusted-posted-id problem at the root
rather than validating around it. It succeeds only against an unspent,
unexpired invitation for **that** teacher and **that** school, consumed in the
same transaction as the attach.

### A trap that is not reachable today, recorded because what makes it reachable is being built

An established account must stay `ACTIVE` and carry its invitation in its own
row. **The shortcut of flipping `status` to `INVITED` on an established account
would delete children's work**: `Teacher` cascades to `ActivityTemplate` →
`Assignment` → `AssignmentStudent` and `Draft`, a `Draft` is a child's private
unfinished work by the schema's own words, and `removeStaff`'s INVITED branch
deletes the teacher row outright. `JournalItem.assignmentId` is `SET NULL`, so a
journal-item count would not notice. Verified at SQL level in
`prisma/migrations/0_init/migration.sql`, guarded by draft and
assignment-record counts in `tests/battery/security/class-handover.spec.ts`, and
stated here because the separate-row design is what prevents it and a future
implementer needs to know that is *why*.

**Worth an outside check:** no. No new data category, no new sub-processor. The
controller change it records is one `RETENTION.md` already describes; what is
new is asking the teacher first.

**Decided by:** the founder, as data protection lead. **Recorded:** 2026-09-02.
