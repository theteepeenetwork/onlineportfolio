# Data retention policy — Storyjar

> Status: **schedule reviewed and approved by the DPO, 2026-07-18.** Storyjar is a
> one-person operation — the founder is also the DPO; the decision is recorded in
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
| **Children's voice notes (AUDIO items)** — a short recorded voice note stored as a media file on the journal item (`JournalItem.mediaPath`), exactly like a photo. **Not a separate category** — it is journal-item media, listed explicitly because rule 9 requires every media type to have a retention line. | Account trial/active, or per school instruction | **Identical to photos:** frozen **12 months** from lapse, then deleted (rows **and** the audio files). Deletion cascades and right-to-erasure remove the row *and* unlink the audio file via the same `deleteMediaFiles()` path (moment delete, pupil/class/school delete, returned-item re-record). Served only through the authorising `/uploads` route — never publicly, never to parents except for approved items. |
| Children's quiz answers + scores | **Not a separate category** — stored as fields on the journal item (`quizAnswersJson`, `quizScore`, `quizTotal`); no separate files | Deleted with their journal item (rows removed by the same cascade/erasure paths) |
| Teacher-authored activity media — template background pages **and** quiz answer-option pictures (`quizJson` / `quizSnapshotJson`) | Template/assignment exists | Deleted with the template/account like other teacher-authored template media; served only via the authorising `/uploads` route, never to parents |
| Child records (first name, class link) | As above | Deleted with the class/school, or on school instruction |
| **Class age mode** — one value per class (`Class.ageMode`: `"KS1"`, `"KS2"`, or NULL): the register a teacher picked once when creating the class, which decides whether its children see the younger or older wording, type size and pace. | The class exists | Deleted with the class by the same cascade. **Not personal data about a child** — it is a teacher's per-class display setting, holds nothing about any individual, and is never attributed to, aggregated across, exported for, or shown to a child or parent. NULL means the younger register (the more protective default, SAFEGUARDING rule 8); it is never inferred from a child's year group. Listed here because rule 9 requires every new field to have a retention line, not because it carries child data. |
| **Child PIN** — bcrypt hash + the date it was set (`pinHash`, `pinSetAt`), optional and only on classes where a teacher switched PINs on (see SAFEGUARDING rule 1) | The class has PINs switched on **and** the child exists | Deleted **immediately** when a teacher switches PINs off for the class — the hash is removed, not just ignored — and otherwise with the child/class/school by the same cascade. Never exported, never shown to any teacher, admin, parent or child, never included in a data export or a parent view. A PIN is not an account and does not outlive the class. |
| **Jar last-seen marker** — one timestamp per child (`jarSeenAt`): when they last opened their own jar. Exists so a moment approved while the child was away can visibly drop into the jar the next time they look (the approval reward otherwise lands in an empty room). | The child exists | Deleted with the child by the same cascade. **Wayfinding only.** It is one timestamp, overwritten each visit — not a history, not a log of visits, and never a measure of how often or how long a child uses Storyjar. It must never be aggregated, reported, exported, shown to a parent, or used to compare children: that would be profiling, which rule 11 forbids outright. **It is not shown to teachers in any form.** *(Corrected 2026-07-16: this row previously said a teacher "may see that returned work has been reopened, so they know their note landed". `jarSeenAt` cannot honestly support that — it records that the child opened their jar page, not that they opened, read or understood the returned work. A surface built on it would tell a teacher their note had landed for a child who never saw it, and a safeguarding judgement would then run on the false version. Any future "seen by child" signal needs its own field, its own row here, and its own purpose test — not this one stretched to fit.)* |
| In-progress drafts — the template builder + a child's activity response (server copy for cross-device resume; composite pages stored as media, owner-scoped) | Last edited within **30 days** | Deleted (rows **and** media files) — lazily purged on access (no cron); erased immediately on submit/publish/discard and on class/student/school deletion. A child's draft is never visible to anyone but that child. |
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
      **Still open** — the 12-month lifecycle is manual until this ships.
- [x] DPO/legal review of all periods above — **done 2026-07-18.** The 12-month
      frozen window and audit-log retention (2y rolling / 6y deletion record) were
      reviewed and kept as written. See `docs/dpo-decisions.md`.
- [ ] **DPO review of the child PIN** (added 2026-07-15 with the SAFEGUARDING
      rule 1 amendment): it is the first per-child data field beyond a first
      name. Needed **before** PINs reach real children, not before the code is
      written. *(2026-07-18: the retention treatment of the PIN row is confirmed;
      the full feature sign-off is still required before any PIN reaches a child.)*
- [ ] Surface this schedule in the customer-facing privacy notice and DPA in
      plain language (Children's Code transparency standard).

*Last updated: 2026-07-18 (DPO review). Review whenever billing states or data flows change.*
