# School identity: the establishment register, and who owns a school

## Context

A `School` row **cannot be created by anything a user can reach**. `db.school.create`
appears in `prisma/seed.ts`, `prisma/seed-test.ts`, `prisma/seed-personas.ts` and
`scripts/ops/seed-academy.mjs`, and nowhere in `src/`. The comment already in
`src/app/actions/billing.ts:80` says as much: "Until now a SCHOOL row only ever
came from a seed."

So for every teacher who has ever signed up through the front door:

- `Teacher.schoolName` holds free text from step 2 of the wizard
  (`src/app/signup/teacher/SignupWizard.tsx:257`), and
- `Teacher.school` is `null`.

Everything that hangs off `School` is therefore unreachable for real users: the
admin console (`src/app/admin/page.tsx:15` bounces anyone without a `schoolId`),
the school plan (`ensureSchoolSubscription` returns `null` with no `schoolId`),
and — per the parent–teacher messaging plan, whose §5 gates the whole feature on
`kind: "SCHOOL"` — messaging.

Two teachers at the same school type "St Bede's Primary" and "St Bedes CofE
Primary School" and nothing joins them. The operator console shows that free text
verbatim (`src/app/ops/lookup/forms.tsx:164`, `src/app/ops/schools/page.tsx:56`),
so support cannot join them either. There is no answer anywhere in the product to
"are these two teachers colleagues?"

This plan fixes the identifying half with a public register, and the creating
half with a claim that is settled by payment.

## Decisions taken (owner, this session)

| Question | Answer |
|---|---|
| Where the register comes from | **GIAS** (Get Information about Schools), England. Imported, not called at runtime. |
| Non-England schools | **England picker, free text elsewhere.** The free-text field stays a first-class path, not a degraded one. |
| When a `School` row is created | **Not at signup.** Signup stores the establishment against the `Teacher`. The row is created later, deliberately. |
| How a second teacher joins | **Invite only**, through the existing admin. Never automatically by matching establishment. |
| What verifies a claim | **Payment.** The account that pays for the school plan becomes that school's verified admin. |
| Teachers already signed up at that school | **Invited, never migrated.** An existing individual account is only ever pulled into a paying school by an admin's invitation that the teacher accepts. |
| A teacher who is never invited | **Unaffected, indefinitely.** Buying a school plan degrades nobody else's account. |

The last one is the load-bearing decision and it resolves a problem the other
options did not. Read on.

## Why the claim needs settling at all

`assignClassToStaff` (`src/app/actions/admin.ts:79`) lets a school admin move any
class in their school to any member of staff — including themselves. That action
**is** the access control: `SAFEGUARDING.md` rule 5 says an admin never sees
children's work unless they teach the class, and assigning yourself the class is
precisely how you come to teach it. It is audited (`CLASS_ASSIGNED`), which is
the right treatment for a legitimate power, but it means **becoming a school's
admin is a privilege-escalation path**, not a filing convenience.

So "who may create a school" is a safeguarding question wearing an onboarding
hat, and the answer cannot be "whoever picks the name from a dropdown first".

**Payment answers it cleanly.** A school plan is bought by somebody who has given
Stripe a real billing identity and, in practice, a purchase order from a real
school. That is stronger evidence than any free check available: GIAS publishes
a school's website and telephone number but **not** its email addresses, so there
is no address to send a confirmation code to, and domain matching against the
website field is weak (schools routinely run `@st-bedes.lancs.sch.uk` behind a
`www.stbedesprimary.co.uk` website, or sit on a local-authority domain entirely).

It also puts the gate where the risk is. A free teacher has no school, no admin
console and no colleagues, so nothing to escalate to.

## Design

### 1. The register is a table, not a service

`Establishment` — one row per open English establishment, imported from the GIAS
all-establishments CSV. Public data about institutions; **holds no person**.

- Import is a **hand-run script**, `scripts/gias-import.ts`, in the shape of
  `scripts/mail-suppression-sync.ts`. There is no job runner in this repo
  (`RETENTION.md` records the scheduled-purge job as still open), so nothing here
  may depend on a cron.
- The download is a date-stamped CSV refreshed daily. **Resolve the URL from the
  GIAS Downloads page at import time rather than hardcoding a pattern** — the
  DfE's own JSON mirror (`DFE-Digital/gias-data`) was archived in January 2025,
  which is what depending on a convenience mirror buys you.
- Licence is **Open Government Licence v3.0**. Attribution belongs on the page
  that uses it and in `docs/brand-and-copy.md`.
- Filter on import to **open** establishments in primary-facing phases. ~50k rows
  in the file, ~28k open, ~20k of them primary/infant/junior. That is the
  addressable set and the only set worth carrying.
- Fields: `urn` (unique), `name`, `postcode`, `localAuthority`, `phase`, `town`.
  Nothing else. Website and telephone are not needed once domain matching is off
  the table, and a field nobody reads is a field somebody will later decide to
  display.

**Staleness is accepted, and the fallback is what makes that honest.** Schools
open, close and merge under new URNs constantly, and a hand-run import is a
snapshot. A real school missing from the picker must still be able to sign up,
which is why the free-text field stays.

### 2. Signup stores the establishment, and creates nothing

Step 2 of `SignupWizard.tsx` gains a type-ahead when Country is England, and
keeps the plain text input for Scotland, Wales, NI and Elsewhere.

- On selection, store `Teacher.urn` **alongside** `Teacher.schoolName`, not
  instead of it. The free text is what the teacher believes their school is
  called and it is already shown in the teacher shell and the ops console; the
  URN is the join key. Keeping both means a later re-import cannot rename a
  teacher's own school out from under them.
- No `School` row. No admin. Nothing changes about what a free teacher can do.

**What the server checks, and the one thing it deliberately does not** (added
2026-08-24, out of the safeguarding review of step 3). `createTeacherAccount`
looks the submitted URN up in the register and **drops it if it is not there**,
rather than refusing the signup: null honestly says "this teacher typed their
school's name", a key pointing at no row is a join somebody will one day follow,
and refusing would fail a real teacher whose school left the register between
step 2 and step 4 — which a wholesale re-import can do mid-signup.

It does **not** check that the URN matches the NAME stored beside it. A tampered
client can therefore send one school's name with another's URN and both are
kept. The row is already fetched, so closing this would cost nothing in
queries — and it is deliberately left open, because the check would reject a
real teacher whose school has been **renamed in the register** since they picked
it, which is a thing that happens to honest people and the mismatch is a thing
that happens only to somebody lying about their own account. The blast radius is
one adult's own record, self-inflicted, joined to nothing: a URN grants no
access, and §3 makes payment rather than selection the thing that settles a
claim on a school. **Revisit this when `School.urn` lands**, because a join key
that creates a school is a different proposition from one that sits inert.

**The accessibility risk is the real cost of this step.** `tests/battery/a11y/` is
a blocking gate, and a hand-rolled autocomplete is the single most likely thing
in this plan to fail axe and keyboard nav. Either use a native `<datalist>`, or
build a properly-ARIA'd combobox (`role="combobox"`, `aria-expanded`,
`aria-activedescendant`, arrow-key traversal, escape to close, announced result
counts) and budget real time for it. Do not discover this at the end.

Search runs **server-side** — 20k rows is not a payload, and a prefix match on
name plus postcode is a server action, not a client filter.

### 3. Claiming a school is buying the school plan

Today the order is inverted: `requireAdmin` needs `staffRole === "ADMIN"` *and* a
`schoolId`, and `ensureSchoolSubscription` needs a `schoolId` — so you must
already be a school admin to buy the thing that makes you a school. The new flow:

1. A teacher with a stored `urn` sees **"Set up whole-school"** in their own area.
2. That runs checkout for the school plan, in the band they pick, exactly as
   `startCheckout` does today.
3. **On the payment confirming**, in the webhook handler and in one transaction:
   create the `School` from the `Establishment` row, attach the `Subscription`,
   set the purchasing teacher's `schoolId` and `role = "ADMIN"`, and write an
   audit row.

`School.urn` is `@unique`. That is the whole payoff of the register: a second
teacher at the same school who tries to set up whole-school is stopped with
*"St Bede's Primary is already on StoryJar. Ask <admin display name> to add you"*
— which is a sentence the product cannot form today at all.

**The trial is the wrinkle, and it needs an owner decision.**
`ensureSchoolSubscription` deliberately opens a school plan on `TRIAL` with a
half-term runway *before* money moves, precisely so every teacher stays writable
in the gap between pressing the button and Stripe confirming
(`src/app/actions/billing.ts:88`). If payment is what verifies a claim, a
trialling school is an unverified one. Three ways out, in the order I'd pick them:

1. **Create the school at trial start, mark it unverified, stamp `verifiedAt` on
   first successful payment.** The admin gets the console and can invite staff;
   `assignClassToStaff` — the escalation path — stays refused until `verifiedAt`
   is set. Keeps onboarding intact, gates only the dangerous power.
2. Create the school only on payment. Cleanest rule, but a school evaluating
   before a PO is raised (which is the documented reason the trial exists) gets
   nothing to evaluate.
3. Treat starting a trial as verification, because a card has been presented.
   Simplest, and weakest.

I recommend (1) and have written the rest of this plan assuming it.

### 4. What is deliberately absent

- **No auto-join.** A teacher who picks the same establishment at signup does not
  join the school. They are told it exists and who to ask.
- **No self-service claim without payment.** There is no "I work here" button.
- **No domain matching.** Considered and rejected above; if it is ever added it
  is a signal for the operator, never a grant.
- **No operator approval queue.** Payment replaces it, which keeps a human out of
  the onboarding critical path.

Each of these gets a comment saying it is a decision, or somebody adds it later
as a missing feature.

### 5. Existing individual accounts are invited, never migrated

**Owner decision.** When a school becomes a paying school, teachers who had
already signed up individually naming that school are **not** swept into it. The
admin invites them, one at a time, and nothing happens until that teacher
accepts.

The reason is the obvious failure the other way round. Anyone can type a school
name at signup — that is exactly the free-text field this plan is built on top
of, and the register does not check that a person works where they say. If a
paying school automatically absorbed every account whose `urn` matched, then the
teacher who signed up at the wrong St Mary's, or the parent-governor who had a
look round, or somebody who simply picked the nearest school from a dropdown,
would land inside a real school's subscription with a real school's admin over
them. Matching a name is not evidence of employment and must never be treated
as a grant.

**Acceptance is the teacher's, not the admin's.** This is the half that is easy
to skip and should not be. A teacher's classes hang off the teacher
(`Class.teacherId`), so joining a school brings their classes — and therefore the
children's work in them — under a school admin who can reassign any of them,
including to themselves (`assignClassToStaff`). Joining a school hands oversight
of children's work to a new adult. That has to be a thing the teacher does, not a
thing done to them, and it is a rule 5 question rather than an onboarding
preference.

So the shape is: admin invites → the teacher is told plainly what joining means
for their classes → the teacher accepts or declines → only on acceptance is
`schoolId` set. A declined or ignored invitation leaves everything exactly as it
was.

**Three things in the code have to change before any of this works.**

1. **`inviteStaff` refuses an email that already exists.**
   `src/app/actions/admin.ts:38` returns *"Someone with that email is already on
   StoryJar"* for exactly the person this decision is about. The already-registered
   colleague is currently the one case the invite flow cannot handle. It needs a
   second path: invite an *existing* teacher, which creates a pending
   invitation rather than a new `Teacher` row.
2. **There is no accept-invite flow at all.** `inviteStaff` creates a teacher with
   `passwordHash: ""` and `status: "INVITED"`, `resendInvite` is explicitly a
   no-op ("in this build a no-op that just refreshes; a real deployment would
   re-send the email", `admin.ts:96`), and `staffInviteEmail`
   (`src/lib/emailTemplates.ts:167`) is never called from anywhere. **Invited
   staff cannot sign in today.** This is pre-existing, and this decision now
   rests on it, so it gets fixed here.
3. **A pending invitation needs to be a row.** Today "invited" is a `status` on a
   `Teacher` the admin created. An invitation to an *existing* teacher cannot be
   modelled that way — that teacher already exists, with their own school-less
   account. It needs its own small model (school, invited teacher, role offered,
   who sent it, when) that is consumed on acceptance and deleted on decline.

**Their own subscription stays.** Leave the teacher's `FREE` `Subscription` row
in place when they join: `governingSubscription` already prefers the school's row
whenever `schoolId` is set, so the free row is dormant rather than competing. It
matters on the way out — `removeStaff` sets `schoolId = null`, and a teacher whose
free row had been deleted would fall straight through the write gate into
read-only with no way back. Deleting it would turn leaving a school into losing
your account.

**Un-invited teachers are unaffected.** A colleague who is never invited keeps
their free account, their classes and their children's work exactly as before.
Buying a school plan must not degrade anybody else's account — §6 sets out why,
at some length, because the opposite reads tidier and is worth refusing on the
record.

### 6. An un-invited teacher is unaffected, indefinitely

A colleague who is never invited keeps their free account, their classes and the
children's work in them, for as long as they want it. **Buying a school plan
never degrades anybody else's account.** The reasoning matters more than the rule,
because the opposite reads tidier and is worth refusing on the record.

**"Un-invited" is five populations, not one.** A teacher at a school that has just
started paying is any of: someone the admin has not got round to yet (a school of
thirty invites people over a fortnight); someone the admin deliberately left out
(a TA, a trainee, a band the school did not want to pay for); someone who used to
work there and moved on; someone who never worked there at all and typed the
wrong St Mary's; or someone supply, peripatetic or cross-federation, where the
answer is genuinely unclear. Suspending on non-invitation is right for one of
those five, wrong for three, and arguable for the last.

**The trigger would be a signal this plan has already called untrustworthy.**
Everyone currently in production has free text and no URN — that is the
backfill question below. So for the population this is actually about, "does this
teacher work at the paying school?" would be answered by fuzzy-matching a name
they typed at signup, possibly two years ago, against a register entry. §2 refuses
to let that match *grant* anything on the grounds that it is not evidence of
employment. It cannot then be used to *revoke*. Revocation needs a **higher**
standard than granting, not a lower one: a wrong grant hands somebody an empty
school, a wrong revocation takes a working teacher's classes off them mid-term.

**It would also mean opening a route this codebase deliberately closed.**
`src/lib/billing.ts` is explicit that a free plan can never become read-only —
"there is no route from here to FROZEN… the NULL check is the enforcement, not a
convenience". There is no suspend mechanism for a free teacher anywhere in `src/`;
the word appears only in the Terms and Acceptable Use pages, as a power held to
protect children. Building one so that the first thing through it is a **billing
event** rather than a safeguarding one is the wrong precedent to set in that file.

**And it would be the processor acting on its own inference.** The school is
controller of the children's data; StoryJar is processor, and a teacher's account
holds that work under their school's lawful basis. Withdrawing a teacher's access
as an automatic consequence of a *different* teacher's purchase is not an
instruction from the controller. Where a school wants a colleague's access
removed, that is an instruction they give, and `removeStaff` is already where it
belongs.

### 7. What is stored about a person

Nothing new. Do **not** put a billing email on `School`: the paying identity
already lives on `Subscription` and in Stripe, and `RETENTION.md` line 67 already
treats disclosing an adult's address in the operator area as an audited
operation. Record `School.claimedByTeacherId` and `School.verifiedAt` and derive
the rest.

## Two things this spins out, neither of which may hang off billing

Refusing suspension does not mean the concerns underneath it are imaginary. Both
are real; both are badly served by tying them to a purchase.

### A. Ex-staff still holding children's work

A teacher who has left a school walks off with their classes: `Teacher.school` is
`onDelete: SetNull` and `Class.teacherId` points at the teacher, not the school.
That is a live safeguarding question — an adult with no current connection to a
school retaining access to its children's work — and it is **true whether or not
the school ever pays**.

Hanging it on the purchase event gets it exactly backwards: it would fire for
schools that buy and never fire for schools that don't, when the risk is
identical. It needs its own mechanism, on its own timing: a school-side "this
person has left" flow that does something deliberate about their classes, and a
periodic, low-friction prompt asking a teacher to confirm where they work.

**Scope:** its own plan. It touches erasure, class reassignment and possibly
`RETENTION.md`, and it is the same defect the parent–teacher messaging plan meets
from the other side (a thread whose school changes underneath it). It should be
settled once, in one place, rather than three times.

### B. Colleagues on free accounts while the school pays

Also real, and the fix is visibility rather than coercion. Surface it to the
admin: *"Six teachers with a StoryJar account name your school. Invite them?"*,
with a one-click invite beside each. That converts the same people without taking
anybody hostage, and the teacher still accepts or declines per §5.

This is only possible **because** of the register — matching on URN is what lets
the product form a sentence it cannot form today. It is a good argument for the
register on its own, independent of admin and messaging.

**Scope:** in this plan, as a step in the sequencing below. It is a read and a
list, and it reuses the invitation flow §5 already requires.

**One caution on the copy.** The list is built from a name a teacher typed, so it
will contain people who do not work there. It must read as a suggestion the admin
checks, never as a roster — *"name your school"*, not *"work at your school"* —
and it must never show anything about those teachers beyond a name. `SAFEGUARDING`
rule 5 keeps an admin out of children's work; a list of maybe-colleagues must not
become a back door to who teaches what.

## The gates this has to pass

**Ops blindness** (`scripts/check-ops-blindness.mjs`). A new model is refused as
`OPS-MODEL-UNKNOWN`, so `npm run check` goes red the moment the schema lands —
the gate working. Classify in the same commit:

- `Establishment` → **`ADULT_READABLE`**. It holds no person at all: a name, a
  postcode and a URN, every one of them already published by the DfE under an
  open licence. An operator answering "is this school in the register?" is
  ordinary support. Worth a sentence in the comment noting it is *public
  reference data* rather than a record of an adult, since `ADULT_READABLE` is
  otherwise about adults — if that reads wrong to the next person, the precedent
  for minting a new class is `PLATFORM_CONTENT` at line 283.
- `School.urn`, `School.verifiedAt`, `Teacher.urn` → no new classification;
  `School` and `Teacher` are already `ADULT_READABLE` (line 247).
- None of the new field names trip `SENSITIVE_NAME_PATTERNS` (line **1137** — note
  for anyone working from the messaging plan, which cites 1110). `urn` is safe.

**Retention.** `RETENTION.md` needs one row for the establishment table, saying
what it is: public reference data about institutions, no personal data, replaced
wholesale on each import, and not subject to a retention clock because there is
no data subject. And one line on `Teacher.urn` — deleted with the teacher, by the
same cascade.

**DPIA.** No new sub-processor: the CSV is imported, not called. That is worth
stating explicitly in `docs/DPIA.md` rather than left as an absence, because "we
added a schools directory" reads like a third party until somebody checks.

**Safeguarding.** This does not need a constitutional amendment the way messaging
does — it grants no new access to any child's data. It does need the review
checklist worked through in the PR (`SAFEGUARDING.md:242`), because it changes
**who can become an admin**, and rule 5 is about exactly that.

**Test selection.** A `prisma/` change selects everything under
`scripts/select-suites.mjs:96`. Budget the full ~9-minute set, not the 6-minute
product run.

## Verification

**New tests, by suite:**

- `tests/battery/security/school-claim.spec.ts` — the important one. A second
  teacher cannot claim an already-claimed URN. A teacher who has not paid cannot
  reach the admin console by any route (the page, the server action, a direct
  POST). An unverified school's admin cannot call `assignClassToStaff`. A teacher
  cannot set their own `role` to `ADMIN`. **An existing individual account is
  never attached to a school without an accepted invitation** — not by claiming
  the school, not by matching URN, not by any server action an admin can reach.
  And **claiming a school changes no other teacher's account**: assert an
  un-invited teacher at the same URN is still writable, still owns their classes,
  and still reaches their own children's work after the purchase settles.
- `tests/battery/security/` — establishment search cannot be turned into a
  data-extraction endpoint (bounded result count, no unbounded wildcard).
- `tests/battery/a11y/` — the combobox under axe **and** keyboard nav, plus the
  free-text fallback path for a non-England country.
- `tests/e2e/` — signup with a picked establishment; signup with free text;
  claim-then-invite-a-colleague.
- `tests/battery/personas/` — a teacher whose school is genuinely not in the
  register. If that path feels like an error state, the design has failed.

**Fixtures.** Extend `prisma/seed-test.ts` with a handful of fictional
establishment rows. Do **not** import real GIAS data into the test seed:
`docs/TEST_LOGINS.md` says fictional data only, forever, and a real school's name
in a fixture is a real school's name in a screenshot.

## Suggested sequencing

Each step ends green.

1. `Establishment` model + ops-gate classification + `RETENTION.md` row +
   `scripts/gias-import.ts`. No UI. `npm run check` green.
2. Server-side establishment search, with its bounds and its tests.
3. Signup step 2: the combobox and the fallback. This is where the a11y time goes.
4. `School.urn`, `School.verifiedAt`, `School.claimedByTeacherId`; the claim
   transaction in the billing webhook; the "already on StoryJar" refusal.
5. "Set up whole-school" entry point, and the `assignClassToStaff` guard on
   `verifiedAt`.
6. The invitation model, the accept/decline flow, the invite-an-existing-teacher
   path, and actually sending `staffInviteEmail`. This is a bigger step than it
   looks — it is where the pre-existing hole gets filled.
7. The admin-side "teachers who name your school" list and its one-click invite
   (spin-out B). Reuses step 6 entirely; it is a read and a list.
8. Tests, seeds, then the document work (RETENTION, DPIA, brand-and-copy
   attribution, AGENTS.md index row for this file).

## Open questions, flagged rather than assumed

**The trial.** Settled provisionally as option (1) in §3, but it is an owner
decision about money and trust, not an implementation detail.

**Teachers who already signed up.** Everyone currently in production has free
text and no URN. Nothing here backfills them, and a fuzzy name match against the
register is exactly the kind of quiet guess this plan exists to remove. The
honest options are to leave them, or to offer a one-time "is this your school?"
prompt they can decline. Not decided.

It matters more now than it did: spin-out B's list is built from that same free
text, so until there is a URN on those rows the list is a fuzzy name match with
all the caution that implies.

**Ex-staff, and the free-rider list.** Both spun out above rather than left
here — A needs its own plan, B is step 7. Neither is resolved by this document
alone.

**Wales, Scotland, NI.** Free text for now. Wales publishes an address list of
schools and PRUs; Scotland's data is spread across spatial data and FOI releases;
neither has GIAS's schema, identifier scheme or refresh cadence. Revisit when
there are enough non-England signups to justify the maintenance, and not before.

---

## Note for the messaging plan

Three things found while checking this, which that plan should absorb:

1. The admin check is `user.teacher.staffRole`, not `Teacher.role` — the session
   maps one to the other at `src/lib/auth.ts:101`. The messaging plan's §4 says
   `Teacher.role === "ADMIN"`, which is true of the database column but is not
   what any guard in the codebase reads.
2. Messaging depends on a `School` existing, and until this plan ships no real
   school does. Messaging is unshippable-in-practice without it.
3. `SENSITIVE_NAME_PATTERNS` is at line 1137, and `NEVER_LINK_RELATIONS` does not
   exist in the gate at all.
