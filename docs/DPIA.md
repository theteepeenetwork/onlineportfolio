# Data Protection Impact Assessment — Storyjar

**Version:** 1.2 (draft for sign-off) · **Written:** 15 August 2026 · **Updated:** 17 August 2026 (R15, platform operator identity added; previously 16 August 2026 for R14 and 15 August 2026 for R6)
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

Storyjar is a digital learning journal for UK primary schools. A child creates a
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
| Billing contact name and email, or school name | Adult | Held by Stripe. **No child data ever reaches Stripe.** |
| Audit log entries | Staff actions | Who did what, never child content. |
| **Platform operator credentials and sessions** (added 17 August 2026) | The one adult who runs the service | Email address, bcrypt password hash, TOTP secret, ten bcrypt-hashed recovery codes, failed-attempt and lockout counters, and a hash of each live session value. Adult data about Storyjar's own operator, held so that the operator area can require a password **and** a second factor. Retention in `RETENTION.md`; risk assessment at R15. |

**Deliberately not collected:** child logins, emails, passwords, phone numbers,
dates of birth, surnames, addresses, biometric data, geolocation, device
identifiers for tracking, behavioural analytics, or any advertising identifier.

### 2.3 Context

- **The school is the data controller; Storyjar is a processor** acting on its
  documented instructions. This holds regardless of who pays — including where a
  teacher uses the free plan personally (see `RETENTION.md`).
- Data subjects are **children aged 3–11** who cannot consent, and who in most
  cases cannot read fluently. They have no meaningful choice about using the
  service: their school chooses it.
- The lawful basis for the school will normally be **public task** (Art. 6(1)(e))
  for a maintained school, or **legitimate interests / contract** for an academy
  trust — the school determines this, not Storyjar.
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
| Data protection lead | The founder. Storyjar is not required to appoint a DPO (no large-scale special category processing, no systematic monitoring — see SAFEGUARDING rule 19), and deliberately does not use the title, since a voluntary appointment imports statutory independence requirements a sole trader cannot meet. Decisions recorded in `docs/dpo-decisions.md`. **A qualified external reviewer has not yet been engaged — see §8.** |
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
  invitation. Storyjar does not do that. A teacher creates a family space for one
  child and gets a **code**, which reaches the household on paper, from the
  school. The parent redeems it, and only then, and only if they want a sign-in
  link in future, do they add their own address.

  The position this produces is worth stating plainly, because it is unusually
  strong for a children's product: **Storyjar holds no contact detail for any
  parent unless that parent chose to give it, about themselves, after they were
  already signed in.** Three things follow, and each of them is a risk that does
  not exist rather than one that is managed:

  - **No adult contact database accumulates as a side effect of use.** A school
    with 300 pupils generates 300 codes and zero addresses. Under the obvious
    build it would generate 300 addresses on day one, whether or not a single
    parent ever signed in.
  - **Storyjar never sends an unsolicited message to a parent.** There is no "you
    have been added" email anywhere in the feature. The only message a parent can
    ever receive is a sign-in link they personally asked for, at an address they
    personally typed. A mistyped address entered by a busy school cannot therefore
    send a stranger anything (see R14).
  - **Nothing is asked of a parent who does not want to be known.** A family can
    use Storyjar for years having told it only that they hold a code.

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

| Standard | How Storyjar addresses it | Gap |
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

| # | Risk | Existing controls | Residual |
|---|---|---|---|
| **R1** | A teacher or admin at one school reaches another school's children's work | All child-data queries scoped by ownership server-side (rule 4); deny by default (rule 8). Blocking tests: `tenant-isolation.spec.ts`, `f1-student-impersonation`, `f15-cross-tenant-journal-write`, `uploads-path-collision`. Two real defects of exactly this kind (F1, F15) were found and fixed, each with a regression test that fails against the pre-fix code. | **Low** |
| **R2** | Child content reaches a parent or third party before a teacher has seen it | The approval queue is a hard gate — no auto-publish, no bypass (rule 3). Server-side, not a UI convention. | **Low** |
| **R3** | Photos or voice notes served from guessable URLs | Every `/uploads` request is authorised against the same ownership rules before bytes are served; hardened content type and CSP; SVG rejected on upload. F5/F17 addressed. | **Low** |
| **R4** | A leaked class code discloses a class roster (every child's first name) | Lookup throttled per IP, miss-only and classroom-safe (F16); a teacher can rotate a leaked code, scoped to the owning teacher. Roster disclosure is limited to first names — no surname exists to leak. | **Medium** — a valid code in the wrong hands still shows first names. Accepted as inherent to a no-login child sign-in; the alternative (child credentials) was judged more intrusive. |
| **R5** | Children's data kept longer than necessary | `RETENTION.md` defines every category; deletion removes rows **and** files across all delete paths (rule 9), covered by tests. A free teacher account can never be frozen, so it never enters a billing deletion clock at all. | **Medium** — the frozen→deletion pipeline for lapsed *school* accounts is **not automated**; it is carried out manually. Tracked as a P2 gap. |
| **R6** | Personal data processed outside the UK/EEA | **Hosting region confirmed 2026-08-15: EU West (Amsterdam, Netherlands)**, with the data volume in the same region — so children's moments, media and account data are held in the EEA, satisfying rule 10. UK→EEA transfers are covered by the UK's adequacy regulations, so no IDTA or SCCs are required for the storage location. Stripe holds **adult billing data only**; no child data ever reaches it. | **Medium.** Two residuals: (a) Railway is **US-incorporated**, so its personnel may access systems for support from outside the EEA — its DPA and onward-transfer terms have not been obtained and recorded; (b) **Stripe's billing-data residency is still unassessed**. Neither involves children's data at rest leaving the EEA. |
| **R14** | A parent's sign-in link reaches the wrong person, or an email discloses a child | Sending is via **Mailjet (Sinch)**, which stores in the **EU only** (Google Cloud, EU regions) and receives the adult address only. **No child's name and no child content appears in any email**: templates are written so a misdirected message tells a stranger nothing about a child, **Amended 2026-08-16, and this is a reduction:** this sentence used to end "which matters because the *school* holds the address and schools mistype them". That route is now closed. When family access was built (PR #112), the design chosen was that **a teacher never types a parent's address**: a code goes home on paper and the parent types their own address afterwards, if they want one at all (§4). So the address on file is the parent's own, entered by the person who owns the inbox, and most families have none at all. Two of R14's three ways in went with that: a third party mistyping an address, and a message going to somebody who never asked for one. The rating is unchanged only because what pins it is the third way in, which this design does not touch. **Storyjar cannot tell whether a particular parent opened an email or clicked its link**: Mailjet's account-level *Track openers* and *Track clicks* are both switched off, which covers transactional messages and not campaigns alone, and `src/lib/mailer.ts` disables both again on every message (`TrackOpens` / `TrackClicks` properties plus the `X-MJ-TrackOpen` / `X-MJ-TrackClick` headers). *(Provider changed 2026-08-16. The reason is recorded here because it decides whether anyone may change it back. Brevo rewrote every link through its own redirect domain and injected an open pixel, offered no way to switch either off below Enterprise, and silently discarded the `disableTracking: true` the code was sending; its transactional log for 16 August 2026 at 14:04 shows a first-opening event against a magic-link email sent with tracking disabled. An account-level off switch is the control Brevo does not offer and Mailjet does, which is why the claim above is now the direct one rather than the narrower "recorded but not associated with an individual".)* Click-tracking must never occur, because rewriting the link would break the token and hand a third party the means to use it. **That one is checked, not assumed**, precisely because we now know a provider can ignore an API flag: `scripts/verify-mail.ts` sends the real sign-in template carrying an obviously fake token, and the delivered raw source is read to confirm the href was not rewritten, and `scripts/mail-events.mjs` reports any open or click event Mailjet recorded despite all three switches. **The messages Storyjar generates carry no image, no external URL and no stylesheet at all**, which since 2026-08-16 is a blocking test over the rendered templates (`tests/battery/security/email-templates.spec.ts`) rather than a comment in the source: an open pixel in a delivered message therefore has to have been injected by the provider, because no change to Storyjar's own code can introduce one without turning the build red. *(Status 2026-08-16: the Mailjet probe and its raw-source inspection are **outstanding**. If links are ever found rewritten, that is a functional defect in the parent sign-in path, not a wording problem, and it gets its own entry in `FINDINGS.md`.)* **Two residuals came with the change**, both recorded in `RETENTION.md`: delivery records are kept **90 days** on the current free plan against Brevo's 1 month, and Mailjet publishes no figure for message-level event data or for a stored copy of the message body separate from that aggregate, so **Storyjar can no longer assert that no copy of a sign-in email is stored anywhere**. Tokens are never logged by us, are single-use, and expire in 30 minutes, which is what stops a stored copy being a durable route in. | **Medium.** Raised from Low on 2026-08-16 by the *unconfirmed* message-body position, not by any known bad fact. A stored, readable copy of a sign-in email is a route by which a link reaches someone other than the parent, and that possibility is currently unevidenced in either direction. Returns to **Low** on written confirmation from Mailjet (the open item in `RETENTION.md`) plus a clean raw-source inspection of a delivered message. **Held at Medium deliberately, not by inertia:** the same-day family-access design removed the mistyped-address and unsolicited-message routes and left almost every family with no address on file at all, which is a genuine narrowing. It is not a reason to move this number, because the residual is about a stored copy of a message that *was* sent to the right person, and one parent who asked for one link is enough for that to bite. |
| **R7** | A child's name or work sent to a third party by read-aloud | `speechSynthesis` may transmit spoken text to a cloud voice on some platforms, so **only fixed UI copy is ever spoken** — never a child's name, caption, or a teacher's instructions. The EYFS greeting displays "Hello, Ava!" but speaks a name-free string. All speakable strings live in one module so the rule is checkable. | **Low** |
| **R8** | Children profiled, scored or tracked | Structurally absent: no analytics provider, no advertising network, no social pixels, no behaviour points, no AI processing of children's work. A static audit gate blocks new third-party script use. | **Low** |
| **R9** | A child cannot reach their own work — exclusion as a privacy harm | WCAG 2.2 AA is a safeguarding rule (18), gated by axe in CI. F18 (six children in eight could not read their own initial on their name card) was found and fixed, with an arithmetic test over the whole palette. | **Medium** — ~30 contrast nodes remain baselined in `BASELINE_RULES` pending a palette decision. **A baselined rule is how F18 hid for weeks.** |
| **R10** | Staff account compromise exposes a class | bcrypt password hashing; failure-count rate limiting per account+IP; session cookies HttpOnly, SameSite, Secure in production; server-side session invalidation on logout. | **Medium** — no multi-factor authentication for staff. Proportionate at current scale; revisit as schools scale. |
| **R11** | A parent sees another family's child | Parent↔child link scoping, read-only, approved items only; covered by tenant-isolation tests. Extended 2026-08-16 when family access became something a teacher can actually set up: a family code is scoped to the child it was made for and to no other, **including another child in the same class**, and a link removed by the teacher ends access on the parent's very next request rather than at the end of their session. Both are blocking tests in `family-access-cross-tenant.spec.ts`, alongside paired positive controls so a route that has simply stopped working cannot pass the negative. The one way two children reach one sign-in is the parent entering the second code themselves, which cannot reach a child no one sent them a letter for. | **Low** |
| **R12** | A breach is mishandled or notified late | Incident response process exists in `SAFEGUARDING.md`: contain, assess, notify the school as controller without undue delay so it can meet its 72-hour ICO duty, route child-safety concerns to the school's DSL, record, remediate. | **Medium** — the process is a starter with **no named contacts and no school-facing template**, and has never been rehearsed. |
| **R15** | The platform operator account is compromised, or the operator area becomes a route to children's work | Three separate things hold this down, and it is worth being precise about which does what. **(a) What the area can reach at all.** It is structurally unable to read a child's name, work, media path, class code or family code: every read goes through a chokepoint, a static gate (`scripts/check-ops-blindness.mjs`) fails the build on any query, import, media element or impersonation path that would change that, and the gate ships with a canary corpus that proves it still fires. **(b) Who gets in.** A separate identity from every other account in the product, with its own table and its own cookie (`__Host-sj_ops`, `Path=/`, httpOnly, SameSite=Strict, Secure in production); bcrypt cost 12; **mandatory TOTP with no bypass of any kind, including in test**; replay protection that refuses a step at or below the last accepted one; session values stored as SHA-256 hashes so a leaked database file is not a set of live sessions; the session value rotated at the moment the code is accepted; a 30-minute idle and 8-hour absolute cap; a lockout persisted on the row so it survives a restart; the throttle checked before any bcrypt work; one generic failure message for every cause; and the whole area 404 (never 403, never a named login page) when unauthorised or when `OPS_ENABLED` is unset, which it is by default. **(c) What is recorded.** Sign-in, failure, code failure, enrolment, recovery-code use and sign-out are written to the operator's own audit table, which the operator area cannot update or delete. Covered by the blocking specs A21 and A22. | **Medium.** Three residuals, all accepted deliberately rather than mitigated. **Real-time phishing of a TOTP code** would defeat the second factor: a passkey or WebAuthn is the upgrade path and is a separate owner decision, not something to bolt on for a one-person pilot. **The TOTP secret is stored in plaintext beside the database**, because encrypting it with a key from the environment puts the key on the same host as the ciphertext and buys less than it appears to; recorded here rather than left undocumented, as brief 02 required. **The volume holding all of this still has no backup** (D2, unanswered), so the operator account shares the disaster-recovery position of everything else. |
| **R16** | The operator, as a person, reads children's data outside the product | Nothing in the application does this, and nothing in the application can. But the same person has Railway shell access and can open the SQLite file and every media file on the volume. **This is stated rather than mitigated, because it is not a defect: it is what running your own service means.** What limits it: the operator area gives no such path, so day-to-day operation never requires touching child data; the recovery procedure in `docs/ops-recovery.md` is the only routine that needs the shell at all; and the audit trail of anything done through the product is complete. What would reduce it further, none of which is built: an off-box audit copy the operator cannot silently edit, encryption at rest for media, and a written policy that direct database access outside an incident is not done. | **Medium, and permanent at this scale.** It must be described in exactly these terms to any school that asks. A guarantee that overstates itself is worse than none, because a school will rely on it, and the gap between the claim and the reality is the likeliest place this project produces something indefensible in a procurement questionnaire. |
| **R13** | A child is asked for a credential, creating an identity to compromise | No child logins, emails or passwords exist. The optional KS2 PIN is permitted by rule 1 but **deliberately not built**. | **Low** |

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
5. **ICO registration is confirmed** (data-controller registration for Storyjar's
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
