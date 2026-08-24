# Parent–teacher messages, held to school office hours

**Status: a plan, not built.** Nothing in this document exists in the codebase
yet. It reverses a written product decision and needs a constitutional amendment
to ship — that work is in scope here, not a footnote.

**It also has a hard dependency.** Messaging is gated on the school plan, and
until [`docs/school-identity.md`](./school-identity.md) ships **no real signup can
produce a `School` row at all** (`db.school.create` appears only in seeds). So
this is unshippable-in-practice on its own, however green its own gates go.

## Context

Parents currently have no way to reply to anything. `src/app/family/` is a
read-only window onto a child's approved moments (`getCurrentParent()` in
`src/lib/parentAuth.ts` returns approved items and nothing writable). Teachers
asking for two-way contact are told to use the school's other tool.

This change adds a message thread between a child's family space and that child's
class teacher, with **one hard rule**: a message is never delivered outside the
school's office hours. Written at 21:40, it reaches the recipient when the school
next opens, and the sender is told so at the moment they send it.

Hours are set by the **school**, never by an individual teacher — parent contact
is a school-oversight matter — and StoryJar hard-caps what a school may choose so
"office hours" cannot quietly become "all day".

### The concern to state up front

`COMPETITIVE_POSITIONING.md:23` records a deliberate **REJECT** verdict on
"Two-way parent messaging / DMs", for two named reasons: scope creep, and "an
adult-in-a-child's-space safeguarding minefield". `SAFEGUARDING.md:138` (rule 6)
says parents are **read-only**.

The shape asked for is a direct answer to both objections rather than a dismissal
of them. The evenings objection ("your evenings stay yours") is met structurally:
nothing is delivered out of hours in **either** direction, so a teacher writing at
22:00 cannot set an out-of-hours expectation either. The adult-in-a-child's-space
objection is met by keeping the thread entirely outside the child's product — no
child account can read or write a message, and nothing from it appears in the jar.
Those two properties are what the amendment is written to bind.

## Decisions taken (owner)

| Question | Answer |
|---|---|
| Direction of the hold | **Both.** Teacher→parent is held exactly as parent→teacher is. No force-send override. |
| Schedule granularity | **Per weekday + closed dates.** Mon–Sun each get their own window (or none); a closure list covers INSET days and holidays. |
| Thread shape | **Per child**, between that child's family space and the class teacher. |
| StoryJar's hard cap | Window must sit inside **06:00–20:00** and be **≤10 hours**. |

## Design

### 1. The hold is a read-time gate, not a delivery job

There is **no scheduled job runner in this repo** — `scripts/mail-suppression-sync.ts`
is run by hand, drafts are "lazily purged on access (no cron)" (`RETENTION.md`),
and automating the frozen→deletion pipeline is still an open item. So the release
must not depend on a cron, and it doesn't need to:

- `Message.deliverAt` is computed **server-side at insert** and stored.
- Every read of messages filters `deliverAt <= now()`. One helper owns that
  filter; nothing else may query the table.
- The **sender** always sees their own held message, labelled with when it will
  arrive. The **recipient** sees nothing at all until `deliverAt` passes.

Time passing is the only thing that delivers a message. Nothing to schedule,
nothing to fail silently overnight.

**The hold is on delivery, not on reading.** A message delivered at 16:55 stays
readable at 22:00. Closing the window never hides something already handed over.

**The policy-change edge case, decided explicitly.** If a school narrows its
hours after a message was held, a stored `deliverAt` could land outside the new
window and break the hard rule. So changing the policy **recomputes `deliverAt`
for every still-undelivered message in that school, in the same transaction as
the policy write**.

*Corrected from the first draft.* Prisma 6.19's `updateMany` does take a full
`WhereInput`, so `where: { thread: { schoolId }, deliverAt: { gt: now } }` is a
valid filter — the relation hop is fine. What it cannot do is set a **different**
`deliverAt` per row, and each held message's new delivery time depends on when it
was written. So the shape is: select the undelivered rows with their `createdAt`,
recompute each, write them back inside the same transaction. Bounded and
deterministic, just not one statement.

### 2. Hard caps live in one pure module

`src/lib/messaging/officeHours.ts` — no `server-only`, importable by the form and
the action so client and server cannot disagree:

```
EARLIEST_OPEN_MINUTE = 6 * 60    // 06:00
LATEST_CLOSE_MINUTE  = 20 * 60   // 20:00
MAX_WINDOW_MINUTES   = 600       // 10 hours
```

A school may pick 07:00–17:00 or 08:00–18:00 or anything shorter; it may not pick
05:00, it may not pick 20:30, and it may not pick eleven hours. Validation is
re-run in the server action — the form is a convenience, the action is the rule.

Exported: `validateWindow()`, `deliveryTimeFor(writtenAt, policy)`,
`isOpenAt(instant, policy)`, `nextOpeningAfter(instant, policy)`.

**Timezone.** There is no date library and almost no timezone handling — every
other date in the app is formatted in the server's local zone
(`src/components/JournalItemCard.tsx:31`, `src/app/teacher/queue/page.tsx:7`).
The one place that gets it right is `src/lib/ops/health.ts:59`, which builds an
`Intl.DateTimeFormat` pinned to `timeZone: "Europe/London"`. **Copy that pattern,
don't import it** — that file is under the ops roots and the blindness gate's
import allowlist makes it the wrong thing to depend on from product code.

Evaluating in Europe/London wall-clock gets BST right, where a raw UTC offset
would put 08:00 at 09:00 for half the year. A `timezone` column is stored so the
assumption is visible in the data, but it is fixed to `Europe/London` and there
is no picker.

### 3. Schema

New models in `prisma/schema.prisma`, each with the comment block this schema
uses to record which rule it serves and where its retention line is.

- **`MessagingPolicy`** — one per school. `schoolId @unique`, `enabled` (default
  **false**), `timezone`, `updatedAt`, `updatedByTeacherId`. Off by default is
  the Children's Code high-privacy default, not a soft launch.
- **`OfficeHourWindow`** — `policyId`, `weekday` (0–6), `openMinute`,
  `closeMinute`. **No row for a weekday means closed that day**, so weekends are
  closed unless a school says otherwise.
- **`OfficeHoursClosure`** — `policyId`, `date` ("YYYY-MM-DD"), `label`. INSET
  days and holidays. School-level, holds nothing about a person.
- **`MessageThread`** — `studentId @unique`, `schoolId`, `classId`,
  `lastMessageAt`. Participants are **derived, never stored**: the student's
  linked `Parent`s and `student.class.teacher`. Derivation means a child moving
  class moves the thread with them and a removed guardian loses access the
  moment their link goes, with no second list to forget to update.
- **`Message`** — `threadId`, `senderType` (`PARENT` | `TEACHER`),
  `senderParentId?`, `senderTeacherId?`, `messageBody`, `createdAt`, `deliverAt`,
  `readByParentAt?`, `readByTeacherAt?`.

**Why `messageBody` and not `body`.** *Corrected from the first draft, and this
one would have failed the build.* §6 requires the message text on `DENY_FIELDS`,
and the banned-identifier scan is a **case-insensitive whole-word regex over
every file under the ops roots** (`check-ops-blindness.mjs:1459`; comments are
stripped, so only real code counts). `src/app/ops/handbook/sections.tsx:26`
already has a React prop named `body` — and the comment above it records that the
gate is what pushed it into that shape. Denying `body` would deny an identifier
ops code already uses, and `npm run check` would go red on a file with nothing to
do with messaging. `messageBody` is distinctive, denies cleanly, and trips none of
the naming patterns below.

**Naming constraint, easy to trip.** `SENSITIVE_NAME_PATTERNS`
(`check-ops-blindness.mjs:1137` — **not** 1110, as the first draft had it) rejects
any field matching `/hash$/i`, `/secret/`, `/token/`, `/code$/i`, `/password/`,
`/Json$/`, `/^caption$/i`, `/^media/i`, `/note$/i`, `/sticker/`, `/^pin[A-Z]?/`.
So the closure field is `label`, not `reasonNote`. Same reasoning as the
`outcomeDetail` and `templateKey` comments already in the schema.

### 4. Who may do what

| Actor | Can |
|---|---|
| School **admin** (`staffRole === "ADMIN"` with a `schoolId`) | Switch messaging on/off for the school; set the weekday windows and closures |
| Class **teacher** | Read and reply in threads for children in **their own** classes only |
| **Family space** | Read and write in the thread for a child **linked to it** |
| Child | **Nothing.** No read, no write, no surface, no mention |
| Platform **operator** | **Nothing** — see §6 |

*Corrected from the first draft:* the guard is `user.teacher.staffRole`, not
`Teacher.role`. The session maps the column to that name at `src/lib/auth.ts:101`,
and every admin guard in the codebase reads `staffRole`
(`admin.ts:16`, `admin/page.tsx:15`, `billing.ts:49`).

There is deliberately **no per-teacher opt-out and no per-teacher hours**. A
teacher cannot narrow, widen or disable their own availability, because the point
of the feature is that parent contact carries school oversight. The absence is a
design decision and gets a comment saying so, or someone will add it as a
"missing setting" later.

### 5. The family space is a household, not a person

This is the finding that most changes the safeguarding case, and it was missing
from the first draft entirely.

`Parent` is **one row per household**, not per adult. It holds a `familyCode`
printed on a letter the school office posts home, and `name` and `email` are
**both NULL** unless a parent typed them in themselves — the schema comment is
explicit that "a teacher NEVER types a parent's name or email". Three
consequences, all of which the amendment has to carry:

1. **There is no identifiable human on the parent side.** A teacher sees a message
   from a family, not from a named adult, and in the normal case there is no name
   to show at all. The UI must not imply otherwise, and a teacher must not be led
   to believe they know who wrote to them.
2. **Anyone holding the letter can read the thread.** Today that code buys
   read-only access to approved work. After this it buys a teacher's written words
   about a named child. That is a materially larger prize for a lost letter, and
   it is a reason the hard caps and the text-only rule matter rather than a
   detail for the DPIA.
3. **Re-issuing a family code hands over the history.** `RETENTION.md:57` says a
   replaced code has "no lasting value" — which stops being true the moment a
   message history hangs off the row. **Open decision** below.

### 6. Subscription gate

Messaging exists only where the governing subscription is `kind: "SCHOOL"`.
A free teacher has no `School` row, so there is no admin to set hours and no
oversight to be had — the feature is simply absent for them, which is a coherent
rule rather than a paywall.

Reuse `governingSubscription()` / `requireWritableAccountForTeacher()` from
`src/lib/billing.ts:139` for the writable check; add
`schoolMessagingPolicy(schoolId)` for the feature check.

**Do not band-gate it.** `src/lib/billing-plans.ts:31` states the promise
directly: "EVERY feature is in EVERY band. The band buys capacity, never
functionality — that is the line competitors cross and we don't." A £199 village
primary gets the same messaging as a £649 one.

**Note the DEMO tenant.** `School.kind` may be `"DEMO"` (StoryJar Academy), and
the schema comment is explicit that nothing may read `"DEMO"` and relax a rule. So
the Academy gets messaging like any other school. That is wanted — it is where
this gets rehearsed — but it should be said rather than discovered.

### 7. Ops blindness — the gate will fail the build until this is done

`scripts/check-ops-blindness.mjs` refuses any unclassified model with
`OPS-MODEL-UNKNOWN`, so `npm run check` goes red the moment the schema lands.
Classify deliberately, in the same commit, with a comment naming the rule — the
file's own ruling R2 procedure:

- `MessageThread` and `Message` → **`CREDENTIAL_NEVER`** (line 321): no read of
  any shape, not even a count. This follows the `AuditLog` precedent exactly —
  `AuditLog` is in that class not because it holds a credential but because its
  free text "routinely contains a child's first name". A message between a
  parent and a teacher *is about a named child* and will contain one constantly.
- `MessagingPolicy`, `OfficeHourWindow`, `OfficeHoursClosure` →
  **`ADULT_READABLE`** (line 247). These hold no person at all — a weekday and two
  integers. An operator answering "is messaging on for this school, and what
  hours?" is ordinary support.
- Add `messageBody` to `DENY_FIELDS` (line 486) with a comment. It matches no
  `SENSITIVE_NAME_PATTERNS` regex, so the drift check will not ask for it — which
  is exactly why it has to be added by hand.
- Per rule 2 of the gate's "only legitimate edits", add a fixture under
  `tests/fixtures/ops-blindness/` proving the true positive still fires.

*Corrected from the first draft:* it also claimed `MessageThread`'s parent→child
linkage is refused by `NEVER_LINK_RELATIONS`. **That constant does not exist** —
it appears only in a comment at line 77 describing a hypothetical amendment C2
that was never made, and in stale worktrees under `_to_delete/`. The
`CREDENTIAL_NEVER` classification stands on the `AuditLog` precedent alone, which
is sufficient; the citation was not.

This is a **tightening**, not a widening: the two person-bearing models land in
the strictest class the gate has.

### 8. Notification — an accepted limitation, stated rather than hidden

There is **no notification path, and there cannot be a good one.** Most family
spaces have no email address at all. `RETENTION.md:58` and the DPIA both rest on
"no child's name and no child content is ever in an email", so any notification
must be nameless and contentless — *"There's something new in StoryJar"* — and
for the majority case there is nothing to send it to.

So a message held until 08:00 on Monday is delivered into silence until the
family next signs in. That is a real limit on the feature and it belongs in the
copy a school is given, not only here. It is not a reason to weaken the hold; it
is a reason not to promise schools that messaging replaces the school's own
contact route.

### 9. Safeguarding — the constitutional work

`SAFEGUARDING.md` rule 6 currently says parents are read-only. Giving a family
space a write surface needs an amendment, and this repo has a precedent for
exactly how to write one (the 2026-07-15 class-PIN carve-out): a named exception,
bound by constraints each of which is testable, plus a row in the Amendments
table saying what was traded away.

Add **rule 21**, sitting beside rule 6 (the numbering note forbids renumbering;
rule 20 already sits out of sequence at line 118, so 21 is free):

> **Parent–teacher messages are school-governed, bounded by office hours, and
> never a channel to a child.**

Bound by all of the following — a change breaking any one does not ship:

1. **Off by default, per school.** A school admin switches it on. An individual
   teacher can neither enable nor disable it.
2. **No child ever touches it.** No student session may read or write a message;
   nothing from a thread appears in the jar, the student area, or any export a
   child can reach.
3. **The hold is absolute.** No override, no "send now", no urgent flag. A
   feature that can be bypassed under pressure is not a rule.
4. **Not an emergency channel, and it says so.** Standing copy on every compose
   screen: if a child is unwell or the school is needed now, telephone the
   office. A channel that is shut fourteen hours a day must never be the one a
   parent reaches for in a crisis, and must never look like it. §8 makes this
   sharper, not softer: there may be no notification at all.
5. **Text only.** No attachments, no images, no audio — the media pipeline and
   its access control (rule 7) stay out of this entirely. Links in a message
   body are never rendered clickable (rule 15, extended from child input to
   parent input).
6. **Scoped server-side like any other child data** (rule 4): parent↔child link
   on one side, `class.teacherId` on the other.
7. **The thread is reachable by whoever holds the family code**, and is written
   to be safe on that assumption: text only, no child's work, nothing a teacher
   would not put on a letter home. See §5.
8. **Audited** (rule 16): messaging enabled/disabled, hours changed, thread
   created, message sent.
9. **Retention line before it ships** (rule 9).
10. **Unreadable by the operator** (rule 20), enforced by the gate.

Also update: `RETENTION.md` (a row for threads/messages — deleted with the
child, the class, the school and the family space, by the same cascades and the
same `deleteOrphanedParents()` path); `docs/DPIA.md` (a new risk row, including
the lost-letter exposure in §5); `COMPETITIVE_POSITIONING.md` (the REJECT verdict
at line 23 and the "Can parents message me?" script at line 109 both now say
something untrue — rewrite them to describe what actually shipped and why it is
not a DM channel).

### 10. Deletion

Cascade at the schema level (`onDelete: Cascade` from `Student`), and check the
existing erasure paths in `src/lib/erasure.ts` — `eraseStudent()` (line 154),
`eraseClass()` (line 181) and `deleteOrphanedParents()` (line 116) — take threads
and messages with them. Messages hold no media, so nothing needs adding to the
media-path gathering; the cascade is the whole story. Assert it
**rows-are-gone** rather than merely-inaccessible, the way
`tests/battery/security/family-access-cross-tenant.spec.ts` already does.

### 11. UI

- **Admin** — a new `"messages"` tab in `src/app/admin/tabs.ts` (add to `Tab`,
  `TABS` and `TAB_HEADING`) with a `MessagesPane.tsx` beside `BillingPane.tsx`,
  reusing the shared `CARD` style already exported there. Seven weekday rows, an
  open and close time each, a closures list, and the cap stated in plain words
  next to the form ("Up to 10 hours a day, between 6am and 8pm").
- **`src/app/family/`** — the thread, below the child's moments in
  `ParentHome.tsx`. Composer shows the standing emergency line, and on send out
  of hours: *"It's outside school hours. Mr Pearson will get this at 8:00am on
  Monday."* Held messages appear in the family's own view greyed, with that
  label.
- **`src/app/teacher/messages/`** — a new route beside `queue/` and `students/`,
  scoped to the teacher's own classes, with the same composer behaviour and the
  same held-message labelling.

Copy must pass `scripts/error-string-audit.mjs` (no jargon: not "queued", not
"delivery window"). Expect that audit to be noisy here: it only scans lines
mentioning error/message/toast/label/title, and every line of this feature
contains the word "message", so essentially all of its strings enter the report.

## Verification

**While writing:** `npm run check` (~2s) — it will fail on the ops gate until §7
is done, which is the gate working.

**New tests, by suite:**

- `tests/battery/security/messaging-office-hours.spec.ts` — this is a *security*
  test, not a UX one. A held message must be unreachable by the recipient **by
  every route**: the page, the server action, and a direct thread fetch. Plus:
  a non-admin teacher cannot write the policy; a posted window of 11 hours, or
  one starting at 05:00, is refused server-side even when the client sends it.
- `tests/battery/security/messaging-cross-tenant.spec.ts` — School B's family and
  School B's teacher must never reach School A's thread. Required by the
  AGENTS.md convention: "New endpoint/action taking an id → add a cross-tenant
  isolation test before it ships."
- `tests/battery/a11y/` — the composer, the held-message notice and the admin
  hours form under axe + keyboard nav.
- `tests/e2e/` — in-hours send arrives; out-of-hours send does not.
- `tests/battery/personas/` — a parent writing at 9pm, in the persona's voice
  (`t.say()` / `t.expects()`), checking the explanation actually reads as an
  explanation.

**Controlling the clock without faking it.** Don't stub time. Seed School A
(St Bede's) with a window that always contains "now", and School B (Oakfield)
with a policy whose weekdays are all closed. In-hours and out-of-hours then both
have a deterministic fixture and the tests never race a real clock. Extend
`prisma/seed-test.ts` and `prisma/seed-personas.ts` accordingly.

**Before pushing:** `npm run test:changed`. A `prisma/` change selects
**everything** under `scripts/select-suites.mjs:96`'s deny-by-default rule, so
this is the full ~9-minute set — expect it and budget for it. Then
`npm run test:changed -- --all` before merge.

Per AGENTS.md: a lone timeout in a lane run is a re-run before it is a bug — run
that spec alone and believe the second answer.

**The PR must work through the safeguarding review checklist**
(`SAFEGUARDING.md:242`) in its body. Every box.

## Suggested sequencing

Each step ends green, so a red gate always points at the step that caused it.

0. **`docs/school-identity.md` ships first.** Not optional, and not this plan's
   work — but without it there is no school to switch messaging on for.
1. `officeHours.ts` — pure module, caps, Europe/London evaluation, unit-level
   coverage. Nothing else touched.
2. Schema + ops-gate classification + fixture + `RETENTION.md` row. `npm run check`
   green.
3. Server layer: policy read/write, thread and message reads behind the single
   delivery filter, actions, audit calls, erasure cascade.
4. Admin hours screen.
5. Family and teacher UIs.
6. Tests, seeds, then the document work (SAFEGUARDING rule 21 + amendment, DPIA,
   COMPETITIVE_POSITIONING, TEST_PLAN).

## Open questions, flagged rather than assumed

**Re-issuing a family code.** A new code is posted home when a letter is lost or
a family's circumstances change. Does the new holder inherit the message history?
Keeping it is a disclosure to whoever now holds the code; clearing it destroys a
record a teacher may rely on. Neither is obviously right and it must be decided
before §5 can be written into rule 21. Not decided.

**A guardian with children in two classes** gets two threads (one per child),
which follows from the per-child decision but means writing twice to say one
thing. That is the right default for scoping; a combined view is a later change
if parents ask for it.

**A teacher moving school, or leaving one.** `Teacher.school` is
`onDelete: SetNull` and classes hang off the teacher, not the school — there is
no `School.classes` relation. So `MessageThread.schoolId` is derived through
`class.teacher.schoolId`, which can change or go NULL while messages are held
against the old school's hours. §1 handles hours narrowing; it does not handle the
school underneath the thread changing. **This is the same defect
`docs/school-identity.md` meets from the other side** (a departing teacher walking
off with their classes) and it should be settled once, in one place, rather than
twice.
