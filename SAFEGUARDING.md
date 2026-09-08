# Safeguarding & security — the rules for StoryJar

> **Rule 1: Safeguarding comes first. Everything else comes after it.**
>
> StoryJar exists to hold the work of children aged 3–11. If a feature,
> optimisation, deadline or convenience trades off against a child's safety or
> privacy, **safety wins — without discussion**. When a choice is unclear, take
> the more protective option and escalate rather than guess.

This document is the constitution for how StoryJar is built. It binds everyone
who works on the codebase, **including AI agents** (it is referenced from
`AGENTS.md`). Read it before changing anything that touches authentication,
access control, the approval queue, children's data, or uploaded media.

It is **engineering governance, not legal advice.** The customer-facing policies
(privacy, safeguarding, DPA, etc.) must be reviewed and signed off by a
qualified data-protection / education-law professional and the responsible data protection lead
before they are relied upon.

---

## Who we are, in law

- The **school is the data controller.** **StoryJar is a data processor** acting
  on the school's documented instructions.
- That means we **minimise** what we hold, we **never** repurpose children's data,
  and we give schools the tools to meet *their* obligations (privacy information,
  a Data Processing Agreement, export and deletion).
- The people whose data we hold are **children who cannot meaningfully consent**.
  We design as if a parent, a DSL (Designated Safeguarding Lead) and the ICO are
  reading over our shoulder — because one day they will be.

---

## The rules

Each rule is testable. A change that breaks one does not ship.

### A. Children are never made into account-holders
1. **No child logins, emails or passwords — ever.** Children sign in with a class
   code and by tapping their own name. Never add a flow that asks a child for an
   email address, a password, a phone number, or any other contact detail — or
   any credential that could identify them outside StoryJar.

   **The one exception — an optional KS2 class PIN** *(amended 2026-07-15; see
   "Amendments" below)*. A teacher may switch on a short numeric PIN for their
   class — intended for Years 4–6, where signing in as each other is a real
   problem and typing four digits is not a barrier. Each child chooses their own.
   It exists for exactly one reason: **to stop children signing in as each
   other.** It is bound by all of the following, and a change that breaks any of
   them does not ship:

   - **Off by default, per class.** A teacher opts in. Nothing changes for any
     class that doesn't, and nothing about it is nudged or recommended in the UI.
   - **It is not security, and must never be described as one** — not to a
     school, not to a child, not in this repo, not in marketing. A short numeric
     PIN is guessable by a determined adult and shoulder-surfable by a classmate.
     It raises the effort of casual name-borrowing. **That is its entire claim.**
     It does not make a child's work safe from anyone, and it relaxes nothing
     else: rule 4's server-side ownership scoping remains the actual access
     control, exactly as it was before.
   - **Never a barrier to a child reaching their own work.** Forgetting is normal
     at this age. Reset is one teacher tap; a wrong entry never scolds; any
     lockout is short and always routes the child to their teacher. **If a PIN is
     ever the reason a child cannot reach their own jar, the feature is wrong.**
   - **The teacher resets it; nobody reads it.** Hashed with bcrypt (rule 13). No
     teacher, no admin, and no one at StoryJar can see a child's PIN. Switching
     PINs off for a class **deletes every stored hash** — it does not merely stop
     asking for them.
   - **It creates no new identity.** The PIN is not an account. It is meaningless
     without the class code and the name tap in front of it, it is never accepted
     from any other flow, it never travels between classes, and it is never a
     recovery factor for anything.
   - **Rule 2 is untouched: still first names only.** A PIN must never be derived
     from, or hint at, a date of birth — that is banned data, and a DOB-derived
     PIN smuggles it back in as a hash. Its retention entry is in
     [`RETENTION.md`](./RETENTION.md) (rule 9).

   **Not covered by this exception**, and each needing its own amendment: a
   per-child secret for KS1; a picture or symbol password; a badge, tag or token
   a child carries; a PIN that outlives the class or unlocks anything other than
   that child's own jar.
2. **First names only.** We store a child's first name and their work. **No**
   surnames, dates of birth, addresses, contact details, or biometric data.
   Data minimisation (UK GDPR Art. 5(1)(c)) is a hard limit, not a target.
   See **rule 19** for why photos and voice notes are *not* biometric data today,
   and the single change that would make them so.

### B. Nothing is seen until an adult has seen it
3. **The approval queue is sacred.** Every child-generated moment stays `PENDING`
   until a teacher approves it. There is **no auto-publish and no bypass**. Do not
   add a feature that lets child content reach anyone (parent, another child, an
   export, a public URL) before teacher approval. This gate is the product's
   primary safeguarding control — treat any change near it as high-risk.

   **Scope note (2026-08-23).** This rule governs **what the product shows**.
   Approval determines visibility inside StoryJar and **never limits disclosure
   to a data subject or their representative**. Approval is a workflow state,
   and a workflow state does not narrow Article 15: a subject access request
   asks what the school holds, not what it has published, so an export that
   omitted `PENDING` or `RETURNED` work would be the defective one. The
   per-child export therefore discloses every status, and answers the risk this
   rule exists for by a different means — it counts the unapproved items at the
   top of the file and says so on screen, so that a human reads it before it is
   released, rather than by withholding a child's own data from the person
   entitled to ask for it.

### C. A child's work is private and tightly scoped
4. **Access is need-to-know and enforced on the server.** A child's moment is
   visible only to: the teacher(s) who teach that child's class, and their
   **linked** parent/carer (read-only, approved moments only). Every database
   query that returns child data **must** be scoped by ownership
   (`teacherId` / `classId` / parent↔child link). Never trust the client.
5. **Admins are not all-seeing.** A school admin manages staff, class assignment
   and billing. An admin **must not** see a child's work unless they personally
   teach that class. This is enforced by the same `teacherId` scoping — never add
   an admin path that reads children's journal items school-wide.
20. **Neither is the platform operator.** The person who operates StoryJar can run
   the service and **cannot read a child's work through it**. Operator code may read
   adult records, billing state, and counts over children large enough that no
   individual shows through. It may **never** read a child's name, moment, caption,
   media path, draft, quiz answer, class code or PIN; never produce a figure about
   an individual child; and never sign in as another person. This is enforced before
   review by `scripts/check-ops-blindness.mjs`, a blocking gate: an operator file
   that reaches the database directly, imports anything not on its allowlist, reads
   a child model in any way other than a suppressed count, or contains an
   impersonation path fails the build. If a genuine operational need appears, the
   answer is a new named, audited, aggregate-only action, never an exception to the
   gate.
   **This rule governs the product, not the host.** The operator holds the hosting
   account, so infrastructure-level access to the server, database file and media
   volume remains technically possible, and the application does not log it. That
   access is not a product capability and is never used for routine work. The only
   circumstances in which it may touch a child's data, the record that must be left,
   and who must be told, are in
   [`docs/exceptional-access.md`](./docs/exceptional-access.md). Nobody should read
   this rule as promising more than it gives.
6. **Parents see only their own child(ren), read-only.** No parent can see
   another family's child. Parents can view and download; only the teacher can
   add, change or remove what is in the jar.
6a. **A parent's contact details come only from that parent, and we send only what
   they asked for.** StoryJar never takes a parent's email or phone number from a
   teacher, a school import or a child. Family access travels home on paper as a
   code, and the parent decides whether to add an address at all. We send a parent
   only a sign-in link they requested, or notifications they switched on
   themselves. Nothing else, and nothing by default.
21. **Parent–teacher messages are school-governed, bounded by office hours, and
   never a channel to a child.** *(Added 2026-09-07; see "Amendments" below. This
   is the one exception to rule 6's "read-only", and it is bound as tightly as
   rule 1's PIN exception.)* A family may write to their child's class teacher,
   and staff may reply, inside a conversation about that one child. The
   constraints, every one of which is a blocking test, and a change that breaks
   any one of them does not ship:

   - **Off by default, per school; the school switches it on.** A school ADMIN
     turns it on and sets the hours on the school console. An individual teacher
     can neither enable it, disable it, nor change the hours. It exists only on a
     school plan, because a teacher on their own has nobody to hold the hours
     (`docs/pricing-decisions.md`, 2026-09-07).
   - **Nothing is delivered outside the school's office hours, in either
     direction, and there is no override.** No "send now", no urgent flag. A
     message written at 21:40 reaches the other side when the school next opens,
     and the sender is told the day and time at the moment they press send. The
     school chooses its hours inside StoryJar's caps — **at most ten hours a
     day, between 06:00 and 20:00** (`src/lib/messaging/officeHours.ts`) — and
     may not go outside them. Delivery is a stored time checked on every read,
     not a job; time passing is the only thing that delivers a message, and
     changing the hours re-times every message still waiting.
   - **Not an emergency channel, and it says so every time.** Above every box:
     if a child is unwell or the school is needed now, phone the office. A
     channel that is shut for most of the day must never be the one a parent
     reaches for in a crisis, and must never look like it.
   - **No child ever touches it.** No student session can read or write a
     message; nothing from a conversation appears in the jar, the student area,
     or anything a child can reach.
   - **Text only.** No attachments, no images, no audio. A link in a message is
     text to read, never a link to press (rule 15, extended from child input to
     adult input).
   - **Scoped server-side like any other child data** (rule 4): the child's
     linked parents on one side; on the other, the class teacher via
     `Class.teacherId`, a colleague the thread was **shared** with, or the
     colleague a teacher has **passed** the family to — each only while still
     staff of that school, and each only if the school has said they may message
     families (a per-staff switch on the Staff tab; teachers and admins may by
     default, teaching assistants may not).
   - **The parent can always see which staff can read the conversation.** The
     names sit at the top of it. A teacher opting out of one family by passing
     it to a colleague **never leaves that family unanswered** and **is never
     announced to the parent**: the reader list simply shows who reads now, and
     the teacher's reason, if any, is for the school admin and lives on the
     thread — never in the audit log.
   - **The school governs the channel, not the conversation.** An admin sees
     metadata — who is in a conversation, how many messages are waiting and for
     how long — and can close a conversation, give it to a member of staff or
     change who holds it, **without reading a word of it** (rule 5). The
     operator cannot read it either (rule 20): the three message tables are in
     the blindness gate's strictest class, and only `src/lib/messaging/threads.ts`
     may query them (`scripts/audit-static.mjs`).
   - **Audited, never quoted** (rule 16): switched on or off, hours changed,
     staff permission changed, message sent, shared, unshared, passed, taken
     back, closed — each recorded with the adult who did it. A message body
     never reaches an audit row: a log that quotes a message is a second copy of
     it with a different retention clock.
   - **Retention line before it ships** (rule 9): `RETENTION.md`, "Parent–teacher
     messages". A lapsed school plan keeps every conversation readable and stops
     new messages on both sides; nothing is deleted for non-payment.

   **Not covered by this rule**, and each needing its own amendment: an admin
   or a designated safeguarding lead reading message content; any notification
   by email or push (rule 6a governs — nothing is sent, a badge in the family
   space is the whole notification model); attachments; translation through a
   third party (a message names a child); read receipts on a personal thread
   (a parent seeing "read 19:04" manufactures the obligation the hold exists to
   remove); absence or illness reporting (a reason for absence is health data,
   and a channel shut overnight must never be where something urgent is
   reported).

21a. **A teacher may raise one conversation to the school's named safeguarding
   lead, with a recorded reason.** *(Added 2026-09-08; rule 21's "not covered by
   this rule" list named this as needing its own amendment, and this is it. Rule
   21 governs everything about the conversation itself; this governs only who
   else may read one, and why.)*

   - **A lead is named by the school, one member of staff at a time.** A nullable
     `Teacher.isSafeguardingLead`, set by an ADMIN on the Staff tab and resolved
     through one helper, never read raw — the `mayMessageParents` pattern. It is
     **not** a fourth value in `staffRole`: that vocabulary is
     `ADMIN`/`TEACHER`/`TA` and is load-bearing in six places, and a school's DSL
     is frequently also its head. A school may name more than one, and **there is
     no default**: nobody is a lead until an admin says so, which is rule 8 in the
     one place a wrong default would be worst.
   - **Raising is a share, not a new mechanism.** The lead gets the conversation
     on exactly the terms a colleague shared with does — the reader list the
     parent can already see gains a name, and nothing about the thread changes.
     This deliberately adds **no new route to a child's data**: if per-thread
     sharing were unsafe, this would be unsafe, and the answer would be to fix
     sharing.
   - **The lead may READ. Whether they may REPLY is a separate question already
     answered.** Reading a raised conversation and writing to a family are two
     permissions, and a lead who does not hold the school's messaging permission
     gets the first and not the second — the existing `mayMessageParents` check
     on sending is what enforces it, unchanged. This is why a lead does **not**
     have to hold that permission to be raised to: a school whose DSL has
     messaging switched off must still be able to escalate to them.
   - **The reason is recorded, and it is not in the audit log.** It lives on the
     share row, on the `handoverReason` precedent and for the same reason: a
     reason for a safeguarding escalation is free text an adult writes about a
     child, and a second copy of it on the audit log's own retention clock is a
     copy nobody asked for. The audit log records that a thread was raised, to
     whom, and by whom.
   - **The parent is not told, and the reader list is the transparency.** Rule 21
     already shows a parent which staff can read their conversation, and that
     list is what changes. A notice saying "this has been raised with the
     safeguarding lead" would tell a parent that a concern exists about their
     household, which is a decision for the school's own safeguarding procedure
     and never for a piece of software. The parent's pages never carry the word
     "safeguarding" or the lead's role.
   - **What it is NOT, said on the screen and not only here.** It is not a report
     to StoryJar. It is not a route to anything outside the school. It is not a
     substitute for the school's own safeguarding procedure — rule 17 routes a
     concern to the school's DSL by the school's own process, and StoryJar is not
     that process. The composer says all three in plain words, because a school
     that mistook this for a reporting channel would be the worst outcome of
     having built it.
   - **A lead reads only what has been raised to them.** Being a lead grants
     nothing on its own: no list of conversations, no school-wide view, no
     standing access to a class they do not teach.

   **Administrative records are not a child's work, and rule 5 does not reach
   them.** *(Clause added 2026-09-08 with rule 22.)* Rule 5 says an admin never
   sees a child's work; it has never said an admin may not see a record of a
   decision **an adult made**. A permission slip, a booked meeting, a class list
   for a trip — these are the office's own paperwork, held in a school office
   long before StoryJar existed, and an admin who could not see whether the slips
   were back could not run the trip. The clause is narrow and its edge is the
   test: **counts, not children.** The school console shows how many have
   answered in 4B and which way; **which child answered which way is the class
   teacher's screen**, because that is the adult who takes them out of the
   building. Nothing in this clause opens a child's *work* — a journal item, a
   drawing, a photograph, a message body — to an admin, and a feature that
   needed it to would be a new amendment, not this one.

22. **A permission slip asks for permission and nothing else, and StoryJar owns
   the answers.** *(Added 2026-09-08; see "Amendments" below.)* A school may send
   a form to whole classes and a linked parent may answer it, for their own
   child. The constraints, every one of which is a blocking test:

   - **The school writes the question; it never writes an answer.** The answer
     set is a constant in `src/lib/consent.ts` — *I give permission* / *I do not
     give permission* — and **there is no free-text response field anywhere in
     the product.** This is what keeps the DPIA's "no special category data"
     claim true by construction rather than by asking a school to be careful: a
     school free to type its own answer labels writes "nut allergy? yes / no"
     within a term, and StoryJar would then be processing health data about
     children. Rule 19's closing paragraph is the ground; rule 21 refused illness
     reporting on the same one.
   - **One extra answer, and it is a catering headcount.** *"My child needs a
     packed lunch provided"*, offered only when the school switches it on for
     that form, for a free-school-meals child on a trip day. It says how many
     lunches to make and nothing about what a child may eat (owner decision,
     2026-09-08).
   - **Every form says where the other things go.** A standing line to the
     family, in the same words on the form and in the builder: anything medical,
     dietary, or about how a child is looked after goes to the school office,
     which already holds it.
   - **Scoped server-side like any other child data** (rule 4), in one module
     (`src/lib/consentForms.ts`), with a query per reader rather than a filter a
     caller must remember: a **parent** sees the forms sent to their own child's
     class and their own household's answer, never another child's and never a
     tally; a **class teacher** sees the register for a class they hold; the
     **school** sees counts per class, by the administrative-records clause
     above. No child ever touches it, and nothing from a form appears in the jar
     or the student area.
   - **One answer per child per form**, enforced by a unique index and not by a
     screen. Two guardians do not get a vote each, and the later answer stands;
     a family may change it, and the register shows who has not answered rather
     than shutting a late one out.
   - **Audited, never quoted** (rule 16): the form sent, and that a family
     answered. **The answer itself is not in the audit row** — the register is
     where a school reads answers, and a log that carried one would be a second
     copy on a different retention clock. An audit row about an answer names the
     child only to the member of staff who is entitled to it (rule 5's redaction
     on the school console).
   - **The operator reads none of it** (rule 20): `ConsentResponse` is in the
     blindness gate's strictest class, on the `Message` precedent — it names a
     child and carries a parent↔child linkage.
   - **Retention line before it ships** (rule 9): `RETENTION.md`, "Permission
     slips".

   **Not covered by this rule**, and each needing its own amendment: any question
   about a child's health, diet, access needs, SEN status, religion or ethnicity
   (rule 19 forbids it and no amendment is contemplated); a free-text answer of
   any kind; a form sent to one named child rather than a class; a child seeing
   or answering one.

23. **A parents' evening is booked by the family, and who is coming is the class
   teacher's list.** *(Added 2026-09-08; see "Amendments" below.)* A school lays
   out appointments for whole classes; a linked parent takes one for their own
   child and may move or give it up until the evening. The constraints, every one
   of which is a blocking test:

   - **A taken appointment says taken and never who by.** A bookable list with
     names on it tells one family exactly when another family will be in the
     building; the reduction to a boolean happens on the **server**
     (`src/lib/meetingBookings.ts`), so no other child's id reaches a parent's
     browser at all. Separated households are the ordinary case that hurts here,
     not an edge case — the same reasoning that took the per-household detail out
     of the subject access export on 2026-08-23.
   - **Two families cannot take one slot.** Booking is a conditional update
     against an empty row the school created, so the database decides and the
     second family is told at once. Not a check that was true a moment ago.
   - **One appointment per child per evening**, and pressing again moves rather
     than accumulates: a second appointment is one the rest of the class cannot
     have.
   - **Scoped server-side like any other child data** (rule 4), one query per
     reader: a **parent** through the parent↔child link; a **class teacher** by
     the appointment's own `teacherId`; the **school** as counts per class, by
     the administrative-records clause under rule 21 above. No child touches it,
     and nothing from an evening appears in the jar or the student area.
   - **Office hours do not cap it, and that is deliberate.** Rule 21's hold
     exists so a teacher's evening is not a workplace; a parents' evening is the
     one night the school has asked them to be there, agreed in advance. What is
     reused is the *time* machinery — every instant computed in the school's own
     zone, every label formatted on the server — and StoryJar's own bounds apply
     instead: 07:00 to 21:00, at most sixty appointments for one teacher in one
     evening, and never on a day the school has marked closed.
   - **Audited, never quoted** (rule 16): the evening set up, a place booked, a
     place given up — each recorded with who did it. **The time is not in the
     audit row**: the teacher's list is where a school reads who is coming when,
     and a logged time would be a second copy on a different clock. An audit row
     about a booking names the child only to the member of staff entitled to it.
   - **The operator reads none of it** (rule 20): `MeetingSlot` is in the
     blindness gate's strictest class — an operator cannot know which rows are
     empty without reading rows, and a booked one names a child, their family,
     the staff member and a time.
   - **Retention line before it ships** (rule 9): `RETENTION.md`, "Parents'
     evening".

   **Not covered by this rule**, and each needing its own amendment: a note or
   free-text message attached to a booking (that is a message, and rule 21
   governs messages); a video or telephone appointment of any kind; anything
   that tells a family who else is attending; a reminder by email or push (rule
   6a governs).
7. **Uploaded media is access-controlled, not public.** Photos and drawings of
   children **must not** be served from guessable or unauthenticated URLs. Every
   media request is authorised against the same rules as rule 4 before the bytes
   are served. *(See the backlog — this is being closed.)*

### D. Fail safe
8. **Deny by default.** On any uncertainty about permission, identity or
   ownership, **refuse** and return nothing. An error must never leak another
   user's data (no other-user records in error messages, logs, or responses).
9. **Deletion is real, and retention is bounded.** When a school, class, child
   or moment is deleted, the database rows **and the underlying media files**
   are removed. Right to erasure (UK GDPR Art. 17) must actually erase. How long
   each category of data lives — including frozen (lapsed) accounts, backups and
   audit logs — is defined in [`RETENTION.md`](./RETENTION.md), which is part of
   this constitution: a change that keeps data longer than that schedule allows,
   or adds a data category without a retention entry, does not ship. Lapsed
   payment never causes silent deletion; deletion is always preceded by the
   warning schedule in `RETENTION.md`.

### E. Data stays where we promised
10. **UK/EU only.** All personal data — database, uploaded media, backups, and
    logs — is stored and processed in the **UK or EU**. No transfers to the US or
    other non-adequate jurisdictions. Every hosting region, storage bucket and
    sub-processor is checked against this before use.
11. **Every third party is listed and assessed.** Each sub-processor (hosting,
    storage, email, error tracking) must be: named in the sub-processor list,
    covered by a DPA, UK/EU-hosted, and safeguarding-assessed. **No analytics,
    advertising or behavioural-profiling third parties, ever** — the product
    promises "no trackers" and children must never be profiled.

### F. Security hygiene (in service of the above)
12. **Secrets never enter the repo.** Credentials, keys and tokens come from
    environment variables only.
13. **Sessions & transport.** Session cookies stay `httpOnly` + `SameSite=Lax`;
    the site is HTTPS-only; mutations happen through Server Actions / same-origin
    POSTs (CSRF-resistant). Passwords are hashed with bcrypt. Do not weaken any of
    these.
14. **Security headers on by default.** A strict Content-Security-Policy, HSTS,
    `X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors and a sensible
    Referrer-Policy are applied to all responses.
15. **Untrusted input is untrusted.** Escape/authorise all user text (React
    escapes by default — do not use `dangerouslySetInnerHTML` on user content).
    Validate upload type and size; never render links from child input as
    clickable. Keep dependencies patched.

### G. Accountability
16. **Safeguarding-relevant actions are audited.** Who approved / returned /
    deleted a moment, who accessed a child's journal, staff/role changes, and
    data exports are recorded with actor, subject, time and action. *(Backlog.)*
17. **Incidents have a plan.** A suspected personal-data breach is reported to the
    controller (the school) without undue delay so they can meet the 72-hour ICO
    duty; a safeguarding concern is routed to the school's DSL. See "Incident
    response" below.

### H. Access for every child
18. **Accessibility is part of safety.** WCAG 2.2 AA, dyslexia-friendly
    typography, ≥64px child touch targets, `prefers-reduced-motion` honoured. A
    child who cannot use the tool cannot be kept safe by it.

### I. A child's face and voice are not identifiers
19. **Never process a child's face or voice to identify them.** A photograph or
    a voice recording is ordinary personal data. It becomes **biometric data —
    special category data under UK GDPR Art. 9** — the moment it is processed by
    technical means *for the purpose of uniquely identifying a person*. StoryJar
    does not do that anywhere, and must not start.

    **Specifically banned** without a full data-protection review *first*: facial
    recognition or face grouping ("show me all photos of Amara"), auto-tagging
    children in photos, voice identification or speaker matching, emotion or
    attention detection, and any third-party service that performs those on our
    behalf.

    **Why this rule has its own number rather than a line in a backlog:** it is the
    single change that would move StoryJar from "no special category data" to
    "large-scale processing of special category data as a core activity". That
    flips the answer on the ICO's registration question, makes appointing a DPO
    **mandatory** (UK GDPR Art. 37(1)(c)), and requires a new DPIA before any of it
    ships. It is also exactly the kind of feature that sounds harmless in a roadmap
    conversation — "wouldn't it be handy to find all of a child's photos?" — which
    is why the cost is written down here next to the temptation.

    The same test applies to teacher-added tags: skill tags record a judgement
    about a *piece of work*. A tag that records something about the *child* —
    SEN status, a diagnosis, a health need, ethnicity, religion — is special
    category data and does not belong in StoryJar.

---

## Compliance map (England / UK)

StoryJar must help schools meet, and itself comply with, at least:

| Framework | What it means for us |
|---|---|
| **UK GDPR + Data Protection Act 2018** | Lawful basis (the school's), data minimisation, purpose limitation, security (Art. 32), data-subject rights, retention limits (schedule: [`RETENTION.md`](./RETENTION.md)), **processor duties (Art. 28)** → a DPA. |
| **ICO Age Appropriate Design Code (Children's Code)** | 15 standards: high-privacy **defaults**, data minimisation, no nudge/dark patterns, no profiling of children, transparency in language a child/parent understands, DPIA. |
| **Keeping Children Safe in Education (KCSIE)** | The product operates in schools' safeguarding regime: teacher moderation, no unsupervised child-to-child contact, clear reporting routes, filtering/monitoring expectations. |
| **DfE digital & technology standards** (incl. filtering & monitoring, data protection in schools) | Supports schools' duties; secure by design; clear data-handling. |
| **PECR** | Cookie/consent rules — we use **essential cookies only** (the session cookie); no marketing/analytics cookies. |
| **Online Safety Act 2023** | Children's content is private and teacher-moderated (not public). **Assessed afresh on 2026-09-07 when parent–teacher messages were added (rule 21):** the new user-to-user content is a private, one-to-one-household conversation between adults about one child, reachable only by that child's linked parents and named school staff, closable by the school, off by default, with no child able to read or write it and nothing public or searchable. It creates no route by which a child can be contacted by, or contact, anyone. Any *further* widening — child-reachable, public, or cross-family content — needs its own assessment. |
| **Equality Act 2010** | Accessibility / non-discrimination. |

A **Data Protection Impact Assessment (DPIA)** is required (children's data at
scale) and should be kept current as data flows change.

---

## The safeguarding review checklist (use on every PR)

A change that touches auth, access scoping, the approval queue, children's data,
media, or third parties **must** answer these in the PR:

- [ ] Does any child data returned by new/changed queries stay scoped by
      ownership (`teacherId` / `classId` / parent link)? Enforced server-side?
- [ ] Can any child content reach anyone before teacher approval? (Must be "no".)
- [ ] Is any new personal data field truly necessary? (Default: don't add it.)
- [ ] Is uploaded media still access-controlled (not a public/guessable URL)?
- [ ] Does anything new store or send personal data outside the UK/EU?
- [ ] New third party / sub-processor? Listed, DPA'd, UK/EU, no profiling?
- [ ] On error or uncertainty, does it deny and leak nothing?
- [ ] Does deletion still remove rows **and** files?
- [ ] Does the change store data longer than the schedule in
      [`RETENTION.md`](./RETENTION.md) allows, or add a data category with no
      retention entry? (Must be "no" — update `RETENTION.md` first.)
- [ ] Security headers / cookie flags / input handling unchanged or improved?
- [ ] Accessibility floor still met?

If a box can't be ticked, the change doesn't ship without a documented,
data-protection-aware decision.

---

## Incident response (starter)

1. **Contain** — stop the exposure (revoke, take offline, rotate).
2. **Assess** — what data, whose, how much, is it a personal-data breach and/or a
   safeguarding concern?
3. **Notify** — tell the affected **school(s)** (the controller) without undue
   delay so they can meet the ICO 72-hour duty; route any child-safety concern to
   the school's **DSL**. Do not contact children or the public directly.
4. **Record** — log the incident, decisions and timeline.
5. **Remediate & learn** — fix the root cause; add a rule or test so it can't
   recur.

*(This is a placeholder to be expanded with named contacts and the school-facing
process, and reviewed by the data protection lead.)*

---

## Known gaps / backlog (prioritised)

Tracked here until closed; each becomes its own change.

| Pri | Gap | Rule | Status |
|---|---|---|---|
| P0 | Uploaded children's media served from unauthenticated `public/uploads` URLs | 7 | **In progress** |
| P0 | ~~Production hosting region is US West~~ — **resolved 2026-08-15: EU West (Amsterdam, Netherlands)**, service and volume in region. Railway has no UK region, so "UK/EU" is satisfied by the EU half; see docs/DPIA.md R6 for the two residuals (Railway is US-incorporated; Stripe residency unassessed) | 10 | **Done** |
| P1 | No security headers (CSP/HSTS/etc.) | 14 | Planned |
| P1 | No audit log of safeguarding-relevant actions | 16 | Planned |
| P2 | No DPIA on file; customer policies are drafts pending professional review | — | Ongoing |
| P2 | Data-retention schedule drafted in [`RETENTION.md`](./RETENTION.md); automated deletion pipeline still to build | 9 | **In progress** |
| P3 | Demo seed exposes public credentials (fine for demo; gate before real launch) | 1 | Note |

---

## Amendments

This document is meant to be hard to change. When a rule is amended, the reason
goes here — so that a future reader can see what was traded away and who agreed
to it, rather than finding a rule that quietly says something else than it used
to.

| Date | Rule | Change | Decided by | Why |
|---|---|---|---|---|
| 2026-09-08 | 21a (new) | A teacher may raise one conversation to a member of staff the school has named as a safeguarding lead, with a reason recorded on the share row. The lead reads only what is raised to them; whether they may reply is decided by the existing per-staff messaging permission, unchanged; the parent is not told, because the reader list rule 21 already shows them is the transparency. | Product owner | Rule 21 named this in its own "not covered" list as needing an amendment, and `COMPETITIVE_POSITIONING.md` said in terms not to promise it to a school until it existed. It is smaller than it sounds because per-thread sharing is already the mechanism: this is a share with a named recipient and a recorded reason, which is why it adds **no new route to a child's data**. **What was traded away:** nothing structural — one more adult can read one conversation, chosen by a teacher, from a list the school itself set. **What was not:** the lead has no standing access to anything not raised to them; reading is not writing; the reason never reaches the audit log; and the parent's pages still never carry the word "safeguarding". The risk actually worth naming is a school mistaking this for a reporting channel, which is answered on the screen rather than in this document. |
| 2026-09-08 | 23 (new) | Rule 23 permits parents'-evening booking: a school lays out appointments, a family takes one for their own child, a taken slot shows as taken and never who by, and office hours deliberately do not cap it. | Product owner | The highest-value reuse of the office-hours time machinery, and the one place where applying the office-hours *hold* would refuse the feature rather than govern it — a parents' evening is the night a school has asked its staff to be there. Two risks decided rather than left: a bookable list is a disclosure surface between families, so the child id is reduced to a boolean on the server; and two parents pressing one slot is a real race, so booking is a conditional update against a row the school created rather than a create. **What was traded away:** nothing in rule 21 — the hold on *messages* is untouched, and a booking carries no free text for a message to hide in. **What was not:** the operator still reads nothing (rule 20), and the school office still sees counts rather than children. |
| 2026-09-08 | 5 (clause), 22 (new) | Rule 22 permits permission slips: the school writes the question, StoryJar owns the two answers, and there is no free-text response field in the product. Rule 5 gains an **administrative records** clause — an admin may see a record of a decision an *adult* made, as counts per class, and never which child answered which way. | Product owner | A permission slip is the biggest paper-and-phone job in a primary office and is adult decision data, not a child's work, so it belongs on a school plan. The whole risk is in one place: a form is where Art. 9 data gets collected by accident rather than by argument, because "does your child have a nut allergy?" sounds like an administrative question. The answer is structural — the school never authors an answer label, so there is no route by which an allergy or a SEN status can be typed in — and the one extra answer permitted is a catering headcount for a trip day, decided by the owner on 2026-09-08. **What was traded away:** rule 5's absolute "an admin sees no record about a child", which was always about *work* and is now said in words instead of inferred. **What was not:** an admin still sees no child's name against an answer, no journal item, no message body; the operator sees nothing at all (rule 20). |
| 2026-09-07 | 6 (exception), 21 (new) | Rule 6 said parents are **read-only**. Rule 21 carves out one write: a conversation with the child's class teacher, held to office hours the **school** sets inside StoryJar's caps (at most ten hours a day, 06:00–20:00), delivered in neither direction outside them, with no override; off by default; school-plan only; text only; never reachable by a child; readers always shown to the parent; a teacher may share a thread with a colleague or pass a family to one, and the parent is not told of a pass; the school sees metadata and closes or reassigns without reading; audited without quoting. | Product owner | `COMPETITIVE_POSITIONING.md` rejected two-way messaging outright until 2026-08-24, when it moved to BUILD on the reasoning that the verdict was right about *direct messaging* and wrong to assume a DM was the only available shape; that note named this rule as its governor before a line of it existed, and this amendment is that rule arriving. The two original grounds — teachers' evenings, and an adult in a child's space — are met structurally rather than by absence: the hold is two-way, so a teacher writing at 22:00 cannot set an out-of-hours expectation either, and the conversation never touches the child's product. The commercial reason is the one `docs/pricing-decisions.md` already gives for the school tier: it sells *oversight*, and school-set office hours are the first feature that makes that concrete. **What was traded away:** rule 6's clean "parents can only look", and the "no DMs" line in the positioning. **What was not:** rule 6a (nothing is emailed), rule 5 (no admin reads a body), rule 20 (the operator reads nothing), and the approval queue, which this does not touch. Data-protection review: the DPIA is amended (R19) and still awaits professional review with the rest. |
| 2026-08-23 | 3 (scope note) | Approval determines visibility **inside StoryJar** and never limits disclosure to a data subject or their representative. The per-child subject-access export discloses every status, including `PENDING` and `RETURNED`. | Product owner | Rule 3 governs what the product *shows*. It does not and cannot narrow what a subject access request must disclose: approval is a workflow state, and a workflow state does not limit Article 15. An export that omitted `PENDING` work would be the defective one — it would answer "what have you published" to a question that asked "what do you hold". The risk rule 3 exists for is real here and is answered by a different means rather than by withholding: the export counts the unapproved items at the top of the file and the screen beside the button says so, so a human reads it before it is released. Recorded as a **scope note, not a carve-out** — nothing about what the product shows a parent, another child or a public URL has changed. |
| 2026-08-23 | 10, 11 (scope note) | Read-aloud may also speak **a quiz question**, on the same terms as the 2026-08-19 amendment below and by the same mechanism: only through a voice the platform reports as running on the device (`SpeechSynthesisVoice.localService === true`), with no listen button rendered where there is no local voice, and **deny by default** where the platform does not report `localService`. This amendment does not cover the answer options; extending to them would need the same on-device condition and its own entry here. | Product owner | A quiz question is teacher-*adopted* text exactly as a returned-work note is — note "adopted" rather than "authored": `create_activity` on the MCP connector means a model may write a question, and a teacher must open the activity and set it for a class before a child sees it. In the register built for children who cannot read, the question being silent is the gap that matters most: an EYFS child who cannot hear the question cannot do the activity at all, which makes this rule 18 as well as 10 and 11. Worded identically to the 19 August entry on purpose — a quiz question and a teacher's note get the same mechanism because **two nearly-identical rules is how one of them gets forgotten**. |
| 2026-08-19 | 10, 11 (scope note) | Read-aloud may speak **a teacher's note on returned work**, and only through a voice the platform reports as running on the device (`SpeechSynthesisVoice.localService === true`). Where there is no local voice the listen button is not rendered and the note stays as text. Storyjar's own fixed copy is unaffected — it is still the only thing `readAloud` will say. | Product owner | Finding F38: a teacher writes the child a note saying what to change, and the child was never shown it. Showing it is not enough for a pre-reader, so it has to be speakable — but `speechSynthesis` is not local on every platform, and the default voice on Android Chrome ships the text to a cloud service with no DPA, which rules 10 and 11 forbid. Naming a local voice explicitly is the narrowest mechanism that reaches the child without the words leaving the tablet. **Deny by default is preserved**: an implementation that does not report `localService` is treated as remote, and says nothing. |
| 2026-08-17 | 20 (new) | Added when the platform operator console was built. States that the operator can run the service and cannot read a child's work **through the product**, enforced by a blocking gate rather than by memory, and states the limit of that guarantee in the same breath: the operator holds the hosting account, the application does not log infrastructure access, and the circumstances under which it may lawfully touch a child's data are governed by `docs/exceptional-access.md`. | Product owner | One person operating a service that holds children's work needs a limit that survives their own future convenience, and a written statement of the limit's edge so that nobody relies on more than it gives. The gate constrains the product; it cannot constrain the person, and a rule that implied otherwise would fall apart in a school's due-diligence questionnaire, or the first time a court ordered otherwise. |
| 2026-08-17 | 6a (new) | A parent's contact details come only from that parent, and StoryJar sends only what that parent asked for: a sign-in link they requested, or notifications they switched on themselves. | Product owner | The first draft said StoryJar never messages a parent who did not ask, which was too wide: it would have forbidden notification preferences before they were built. The principle was right and the scope was wrong. This wording bans the thing that actually matters, which is obtaining a parent's address from anyone other than the parent, without banning a feature the parent themselves turns on. It describes what family access already does, where the code travels home on paper and the parent chooses whether to add an address at all. |
| 2026-07-15 | 1 | Carved out **one** exception to "never ask a child for any credential": an optional, off-by-default, teacher-enabled numeric PIN, self-chosen, intended for Years 4–6. Bans on child emails, passwords and phone numbers are unchanged, as is rule 2. | Product owner (the serving teacher who owns StoryJar), acting on the July 2026 intuitiveness audit | Widening to ages 3–11 brought in Years 4–6, where children signing in as each other is a genuine problem that the class-code-plus-name model does not address. A mis-tap files one child's work in another child's evidence base — an assessment problem and a safeguarding one. **The honest framing: this is a classroom-management feature, not a security control**, and rule 1's text now says so explicitly so that no one later mistakes it for protection. **Not yet reviewed by a data-protection professional** — the PIN adds a per-child data field (`pinHash`), so it needs that review before it reaches real children. |

**A note on numbering.** Rule numbers are permanent identifiers assigned in the
order rules were added, not positions on the page. They are cited from
`schema.prisma`, `docs/DPIA.md` and the test battery, so a rule is never
renumbered to tidy the sequence. Rule 20 therefore sits beside rule 5, which is
the rule it extends, and rule 6a sits beside rule 6.

*Last reviewed by engineering; **not yet reviewed by a data-protection professional / legal.** Update the
"Last reviewed" line and the backlog whenever this changes.*
