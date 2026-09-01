# Paid tier: making the school plan worth buying

Written 30 August 2026, after an ICP review from the buyer's seat. Evidence is
this repository, checked rather than remembered. Scope rules are
`docs/launch-runway.md`; nothing here goes near the launch freeze.

This is a work plan for a Claude Code session. Each item is self-contained:
take one, read the linked documents, build it, leave the record. Do not take
two at once. **Item 0 comes first and everything else waits on it**, because
until it lands no school can buy anything the rest of this plan builds.

## The argument

`docs/pricing-decisions.md` made the right call and then created one obligation.
The free teacher tier is uncapped and carries every classroom feature, so the
school plan does not sell capacity. It sells oversight, continuity and the data
relationship. Two of those three are currently copy rather than product:

| Sold in | Says | Built |
| --- | --- | --- |
| `src/app/page.tsx`, `src/app/admin/BillingPane.tsx`, `src/app/teacher/account/BillingPanel.tsx` | "Year-end transfer" | Nothing. No rollover, move-up or class-archive logic exists |
| `src/app/page.tsx` | "Whole-school export" | Teacher-scoped only: `/teacher/export/[classId]` and `/teacher/export/pupil`. No admin route |
| Admin console | Oversight | Real: staff, classes, audit log, the Promises pane |

So the work is not to invent reasons to pay. It is to open the door (item 0),
build the things the product already promises at the point of sale, and give the
buyer the paper they need to say yes. Everything below is ordered by how much it
moves that.

## 0. A school buys without asking anyone

**Owner decision, 30 August 2026: there is no gatekeeper.** A school that wants
to pay must be able to do so on a Tuesday evening without a person in the loop.
Recorded in `docs/pricing-decisions.md`, with the safeguarding condition in
`docs/dpo-decisions.md`.

This is not a change of direction. `docs/school-identity.md` §4 already lists
"No operator approval queue" as a deliberate absence, on the grounds that
payment replaces it and keeps a human out of the onboarding critical path. The
human is in the path today only because the half of that design which removes
him has not been built.

**What is true in the code today.** `db.school.create` appears only in
`prisma/seed.ts`, `prisma/seed-test.ts`, `prisma/seed-personas.ts` and
`scripts/ops/seed-academy.mjs`. `createTeacherAndClass` stores `school` as free
text plus the `urn` and never sets `schoolId`, which is §2 working as designed.
So `/admin` does `if (!school) redirect("/teacher")`, and
`ensureSchoolSubscription` opens with `if (!actor.schoolId) return null`. Both
paid doors are shut to every real account.

**Build, in this order.**

1. **Invert the guard.** `requireAdmin` needs `staffRole === "ADMIN"` and a
   `schoolId`, and `ensureSchoolSubscription` needs a `schoolId`, so you must
   already be a school admin to buy the thing that makes you a school. Any
   signed-in teacher must be able to reach checkout for the school plan. Every
   other admin power stays exactly where it is.
2. **Add the entry point.** "Set up whole-school" in the teacher's own area,
   with the band picker that `BillingPane` already has. It runs `startCheckout`
   unchanged.
3. **The claim transaction.** Nothing is created when the button is pressed —
   see "The trial, removed" below. In the Stripe webhook, in one transaction:
   create the `School`, attach the `Subscription` as **ACTIVE**, set the
   purchasing teacher's `schoolId` and `role = "ADMIN"`, stamp `verifiedAt`,
   write the audit row. The purchase intent travels in Checkout metadata —
   purchasing teacher id, band, school name, URN — because `startCheckout`
   currently needs a local `Subscription` to exist first (it passes
   `client_reference_id: sub.id` and persists the Stripe customer onto it) and
   there is no longer a row to hang that on. `School.urn` is unique, which is
   what lets a second teacher at the same school be told "St Bede's Primary is
   already on StoryJar, ask <admin> to add you" rather than creating a
   duplicate. An abandoned checkout leaves an orphan Stripe customer carrying a
   school name and the teacher's email, and no subscription: adult billing data
   only, and Stripe is already a listed sub-processor.
4. **The invoice route gets the same treatment.** Most primaries pay by PO.
   `requestSchoolInvoice` already writes ACTIVE immediately so finance holding
   the invoice cannot freeze a school, and that behaviour is correct and stays.
   It must also be reachable without an existing school. It creates the `School`
   ACTIVE and **unverified**; `verifiedAt` is stamped on `invoice.paid`. This is
   the only route that enters the unverified state.
5. **Gate the unverified school.** `assignClassToStaff`, `removeStaff` where the
   staff member is ACTIVE, and promotion to `ADMIN` via `setStaffRole` are all
   refused until `verifiedAt` is set. `removeStaff` on an `INVITED` row stays
   allowed. Staff invitation emails from an unverified school say the plan is
   not yet paid for and name the person who set it up. Reasoning and the threat
   model are in `docs/dpo-decisions.md` (1 Sep 2026).
6. **Shut `joinSchoolPlan`.** `src/app/actions/billing.ts:286` attaches any
   signed-in schoolless teacher to any school by posted `schoolId` with no
   invitation. No UI calls it; it is still a live server action, and item 0 is
   what makes real `School` rows exist. Make it return an error unconditionally
   in this change. The invitation it needs — `inviteStaff` currently refuses an
   email that already belongs to a teacher, so an existing free teacher cannot
   be brought into their school at all — is a follow-up, not part of item 0.

**The trial, removed.** Owner decision, 1 September 2026
(`docs/pricing-decisions.md`): new purchases do not open on TRIAL. A **42-day
full refund** replaces it. The trial existed so a school could evaluate before
finance raised a PO, but a countdown is something a school can be cut off by
mid-term, and it made every new school unverified for six weeks. A refund is the
same reassurance with the money on the other side of it.

What that buys here: on the card route the school is created and verified in one
transaction, so it never passes through the unverified state and an abandoned
checkout cannot squat on a URN. The unverified state survives only on the
invoice route, where an invoice with 30-day terms is unpaid by definition. What
holds the line there is step 5 above, not a shorter clock.

The `TRIAL` status itself stays in the schema and the seeds — `prisma/seed.ts`,
`seed-test.ts`, the frozen-school persona and `scripts/ops/freeze-expired.mjs`
all depend on it, and `BillingPane` still renders a countdown for a row that has
one. New purchases simply never enter it. Removing the status is a separate
cleanup.

**The refund path.** Manual: a school asks, the founder actions it in the Stripe
dashboard. No refund button. `customer.subscription.deleted` →
`freezeSubscription` already exists, and it needs one change: the **buyer is
detached back to a free teacher plan** rather than frozen with the school. They
usually had a free account and their own classes before they paid, and freezing
those leaves them worse off than never buying, which is not a refund. Note that
joining a school *deletes* the teacher's free `Subscription` row, so detaching
means recreating one. The school and any remaining staff stay frozen read-only —
they did not pay.

**Where the school's name comes from.** The register name when a URN is picked
from GIAS, editable free text otherwise. It goes on the Stripe invoice a finance
office has to recognise, and it is what every colleague sees.

**The hole to close in the same change.** §3 begins "a teacher with a stored
`urn`". A URN is null for every teacher outside England and for any English
teacher whose school is missing from the register, and the schema comment on
that column is emphatic that null is a real answer rather than a missing one. If
"Set up whole-school" requires a URN, self-serve payment silently excludes those
schools and they arrive in Mark's inbox, which is the thing this item exists to
remove. So the free-text path must buy too, creating a `School` with `urn` null.
SQLite treats every null as distinct, so the unique constraint still holds; this
is the same arrangement `Parent.email` already relies on, and the comment on
that column explains it.

The trade, stated plainly: schools created without a URN have no collision
protection, so two teachers at one free-text school could each create one. That
is a merge job for the operator console at very low volume, and it is a much
smaller problem than a school that wants to pay and cannot. Record it as a
known limitation rather than solving it now.

**Safeguarding.** Rule 1 change, and the heaviest one in this plan: it decides
who becomes an admin, which `school-identity.md` names as a privilege-escalation
path rather than a filing convenience. Work the review checklist. The gates in
§"The gates this has to pass" of that document apply to this work directly.

**Done when.** A teacher who signed up this morning, with or without a URN, can
buy the school plan by card or raise a PO, land in the admin console, and invite
a colleague, without anyone at StoryJar touching anything. A card purchase lands
verified; an abandoned one creates nothing. A second teacher at the same
registered school is told who to ask. An unverified (PO, unpaid) school cannot
reassign classes, cannot remove an active colleague, and cannot mint a second
admin. `joinSchoolPlan` refuses. The Terms and the landing page describe a
refund rather than a trial. `npm run test:changed -- --all` green, with a persona
journey that walks the purchase end to end.

**Still worth doing by hand.** Saying hello to the first schools that buy. That
is a follow-up, not a gate.

---

## 1. Year-end transfer

**The flagship.** This is the promise a school buys in the summer term and
tests in the first week of September, well inside the first renewal cycle. It
is also the clearest thing a pile of free teacher accounts cannot produce,
which is exactly what the pricing model needs.

**What it is.** One July flow in the admin console:

1. For each class, choose next year's teacher (or leave it).
2. For each class, choose what happens to the children: move up to a new class,
   or mark as leavers.
3. Leavers produce an export the school can hand to the family or the next
   school, and their class is archived rather than deleted.
4. A dated summary of what moved, in the audit log.

**Where.** `src/app/admin/` for the console, a new pane alongside Classes. The
staff-reassignment half already exists as `assignClassToStaff` in
`src/app/actions/admin.ts`, including the `inherited` flag on `SchoolClass`, so
read that first: half of step 1 is there.

**Schema, and the thing to get right.** `Class` has no school, no academic year
and no archive flag, and it hangs off `Teacher` with `onDelete: Cascade`.
`JournalItem` carries its own `classId` alongside `studentId`. That is the right
shape for this: moving a child means updating `Student.classId`, while their
existing journal items keep pointing at the class they were made in, so last
year's work stays labelled with last year's class. **Before writing any of it,
audit every access-control path that reads a child's class**, because several
authorise through `student.class` and a child whose `classId` has moved must not
become visible to a teacher who never taught them, nor invisible to the one who
did. That audit is the deliverable of the first sitting; write it into this
document before building.

Expect to add `Class.archivedAt` and something that records the academic year.
`prisma generate` cannot run on the mounted VM (see the project state note), so
the migration is Mark's hands or a cloud container, not `device_bash`.

**Safeguarding.** Read `SAFEGUARDING.md` first: this touches access control and
children's data, so it is a rule 1 change and needs the review checklist. Rule 5
holds throughout: the admin arranges classes and staff and never sees a child's
work, so the transfer screen shows counts and names of classes, never a moment.
The leaver export follows item 3's design, not a new one.

**Done when.** A seeded two-form-entry school can be walked from July to
September by an admin in one sitting, with the audit log showing what happened,
no child's work lost, and no teacher gaining sight of a class they do not teach.
`npm run test:changed -- --all` green, plus a persona journey for the flow.

---

## 2. The procurement pack

**The cheapest conversion work available.** The Promises pane
(`src/app/admin/Promises.tsx`) is already the best sales asset in the product
and it currently exists only as a screen. A head or business manager writing a
governor paper, and a DPO filling in a DPIA, both need this as an attachment.

**What it is.** A dated PDF the admin generates, carrying the school's name:
the promises with their permanent rule numbers, the sub-processor list, the
retention schedule in plain English, where the data is hosted, and the fact that
no child data reaches the payment processor. One page of contents, then the
detail.

**Why it sells.** It hands the buyer their own homework already done. No
competitor does this, and the rule numbers are already printed on purpose so a
school can quote one back during a procurement check.

**Where.** A print route plus a print stylesheet is the cheap version and
probably the right one: the content is already static text that reads nothing
about the school beyond its name. Pull the retention and sub-processor content
from the existing sources rather than restating it, so it cannot drift.

**Copy gate.** Everything in it is published in StoryJar's name, so it is
governed by `docs/brand-and-copy.md`. Hosting is Amsterdam: the claim is "never
leaves Europe", never "stays in the UK". Nothing may show "+ VAT". Do not let
the pack state a policy as settled while `docs/policy-readiness.md` still has
the "Draft for review" banner up: either the banner comes off first, or the pack
carries the same status honestly.

**Done when.** An admin can produce it in two clicks, it prints correctly, and
every claim in it is traceable to a document in this repository.

---

## 3. Export an admin can request without seeing anything

**The problem.** A subject access request lands on the school office, not the
class teacher, and the landing page already promises whole-school export. But
rule 5 says an admin never sees a pupil's work, and the admin Guide currently
points admins at the teacher export route, which they can only use for classes
they teach. That is a real gap, not an oversight to route around.

**The design to build.** The admin requests; the system generates; the content
goes to somebody entitled to see it. Two candidate shapes, and this document
should record which was chosen and why:

- the bundle is generated and delivered to the teacher who holds the class, who
  passes it on; or
- a one-time link the admin can forward without opening, expiring quickly.

Either way the admin sees that the request happened and what it covered, never
what is inside it, and the whole thing is audited.

**Where.** `src/lib/exportBundle.ts` already builds bundles. The work is the
request, the entitlement and the delivery, not the file format.

**Safeguarding.** Rule 1 change. This is also exactly the territory of
`docs/exceptional-access.md`, so read it before designing: any access to a
child's data that does not come through an ordinary StoryJar screen belongs to
that procedure, and this feature must either fit inside it or amend it
deliberately.

**Done when.** An admin can satisfy a parent's request without any adult seeing
work they are not entitled to, the audit log shows it, and the landing page's
"whole-school export" line is true as written. If the chosen design makes the
line only partly true, change the line.

---

## 4. Store the band that was bought

**Small, known, and blocks the renewal conversation.** `Subscription` has no
`planKey`, so nothing records which of the four bands a school actually paid
for. The Billing pane suggests a band from the school's roll and is careful
never to claim it knows the current one. That is honest, and it means a renewal
reminder cannot name the price.

Already written up in `docs/admin-billing-and-import.md` as a known gap. The
migration was written and pulled because `prisma generate` cannot run on the
mounted VM.

**Done when.** The band is written at checkout and at invoice activation, the
Billing pane states it rather than inferring it, and the three rules from
`docs/pricing-decisions.md` still hold: chosen once at purchase, fixed for the
paid year, every feature in every band.

---

## 5. One honest number for the head

**What a head asks in a leadership meeting.** Rule 5 rightly blocks any
school-wide view of children's work. It does not block participation: which
classes are live, how many pieces were approved this half term, which class has
not started yet.

**Why it sells.** It is what justifies the spend at renewal, and it is the only
oversight a head actually wants that the console does not already give.

**The line not to cross.** Counts of activity by class, never by child. Nothing
that ranks children, nothing derived from `Student.jarSeenAt` (the schema
comment on that column forbids aggregating, reporting or exporting it, and it
means it), and no drill-through to a moment. If a number could be read as a
judgement about a child, it does not ship. Rule 11 is the test.

**Done when.** A head can see their school is being used without any child
appearing in it, and a safeguarding review agrees.

---

## 6. Bulk approve in the queue

**The single largest usefulness lever in the product**, and it belongs to the
teacher rather than the buyer, which is why it matters: the buyer is only ever
asked because teachers stayed.

Nothing in `src/app/teacher/queue` or the actions does multi-select today.
Thirty pieces approved one at a time on a Friday afternoon is how portfolio
tools die in November, and November is the first renewal window.

**What it is.** Select many, approve with one shared skill tag, on a phone. The
approval itself keeps every guarantee it has now: rule 3 says the queue is
sacred, and a bulk action must be a faster way to do the same considered thing,
not a way to publish without looking. Returning work stays one at a time, with
its note.

**Watch.** `src/app/actions/familyAccess.ts` already carries a comment about a
deliberate refusal to make something a side effect of a bulk button. Read it
before designing this, and keep the same instinct: what gets bulk-approved must
be visible on the screen at the moment of approving.

**Done when.** A class set can be cleared in well under a minute on a phone,
each item still shown before it is approved, and `npm run test:personas` green.

---

## 7. The term one-pager

**Give the teacher something back for approving.** Today the queue is pure cost
to them. A per-child one-pager the teacher generates for parents evening turns
that cost into output: what this child has made this term, in their own work.

It is also, aggregated by the teacher rather than by an admin, the evidence a
subject lead wants, without any adult browsing children's work. That keeps it
the right side of rule 5.

**Where.** Close relative of the per-pupil export and of item 2's print route.
Build the print route once and use it three times.

**Done when.** A teacher can produce one for every child in their class before a
parents evening without asking anyone for help.

---

## 8. Video

Already the known number one switcher ask (`COMPETITIVE_POSITIONING.md`, verdict
BUILD, post-launch). Nothing to add here except its commercial weight: it is the
first thing a Seesaw leaver checks, so it gates the switcher story that the
whole pilot recruitment rests on. It is a bigger job than anything else on this
list because of upload, storage and moderation, so it wants its own scoping
document rather than a paragraph in this one.

---

## Parked on purpose: two-way messages

`docs/parent-teacher-messages.md` exists and is scoped, and the verdict in
`COMPETITIVE_POSITIONING.md` was reversed for it on 24 August. It stays parked
here anyway, as an owner call on 30 August 2026, not a scheduling accident.

The reason to hold: even in the office-hours shape it hands a school an
obligation it did not ask for, and the workload argument that killed replies to
feedback applies at a larger scale. The reason it may still be right: it is on
the switcher's list and a pilot school may well ask for it directly.

**How to settle it:** let the pilot schools raise it. If two of the first ten
ask unprompted, build it as scoped. If they do not, it stays parked and the
positioning line stands. Record the answer here either way.

---

## Copy fixes, cheap and independent of everything above

None of these need the gate, a migration or a safeguarding review, and all three
are wrong in the repository today.

1. **The heart.** `docs/product-overview.md` says "Parents can send a heart, and
   that is the whole channel". No parent reaction exists in the code, and
   `COMPETITIVE_POSITIONING.md` rejects one twice, most recently on 24 August.
   The heart that does exist is `JournalItem.stickerReply`, a child replying to
   their teacher's stickers, which is a different feature. Fix the overview so
   launch copy cannot inherit the wrong version.
2. **`LAUNCH_PLAN.md`** still carries the retired flat pricing and the wrong
   Tapestry claim. It is superseded in practice by `docs/launch-runway.md` and
   is a standing trap for anyone writing pricing copy. Already on the launch
   list; it belongs here too because the claim is a pricing claim.
3. **"Year-end transfer" and "whole-school export"** are on the landing page and
   in two billing panes today. Until items 1 and 3 land, either soften them to
   what is true or say plainly that they are coming. Selling a school a promise
   it will test in its first fortnight is the most expensive way to be wrong.

---

## How to work this

- One item per session. Each is scoped to be finishable.
- Rule 1 first: items 0, 1, 3 and 5 touch access control or children's data, so
  read `SAFEGUARDING.md` and work the review checklist.
- `npm run check` constantly; `npm run test:changed` before pushing; the full
  battery before anything lands on `main`. The table in `AGENTS.md` is the
  authority.
- Migrations cannot be generated on the mounted VM. Plan them, do not run them
  there.
- Leave the record. A decision taken here goes into `docs/pricing-decisions.md`
  if it is commercial, `docs/dpo-decisions.md` if it is data protection, and
  back into this file if it is scope.
