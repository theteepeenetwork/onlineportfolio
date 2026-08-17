# Data retention policy — Storyjar

> Status: **schedule reviewed and approved by the data protection lead, 2026-07-18.**
> Storyjar is a one-person operation — the founder is also the data protection lead;
> the decision is recorded in
> [`docs/dpo-decisions.md`](./docs/dpo-decisions.md). The periods below stand as
> written (12-month frozen window kept; audit-log 2y/6y kept). **Known gap, not a
> policy question:** the frozen → deletion *automation* that enforces the
> lapsed-account lifecycle is not built yet (P2, see Open items) — until it ships,
> that lifecycle is carried out manually; erasure **on request** already works
> (deletion cascades exist). This is the default schedule Storyjar applies as a
> **data processor**; the school (the **data controller**) may instruct earlier
> deletion at any time, and those instructions override it. See
> [`SAFEGUARDING.md`](./SAFEGUARDING.md) — in particular rule 9 (*deletion is
> real*: database rows **and** media files).

## Principles

1. **We keep children's data only as long as there is a live educational
   purpose or a clear instruction from the school.** Retention limits are a UK
   GDPR requirement (Art. 5(1)(e)), not a courtesy.
2. **Lapsed payment never causes silent deletion.** Accounts freeze first
   (read-only, downloadable) and are deleted only after a warning schedule.
3. **Deletion cascades.** Deleting a school deletes its classes; a class its
   students; a student their journal items; every journal item its media files.
   A family space goes when its last linked child does, taking its sessions and
   sign-in tokens with it.
4. **Parents get a chance to download** their child's approved work before any
   scheduled deletion.

## Account states

| State | Meaning | Can upload | Can view/download |
|---|---|---|---|
| **Free (teacher)** | The permanent teacher plan — one teacher, all their own classes. **No trial clock and nothing to pay, so it cannot lapse.** | Yes | Yes |
| **Trial** | 42-day evaluation — **schools only**, before a PO is raised | Yes | Yes |
| **Active** | Paid — school plan (£299/yr flat) | Yes | Yes |
| **Frozen** | A **school** trial or subscription lapsed. A free teacher account never reaches this state. | No | Yes (read-only) |
| **Scheduled for deletion** | Frozen 12 months, warnings sent | No | Yes, until deletion date |

## Retention schedule

| Data | Kept while | Then |
|---|---|---|
| Children's journal items + media (approved and pending) | Account trial/active, or per school instruction | Frozen: retained **12 months** from lapse, then deleted (rows + files) |
| **Children's voice notes (AUDIO items)** — a short recorded voice note stored as a media file on the journal item (`JournalItem.mediaPath`), exactly like a photo. **Not a separate category** — it is journal-item media, listed explicitly because rule 9 requires every media type to have a retention line. | Account trial/active, or per school instruction | **Identical to photos:** frozen **12 months** from lapse, then deleted (rows **and** the audio files). Deletion cascades and right-to-erasure remove the row *and* unlink the audio file via the same `deleteMediaFiles()` path (moment delete, pupil/class/school delete, returned-item re-record). Served only through the authorising `/uploads` route — never publicly, never to parents except for approved items. |
| Children's quiz answers + scores | **Not a separate category** — stored as fields on the journal item (`quizAnswersJson`, `quizScore`, `quizTotal`); no separate files | Deleted with their journal item (rows removed by the same cascade/erasure paths) |
| Teacher-authored activity media — template background pages **and** quiz answer-option pictures (`quizJson` / `quizSnapshotJson`) | Template/assignment exists | Deleted with the template/account like other teacher-authored template media; served only via the authorising `/uploads` route, never to parents |
| Child records (first name, class link) | As above | Deleted with the class/school, or on school instruction |
| **Class age mode** — one value per class (`Class.ageMode`: `"EYFS"`, `"KS1"`, `"KS2"`, or NULL): the register a teacher picked once when creating the class, which decides whether its children see the younger or older wording, type size and pace. | The class exists | Deleted with the class by the same cascade. **Not personal data about a child** — it is a teacher's per-class display setting, holds nothing about any individual, and is never attributed to, aggregated across, exported for, or shown to a child or parent. NULL means EYFS, the youngest and most protective register (SAFEGUARDING rule 8); it is never inferred from a child's year group. Listed here because rule 9 requires every new field to have a retention line, not because it carries child data. |
| **Child PIN** — bcrypt hash + the date it was set (`pinHash`, `pinSetAt`), optional and only on classes where a teacher switched PINs on (see SAFEGUARDING rule 1) | The class has PINs switched on **and** the child exists | Deleted **immediately** when a teacher switches PINs off for the class — the hash is removed, not just ignored — and otherwise with the child/class/school by the same cascade. Never exported, never shown to any teacher, admin, parent or child, never included in a data export or a parent view. A PIN is not an account and does not outlive the class. |
| **Jar last-seen marker** — one timestamp per child (`jarSeenAt`): when they last opened their own jar. Exists so a moment approved while the child was away can visibly drop into the jar the next time they look (the approval reward otherwise lands in an empty room). | The child exists | Deleted with the child by the same cascade. **Wayfinding only.** It is one timestamp, overwritten each visit — not a history, not a log of visits, and never a measure of how often or how long a child uses Storyjar. It must never be aggregated, reported, exported, shown to a parent, or used to compare children: that would be profiling, which rule 11 forbids outright. **It is not shown to teachers in any form.** *(Corrected 2026-07-16: this row previously said a teacher "may see that returned work has been reopened, so they know their note landed". `jarSeenAt` cannot honestly support that — it records that the child opened their jar page, not that they opened, read or understood the returned work. A surface built on it would tell a teacher their note had landed for a child who never saw it, and a safeguarding judgement would then run on the false version. Any future "seen by child" signal needs its own field, its own row here, and its own purpose test — not this one stretched to fit.)* |
| In-progress drafts — the template builder + a child's activity response (server copy for cross-device resume; composite pages stored as media, owner-scoped) | Last edited within **30 days** | Deleted (rows **and** media files) — lazily purged on access (no cron); erased immediately on submit/publish/discard and on class/student/school deletion. A child's draft is never visible to anyone but that child. |
| Rejected/returned moments | — | Deleted within **30 days** of rejection |
| **Parent/carer family space + parent↔child links.** One row per household: a **family code**, the link(s) to their own child(ren), and **optionally** a name and an email address. **Both optional fields are NULL unless that parent typed them in themselves.** A teacher creates a family space for one child and gets a code to send home on paper; there is no field anywhere in the teacher's screens for a parent's name or address, so Storyjar holds no way of contacting a parent unless the parent chose to give one (for sign-in links, and for nothing else). See `docs/DPIA.md` §4. | A linked child exists | Deleted when the **last** linked child's link goes, by any route: the teacher removes the family's access, removes the pupil, or deletes the class. Also on request. Deletion takes the row **and everything hanging off it**: the family's sessions and any unused sign-in tokens cascade with it (SAFEGUARDING rule 9: a family space linked to no child is a working code owned by nobody). Enforced by `deleteOrphanedParents()` on all three paths and asserted, rows-are-gone rather than merely-inaccessible, in `tests/battery/security/family-access-cross-tenant.spec.ts`. |
| **Family code**, the 8-character code on the school's letter, stored on the family space row above | The family space exists | Replaced (not archived) whenever a teacher issues a new one, so a lost letter has no lasting value; deleted with the family space. **Never written to the audit log**: the log records that a code was created or re-issued, never the code itself. |
| **Email delivery records held by Mailjet (Sinch).** For each message Storyjar sends: the **adult** recipient address (a parent's or staff member's), a timestamp, the subject line, and the delivery status (sent, delivered, deferred, bounced). **No child's name and no child content is ever in an email**, so none reaches Mailjet. Listed here because rule 9 requires every category to have a retention line, including the ones a sub-processor holds rather than us. | The message was sent within Mailjet's retention window for this account | **90 days** on the free plan Storyjar is currently on. Mailjet's paid plans retain for 13 months, so moving to a paid plan lengthens this: that is a change to the schedule and needs a decision recorded here first, not a silent consequence of an upgrade. **Be precise about what that 90 days is evidenced by.** It is the period Mailjet publishes for statistics and campaign data. Mailjet's published documentation does not separate message-level event data, or a stored copy of the message body, from that aggregate figure, and Storyjar has not obtained written confirmation of either. **So the finer breakdown is unconfirmed, and this row says so rather than quoting a number nobody can evidence.** In particular, **Storyjar can no longer assert that no copy of a message body is stored.** The previous provider had a "message previews off" setting; Mailjet has no confirmed equivalent, and the reason that setting mattered is unchanged: a stored copy of a sign-in email holds a working sign-in link. What limits the exposure is the token, not the provider: a sign-in token is single-use and expires in 30 minutes (see the Magic tokens row below), so a stored copy is not a durable route into a family account. Open tracking and click tracking are switched off at **account level**, which covers transactional messages and not only campaigns, and switched off again on every individual message, so **Storyjar cannot tell whether a particular parent opened an email or clicked its link**. Mailjet stores in the **EU only** (Google Cloud, EU regions), is listed on /legal/sub-processors and is assessed in `docs/DPIA.md` (R14). **This period is a regression:** the previous provider deleted after 1 month. It was accepted as the cost of not routing a parent's single-use sign-in token through a third party's redirect domain, which was a live authentication defect rather than a retention one. Getting the message-level figure confirmed in writing is an open item below. |
| Magic tokens | Until used or expired | Expired tokens purged within **7 days** |
| Sessions | Until expiry/logout | Purged within **7 days** of expiry |
| Teacher/staff accounts | Account exists | Deleted on school instruction or account closure; personal data minimised to name + email throughout |
| **Platform operator account** (added 2026-08-17, when operator identity was built). One row, `Operator`: the operator's own email address, a bcrypt password hash, a TOTP secret, ten bcrypt-hashed single-use recovery codes, a failed-attempt counter, a lockout time and the last sign-in time. **Adult staff data about the person who runs the service, not child data, and there is exactly one of these rows.** The plaintext password, TOTP secret and recovery codes are printed once at creation and live outside Storyjar entirely (a password manager and a sheet of paper), so the only copies here are hashes and one secret the account cannot function without. | The person operates the service | Deleted when they stop, or on account rebuild (`docs/ops-recovery.md`), which removes the row outright rather than marking it disabled. Deleting it takes the TOTP secret and every recovery-code hash with it, and cascades to the operator's sessions. It does **not** delete the operator audit trail below: an account rebuild must never be a way to erase the record of what that account did. |
| **Operator sessions** (`OperatorSession`). One row per signed-in browser, holding a SHA-256 hash of the session value and never the value itself, plus the times it was created and last used. No address, no device information, no location. | Until sign-out, or 30 minutes idle, or 8 hours absolute, whichever comes first | Deleted at that moment, not marked expired: sign-out, idle timeout, absolute expiry, disabling the account and rebuilding the account all remove the rows. A stale row is therefore a bug rather than a retention question. |
| **Operator audit log** (`OpsAuditLog`). Who did what in the operator area: sign-in, sign-in failure (recorded against a one-way label for the address attempted, never the address), code failure, enrolment, recovery-code use, sign-out, and every named action a later release adds. From 2026-08-17 it also holds, for each **adult lookup**, the email address that was searched for and the operator's stated reason, stored word for word. Those two are the point of the row rather than a side effect: an adult record in the operator area is reachable only by typing somebody's whole email address, and the rule that permits it at all requires every lookup to be recorded with the term and the reason, so a row without them would say that somebody looked without saying what they looked at. The address is always an adult's, being a member of school staff or a parent who chose to give Storyjar an address. The same day the table gained rows for the two things an operator can DO as well as look up (`docs/ops-architecture.md`, "The operation registry"), each carrying the operator's stated reason in the same way. **Issuing a new family code**: the row records that a code was re-issued and for which family space, with the address **masked**, and never the old code or the new one, per the family-code row above. **Showing a parent's email address in full**: the row records that address, because a line saying an address was disclosed without saying which one is not a record of a disclosure, and it is the same adult address the lookup row beside it already holds. Both are written inside the same database transaction as the thing they describe, so an operation whose record cannot be written does not happen at all. The reason is free text, and it is the one way a child's name could ever reach this table: nothing can stop an operator typing one, the field says so above the box, and that residual risk is recorded at R15 in `docs/DPIA.md`. **Nothing the operator area READS can put a child's name, a child's work or a credential value in here**, because the operator area is structurally unable to read those (SAFEGUARDING rules 4 and 5, enforced by `scripts/check-ops-blindness.mjs`), and a blocking test asserts no row carries a credential. | **2 years** rolling, matching the audit row below it | Deleted. Like that row, the purge is carried out manually today: the scheduled job that enforces both is the same open item recorded at the foot of this document. |
| Audit logs (approvals, deletions, exports, access) | **2 years** rolling | Deleted; a minimal deletion record (what was deleted, when, on whose instruction — no child data) is kept **6 years** for accountability |
| Billing records — subscription state, Stripe customer/subscription IDs, invoices, payment status (**no card data** held by Storyjar; adult billing data only) | **6 years** | Deleted (HMRC/accounting requirement) |
| Backups | **35-day** rolling cycle | Deletions propagate out of all backups within one cycle; backups stay in the same EU region as the data (Amsterdam) |

## The frozen-account lifecycle

1. **Day 0 — lapse.** Trial ends or subscription payment fails/cancels. Account
   becomes read-only. Email to the account holder (and school admin, if a school
   plan) explaining the frozen state and the 12-month clock.
2. **Months 6, 9, 11.** Reminder emails: resubscribe or export.
3. **30 days and 7 days before deletion.** Final warnings to teacher/school admin.
   Parents with linked children receive a download reminder (approved moments
   only, per SAFEGUARDING rule 6).
4. **Month 12.** Permanent deletion: database rows and media files, cascading per
   principle 3. Confirmed by a deletion record in the audit trail.
5. **Reactivation at any point before deletion** restores the account intact.

## On-demand deletion (right to erasure, Art. 17)

A verified instruction from the school — or, for a free teacher account, the
teacher acting with the school's authority — is executed **without
undue delay and within 30 days**: rows and media removed, backup propagation
within the 35-day cycle, deletion record kept.

## Free teacher plan vs school plan

The school remains the data controller regardless of who pays. Consequences:

- A teacher on the free plan must have the school's authority to
  process its pupils' data (asserted in terms at signup).
- If a teacher leaves the school, the journals belong to the school context.
  The school may claim them onto a school plan; they do not travel with the
  teacher's personal account to a new school.
- A **free teacher account is never frozen for non-payment** — there is nothing
  to pay, so the billing route into the 12-month deletion clock does not exist
  for it. Children's work in a free account is therefore only ever deleted on
  request, on school instruction, or when the teacher deletes the class or
  account themselves. This *narrows* the circumstances in which data is deleted
  for billing reasons; it changes no period in the schedule above.
- If a **school** account is frozen and the school wishes to preserve the data,
  it may reactivate the school plan at any point before deletion.

## Open items

- [ ] Automate the frozen→deletion pipeline (currently the P2 backlog gap in
      SAFEGUARDING.md; this document is the schedule it must implement).
      **Still open** — the 12-month lifecycle is manual until this ships.
- [x] Data-protection / legal review of all periods above — **done 2026-07-18.** The 12-month
      frozen window and audit-log retention (2y rolling / 6y deletion record) were
      reviewed and kept as written. See `docs/dpo-decisions.md`.
- [ ] **Data-protection review of the child PIN** (added 2026-07-15 with the SAFEGUARDING
      rule 1 amendment): it is the first per-child data field beyond a first
      name. Needed **before** PINs reach real children, not before the code is
      written. *(2026-07-18: the retention treatment of the PIN row is confirmed;
      the full feature sign-off is still required before any PIN reaches a child.)*
- [ ] **Confirm in writing with Mailjet how long message-level data is held**
      (added 2026-08-16 with the provider change): specifically (a) the retention
      period for individual delivery and event records, as distinct from the 90-day
      figure published for statistics and campaign data, and (b) whether a copy of
      the message body is stored at all, and if so for how long and who can read it.
      Until that arrives, the email row above states the documented figure and says
      plainly that the breakdown is unconfirmed. **This is what makes the row
      honest; do not replace it with a confident number before the answer exists.**
      If the answer is that message bodies are stored and readable, that is a
      finding rather than a documentation update, because a stored sign-in email
      holds a working link.
- [ ] Surface this schedule in the customer-facing privacy notice and DPA in
      plain language (Children's Code transparency standard).

*Last updated: 2026-08-17 (platform operator identity built: three rows added to
the schedule above for the operator account, its sessions and its own audit log.
They are the first records Storyjar holds about the person who runs it rather
than about a school, a teacher, a parent or a child, which is why they get their
own lines rather than being folded into "Teacher/staff accounts". The
operator audit-log row was extended later the same day, when the first operator
read screens landed, to say that an adult lookup records the address searched
for and the reason given, and extended again the same day for the first two
operator actions that change or disclose anything: issuing a new family code and
showing a parent's address in full. **No new category of personal data was added
by either.** Both write to the operator audit log, which is already listed; a
rotated code replaces the old one in the row that already holds it; and the
address in a disclosure row is the same adult address the lookup row beside it
already carries. Previously
2026-08-16: transactional email provider changed to Mailjet; email
delivery-record row rewritten, retention regression from 1 month to 90 days
recorded above. Also 2026-08-16: family access became buildable by a teacher for
the first time, so the parent row above was rewritten so that a parent's name and email
are now **optional and self-supplied**, and the deletion cascade for a family
space is written down and tested rather than promised.) Review whenever billing
states or data flows change.*
