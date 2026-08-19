# StoryJar: one context document

Assembled 19 August 2026 by reading every markdown document in the
`onlineportfolio` repo: `README.md`, `AGENTS.md`, `CLAUDE.md`,
`COMPETITIVE_POSITIONING.md`, `LAUNCH_PLAN.md`, `SAFEGUARDING.md`,
`RETENTION.md`, `TESTING.md`, `TEST_PLAN.md`, `FINDINGS.md`,
`.github/pull_request_template.md` and the thirteen documents in `docs/`.

Purpose: a single place to understand what StoryJar is, how it is built and
governed, what is decided, what is still open, and which written claims are now
wrong. Where two documents disagree, that is recorded rather than smoothed over.

---

## 1. What StoryJar is

A UK primary school digital learning journal and portfolio for children aged 3
to 11 (EYFS, KS1, KS2). A child creates a moment as a photo, a voice note, typed
words or an in-app drawing. The teacher approves it. Approved work builds a
dated, skill-tagged journal for the year, and linked parents can view it
read-only.

Solo founder product, feature-frozen 15 August 2026, targeting the autumn term.
The repo still carries its original working name, Class Journal, in the README
title.

Positioning in three lines:

1. The calm one. No behaviour points, no public feeds, no DMs, no AI upsell.
2. It is the child's jar, not the teacher's evidence file. Rivals are built
   around an adult observing a child. StoryJar is built around the child making
   the work in their own space.
3. UK-first data trust, which is the concrete reason a head or DPO picks it over
   Seesaw.

Product one-liner in the launch plan: the simple way to capture children's
learning. Three proof points repeated everywhere: capture in under 10 seconds,
parents see work without app friction, one honest price with every feature in
every band.

---

## 2. What it does today

### Accounts and sign-in

- Teachers sign up with name, email, password and an optional first class, then
  sign in with email and password. A teacher can create unlimited classes, each
  with an auto-generated class code and roster.
- Children sign in with a short class code then tap their own name. No child
  passwords, emails or phone numbers, ever.
- Parents request a sign-in link by email. This is the only transactional email
  the product sends. The family view is read-only and limited to their own
  child's approved work. Demo family code `FAM123`.
- Roster management: add children one at a time or paste a whole register, one
  name per line. First names only.
- Staff invitations deliberately do not send. There is no accept-invite flow,
  invited staff have an empty password hash and no route to set one. Logged as a
  known gap.

### The four capture routes

Photo (live device camera or file upload, optional caption), voice note (device
microphone with record, stop, play back, re-record, optional caption), typed own
words, and a drawing. Voice was built as the top pre-launch priority because it
serves EYFS and pre-readers.

### The drawing canvas, which is the differentiator

Full screen and child-led. Realistic tools rise from the bottom edge (pencil,
pen, marker, eraser) with the selected one lifted. Text boxes can be reselected,
moved and re-edited. Rainbow colour slider plus palette, brush sizes, undo and
redo, multiple pages with a live thumbnail filmstrip.

A ＋ button adds a photo, a PDF or a shape as a movable, resizable object: cursor
tool to select, drag to move, corner pull to resize, ✕ to remove, ＋1 to
duplicate, and a rotate handle that turns freely all the way round. Dragged
shapes snap to a light grid so a row of apparatus lines up without a child having
to aim.

Children get one shape palette at every age: rectangle, circle, triangle, star,
speech bubble, line, arrow, ring. Shapes take editable fill and line colours, and
a double tap adds a label locked inside the shape that wraps and auto-sizes to
the shape's real area, reflowing as the shape moves or resizes. With any drawing
tool selected, pen strokes go on top of shapes and pictures.

### Activity library, runs and the maths kit

Teachers build reusable templates: title, instructions, tags, and an optional
template drawn on the canvas and/or uploaded as a PDF or picture for children to
work on top of.

The maths kit on the template canvas covers number lines, arrows, jump arrows and
braces; base 10 ones, ten rods, hundred flats and thousand cubes; place value
counters labelled 1, 10, 100 and 1000; ten frames, hundred squares and arrays;
fraction bars, circles and rings; and a clock face whose numbers can be printed
or left blank. Number-built shapes carry a stepper so any denominator up to 24 is
one tap away. Apparatus can be marked endless, so a child drags copies off it
while the original stays put. The kit is the teacher's tool for building the
worksheet, and what a child needs arrives on it.

A template is assigned to a class as a run, whole class or chosen children, and
can be reassigned to another class or next year. Runs are independent and past
responses are kept forever. The library shows live status, a needs-attention
strip for runs with work waiting, and tag and status filters. A template detail
page lists every run with progress and a per-run response grid showing every
child at a glance as done, waiting or not yet.

### Approval and journals

Every child submission waits in the approval queue. The teacher approves and
publishes, tagging skills as they go, or sends it back with a note asking for
another go. Bulk approve exists. Teachers can add work on a child's behalf, which
publishes immediately. Each child has a timeline that builds into an evidence
base over the year.

### Not built yet

Video capture (the number one switcher ask, first on the post-launch list),
recorded voice instructions on activities, groups and group tagging, scheduling,
a light from-home parent reaction, and EAL translation.

---

## 3. Age modes and child-facing copy

`docs/AGE_MODE_COPY.md` (SJ-06, approved by the owner 18 July 2026) specifies two
registers, Younger and Older. The brief for Older is calm, not corporate, spoken
as you would to an eleven-year-old you respect, roughly 15% terser because
terseness reads as respect. Never babyish, never a form.

Three kinds of string:

- **Swaps**, about fifteen of them. "Bye bye 👋" becomes "Sign out". "Tap your
  name!" loses the exclamation mark. "Popped in!" becomes "Added ✓". "This went
  in your jar!" becomes "Added to your jar". "Have another go" becomes "Redo".
- **Jar becomes journal** for older classes, decided 17 July 2026, and the jar
  picture goes with the word, because a journal has no rim for a tile to balance
  on. Older gets a grid of moments plus a second status display for KS2, which is
  the only real build in SJ-06 beyond copy. The product NAME stays storyjar
  everywhere: header, landing page, legal.
- **Five locked strings** carry a safeguarding promise. They may be reworded for
  age but the meaning must survive and must never become jargon such as "Pending
  review" or "Invalid": your teacher checks it first, you do not have to (this is
  optional), the empty-name wall (not your fault, ask the teacher), the wrong
  class code (no blame, try again), and the deliberately dead keypad key with its
  reason. A test asserts both registers keep the promised meaning.

The class-code sign-in screen is neutral, because it runs before the class is
known and therefore cannot be age-aware.

Implementation is PR 11: `studentCopy` becomes `studentCopy(mode)`, the class
`ageMode` is threaded through, and a `data-ks` attribute drives the type-scale
tightening and halved motion durations off one switch. `ageMode` is a teacher
display setting; NULL defaults to EYFS as the most protective option.

**Conflict to resolve.** `LAUNCH_PLAN.md` lists three age registers including
EYFS as done and on `main`. `AGE_MODE_COPY.md` defines only two registers and
says nothing is built yet. Settle this before any three-mode claim goes on the
landing page.

---

## 4. Pricing

Two tiers.

- **Teacher: free permanently.** One teacher, all of their own classes, every
  feature, no card and no trial clock.
- **School: banded by pupils on roll.** £199 up to 105 pupils (village, infant,
  small rural), £299 up to 210 (1FE), £449 up to 420 (2FE), £649 over 420 (large
  primary or all-through). Bands follow form entry so a business manager can
  self-place without arithmetic. The school tier adds leadership oversight, staff
  continuity, year-end transfer and the DPA naming the school as controller. Card
  or invoice and PO by BACS.

Three rules keep the no-price-creep promise true: the band is set once at
purchase from the published roll, it is fixed for the paid year so mid-year
growth costs nothing, and every feature is in every band, so a band buys capacity
and never functionality.

History, all recorded 15 August 2026: per-seat at £40 per teacher per year was
dropped, flat £299 was built and then superseded the same day, and banding won.
The paid Individual plan (£3.99 a month, £40 a year) is retired because it
undercut the only revenue path, letting the most engaged teachers pay personally
instead of introducing StoryJar to their head.

Why flat was rejected: the evidence for it was wrong (see section 11), and flat
overcharges small schools, who are the beachhead. At 100 pupils £299 flat is
about £3 a pupil against £0.60 at 500, while at 300 pupils it forfeits margin
where Tapestry quotes £900 and StoryJar can charge £449. The accepted trade is
that banding may lower near-term revenue because early adopters skew small.

VAT: not registered, and far from the £90,000 threshold. No surface may show
"+ VAT" or "ex VAT". One flag, `VAT_REGISTERED` in `src/lib/billing-plans.ts`,
drives `priceNote()` and `formatPrice()`. Tapestry quotes ex-VAT, so restate
their figures inclusive before comparing.

Promises: every account created before 1 September 2026 is a founding teacher
with permanent free unlimited access, stored as `Teacher.foundingMember` (stored
rather than derived, so the promise stays keepable). It is a teacher mark, not a
school one. Pilot schools separately get year one free. The known risk is that a
twelve-teacher primary could run entirely free. The counterweight is the
controller and DPA relationship, never a class cap, and it is revisited in the
October to November subscription-review window.

---

## 5. Competitors, the AI line, and what will never be built

Comparators are Seesaw, Tapestry and ClassDojo. The strategy is a shorter feature
list held with conviction, not parity, on the view that half of what competitors
ship is the bloat teachers are tired of.

**Build:** video, one light from-home reaction that surfaces to the teacher, EAL
translation, and AI for teacher prep.

**Reject:** two-way parent messaging and DMs (scope creep plus an adult in a
child's space), behaviour points and rewards, public whole-class feeds, per-pupil
AI upsells and auto-feedback on children's work.

**Later and conditional:** framework tagging (Development Matters, Birth to 5
Matters, National Curriculum) is Tapestry's moat, and cohort monitoring pairs
with it. Build only on a decision to fight Tapestry for EYFS assessment.

**The AI line.** Not anti-AI, anti-unconsidered AI. One test: does it remove
drudgery from the teacher's prep without touching a child's data or judgement?
Welcome when it acts on teacher-authored content, saves real prep time and keeps
the teacher in control, with nothing reaching a child unreviewed. Flagship
example: a teacher uploads a comprehension PDF and gets an editable multi-page
quiz, extending the activities builder that already stores `quizJson`. Refused
when it processes children's work, auto-marks, auto-comments, ranks or profiles,
or appears as a per-pupil upsell. Any AI provider becomes a sub-processor needing
a DPA and a sub-processors page entry, and must clear `SAFEGUARDING.md`. The
internal slogan: AI that does your prep, not AI that watches your kids.

Scripts exist for the two questions teachers always ask, about parent messaging
and about behaviour points, and both answer with the reason rather than a
roadmap.

---

## 6. Safeguarding: the constitution

`SAFEGUARDING.md` is the governing document, binding on human and AI
contributors through `AGENTS.md`. Rule numbers are permanent identifiers and are
never renumbered.

- **Rule 1** no child logins, emails, passwords or phone numbers, ever. One
  amendment (15 July 2026) allows an optional, off-by-default, teacher-enabled
  numeric KS2 PIN for Years 4 to 6, self-chosen, bcrypt-hashed, resettable in one
  tap, hashes deleted when a class turns PINs off. It is classroom management,
  never security, creates no identity and must never derive from a date of birth.
  It is not built (owner decision, 18 July 2026) and has not been reviewed by a
  data-protection professional.
- **Rule 2** first names only. No surnames, dates of birth, addresses, contact
  details or biometrics. No schema field exists for them.
- **Rule 3** the approval queue is sacred. Everything is PENDING until a teacher
  approves. No auto-publish and no bypass.
- **Rule 4** server-side ownership scoping on every child-data query.
- **Rule 5** admins are not all-seeing. A school admin sees no child work unless
  they teach that class.
- **Rules 6 and 6a** parents see only their own children, read-only, approved
  items, and a parent's contact details come only from that parent.
- **Rule 7** uploaded media authorised per request, never public or guessable.
  Priority P0 and still in progress.
- **Rule 8** deny by default, and errors leak nothing.
- **Rule 9** deletion removes rows and media files, and every data category needs
  a retention entry.
- **Rule 10** UK or EU only for database, media, backups and logs.
- **Rule 11** every sub-processor named, DPA'd, UK or EU, safeguarding-assessed.
  No analytics, advertising or profiling third parties, ever.
- **Rules 12 to 15** no secrets in the repo, httpOnly and SameSite=Lax cookies,
  HTTPS only, bcrypt, strict CSP and HSTS headers (P1, not built), untrusted
  input escaped.
- **Rule 16** audit of safeguarding-relevant actions. Backlog, P1, not built.
- **Rule 17** breach reported to the school so it can meet its 72-hour ICO duty,
  child-safety concerns to the school's DSL.
- **Rule 18** WCAG 2.2 AA and touch targets of at least 64px.
- **Rule 19** never process a child's face or voice to identify them. Facial
  recognition, face grouping, auto-tagging, voice matching and emotion detection
  are banned without a prior full review, because they would create Article 9
  special category processing, make a DPO mandatory under Article 37(1)(c) and
  require a new DPIA. Tags about a child (SEN, diagnosis, health, ethnicity,
  religion) are banned.
- **Rule 20** (added 17 August 2026) the platform operator cannot read a child's
  work through the product, enforced by the blocking gate
  `scripts/check-ops-blindness.mjs`. This governs the product, not the host:
  infrastructure access to the server, database file and media volume remains
  technically possible and is not logged by the application.

---

## 7. Data protection

**Roles.** The school is the data controller, StoryJar is the processor under
Article 28, acting on documented instructions, regardless of who pays, including
on the free teacher plan. Lawful basis is the school's to determine: normally
public task, Article 6(1)(e), for maintained schools, and legitimate interests or
contract for academy trusts.

**The DPO question.** The founder is the data protection lead and sole operator,
and StoryJar deliberately does not use the title DPO. It is not required to
appoint one, and voluntary appointment would import statutory independence
requirements a sole trader who is also the decision-maker cannot meet. Recorded
in `docs/dpo-decisions.md`.

**Data collected.** Child: first name, avatar colour, journal moments, optional
teacher skill tags and dates, in-progress drafts, `jarSeenAt` (a single
overwritten wayfinding timestamp never shown to teachers and never aggregated),
and quiz answers and scores as fields on the journal item. Adults: staff name,
email, password hash, title, school, country; family code plus optional
self-supplied parent name and email; billing contact at Stripe; audit rows; and
operator credentials (email, bcrypt hash, TOTP secret, ten hashed recovery
codes).

**Sub-processors.** Railway for hosting, EU West Amsterdam, confirmed 15 August
2026, with no UK region available. Mailjet (Sinch) for email, EU only, adult
addresses only, replacing Brevo on 16 August 2026 because Brevo rewrote links
through its own redirect domain, injected an open pixel and silently discarded
`disableTracking: true`. Stripe for payments, adult billing data only, no card
data on StoryJar servers and no Stripe.js anywhere.

**Retention, exact.** Journal items and media are kept while a plan is trial or
active. A frozen account is retained 12 months from lapse, then rows and files
are deleted. Drafts 30 days, lazily purged. Rejected or returned moments 30 days.
Magic tokens single-use, 30 minute expiry, purged within 7 days. Sessions purged
within 7 days of expiry. Operator sessions 30 minutes idle and 8 hours absolute.
Audit logs 2 years rolling, with a minimal deletion record kept 6 years. Operator
audit log 2 years. Billing records 6 years for HMRC. Mail counters and `JobRun`
13 months. Refused-address labels, HMAC-SHA256 under an out-of-database key,
deleted 90 days after the provider stops refusing. Mailjet delivery records 90
days on the current free plan, which is a regression from Brevo's one month
position and would need a recorded decision to change. Erasure on request within
30 days, with roughly a month of backup propagation.

**The frozen lifecycle.** Day 0 lapse makes the account read-only with an email,
reminders go at months 6, 9 and 11, final warnings at 30 days and 7 days before
deletion with a parent download reminder, and deletion is permanent at month 12.
Reactivation restores everything intact at any point before deletion. Lapsed
payment never causes silent deletion. Deletion actions are deliberately left
ungated so erasure still works while FROZEN. **The automation is not built and
the lifecycle is carried out manually today.**

A free teacher plan is ACTIVE with no `trialEndsAt`, cannot lapse and never
freezes, so children's work in a free account is never on a billing deletion
clock.

**Exceptional access** (`docs/exceptional-access.md`, in force 17 August 2026).
Five permitted circumstances only: a court, police or regulator order; a written
school instruction; reported illegal content, which must not be opened but
preserved and reported to police and the IWF; a safeguarding concern where the
school or its staff is the subject, where the first call is the LADO rather than
the school; and corruption or loss where blind recovery is impossible. Never a
trigger: curiosity, debugging, demos, bug verification, or informal teacher or
parent requests. The procedure is to write the narrowest question down, notify
before looking, open only that, take no copies or screenshots, and complete the
record the same day. The notification is the record, because every audit row
StoryJar writes sits in the same database file on the same volume in the same
account. Stated weaknesses: one person authorises their own access, the
application does not log infrastructure access (the single biggest gap), and
there is no tamper-proof audit chain, which was rejected as disproportionate.

**DPIA** (`docs/DPIA.md` v1.2, written 15 August, updated 17 August 2026). Draft,
not signed off, never reviewed by a qualified professional. Medium residual
risks: R4 a leaked class code discloses a first-name roster (accepted), R5 the
manual frozen pipeline, R6 residency (Railway is US-incorporated, onward-transfer
terms not obtained, Stripe residency unassessed), R9 around 30 baselined contrast
nodes, R10 no staff MFA, R12 an incident plan with no named contacts and no
school template that has never been rehearsed, R14 Mailjet on an unconfirmed
message-body position, R15 the operator account (TOTP is phishable, the TOTP
secret is stored in plaintext, and the free-text reason box can carry a child's
name), and R16 operator shell access to the volume, which is permanent at this
scale. R1, R2, R3, R7, R8, R11 and R13 are Low. Blocking before sign-off: Railway
and Mailjet DPAs, Stripe residency, a named incident contact and breach template,
external professional review, and confirmed ICO registration.

**Policy readiness** (as at 15 August 2026). Every `/legal` page still carries a
"Draft for review" banner, asserted by a test. Blocking items: B1 legal name, B2
a publishable business address that is not the founder's home, B3 an ICO number,
B4 a working `hello@storyjar.co.uk`, B5 Stripe residency, B6 the Railway DPA. ICO
registration is Tier 1 micro at £52 a year, or £47 by direct debit, and is not
yet done. Solicitor-only items: liability and indemnity (an explicit placeholder
sits in Terms section 7), a signable Article 28(3) DPA (only a plain-English
summary exists), and a review of the whole set. Settled already: cancel any time
with no part-year refunds, no contractual SLA, one contact address, EU residency,
and published accessibility shortfalls.

---

## 8. Architecture and operations

**Stack.** Next.js 16 App Router with React 19 and TypeScript, Prisma 6 over
SQLite, Tailwind CSS, deployed on Railway, Stripe for billing, Mailjet for mail.

**Hosting.** Railway project "Story Jar", service `onlineportfolio`, environment
`production`, region EU West Amsterdam (`europe-west4-drams3a`), one replica,
RAILPACK builder. `railway.json` sets `bash scripts/railway-start.sh`, restart on
failure with a maximum of 5 retries. Plan was upgraded from Hobby to Pro on 17
August 2026.

**Storage.** A single 5 GB volume mounted at `/data` holds `/data/prod.db` (every
school, class, teacher, pupil name and journal entry) and `/data/media` (every
photograph, drawing and voice note). `DATABASE_URL=file:/data/prod.db`,
`MEDIA_DIR` defaults to `/data/media`. The boot script runs `prisma db push
--skip-generate --accept-data-loss`, then the seed, then `next start`. The first
deploy after the migrations PR baselines the migration history only after proving
the live schema matches `0_init` exactly, and fails the boot on any difference so
the previous deployment keeps serving.

**Key code locations.**

| Path | What lives there |
|---|---|
| `prisma/schema.prisma` | The data model |
| `prisma/seed.ts` | Demo class, runs on every production boot, skips a non-empty database |
| `prisma/seed-test.ts` | Battery fixtures: Oakfield, plus Larchwood permanently FROZEN |
| `src/app/` | Pages, teacher, student and sign-in areas |
| `src/app/actions/` | Server actions that save data |
| `src/app/ops/` | The operator console |
| `src/lib/ops/` | Operator session, reads, dto, operations, audit, stripeLinks |
| `src/lib/billing.ts` | `requireWritableAccount()`, the single write gate |
| `src/lib/billing-plans.ts` | Bands, `bandForPupils`, `priceIdFor`, `VAT_REGISTERED` |
| `src/lib/mailer.ts` | Mailjet Send API v3.1 over fetch, plus the WHY NOT BREVO note |
| `src/lib/signInLinkPolicy.ts` | Sign-in link never returned to the browser in production |
| `scripts/check-ops-blindness.mjs` | The operator blindness gate |
| `.github/workflows/battery.yml` | CI |

**The /ops operator console.** Distinct from `/admin`, which is the tenant-scoped
school console. The code namespace is `ops`, never `admin`. The governing
principle is that the operator is structurally blind to children's data, enforced
by a gate that walks the ops import graph and treats anything imported by ops
code as ops code. Widenings are per-entry allowlist additions shipped with
fixtures. One gate rule refuses any Prisma write under the ops roots outside
`src/lib/ops/operations.ts`, another permits exactly one write shape (minting a
family code inline so nothing can return it), and another refuses the parent to
child to class to teacher to school traversal.

The operation registry is closed and has exactly two entries, both added 17
August 2026: rotate a family code (the operator never sees either code) and
reveal one parent email (audited with the reason). Every operation requires a
stored free-text reason of at least 12 characters, a confirm step, and the change
plus audit row in one transaction. Refused by name: impersonation, session
minting, password or PIN setting, any change to an adult's email, any deletion,
any export, and class-code rotation.

Auth is email and password with bcrypt, then TOTP via `otplib` 13.4.1, accepting
one 30-second step either side and refusing reuse. Ten single-use recovery codes
are printed once. Lockout is five failed attempts for 15 minutes, stored in
columns so a restart does not clear it, with an error message identical to every
other failure so it never confirms the account exists. Operators are kept out of
the shared session table, and `OpsAuditLog.actorId` is a plain column rather than
a foreign key so the trail survives an account rebuild. There is no TOTP bypass
and the rules forbid adding one.

`OPS_ENABLED=1` is the kill switch. Unset means the whole area 404s to everyone
including the operator. Seeding is
`railway run npx tsx scripts/seed-operator.ts you@example.com`, which prints the
password, TOTP setup key and ten recovery codes once, and refuses with exit 1
while any operator row exists, with no override flag.

**Backups.** Four options were costed. Option A, Railway volume backups, was
chosen and executed on 17 August 2026 after upgrading to Pro, because it adds no
sub-processor, no new DPA and no school change notice before the pilot. RPO is
nightly, so up to 24 hours of children's work could be lost, and RTO is back
within a day. Both are knowingly accepted for a ten-school pilot. Constraints
that matter: Railway retention is daily for 6 days, weekly for 1 month and
monthly for 3 months, wiping a volume also deletes its backups, backups restore
only into the same project and environment, manual backups are capped at half the
volume size, point-in-time recovery should be treated as absent for volumes, a
restore stages a new volume and leaves the damaged one unmounted so the runbook is
provision and swap, and backups live in the same account as the data, so one
compromised login loses both.

**Recovery.** `docs/ops-recovery.md` covers normal sign-in, the 15-minute lockout
(clearable with a `railway run` Prisma one-liner), a lost phone (recovery code
then same-day rebuild), and break-glass, which is a documented row deletion
rather than a script because committing anything that mints a session is
forbidden. Recovery codes must live on paper, not in the repo, email, phone notes
or a password manager the same phone unlocks. Rehearsed on 17 August 2026 against
a throwaway database: seed, refusal on second run, delete, re-seed, session
cascade, audit survival. **Not rehearsed:** the `railway run` wrapper against a
real Railway environment, and any data restore at all, because there is no
non-production environment and a restore drill would create a second live copy of
every child's media. The RTO figure is therefore unmeasured.

**Monitoring.** There is no external uptime monitor, taken as a default and
recorded rather than closed. The accepted consequence: if the service stops
answering at 4am, the first to know is a teacher at 08:40. The health pane renders
only what it can determine inside the process, so five of its seven tiles read
"Not monitored" with the reason. Mail telemetry is counters only, with three
tables (`JobRun`, `MailCounter`, `MailSuppression`), because a per-send row
holding a recipient address would rebuild the enumeration signal a finding
deliberately withholds.

**Environment variables.** `APP_URL`, `DATABASE_URL`, `EMAIL_FROM_ADDRESS`,
`EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `FORCE_SEED`, `MAILJET_API_KEY`,
`MAILJET_SECRET_KEY`, `MEDIA_DIR`, `NODE_ENV`, `PORT`,
`STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, and the four price ids `STRIPE_PRICE_SCHOOL_SMALL`,
`_1FE`, `_2FE`, `_LARGE`. Sender defaults to `hello@mail.storyjar.co.uk` with
reply-to `hello@storyjar.co.uk`. Confirmed absent:
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (harmless at one replica, mandatory at two,
and setting it later invalidates in-flight actions) and `OPS_ENABLED`. Any backup
job variables must be named `BACKUP_*`, never `R2_*`, to preserve a parked
tripwire.

---

## 9. Billing implementation

Stripe hosted Checkout for purchase and the Customer Portal for changes and
cancellation. Only Stripe IDs are stored, never card numbers, and there is no
Stripe.js on any page. Apple Pay and Google Pay arrive through automatic payment
methods, with the production domain registered through
`/.well-known/apple-developer-merchantid-domain-association`.

A dedicated `Subscription` model holds `kind`, `status`, `stripeCustomerId`,
`stripeSubscriptionId`, `trialEndsAt`, `frozenAt`, `currentPeriodEnd`, timestamps
and exactly one of `teacherId` or `schoolId`. SQLite has no native enums so these
are strings with allowed values in comments. Shipped `kind` is `FREE | SCHOOL`.
A `BillingEvent` model provides idempotency and audit.

States: TRIAL (42 days, tracked locally, no Stripe trial and no card) and ACTIVE
give full access, PAST_DUE keeps full access through Stripe smart retry for about
14 days, and FROZEN is read-only, where viewing, media serving, download and
export stay open and every mutation is blocked except account management, export
and deletion. `frozenAt` starts the 12-month deletion clock. Nothing in billing
deletes data, and freezing is the only downgrade.

`requireWritableAccount()` is the single server-side gate, called at the top of
every mutating server action and route, denying by default if the state cannot be
determined, and never client-gated. Larchwood Primary exists in the test seed
permanently FROZEN specifically to prove the gate blocks mutations while reads
stay open.

Webhooks are signature-verified and idempotent via stored event ids:
`checkout.session.completed` activates, `invoice.paid` sets ACTIVE and
`currentPeriodEnd`, `invoice.payment_failed` sets PAST_DUE,
`customer.subscription.updated` syncs, and `customer.subscription.deleted` sets
FROZEN with `frozenAt`.

The trial-expiry freeze job is `scripts/freeze-expired.mjs` via
`npm run billing:freeze`, idempotent through a guarded `updateMany`, writing a
SYSTEM audit row. It is not registered as an ops operation and has no `JobRun`
record, so its health tile stays dark, and no scheduler is documented, so treat it
as manual. Ops billing screens are read-only with a link out to Stripe, because
manual payment recording was dropped: an override the next webhook silently
reverts is worse than none.

Hard constraint: no child data ever reaches Stripe, in metadata, descriptions or
line items.

---

## 10. Quality: gates, tests and findings

**Three layers.** Playwright e2e specs driving a real browser, the standing QA
battery under `tests/battery/` which is the executable form of `SAFEGUARDING.md`,
and a short manual smoke test.

**Commands.** `npm run check` (about 2 seconds: typecheck plus every static gate)
while writing code. `npm run test:battery` for everything. `npm run test:security`
and `npm run test:a11y` are the blocking gates. `npm run test:ux` and
`npm run test:perf` are report-only. `npm run test:security:findings` runs repros
for known gaps and fails on purpose. `npm run test:gate` before anything lands on
`main`. Setup needs `npm install` and `npx playwright install chromium`.

**Operating rules learned the hard way.** Run cold before a PR
(`pkill -f "next dev"; rm -rf .next; npm run test:battery`), because a warm server
once hid a merge that dropped three import lines and three blocking suites went
red only in CI. Never run two battery invocations at once, because they share one
SQLite file and the second run's global setup wipes the first mid-flight, which
cost six then fourteen phantom failures. Parallel branches need a git worktree
with its own `node_modules`, its own relative `DATABASE_URL` and its own port, and
processes must be killed by port rather than by `pkill -f "next dev"`, which once
killed nine tenant-isolation specs and read as a security regression.

**Never weaken a gate.** When a gate would go red for unrelated debt, the honest
options are to fix everything or weaken the gate, and neither is right, so the
debt gets logged as a finding instead. A related ruling: the author of a gate is
the worst person to certify it fires, which is why the gate has a mutation test
and a QA-owned canary corpus.

**PR template.** Safeguarding first, then a ten-item checklist covering
server-side ownership scoping, nothing published before approval, data
minimisation, access-controlled media, no data outside the UK or EU, DPA'd
sub-processors, deny and leak nothing, deletion removing rows and files, headers
and cookies unchanged or improved, and WCAG 2.2 AA with child target sizes and
reduced motion. A line may be deleted only with a stated reason.

**Test plan shape.** Security cases A1 to A15 and A17 to A32, 31 in total, with
A16 reserved then abandoned and A12 duplicated once, so the next free number is
A33. They cover tenant isolation, sessions, student login, uploads, injection and
XSS, CSRF, headers, dependencies, rate limiting, data protection, email
templates, family access, typecheck, the ops blindness gate with 94 canary
fixtures, healthcheck, seed refusal in production, log hygiene, migration and
schema agreement, and the whole operator area, each paired with its own
accessibility spec against an empty axe baseline. Usability cases B1 to B6 cover
axe on every page, keyboard navigation, 64px child targets, core task flows,
interruption resilience, responsive and device coverage, Lighthouse budgets and
an error-message audit. Layer C is the only manual layer.

**FINDINGS.md.** 38 findings, F1 to F38, so the next free number is F39. Roughly
22 are fixed or equivalent, 10 are open, one is mitigated, three are accepted, one
is deferred and one was withdrawn.

Open findings:

- **F20, Critical.** No backups of the volume holding every child's photo,
  drawing and voice note, while three documents told schools there were. Now
  largely overtaken by the 17 August backup work.
- **F35, High.** Backups are on, but Railway's DPA says primary processing is in
  the United States and backups sit across multiple sites and regions, against
  rule 10. Closes only on a written region answer from Railway.
- **F26, Medium.** Deleting a teacher row cascades classes, pupils, moments,
  drafts and templates and erases no media files. Latent today, but exactly the
  shape account deletion will reach for.
- **F27, Medium.** Template media has no erasure path, and duplicating or
  assigning a template copies path strings so files are shared. `RETENTION.md`
  claims otherwise.
- **F28, Medium.** Build and dev startup fetch webfonts from `fonts.gstatic.com`,
  so a Google 404 killed a CI job and would fail a deploy. Fix is vendoring plus
  `next/font/local`.
- **F30, Medium.** No mail alerting, and `MailCounter` is UTC-day granular so an
  hourly threshold is not expressible. It also has nowhere to send an alert.
- **F31, Medium.** Suppression sync has no schedule.
- **F32, Medium.** In forced-colours mode the entire operator nav and sign-out
  vanish.
- **F37, Medium.** Child touch-target debt on the drawing page, which the
  blocking sweep has never visited: ＋ and ✓ at 56px, object toolbar 44px,
  filmstrip and undo controls 24 to 32px, resize and rotate handles 20px, all
  against rule 18's 64px floor.
- **F38, Medium.** No per-test draft cleanup, so a failed test leaves a modal
  restore dialog that intercepts pointer events and turns one broken thing into
  twelve red specs.

**Recurring themes.** Client-supplied ids trusted server-side (F1, F15, F19,
two of them Critical). Erasure gaps (F3, F26, F27). Test infrastructure faults
masquerading as product bugs (F29 withdrawn, superseded by F34 and F36).

**The lesson worth repeating (F18).** Six of eight avatar colours gave a child a
1.8 to 2.5:1 contrast ratio on their own sign-in name card, and the blocking
accessibility gate passed throughout because an earlier finding's `color-contrast`
entry in `BASELINE_RULES` hid it. "The a11y gate will catch it" is not safe until
`BASELINE_RULES` is empty, an assumption already made twice in planning. Around 19
to 30 adult-surface nodes remain baselined pending a palette decision, while every
operator a11y spec runs against an empty baseline.

---

## 11. Claims that are wrong or stale

1. **The Tapestry flat-pricing claim in `LAUNCH_PLAN.md` is wrong.** It says
   Tapestry proves UK schools respond to simple flat pricing at about £99 a year
   for 40 children. Tapestry is not flat. It is banded across roughly fifteen
   tiers: £164 at 40 children, £290 at 90, £900 at 300, £1,200 at 400 (checked 15
   August 2026). The plan's central evidence for flat pricing in fact argued for
   banding. Both the £99 figure and the word flat are dead.
2. **Stale pricing throughout `LAUNCH_PLAN.md`:** flat £299, the £40 per-teacher
   seat model, seat limits governing billing, and the retired Individual plan.
3. **The Seesaw per-student figure must not be published.** The roughly
   $7 per student per year plus $0.85 for AI number is an unverifiable
   second-hand consortium rate. Seesaw publishes no prices, and every tier ends in
   "Talk to Sales". Say "schools tell us they pay four figures". The £1,700 a year
   at 300 pupils figure is private sizing, not a publishable source.
4. **"Your data stays in the UK" is wrong and was removed.** Say Europe, or
   Amsterdam. Avoid absolute never-goes-to phrasing, because Railway is
   US-incorporated and may support the service from outside the EEA.
5. **`RETENTION.md` promises schools a 35-day rolling backup cycle**, which no
   available option produces. That line is read by school DPOs during
   procurement and is still uncorrected. `/legal/privacy` and
   `/legal/data-processing` overstate in the same direction, and the privacy
   notice must not claim EU backups until Railway confirms the region.
6. **`AGENTS.md` line 42 says two seeded schools.** There are three, including
   Larchwood.
7. **Brand casing is inconsistent** across documents: StoryJar, Storyjar and
   storyjar all appear. The decided form is StoryJar with the capital J, except
   the in-app product name, which `AGE_MODE_COPY.md` keeps as storyjar. Settle
   this before the landing page rebuild.
8. **Comparison honesty rule.** Tapestry is usually bought EYFS-only, so its £164
   often covers a Reception cohort rather than a school. Comparing whole-school
   StoryJar against it flatters us. Seesaw is the honest whole-school comparator,
   and Tapestry should be cited only for the banding and metering point.

---

## 12. Launch plan and what is still open

Target launch is 1 to 2 September 2026, with the autumn term starting around
Tuesday 1 September. The wedge is individual teachers, bottom-up, then the school
conversation, aimed at Seesaw-fatigued KS1 and KS2 rather than EYFS assessment
buyers.

**Phase A (to 20 August):** create the four Stripe prices and env vars, then
compliance in order, being the privacy notice, terms and DPA out of draft, a
plain-English retention summary, a where-is-your-data page, the DPIA on file and
ICO registration confirmed. Rebuild the landing page around the switcher message,
with a "Switching from Seesaw?" page carrying a comparison, a cost calculator and
migration notes.

**Phase B (21 to 31 August):** recruit 10 to 15 pilot teachers by personal
message, offering the school tier free for year one in exchange for feedback and
a quotable testimonial. Three or four content posts a week, useful-first
participation in UK primary communities, email capture for a September setup
guide plus a free evidence-capture checklist, and an optional £150 to £300 of
paid social from 24 August, killed above about £5 per signup.

**Phase C (1 to 20 September):** coordinated launch day, daily quick-win content
for two weeks with replies within hours, watch every signup's first session.
Activation is 5 or more captures plus one parent share in week one. Offer a
head-facing one-pager to any teacher still active after two weeks.

**Phase D (21 September to half term):** follow up every active teacher, since
October and November is subscription-review season. Two or three SEO articles,
a monthly email, and reviews on EdTech Impact and Capterra UK.

**Metrics.** By 31 August: 10 pilot teachers active, 100 or more email signups,
landing page live with two testimonials, compliance published. By 20 September:
100 teacher signups, 40% activated. By half term: 250 teachers, 5 school
conversions, 3 case studies. If activation is under 25%, stop marketing and fix
onboarding.

**Budget.** Domain, hosting and email about £100, paid social £150 to £300,
design and screen recording about £50, reserve £50 to £200, at roughly 15 hours a
week.

**Open owner decisions.** D3, whether platform actions appear in the affected
school's own audit feed, answered yes for the action without the operator's
free-text reason, but not buildable today because reaching `schoolId` from a
parent needs the traversal the gate forbids, so a school's audit feed currently
shows nothing when StoryJar rotates one of their family codes. D12, paying for a
non-production Railway environment, still open and blocking the restore rehearsal
and all deletion work. D14, succession and sealed credentials, where one person
currently holds every credential, which must be answered before the pilot. D15,
the sending domain and disabling one-click List-Unsubscribe on transactional
mail, which becomes a launch blocker if it cannot be disabled.

**Biggest risks, as written.** Compliance not finished is the largest, because it
blocks the school sale and a single DPO rejection story in a Facebook group can
stall a term. Then no pilots and therefore no proof, the beta not being ready
(launch anyway, do not slip past 1 September), Seesaw switching costs, the free
tier never converting, and solo bandwidth.

---

## 13. Working conventions

- **Rule 1 is safeguarding first.** Before changing anything touching
  authentication, access control, the approval queue, children's data or uploaded
  media, read `SAFEGUARDING.md` and follow it. It overrides convenience and
  speed, and where it is unclear, take the more protective option.
- `CLAUDE.md` is a single line, `@AGENTS.md`, delegating entirely to it.
- `AGENTS.md` carries an auto-written block warning that this is not the Next.js
  you know, and asking contributors to read the relevant guide in
  `node_modules/next/dist/docs/` before writing code, and to commit the block
  rather than delete it.
- Keep the QA battery green. Nothing reaches `main` with a red gate. The plan
  lives in `TEST_PLAN.md`, gaps in `FINDINGS.md`, retention decisions in
  `RETENTION.md`.
- Any new endpoint or action taking an id gets a cross-tenant isolation test
  before it ships. Fixing a logged finding means moving its repro out of
  `tests/battery/findings/` into the matching blocking suite and deleting the
  finding entry.
- CI runs the full battery on every push and PR, but there is no branch
  protection configured, so a local `test:gate` is the only thing between a red
  gate and `main`.
- Commit message style is not documented anywhere in the repo. The convention in
  practice is plain human language describing the user-visible effect, with the
  reasoning in the body.

**Manual usability kit** (`docs/MANUAL_USABILITY_KIT.md`). A printable kit for
moderated sessions with 3 to 5 colleagues, ideally teachers, about 30 minutes
each, needing a laptop and an iPad and seed data only, reset between
participants. Five tasks: capture a photo into a child's journal on iPad, review
and approve on laptop including sending one back, add a new child including
paste-the-register, set up a second class and find what goes on the classroom
wall, and sign in as a family and correctly state that the view is read-only and
limited to their own child. Severity is 1 Critical (blocks the task or risks a
safeguarding mistake), 2 Serious, 3 Minor, 0 Note. Closes with the ten-item SUS
questionnaire, where 68 is average and the target is above 75. Severity 1 and 2
issues feed into `FINDINGS.md`, and where a flow can be pinned down a Playwright
test is added so the fix is protected. **The kit has been written but never run.**
