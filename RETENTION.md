# Data retention policy — Storyjar

> Status: **draft — not yet reviewed by a DPO / legal.** This is the default
> retention schedule Storyjar applies as a **data processor**. The school (the
> **data controller**) may instruct earlier deletion at any time, and those
> instructions override this schedule. See [`SAFEGUARDING.md`](./SAFEGUARDING.md)
> — in particular rule 9 (*deletion is real*: database rows **and** media files).

## Principles

1. **We keep children's data only as long as there is a live educational
   purpose or a clear instruction from the school.** Retention limits are a UK
   GDPR requirement (Art. 5(1)(e)), not a courtesy.
2. **Lapsed payment never causes silent deletion.** Accounts freeze first
   (read-only, downloadable) and are deleted only after a warning schedule.
3. **Deletion cascades.** Deleting a school deletes its classes; a class its
   students; a student their journal items; every journal item its media files.
4. **Parents get a chance to download** their child's approved work before any
   scheduled deletion.

## Account states

| State | Meaning | Can upload | Can view/download |
|---|---|---|---|
| **Trial** | Free half term (42 days from signup) | Yes | Yes |
| **Active** | Paid — individual (£3.99/mo or £40/yr) or school seat | Yes | Yes |
| **Frozen** | Trial or subscription lapsed | No | Yes (read-only) |
| **Scheduled for deletion** | Frozen 12 months, warnings sent | No | Yes, until deletion date |

## Retention schedule

| Data | Kept while | Then |
|---|---|---|
| Children's journal items + media (approved and pending) | Account trial/active, or per school instruction | Frozen: retained **12 months** from lapse, then deleted (rows + files) |
| Children's quiz answers + scores | **Not a separate category** — stored as fields on the journal item (`quizAnswersJson`, `quizScore`, `quizTotal`); no separate files | Deleted with their journal item (rows removed by the same cascade/erasure paths) |
| Teacher-authored activity media — template background pages **and** quiz answer-option pictures (`quizJson` / `quizSnapshotJson`) | Template/assignment exists | Deleted with the template/account like other teacher-authored template media; served only via the authorising `/uploads` route, never to parents |
| Child records (first name, class link) | As above | Deleted with the class/school, or on school instruction |
| Rejected/returned moments | — | Deleted within **30 days** of rejection |
| Parent accounts + parent↔child links | Linked child exists | Deleted when last linked child is deleted, or on request |
| Magic tokens | Until used or expired | Expired tokens purged within **7 days** |
| Sessions | Until expiry/logout | Purged within **7 days** of expiry |
| Teacher/staff accounts | Account exists | Deleted on school instruction or account closure; personal data minimised to name + email throughout |
| Audit logs (approvals, deletions, exports, access) | **2 years** rolling | Deleted; a minimal deletion record (what was deleted, when, on whose instruction — no child data) is kept **6 years** for accountability |
| Billing records — subscription state, Stripe customer/subscription IDs, invoices, payment status (**no card data** held by Storyjar; adult billing data only) | **6 years** | Deleted (HMRC/accounting requirement) |
| Backups | **35-day** rolling cycle | Deletions propagate out of all backups within one cycle; backups are UK/EU-hosted only |

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

A verified instruction from the school — or, for individual subscriptions, the
subscribing teacher acting with the school's authority — is executed **without
undue delay and within 30 days**: rows and media removed, backup propagation
within the 35-day cycle, deletion record kept.

## Individual vs school subscriptions

The school remains the data controller regardless of who pays. Consequences:

- An individually subscribing teacher must have the school's authority to
  process its pupils' data (asserted in terms at signup).
- If a teacher leaves the school, the journals belong to the school context.
  The school may claim them onto a school plan; they do not travel with the
  teacher's personal account to a new school.
- If an individual account is frozen and the school wishes to preserve the
  data, the school may take over the account onto a school seat at any point
  before deletion.

## Open items

- [ ] Automate the frozen→deletion pipeline (currently the P2 backlog gap in
      SAFEGUARDING.md; this document is the schedule it must implement).
- [ ] DPO/legal review of all periods above, especially the 12-month frozen
      window and audit-log retention.
- [ ] Surface this schedule in the customer-facing privacy notice and DPA in
      plain language (Children's Code transparency standard).

*Last updated: 2026-07-12. Review whenever billing states or data flows change.*
