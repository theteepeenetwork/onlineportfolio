# Safeguarding & security — the rules for Storyjar

> **Rule 1: Safeguarding comes first. Everything else comes after it.**
>
> Storyjar exists to hold the work of children aged 3–11. If a feature,
> optimisation, deadline or convenience trades off against a child's safety or
> privacy, **safety wins — without discussion**. When a choice is unclear, take
> the more protective option and escalate rather than guess.

This document is the constitution for how Storyjar is built. It binds everyone
who works on the codebase, **including AI agents** (it is referenced from
`AGENTS.md`). Read it before changing anything that touches authentication,
access control, the approval queue, children's data, or uploaded media.

It is **engineering governance, not legal advice.** The customer-facing policies
(privacy, safeguarding, DPA, etc.) must be reviewed and signed off by a
qualified data-protection / education-law professional and the responsible DPO
before they are relied upon.

---

## Who we are, in law

- The **school is the data controller.** **Storyjar is a data processor** acting
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
   any credential that could identify them outside Storyjar.

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
     teacher, no admin, and no one at Storyjar can see a child's PIN. Switching
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

### B. Nothing is seen until an adult has seen it
3. **The approval queue is sacred.** Every child-generated moment stays `PENDING`
   until a teacher approves it. There is **no auto-publish and no bypass**. Do not
   add a feature that lets child content reach anyone (parent, another child, an
   export, a public URL) before teacher approval. This gate is the product's
   primary safeguarding control — treat any change near it as high-risk.

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
6. **Parents see only their own child(ren), read-only.** No parent can see
   another family's child. Parents can view and download; only the teacher can
   add, change or remove what is in the jar.
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

---

## Compliance map (England / UK)

Storyjar must help schools meet, and itself comply with, at least:

| Framework | What it means for us |
|---|---|
| **UK GDPR + Data Protection Act 2018** | Lawful basis (the school's), data minimisation, purpose limitation, security (Art. 32), data-subject rights, retention limits (schedule: [`RETENTION.md`](./RETENTION.md)), **processor duties (Art. 28)** → a DPA. |
| **ICO Age Appropriate Design Code (Children's Code)** | 15 standards: high-privacy **defaults**, data minimisation, no nudge/dark patterns, no profiling of children, transparency in language a child/parent understands, DPIA. |
| **Keeping Children Safe in Education (KCSIE)** | The product operates in schools' safeguarding regime: teacher moderation, no unsupervised child-to-child contact, clear reporting routes, filtering/monitoring expectations. |
| **DfE digital & technology standards** (incl. filtering & monitoring, data protection in schools) | Supports schools' duties; secure by design; clear data-handling. |
| **PECR** | Cookie/consent rules — we use **essential cookies only** (the session cookie); no marketing/analytics cookies. |
| **Online Safety Act 2023** | User-to-user content is private and teacher-moderated (not public). Any future parent/public sharing needs a fresh assessment. |
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
DPO-aware decision.

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
process, and reviewed by the DPO.)*

---

## Known gaps / backlog (prioritised)

Tracked here until closed; each becomes its own change.

| Pri | Gap | Rule | Status |
|---|---|---|---|
| P0 | Uploaded children's media served from unauthenticated `public/uploads` URLs | 7 | **In progress** |
| P0 | Production hosting region is US West (must be UK/EU before real data) | 10 | **In progress** |
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
| 2026-07-15 | 1 | Carved out **one** exception to "never ask a child for any credential": an optional, off-by-default, teacher-enabled numeric PIN, self-chosen, intended for Years 4–6. Bans on child emails, passwords and phone numbers are unchanged, as is rule 2. | Product owner (the serving teacher who owns Storyjar), acting on the July 2026 intuitiveness audit | Widening to ages 3–11 brought in Years 4–6, where children signing in as each other is a genuine problem that the class-code-plus-name model does not address. A mis-tap files one child's work in another child's evidence base — an assessment problem and a safeguarding one. **The honest framing: this is a classroom-management feature, not a security control**, and rule 1's text now says so explicitly so that no one later mistakes it for protection. **Not yet reviewed by a DPO** — the PIN adds a per-child data field (`pinHash`), so it needs that review before it reaches real children. |

*Last reviewed by engineering; **not yet reviewed by a DPO / legal.** Update the
"Last reviewed" line and the backlog whenever this changes.*
