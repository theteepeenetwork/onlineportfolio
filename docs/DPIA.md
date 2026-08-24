# Data Protection Impact Assessment — StoryJar

**Version:** 1.2 (draft for sign-off) · **Written:** 15 August 2026 · **Updated:** 17 August 2026 (R15, platform operator identity, the operator read screens with their lookup records, the read-only billing view, and the first two named operator actions, none of which adds a new category of personal data; previously 16 August 2026 for R14 and 15 August 2026 for R6)
**Assessed by:** the founder, as data protection lead · **Status:** *Not yet signed off*

> **This is an internal assessment, not legal advice, and it has not been reviewed
> by a qualified data-protection or education-law professional.** It is written so
> that a school's data lead, an auditor or the ICO can see that the risks were
> identified deliberately. Section 8 lists what must be resolved before it is
> signed off and relied upon. Consistent with `SAFEGUARDING.md`, the customer-facing
> policies it supports need the same external review.

---

## 1. Why a DPIA is required

A DPIA is mandatory here, on more than one ground:

- The processing is of **personal data of children** who cannot meaningfully
  consent, at scale, by an online service they access directly. The ICO's
  Age Appropriate Design Code (the **Children's Code**) requires a DPIA for any
  information society service likely to be accessed by children.
- The data includes **photographs, voice recordings and creative work of
  identifiable children aged 3–11** — a category that carries real safeguarding
  consequence if disclosed to the wrong person, even though it is not special
  category data under Art. 9.
- Processing is **systematic and at scale** across multiple schools on shared
  infrastructure, where a failure of tenant isolation would affect many children
  at once.

## 2. Description of the processing

### 2.1 Nature

StoryJar is a digital learning journal for UK primary schools. A child creates a
"moment" — a photo, a voice note, typed words, or a drawing made on an in-app
canvas. The moment enters an **approval queue** and is invisible to everyone
except the child and their own teacher until that teacher approves it. Once
approved it appears in the child's journal and to their linked parent/carer.

Teachers may also add work on a child's behalf, and may set assignable activities
with worksheet templates and quizzes.

### 2.2 Scope — what personal data is held

| Data | Subject | Notes |
|---|---|---|
| **First name only** | Child | No surname, no date of birth, no address, no contact details, no biometrics. Enforced as a hard limit (SAFEGUARDING rule 2). |
| Avatar colour | Child | Display only; one of a fixed palette. Used to distinguish two children with the same first name. |
| **Journal moments** — photos, voice recordings, typed text, drawings | Child | The substantive content. May contain a child's image and voice. |
| Optional teacher-added skill tags and dates | Child | Teacher's professional judgement about a piece of work. Not a score, not a profile. |
| In-progress drafts | Child | Transient; 30-day retention. |
| Name, email, password hash, title, school name, country | Staff | Adults. |
| Family code, and the link to their own child(ren) | Parent/carer | Adults. Created by the teacher as a code and a link, and **nothing else**: no name, no address. |
| **Optional** parent name and email | Parent/carer | Adults, and **volunteered by that parent about themselves**. A teacher is never asked for either and has nowhere to type them; the email exists only so a parent who would rather not keep the letter can be sent a sign-in link, and can be cleared again by the parent at any time. The address is disclosed to **Mailjet (Sinch)** (EU storage only) when a link is sent (see R14). See §4. |
| **Mail delivery counters and refused-address labels** (added 17 August 2026) | Nobody identifiable, plus one pseudonymous label per refused address | Per-day tallies of send attempts carrying no recipient and no domain, plus a keyed one-way label for each address Mailjet is refusing. Owner decision **D7** default applied: counters only. The alternative was a row per send holding `toAddress`, refused because a visible list of sign-in failures by address rebuilds inside StoryJar the enumeration signal FINDINGS F6 withholds from the public form. Retention in `RETENTION.md`; risk at R14. |
| Billing contact name and email, or school name | Adult | Held by Stripe. **No child data ever reaches Stripe.** |
| Audit log entries | Staff actions | Who did what, never child content. |
| **Connector tokens and app registrations** (added 21 August 2026) | Teachers | A bearer token a teacher makes so Claude can build activities in their library: a SHA-256 of the token (never the token), a label the teacher chose, four characters of the token as a display hint, and the times it was made and last used. Plus, for a connector added on claude.ai, the app's self-declared name and redirect URIs and a hash of the codes behind the teacher's grant. **Adult data only; no child data is reachable through a token at all.** Retention in `RETENTION.md`; risk assessment at R17. |
| **Platform operator credentials and sessions** (added 17 August 2026) | The one adult who runs the service | Email address, bcrypt password hash, TOTP secret, ten bcrypt-hashed recovery codes, failed-attempt and lockout counters, and a hash of each live session value. Adult data about StoryJar's own operator, held so that the operator area can require a password **and** a second factor. Retention in `RETENTION.md`; risk assessment at R15. |
| **Operator lookup records** (added 17 August 2026) | School staff, and parents who have chosen to give StoryJar an address | One row per exact-match adult lookup in the operator area: the email address searched for, the operator's stated reason word for word, whether a record was found, and the time. Adult data, and it is the accountability record that makes the lookup permissible at all. An operator cannot browse adults or search part of an address; they can only type somebody's whole address, and every time they do it is written down with the reason they gave. Retention in `RETENTION.md`; risk assessment at R15. |
| **The school register** (added 24 August 2026) | **Nobody.** It is a list of institutions. | One row per open, primary-facing school in England — URN, name, postcode, local authority, phase, town — from the Department for Education's Get Information about Schools extract, so that a teacher signing up picks their school rather than typing its name. It contains **no personal data of any kind**: no child, no parent, no member of staff, no foreign key to a person, and every column is already published by the DfE under the Open Government Licence v3.0. **It adds no sub-processor: the extract is imported, not called.** That is stated rather than left as an absence because "we added a schools directory" reads like a third party until somebody checks. StoryJar downloads a public CSV by hand and reads it; nothing about a teacher, a parent or a child is sent anywhere, no request is made at runtime, and there is no account, contract or API key with the DfE. Retention in `RETENTION.md`; risk assessment at R18. |
| **Operator action records** (added 17 August 2026) | School staff, and parents who have chosen to give StoryJar an address | One row per named operation carried out in the operator area, holding the operation, the operator, the record acted on, the time and the operator's stated reason word for word. **No new category of personal data.** There are two operations and the list is closed (`docs/ops-architecture.md`, "The operation registry"): issuing a new family code, whose row carries the address **masked** and never a code of any kind; and showing a parent's address in full, whose row carries that address, because a record of a disclosure has to say what was disclosed. It is the same adult address the lookup row beside it already holds. Each row is written in the same database transaction as the thing it describes, so an operation whose record cannot be written does not happen. Retention in `RETENTION.md`; risk assessment at R15. |

**Deliberately not collected:** child logins, emails, passwords, phone numbers,
dates of birth, surnames, addresses, biometric data, geolocation, device
identifiers for tracking, behavioural analytics, or any advertising identifier.

### 2.3 Context

- **The school is the data controller; StoryJar is a processor** acting on its
  documented instructions. This holds regardless of who pays — including where a
  teacher uses the free plan personally (see `RETENTION.md`).
- Data subjects are **children aged 3–11** who cannot consent, and who in most
  cases cannot read fluently. They have no meaningful choice about using the
  service: their school chooses it.
- The lawful basis for the school will normally be **public task** (Art. 6(1)(e))
  for a maintained school, or **legitimate interests / contract** for an academy
  trust — the school determines this, not StoryJar.
- Parents and children have a reasonable expectation that a child's work is seen
  by their teacher and their own family, and by nobody else.

### 2.4 Purposes

To let a teacher capture and moderate evidence of a child's learning, build a
per-child record over a school year, and share approved work with that child's
own family. Nothing else. The data is **never** repurposed for analytics,
research, product improvement by inspection, marketing, model training, or
disclosure to any third party.

## 3. Consultation

| Who | Status |
|---|---|
| Data protection lead | The founder. StoryJar is not required to appoint a DPO (no large-scale special category processing, no systematic monitoring — see SAFEGUARDING rule 19), and deliberately does not use the title, since a voluntary appointment imports statutory independence requirements a sole trader cannot meet. Decisions recorded in `docs/dpo-decisions.md`. **A qualified external reviewer has not yet been engaged — see §8.** |
| Teachers / schools | Informal design input from classroom practice. A moderated usability kit exists (`docs/MANUAL_USABILITY_KIT.md`) but **has not yet been run**. |
| Children | Not directly consulted. Age-appropriateness has been addressed through design (three age registers, icon-only pre-reader interface, read-aloud) rather than consultation. **A gap worth closing with pilot schools.** |
| Parents | Not yet consulted. The family-facing privacy notice (`/legal/privacy-for-families`) is written for them but untested with them. |
| Processors | Terms reviewed; residency questions open (§6, R6). **Mailjet (Sinch)** replaced Brevo as the transactional-email sub-processor on 2026-08-16 (EU storage only, adult addresses only); the reason is recorded in R14. Its DPA is an open item alongside Railway's. |

## 4. Necessity and proportionality

- **Is the processing necessary?** Yes for the purpose — a learning journal
  cannot exist without holding the child's work. But the *identifying* data around
  it has been cut to the minimum that makes the product work: a first name and a
  colour. There is no field in the schema for a surname or a date of birth to be
  put into, which makes minimisation structural rather than a policy anyone has to
  remember.
- **Is there a less intrusive way?** The main alternative — no per-child record at
  all — defeats the purpose the school has chosen the tool for. Within the design,
  the less intrusive options *have* been taken: no child accounts, no
  child-identifying credentials, no public feeds, no behaviour scoring, no
  cross-class visibility, and no analytics.
- **Function creep** is constrained by written rules that bind future development
  (`SAFEGUARDING.md`), and by a test battery that fails the build if they are
  broken.
- **Children's rights:** access, rectification and erasure are exercised through
  the school. Erasure is real — rows *and* media files (rule 9), covered by tests.
  Portability is served by per-class export.
- **A deliberate decision not to collect:** the optional KS2 PIN permitted by the
  rule 1 amendment is **not built**, precisely because a PIN hash would be the
  first per-child credential and the first per-child data field beyond a first
  name (`docs/dpo-decisions.md`, 2026-07-18).
- **A second deliberate decision not to collect: a parent's contact details.**
  Family access is the mechanism that decides which adult sees a child's
  photographs, so how it is set up is a data-protection question, not a
  convenience one. The obvious build is the one every comparable product ships:
  the teacher types the parent's email address and the system emails them an
  invitation. StoryJar does not do that. A teacher creates a family space for one
  child and gets a **code**, which reaches the household on paper, from the
  school. The parent redeems it, and only then, and only if they want a sign-in
  link in future, do they add their own address.

  The position this produces is worth stating plainly, because it is unusually
  strong for a children's product: **StoryJar holds no contact detail for any
  parent unless that parent chose to give it, about themselves, after they were
  already signed in.** Three things follow, and each of them is a risk that does
  not exist rather than one that is managed:

  - **No adult contact database accumulates as a side effect of use.** A school
    with 300 pupils generates 300 codes and zero addresses. Under the obvious
    build it would generate 300 addresses on day one, whether or not a single
    parent ever signed in.
  - **StoryJar never sends an unsolicited message to a parent.** There is no "you
    have been added" email anywhere in the feature. The only message a parent can
    ever receive is a sign-in link they personally asked for, at an address they
    personally typed. A mistyped address entered by a busy school cannot therefore
    send a stranger anything (see R14).
  - **Nothing is asked of a parent who does not want to be known.** A family can
    use StoryJar for years having told it only that they hold a code.

  The cost is real and was accepted knowingly: delivery depends on the school
  putting a letter in a bag, there is no way to reach a family whose letter went
  astray except through the school, and the code is a bearer credential until it
  is redeemed. Those are the reasons the code is generated with the crypto RNG,
  is revocable and re-issuable by the teacher in one tap, is never written to the
  audit log, and is destroyed with the family space when access is removed
  (`RETENTION.md`).

  **Siblings follow from the same decision.** Two children in one family may be
  taught by two teachers who must never see each other's classes, so neither
  teacher can be the one to join the two records up. The parent does it: signed
  in, they enter the second code themselves. It is the only route that puts two
  children behind one sign-in, and it discloses nothing about either class to
  anyone.

## 5. Children's Code — how each standard is met

| Standard | How StoryJar addresses it | Gap |
|---|---|---|
| 1. Best interests of the child | The founding rule: safeguarding wins over convenience, speed and deadlines, without discussion. | — |
| 2. DPIA | This document. | Not yet signed off |
| 3. Age-appropriate application | Three registers (EYFS 3–5, KS1 5–7, KS2 7–11) chosen per class by the teacher. Unset defaults to **EYFS — the most protective**. | — |
| 4. Transparency | Child-facing copy is written for the age band and read aloud on request; a family-facing notice exists in plain English. | Policies still marked draft |
| 5. Detrimental use of data | Data is used only to show a child's work to their teacher and their own family. | — |
| 6. Policies and community standards | `SAFEGUARDING.md` is enforced by an automated test battery, not just asserted. | — |
| 7. Default settings | Deny by default (rule 8). Nothing is shared until a teacher approves it. Age mode defaults to the youngest register. | — |
| 8. Data minimisation | First name only; no schema field exists for banned data. The same test is applied to the adults: a parent's name and email are optional, self-supplied and clearable, and the teacher's screens have nowhere to enter either (§4). | — |
| 9. Data sharing | No child data is shared with any third party. Stripe receives adult billing data only. | — |
| 10. Geolocation | Not collected at all. | — |
| 11. Parental controls | Parents see their own child's approved work, read-only. No covert monitoring of the child by anyone. Access is granted by the school one child at a time, and the school can re-issue or withdraw it in one tap; the parent controls their own contact details and can remove them. | — |
| 12. Profiling | **Off, and not built.** No behaviour points, no rankings, no cohort scoring, no recommendation engine, no AI processing of children's work. | — |
| 13. Nudge techniques | No streaks, no pressure to share, no engagement mechanics. The celebration on submission rewards the act of making work, not frequency of use. | — |
| 14. Connected toys/devices | Not applicable. | — |
| 15. Online tools | Erasure and export are available to the school; a child is never asked to justify a request. | Requests routed via the school |

## 6. Risks identified

Likelihood × severity, assessed **after** existing controls. "Residual" is the
rating that remains.

**These rows cite; they do not restate.** Where a fact has a home — a rule in
`SAFEGUARDING.md`, a period in `RETENTION.md`, a count in `FINDINGS.md`, a
constant in the code — this table points at it by name and date rather than
repeating it. That is not tidiness. Every stale row found in the sweep of
2026-08-24 had the same cause: a fact copied out of its home document and then
left behind when the home changed. R15 restated D2's answer and said the volume
had no backup five days after backups were switched on. R6 carried the
backup-location residual implicitly instead of citing `RETENTION.md`, which had
already recorded it as unconfirmed. R7 paraphrased the read-aloud rule and so
still forbade what two governed amendments had allowed. R9 carried its own node
count and disagreed with `FINDINGS.md` F11 — and when it was measured, both were
wrong.

A copied fact cannot be updated by whoever changes the original, because they do
not know it exists. **A citation can only go stale in one place.** When adding or
editing a row: if a sentence here would have to change because a file elsewhere
changed, cite that file instead of writing the sentence.

| # | Risk | Existing controls | Residual |
|---|---|---|---|
| **R1** | A teacher or admin at one school reaches another school's children's work | All child-data queries scoped by ownership server-side (rule 4); deny by default (rule 8). Blocking tests: `tenant-isolation.spec.ts`, `f1-student-impersonation`, `f15-cross-tenant-journal-write`, `uploads-path-collision`, and — added 2026-08-23 with the per-pupil subject access export — `security/data-protection.spec.ts`, which proves the owning teacher gets 200 while a colleague at the same school who does not teach the child and a teacher at another school both get 404. Two real defects of exactly this kind (F1, F15) were found and fixed, each with a regression test that fails against the pre-fix code. **The convention is that a new endpoint taking an id gets a cross-tenant test before it ships** (`AGENTS.md`); this row lists them so the absence of one is visible. | **Low** |
| **R2** | Child content reaches a parent or third party before a teacher has seen it | The approval queue is a hard gate on **what the product displays**: no auto-publish, enforced server-side rather than as a UI convention (`SAFEGUARDING.md` rule 3). **One named exception**: a subject access export discloses `PENDING` and `RETURNED` work, because approval is a *workflow state* and a workflow state does not limit Article 15 — an export answering "what have you published" to a question that asked "what do you hold" would be the defective one. The control there is **human review before release, not withholding**: the file counts its unapproved items at the top and the teacher's screen says to read it before sending. Governed by rule 3's **scope note of 2026-08-23**; read the wording there rather than here. | **Low.** The exception is the one route by which unapproved work reaches a parent, and it is teacher-initiated, teacher-mediated and audited (`PUPIL_DATA_EXPORTED`), so what pins the rating is that no automatic path exists — not that no path exists. |
| **R3** | Photos or voice notes served from guessable URLs | Every `/uploads` request is authorised against the same ownership rules before bytes are served; hardened content type and CSP; SVG rejected on upload. F5/F17 addressed. | **Low** |
| **R4** | A leaked class code discloses a class roster (every child's first name) | Lookup throttled per IP, miss-only and classroom-safe (F16); a teacher can rotate a leaked code, scoped to the owning teacher. Roster disclosure is limited to first names — no surname exists to leak. | **Medium** — a valid code in the wrong hands still shows first names. Accepted as inherent to a no-login child sign-in; the alternative (child credentials) was judged more intrusive. |
| **R5** | Children's data kept longer than necessary | `RETENTION.md` defines every category; deletion removes rows **and** files across all delete paths (rule 9), covered by tests. A free teacher account can never be frozen, so it never enters a billing deletion clock at all. | **Medium** — the frozen→deletion pipeline for lapsed *school* accounts is **not automated**; it is carried out manually. Tracked as a P2 gap. |
| **R6** | Personal data processed outside the UK/EEA | **Hosting region confirmed 2026-08-15: EU West (Amsterdam, Netherlands)**, with the data volume in the same region — so children's moments, media and account data are held in the EEA, satisfying rule 10. UK→EEA transfers are covered by the UK's adequacy regulations, so no IDTA or SCCs are required for the storage location. Stripe holds **adult billing data only**; no child data ever reaches it. | **Medium.** Three residuals: (a) Railway is **US-incorporated**, so its personnel may access systems for support from outside the EEA — its DPA and onward-transfer terms have not been obtained and recorded; (b) **Stripe's billing-data residency is still unassessed**; (c) **the geographic location of the volume backups is not confirmed** (F35, open). The hosting region confirmed above covers the database and media at rest; it does not establish where a backup of them is held, and Railway's documentation states the schedule but not a region. `RETENTION.md` removed the Amsterdam claim from that row rather than repeating it, and instructs that the privacy notice must not claim backups are held in the EU until the question is answered in writing — the notice was corrected accordingly on 2026-08-23. Neither (a) nor (b) involves children's data at rest leaving the EEA; (c) is unknown rather than adverse. |
| **R14** | A parent's sign-in link reaches the wrong person, or an email discloses a child | Sending is via **Mailjet (Sinch)**, which stores in the **EU only** (Google Cloud, EU regions) and receives the adult address only. **No child's name and no child content appears in any email**: templates are written so a misdirected message tells a stranger nothing about a child, **Amended 2026-08-16, and this is a reduction:** this sentence used to end "which matters because the *school* holds the address and schools mistype them". That route is now closed. When family access was built (PR #112), the design chosen was that **a teacher never types a parent's address**: a code goes home on paper and the parent types their own address afterwards, if they want one at all (§4). So the address on file is the parent's own, entered by the person who owns the inbox, and most families have none at all. Two of R14's three ways in went with that: a third party mistyping an address, and a message going to somebody who never asked for one. The rating is unchanged only because what pins it is the third way in, which this design does not touch. **StoryJar cannot tell whether a particular parent opened an email or clicked its link**: Mailjet's account-level *Track openers* and *Track clicks* are both switched off, which covers transactional messages and not campaigns alone, and `src/lib/mailer.ts` disables both again on every message (`TrackOpens` / `TrackClicks` properties plus the `X-MJ-TrackOpen` / `X-MJ-TrackClick` headers). *(Provider changed 2026-08-16. The reason is recorded here because it decides whether anyone may change it back. Brevo rewrote every link through its own redirect domain and injected an open pixel, offered no way to switch either off below Enterprise, and silently discarded the `disableTracking: true` the code was sending; its transactional log for 16 August 2026 at 14:04 shows a first-opening event against a magic-link email sent with tracking disabled. An account-level off switch is the control Brevo does not offer and Mailjet does, which is why the claim above is now the direct one rather than the narrower "recorded but not associated with an individual".)* Click-tracking must never occur, because rewriting the link would break the token and hand a third party the means to use it. **That one is checked, not assumed**, precisely because we now know a provider can ignore an API flag: `scripts/verify-mail.ts` sends the real sign-in template carrying an obviously fake token, and the delivered raw source is read to confirm the href was not rewritten, and `scripts/mail-events.mjs` reports any open or click event Mailjet recorded despite all three switches. **The messages StoryJar generates carry no image, no external URL and no stylesheet at all**, which since 2026-08-16 is a blocking test over the rendered templates (`tests/battery/security/email-templates.spec.ts`) rather than a comment in the source: an open pixel in a delivered message therefore has to have been injected by the provider, because no change to StoryJar's own code can introduce one without turning the build red. *(Status 2026-08-16: the Mailjet probe and its raw-source inspection are **outstanding**. If links are ever found rewritten, that is a functional defect in the parent sign-in path, not a wording problem, and it gets its own entry in `FINDINGS.md`.)* **From 17 August 2026 StoryJar records its own per-day counters of send attempts, and a keyed label for each address Mailjet is refusing, so a parent reporting that no sign-in link arrives can be answered. Neither holds a recipient address, and this does not change what Mailjet holds.** **Two residuals came with the change**, both recorded in `RETENTION.md`, **which owns the periods and is where they should be read** — this row does not repeat them, because a retention figure copied here is a figure that drifts from the schedule it came from. The two facts this row does depend on: the change to Mailjet **lengthened** the delivery-record period rather than shortening it, and Mailjet publishes no figure for message-level event data or for a stored copy of the message body separate from that aggregate, so **StoryJar can no longer assert that no copy of a sign-in email is stored anywhere**. Tokens are never logged by us, are single-use, and short-lived, which is what stops a stored copy being a durable route in — the expiry itself is set out in `RETENTION.md`'s magic-tokens row and is not repeated here. | **Medium.** Raised from Low on 2026-08-16 by the *unconfirmed* message-body position, not by any known bad fact. A stored, readable copy of a sign-in email is a route by which a link reaches someone other than the parent, and that possibility is currently unevidenced in either direction. Returns to **Low** on written confirmation from Mailjet (the open item in `RETENTION.md`) plus a clean raw-source inspection of a delivered message. **Held at Medium deliberately, not by inertia:** the same-day family-access design removed the mistyped-address and unsolicited-message routes and left almost every family with no address on file at all, which is a genuine narrowing. It is not a reason to move this number, because the residual is about a stored copy of a message that *was* sent to the right person, and one parent who asked for one link is enough for that to bite. |
| **R7** | A child's name or work sent to a third party by read-aloud | `speechSynthesis` may transmit spoken text to a cloud voice on some platforms. **The rule is that only StoryJar's own fixed copy is spoken**, with **two named exceptions**: a teacher's note on returned work, and a quiz question. The EYFS greeting displays "Hello, Ava!" but speaks a name-free string; a child's name, a caption and their own work are not speakable at all. **Both exceptions are bounded by the same mechanism** — the words are spoken only through a voice the platform reports as running on the device (`SpeechSynthesisVoice.localService === true`), no listen button is rendered where there is no local voice, and a platform that will not say is treated as remote and stays silent. The rule and both exceptions are governed by `SAFEGUARDING.md` rules 10 and 11 and its **amendments of 2026-08-19 and 2026-08-23**; read them there rather than here, and note that the second is recorded as covering the question only and not the answer options. | **Low**, and what pins it there is the on-device condition rather than the narrowness of the exceptions: the words never leave the tablet, so a wider exception would not change the rating but a weakened voice check would. |
| **R8** | Children profiled, scored or tracked | Structurally absent: no analytics provider, no advertising network, no social pixels, no behaviour points, no AI processing of children's work. A static audit gate blocks new third-party script use. | **Low** |
| **R9** | A child cannot reach their own work — exclusion as a privacy harm | WCAG 2.2 AA is a safeguarding rule (18), gated by axe in CI. F18 (six children in eight could not read their own initial on their name card) was found and fixed, with an arithmetic test over the whole palette. | **Medium** — a `color-contrast` baseline remains in `BASELINE_RULES` pending a palette decision. **The count lives in `FINDINGS.md` F11 and is not repeated here**: this row previously said ~30 while F11 said ~19, and when it was finally measured cold on 2026-08-24 the answer was neither. Read the number there. What matters for this row and does not change with the count: the remaining nodes are on **adult admin surfaces**, no child-facing surface is baselined, and **a baselined rule is how F18 hid for weeks** — six of eight avatar colours gave a child an unreadable initial on their own name card while the scan passed throughout. |
| **R10** | Staff account compromise exposes a class | bcrypt password hashing; failure-count rate limiting per account+IP; session cookies HttpOnly, SameSite, Secure in production; server-side session invalidation on logout. | **Medium** — no multi-factor authentication for staff. Proportionate at current scale; revisit as schools scale. |
| **R11** | A parent sees another family's child | Parent↔child link scoping, read-only, approved items only; covered by tenant-isolation tests. Extended 2026-08-16 when family access became something a teacher can actually set up: a family code is scoped to the child it was made for and to no other, **including another child in the same class**, and a link removed by the teacher ends access on the parent's very next request rather than at the end of their session. Both are blocking tests in `family-access-cross-tenant.spec.ts`, alongside paired positive controls so a route that has simply stopped working cannot pass the negative. The one way two children reach one sign-in is the parent entering the second code themselves, which cannot reach a child no one sent them a letter for. | **Low** |
| **R12** | A breach is mishandled or notified late | Incident response process exists in `SAFEGUARDING.md`: contain, assess, notify the school as controller without undue delay so it can meet its 72-hour ICO duty, route child-safety concerns to the school's DSL, record, remediate. | **Medium** — the process is a starter with **no named contacts and no school-facing template**, and has never been rehearsed. |
| **R15** | The platform operator account is compromised, or the operator area becomes a route to children's work | Three separate things hold this down, and it is worth being precise about which does what. **(a) What the area can reach at all.** It is structurally unable to read a child's name, work, media path, class code or family code: every read goes through a chokepoint, a static gate (`scripts/check-ops-blindness.mjs`) fails the build on any query, import, media element or impersonation path that would change that, and the gate ships with a canary corpus that proves it still fires. *(Added 17 August 2026, PR3: the area now also shows each school's **billing state** (the plan, the payment status, the trial and period dates, the price band, and the Stripe customer and subscription ids), with a link out to the Stripe dashboard. **This is not a new category of personal data.** Every field is already held and already listed in `RETENTION.md` as a billing record kept six years, it is adult and organisational data with no child in it, and the only child-derived figure on the screen is the same whole-school headcount the schools list shows, suppressed below ten by the same single constant. The screen is **read-only by construction**: owner decision D6 dropped manual payment recording, so there is no form, no button and no writable field on it, and no code path in the operator area calls Stripe or holds the Stripe secret key. Clicking through to Stripe sends no referrer. Stated plainly, in the same terms as R16: on the other side of that link is Stripe, where the operator is the account holder and can already see the school's adult billing contact and its invoices. The link changes what is convenient, not what is possible, and nothing behind it is a child's data.)* *(Added 17 August 2026, PR4: the area can now DO two things as well as look, and both are named rows in a closed registry with a confirm step, a stated reason of at least twelve characters and an audit row written in the same database transaction as the thing itself, so an action whose record cannot be written does not happen. **Issuing a new family code** is a revocation: it replaces the code on one household's letter, takes access away and hands nothing over. The operator never sees either the old code or the new one, which owner amendment C1 requires because reading a family code is a way to sign in as that family; the value is minted inline and never bound to a name, the static gate permits that one write shape and refuses every other spelling of it, and a blocking test asserts the new code appears nowhere in the page, its serialised payload or the audit trail while the teacher's own page does show it. **Showing a parent's email address in full** discloses one adult address, once, on request, with the reason and the address both recorded; it is reachable only from a record the operator has already found by typing that whole address, never from an address box of its own. What was deliberately NOT built: rotating a class code, because reaching a class would mean putting class names and ids on an operator screen, and any change to an adult's email address, which is owner decision D9 and is refused by the gate rather than by a convention. **One transparency gap is open and is the owner's to close (D3):** the affected school's own audit feed does not yet show that StoryJar rotated one of their family codes, because whether platform actions appear there is an unanswered owner decision and building it either way would be guessing. The operator screen says, in words, that the school has to be told.)* **(b) Who gets in.** A separate identity from every other account in the product, with its own table and its own cookie (`__Host-sj_ops`, `Path=/`, httpOnly, SameSite=Strict, Secure in production); bcrypt cost 12; **mandatory TOTP with no bypass of any kind, including in test**; replay protection that refuses a step at or below the last accepted one; session values stored as SHA-256 hashes so a leaked database file is not a set of live sessions; the session value rotated at the moment the code is accepted; a 30-minute idle and 8-hour absolute cap (`IDLE_MINUTES` and `ABSOLUTE_HOURS`, `src/lib/ops/session.ts:58-59` — the constants are the authority, this row is a copy of them); a lockout persisted on the row so it survives a restart; the throttle checked before any bcrypt work; one generic failure message for every cause; and the whole area 404 (never 403, never a named login page) when unauthorised or when `OPS_ENABLED` is unset, which it is by default. **(c) What is recorded.** Sign-in, failure, code failure, enrolment, recovery-code use and sign-out are written to the operator's own audit table, which the operator area cannot update or delete. So is every adult lookup, with the address searched for and the operator's stated reason of at least twelve characters, written by the same function that performs the read so that a lookup cannot happen without a record of it, and refused outright if the record cannot be written. Covered by the blocking specs A21 and A22. | **Medium.** Three residuals, all accepted deliberately rather than mitigated. **Real-time phishing of a TOTP code** would defeat the second factor: a passkey or WebAuthn is the upgrade path and is a separate owner decision, not something to bolt on for a one-person pilot. **The TOTP secret is stored in plaintext beside the database**, because encrypting it with a key from the environment puts the key on the same host as the ciphertext and buys less than it appears to; recorded here rather than left undocumented, as brief 02 required. **The volume holding all of this is backed up but the restore has never been rehearsed.** *(Corrected 2026-08-23: this residual previously read "still has no backup (D2, unanswered)". D2 was answered and executed by the owner on 2026-08-17 — Railway upgraded to Pro, daily and weekly volume backups switched on, RPO nightly — and this line was not updated with it. What remains true is narrower and still worth stating: handbook R12 is not satisfied because no restore has been performed end to end, and the geographic location of those backups is not confirmed (R6 residual (c), F35). So the operator account shares the disaster-recovery position of everything else, which is now "a nightly copy nobody has yet restored" rather than "nothing".)* **The lookup reason is free text**, so nothing can stop a child's name being typed into it; the field warns against it above the box, the text is stored word for word and is readable by somebody other than the person who typed it, and no gate can do better than that. That now applies to the reason given for an action as well as for a lookup. **And, as of PR4, a school is not told when StoryJar issues a new family code for one of their families** (D3, unanswered): the record exists in StoryJar's own operator trail and not in the school's, so the controller depends on being rung rather than on being shown. |
| **R16** | The operator, as a person, reads children's data outside the product | Nothing in the application does this, and nothing in the application can. But the same person has Railway shell access and can open the SQLite file and every media file on the volume. **This is stated rather than mitigated, because it is not a defect: it is what running your own service means.** What limits it: the operator area gives no such path, so day-to-day operation never requires touching child data; the recovery procedure in `docs/ops-recovery.md` is the only routine that needs the shell at all; and the audit trail of anything done through the product is complete. What would reduce it further, none of which is built: an off-box audit copy the operator cannot silently edit, encryption at rest for media, and a written policy that direct database access outside an incident is not done. | **Medium, and permanent at this scale.** It must be described in exactly these terms to any school that asks. A guarantee that overstates itself is worse than none, because a school will rely on it, and the gap between the claim and the reality is the likeliest place this project produces something indefensible in a procurement questionnaire. |
| **R17** | A teacher's connector token leaks, and a third party reads or rewrites their teaching material | **What a token can reach is the mitigation, and it is a structural one rather than a configured one.** A token resolves to one teacher and reaches that teacher's activity templates and folders, and (from 21 August 2026) may write image files into the media volume as part of building one. It cannot reach a class, a child, a journal item, a draft, an assignment, the approval queue or any uploaded media — not because a scope says so, but because `src/lib/api/` queries no other model and there is no route above it that can. There is no scope parameter to widen and no flag that changes it; a connector that wanted child data would have to be written, reviewed and merged, and the blocking spec `tests/battery/security/connector-api.spec.ts` asserts both the closed tool list and the absence of those routes against the running server. **Beyond that:** only the SHA-256 of a token is stored, so a copy of the database file is not a set of live tokens; every query is scoped by `teacherId` in the where clause, so a leaked token cannot reach another tenant and a refusal cannot confirm another teacher's row exists; the same billing gate the teacher's own screens use makes a frozen account read-only here too; a teacher sees every live token and connected app on their own account page and can revoke either in one click, taking the access tokens with it; revoking **deletes** the row rather than flagging it, so the hash stops existing rather than being filtered out; OAuth access tokens expire in an hour and their predecessor is deleted as the next is issued; a replayed authorization code revokes the whole grant; and the connector deliberately does **not** push an edit onto classes already working on an activity, so nothing a model writes can change a quiz a child is halfway through. **On the media write added 21 August 2026:** pictures arrive as bytes only — StoryJar will not fetch a caller-supplied URL, because doing so from inside the container is server-side request forgery, and the refusal says so rather than leaving it as an unimplemented convenience. Bytes go through the same `saveImageDataUrl` a teacher's own upload does, so the type allow-list (PNG/JPEG/WebP) and the private media directory served only through the authorising `/uploads` route are unchanged. Two caps bound the volume rather than the file: 2 MB for one picture and 10 MB across one activity, because the risk on a 5 GB volume with six days of backups is a loop writing a hundred reasonable files, not one oversized one. An `asset_id` is matched against a strict `/uploads/<name>` pattern, so a token cannot point a page at a path of its choosing — and `/uploads` would refuse to serve it anyway. Alt text is required whenever new bytes are supplied (rule 18), and not demanded when a caller merely references a picture already stored, so a teacher's legitimate edit is never blocked by a picture that predates the field. **What a leak costs, stated plainly:** somebody could read and rewrite one teacher's worksheets and quizzes, and place pictures on them, bounded by the caps above. That is the teacher's own professional work, it is not a child's, and it is recoverable. **This row's claim is load-bearing and it is a claim about a directory.** What makes it true is that `src/lib/api/` queries no model belonging to a class, a child or the approval queue — not a scope, not a flag, not a setting. That surface grows: it gained roughly 590 lines on 2026-08-23 (a PNG renderer, wider media handling, quiz layout), and the claim survived only because none of it reached a child model. Anyone extending that directory is extending the thing this row rests on, and `tests/battery/security/connector-api.spec.ts` is the assertion that catches it — treat a change there as a change to this row. | **Low.** The residual is that a bearer token is a bearer token: anyone holding it is that teacher, until it is revoked. Two things keep it there rather than higher. The blast radius is one teacher's teaching material, and every route out of that material into a child's data is absent from the code rather than closed by a check. **One residual is the teacher's own judgement**, and nothing technical can remove it: a teacher who pastes a token into the wrong place has handed over their library, exactly as if they had shared their password, and the account page says so in those words. **A second is that dynamic client registration is open**, because a connector running in somebody else's product has nobody to hand a client id to in advance; registering grants nothing on its own — the only thing it can lead to is a consent screen a teacher has to read — and registrations nobody authorises are swept after thirty days. |
| **R13** | A child is asked for a credential, creating an identity to compromise | No child logins, emails or passwords exist. The optional KS2 PIN is permitted by rule 1 but **deliberately not built**. | **Low** |
| **R18** | The school register becomes a data-protection surface it was never meant to be | **It cannot become one from where it starts, and the reasons are structural rather than procedural.** The table holds no personal data at all — six public columns about an institution, published by the DfE under the Open Government Licence v3.0 — so there is no data subject, no lawful-basis question, and nothing in it to erase, rectify or export. **No sub-processor is added:** the extract is a public CSV downloaded by a person and read, so nothing about a teacher, a parent or a child is sent to the DfE, no request is made at runtime, and there is no account or contract with them. The register is **read-only to the operator area** — classified `PUBLIC_REFERENCE` in `scripts/check-ops-blindness.mjs`, which permits no write of any shape — so no operator screen can add, change or bulk-replace a row; rows arrive only through `npm run gias:import`, in the repository and reviewable. The search that reads it is **bounded and wildcard-proof**: a fixed server-side cap of twenty rows with no `limit`, `skip` or cursor to raise it, LIKE metacharacters stripped from the query rather than escaped, and a three-character minimum — all asserted in `tests/battery/security/establishment-search.spec.ts` and in `npm run check`. A per-IP request budget is **implemented, now relied upon, and still not exercised by any test** (`allowEstablishmentSearch` in `src/lib/rateLimit.ts`, called only from the search action). **Corrected 24 August 2026, when step 3 landed.** This row previously said "nothing rests on it today, because the action is not yet reachable from any page" — the signup picker is what makes it reachable, so that sentence stopped being true the moment the picker shipped, and it stopped being true in the direction that matters: the budget is now the only bound on how often an unauthenticated caller may ask. What is at stake is availability rather than disclosure, because every column the search can return is public; the risk is somebody making StoryJar scan a table for them, not somebody learning something. It remains **named here as unproven rather than counted among the assertions**, and the reason it is unproven is structural rather than neglect: `src/lib/rateLimit.ts` imports `server-only`, so no `tsx` check and no Playwright spec can call the function directly, and driving the ceiling through the browser would need 121 real searches against an in-process counter shared by the whole run — leaving every later search throttled for ten minutes and turning a documented open gap into an undocumented flaky gate. **The fix is to split the counter's arithmetic into a `server-only`-free module**, the same split already made for `mailStatus`/`mailer` and `establishmentRegister`/`establishmentSearch`, at which point the window, the ceiling and the trickle are all testable in milliseconds. Recorded as an open measure below rather than left as an absence. Storing a URN against a `Teacher` adds no new category: it is one public identifier for the school an adult says they work at, alongside the free text already held, and it is deleted with the teacher by the same cascade. Retention in `RETENTION.md`. | **Low.** Two residuals, both stated rather than mitigated. **The register does not verify employment.** A teacher picking a school from it is a claim, not evidence — matching a name has never been evidence of working somewhere — which is exactly why `docs/school-identity.md` refuses auto-join and makes payment, not selection, the thing that settles a claim on a school. Nothing in this step grants any access to anything. **The register is a snapshot and will be stale.** A hand-run import cannot be otherwise, so the free-text path stays a first-class route rather than a fallback, and `/ops/health` shows the age of the data instead of implying it is current. |

## 7. Measures to reduce risk

| Risk | Measure | Effect | Owner | When |
|---|---|---|---|---|
| R6 | ~~Confirm and pin the Railway region~~ — **done 2026-08-15: EU West (Amsterdam)**, recorded in the sub-processors table and the privacy notice | Closed | Founder | Complete |
| R6 | Obtain **Railway's and Mailjet's** DPAs and record their onward-transfer / support-access terms | Reduced to Low | Founder | Before launch |
| R6 | Complete the Stripe residency assessment and record the conclusion | Reduced to Low | Founder | Before first live payment |
| R5 | Build the frozen→deletion automation | Reduced to Low | Founder | Post-launch; until then, a documented manual diary check |
| R9 | Settle the badge palette and empty `BASELINE_RULES` so the a11y gate is strict | Reduced to Low | Founder | Before launch |
| R12 | Name an incident contact, write the school-facing breach template, rehearse once | Reduced to Low | Founder | Before launch |
| R10 | Offer MFA for staff accounts | Reduced | Founder | Post-launch, review at scale |
| R15 | Rehearse `docs/ops-recovery.md` against a Railway environment, not only a local database (blocked on D12, a non-production environment) | Reduced | Founder | Before the pilot |
| R15 | Decide on a passkey or WebAuthn second factor, which is the answer to real-time phishing that TOTP does not have | Reduced | Founder | Post-launch decision, recorded either way |
| R16 | Write down, and hold to, that direct database or media access happens only during a named incident, and say so to schools in those words | Accepted, bounded | Founder | Before the pilot |
| R18 | Split the per-IP counter's arithmetic out of `src/lib/rateLimit.ts` into a `server-only`-free module, so the establishment search's request budget can be asserted by a test instead of described by a comment. Added 2026-08-24 when the signup picker made the throttle reachable and therefore load-bearing. **Why a browser test is the wrong answer here specifically**, recorded so it is not re-proposed: `tests/battery/security/classcode-throttle.spec.ts` does drive a limiter through the browser, so "throttles cannot be tested here" would be false. That one is **miss-based and any success clears the key**, so a spec can trip it and reset it in one correct lookup. `allowEstablishmentSearch` is a pure budget with **no clearing event at all** — 120 requests per 10 minutes on an in-process counter keyed by IP and shared by every spec in the run — so nothing a spec does afterwards un-poisons it, and a spec that tripped it would leave every later establishment search throttled. **Also rejected: a test-only reset or inspection hook.** That is ruling R6's shape — a guard that stops guarding when a parameter says so, one copy-paste from production. The split costs more and takes nothing away. | Reduced to Low — it is the only control in the register that is relied upon and unproven | Founder | Post-launch |
| R4 | Keep roster disclosure to first names; monitor for abuse; keep rotation one tap away | Accepted | — | Ongoing |
| All | Keep the QA battery green as the executable form of `SAFEGUARDING.md`; never weaken a gate to make it pass | Sustained | Founder | Ongoing |
| Consultation | Run the moderated usability kit with pilot teachers; ask a pilot school's DPO to review this DPIA | Reduced | Founder | During the pilot phase |

## 8. Outstanding before sign-off

This DPIA **cannot be signed off** until:

1. ~~The Railway hosting region is confirmed and recorded.~~ **Done 2026-08-15 —
   EU West (Amsterdam, Netherlands), volume in the same region.** Remaining under
   this heading: obtain **Railway's and Mailjet's DPAs and onward-transfer terms**, since Railway
   is US-incorporated and may support the service from outside the EEA. The provider
   changed on 2026-08-16, so this action now needs **Mailjet's** DPA rather than
   Brevo's; it stays open and is not carried over as done.
2. **Stripe's billing-data residency is assessed** and the conclusion recorded.
3. **An incident contact is named** and the school-facing breach template written.
4. **A qualified data-protection professional reviews** this assessment and the
   customer-facing policies. `SAFEGUARDING.md` has required this from the start; it
   has not yet happened.
5. **ICO registration is confirmed** (data-controller registration for StoryJar's
   own processing of staff and billing data — separate from the school's
   controllership of children's data).

## 9. Sign-off

| | Name | Date | Outcome |
|---|---|---|---|
| Assessed by | *(founder, data protection lead)* | 2026-08-15 | Draft |
| Reviewed by (external) | *(not yet engaged)* | — | **Outstanding** |
| Residual risk accepted by | *(founder, data protection lead)* | — | **Not yet — see §8** |

**Review cycle:** at least annually, and immediately on any change to hosting,
sub-processors, the age range served, the categories of data held, or any feature
touching authentication, the approval queue, or children's media.

## StoryJar's shared activity library (added 2026-08-18)

A small library of activities StoryJar has written itself, which a teacher can
browse and add to their own library. It exists so that a teacher who has just
signed up sees what the product can do instead of an empty grid.

**It processes no personal data, and it does not move any risk rating in this
assessment.** That is stated rather than left to be inferred, because a new
content surface normally invites a re-read of the whole document. There is
nothing here to re-read: a shared activity is StoryJar's own teaching content,
held in its own table with no `teacherId` and no `folderId`, and its media is
StoryJar's own illustration held in its own directory. No child data, no teacher
personal data, and no media authored by any teacher goes into it.

Two things about it are worth recording because they touch controls described
elsewhere in this document:

1. **A widening of the authorising media route.** `/uploads/shared/...` is
   readable by any signed-in teacher, including one who has not added the
   activity, so they can see what they are considering. It is scoped to the
   resource rather than to the path: the file must be referenced by a
   **published** shared activity, and the route serves it only out of the
   separate shared directory. Children, parents and unauthenticated requests are
   refused, and a teacher still cannot read another teacher's ordinary template
   media. Both halves are asserted in
   `tests/battery/security/shared-activity-media.spec.ts`.
2. **Adding copies the files.** A teacher's copy shares nothing with the
   original, so nothing a school relies on depends on content StoryJar can later
   change or withdraw.

Publishing is not in the application. It is a repository script, so the library
is version controlled and reviewable, and no teacher-authenticated code path can
write to the table (asserted over `src/` in
`tests/battery/security/shared-activities.spec.ts`).
