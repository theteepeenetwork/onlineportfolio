# Backups: the options for decision D2

**Status: options only. No option here is recommended, chosen, started or
budgeted for. D2 is the owner's decision and nobody else's.**

This document exists so that the choice can be made with the numbers in front of
it rather than in a hurry. It sets out what each option costs, how much work it
could lose (RPO), how long a school would be down (RTO), and, for each one, what
Storyjar would then have to tell schools. It changes nothing: no plan has been
changed, no provider has been signed up, no money has been spent, and
`RETENTION.md` has deliberately not been edited.

Written 16 August 2026 as part of OPS-0b, which is blocked on this decision and
stays blocked until it is answered.

---

## 1. Where things actually stand

One Railway volume of 5 GB, in EU West (Amsterdam), holds two things:

- `/data/prod.db`, the SQLite database: every school, class, teacher, pupil name
  and journal entry.
- `/data/media`, every photograph, drawing and voice note a child has saved.

There is no volume backup and no point in time recovery on it. A volume
corruption, a mistaken command, or a Railway incident destroys all of it, and
there is nothing to restore from.

`RETENTION.md` tells schools something different. Its backup row promises a
35-day rolling cycle, that deletions propagate out of all backups within one
cycle, and that backups stay in Amsterdam. **That line has not been touched by
this work**, because correcting it and fixing it are two different decisions and
both belong to the owner. What matters for D2 is that the line is read by a
school's data protection lead during procurement, and today it is not true.

Three documents make a backup claim of some kind: `RETENTION.md`,
`/legal/privacy` (which says the database, uploaded media and backups are all
stored in Amsterdam), and `/legal/data-processing` (which lists the Article 32
measures and, notably, does not claim restore capability). Whichever option is
chosen, the wording in all three has to end up matching what actually exists.
The wording is not written here. The technical facts are.

---

## 2. Two numbers to settle first, because every option depends on them

Neither is a technical question. Both are the owner's.

**RPO, how much work may be lost.** If backups run nightly, the worst case is
that a day of children's work is gone for good. That is not the same as losing a
day of orders or invoices. A photograph of a four year old's painting is a
one-time capture: the painting itself went home in a book bag weeks ago, and if
the file is gone there is nothing to photograph again.

**RTO, how long a school may be down.** This decides whether a restore that takes
half a morning is acceptable, or whether it has to be minutes. It is different
in the middle of a Tuesday in November from what it is in August.

Suggested starting point, for the owner to accept, change or reject: database
snapshot hourly (the file is small), media snapshot nightly, and a target of
being back within four hours during term time. Everything below is costed
against a daily cycle unless stated, because that is what each option gives you
without extra work.

---

## 3. Option A: Railway's own volume backups

Railway takes the snapshots, stores them in its own infrastructure, and a restore
is something the owner clicks rather than something anybody has to build.

**Cost.** Railway's published pricing on 16 August 2026: Hobby is $5 per month
including $5 of usage credit, Pro is **$20 per month per workspace** including
$20 of usage credit. Storage and compute are charged on usage on top of that, at
$0.00000006 per GB per second for volumes, which is roughly $0.16 per GB per
month. So the uplift from Hobby to Pro is about $15 per month before any
additional storage the backups themselves consume.

**One thing to check before budgeting.** Railway's public backups documentation
does not state that backups are a paid-plan feature, but the Railway dashboard
for this service reports that the volume has no backups, and the account is on
Hobby. Confirm in the dashboard, on the actual service, whether backups can be
switched on where they are today. It changes whether the $15 is needed at all.

**What it gives you.** Railway's documented schedules and how long each is kept:

| Schedule | Kept for |
| --- | --- |
| Daily | 6 days |
| Weekly | 1 month |
| Monthly | 3 months |

**RPO: up to 24 hours** on the daily schedule. Anything a class did after the
last nightly snapshot is gone.

**RTO: short, but not zero, and not yet measured.** A Railway restore does not
overwrite the live volume. It creates a new volume mounted at the same path,
named after the backup date, and leaves the old volume in place unmounted. The
change is staged for review before it deploys. That is a good property: the
damaged volume is still there if the restore turns out to be the wrong one. It
also means the runbook is "provision and swap", not "roll back in place", and
the app has to redeploy against the new volume. Until it has actually been done
once, the honest RTO is unknown.

**What Storyjar would have to tell schools.**

- The retention windows are **6 days, 1 month and 3 months**, not 35 days. That
  does not match what `RETENTION.md` currently promises, so the schedule line has
  to change to the real numbers whichever way this goes.
- Erasure takes as long as the longest surviving copy. With a monthly backup kept
  three months, a record a school asks to be deleted can persist in a backup for
  up to three months after deletion. Rule 9 says deletion is real. That is still
  satisfiable, but only if the document says three months and the erasure process
  accounts for it, rather than claiming one 35-day cycle.
- Backups sit inside Railway, which is already a named sub-processor. **No new
  sub-processor, no new DPA, and no sub-processor change notice to schools.**
  That is the single biggest practical advantage of this option before a pilot.
- A DPIA entry is still required. A backup is a second copy of children's
  personal data with its own retention and its own restore path, so it is a
  processing activity whether or not the company holding it is new.
- The honest limitation to write down: the backups live in the same account as
  the data. A lost or compromised Railway login, or an account-level problem,
  takes the data and the backups together.

---

## 4. Option B: self-managed encrypted backups to an EU object store

A scheduled job takes a consistent snapshot of the database, archives the media,
encrypts both, and uploads them to storage at a different company.

**Cost.** Object storage at EU providers is in the region of a few pounds a
month at this data size, plus whatever the scheduler costs to run. The dominant
cost of this option is not money. It is the work to build the job, the work to
keep it working, and the calendar time for the sub-processor paperwork.

**Candidates with EU regions**, each to be checked directly for current terms,
region guarantees and DPA rather than taken from this list: Scaleway Object
Storage, OVHcloud, Hetzner Object Storage, and Cloudflare R2 with an EU
jurisdiction restriction. Railway itself now sells object storage at $0.015 per
GB per month, which is cheap and easy, but it is still Railway: it does not give
the off-provider copy that is the whole point of this option.

**RPO: whatever the schedule says.** This is the option's real advantage. The
database file is small, so hourly database snapshots with a nightly media archive
are affordable, which would put the worst case at about an hour of lost work
instead of a day.

**RTO: longer, and manual.** Download, decrypt, verify, put the files back, then
boot. Realistically tens of minutes to a couple of hours, and it must be measured
in a rehearsal rather than estimated.

**What Storyjar would have to tell schools.**

- **A new sub-processor.** That means a row on `/legal/sub-processors`, a signed
  DPA with the provider, a `docs/DPIA.md` entry, and, because the schools are the
  controllers, a sub-processor change notice under the school DPA. That notice
  has a lead time. It is not a same-day step, and it lands during exactly the
  period when the pilot is being sold.
- The destination region, named, so the privacy notice can say where the copies
  actually are.
- The retention window, which is now a number Storyjar chooses rather than one
  the platform imposes, and which must be the same number in the runbook and in
  `RETENTION.md`.

**What this option requires to be a backup rather than a folder of files**, and
therefore what the work actually is:

1. Encrypted at rest with a key that is not on the production volume, held in at
   least two places, one of them offline and outside Railway. A restore drill
   that decrypts using the copy already in the environment has not tested
   anything.
2. The job's credential is write and list only, with no delete permission, and
   the bucket has versioning or object lock, so a compromised production
   environment cannot erase the backup history. A separate read credential for
   restore, held offline.
3. A consistent database snapshot, using `VACUUM INTO` or the SQLite online
   backup API. Copying a live SQLite file gives a corrupt backup and leaves the
   write-ahead log behind.
4. `PRAGMA integrity_check` on every run before upload, not only at drill time,
   and an alert if the archive size drops more than about 20 percent against the
   previous success, which is the signature of a truncated capture.
5. An erasure replay step in the restore procedure. Without it, restoring
   resurrects records a school asked to have deleted, which is a personal data
   breach and a broken promise in the same action.

Naming note for whoever builds it: call the environment variables `BACKUP_*` and
never `R2_BUCKET`, `R2_ACCOUNT_ID` or `R2_ACCESS_KEY`, so the parked R2 media
migration tripwire keeps meaning what it was written to mean. The tripwire scans
`src/` only, so a backup job under `scripts/` would not trip it either way, and
it must not be edited to accommodate backups.

---

## 5. Option C: both

Railway's backups for the easy, fast restore, and a weekly or monthly encrypted
copy at a second company for the case where the Railway account itself is the
problem.

**Cost:** the sum of A and B.

**RPO and RTO:** the better of the two in each case. Ordinary recovery uses
Railway. The off-provider copy exists for the day the account is gone, and would
have a worse RPO, on whatever cycle it runs.

**What Storyjar would have to tell schools:** everything in Option B, since the
new sub-processor is still new, plus the accurate Railway retention numbers from
Option A. Two retention windows to state instead of one, and the erasure window
is set by the longer of the two.

---

## 6. The fourth option, stated because it is real

**Change nothing technical, and correct the documents instead.**

The owner amendments are explicit that there are two ways to resolve this: make
the claim true, or correct the document. This option is the second one, and it is
listed here so the choice is visible rather than implied.

**Cost:** nothing.

**RPO and RTO: there is no recovery.** If the volume is lost, every photograph,
drawing and voice note is lost with it, permanently.

**What Storyjar would have to tell schools:** that their children's work has no
disaster recovery. `RETENTION.md`, `/legal/privacy` and `/legal/data-processing`
would all have to say so plainly, because the current text says the opposite and
a school's data protection lead reads it during procurement. A school may
reasonably decide not to proceed on that basis. The point of writing this option
down is that leaving the current wording in place while doing nothing is not this
option: it is the same absence of backups plus an untrue statement, which is
worse than either half.

---

## 7. Side by side

| | A: Railway | B: EU object store | C: both | D: correct the documents |
| --- | --- | --- | --- | --- |
| Monthly cost | about $15 uplift, plus usage | a few pounds, plus build and upkeep | sum of A and B | nothing |
| RPO | up to 24 hours | as often as scheduled, hourly is affordable | best of the two | no recovery |
| RTO | short, staged new volume, unmeasured | tens of minutes to hours, manual | best of the two | not applicable |
| Retention | 6 days / 1 month / 3 months | whatever is chosen | both, erasure set by the longer | not applicable |
| New sub-processor | no | yes, with DPA and school notice | yes | no |
| DPIA entry needed | yes | yes | yes | yes, to record the absence |
| Survives losing the Railway account | no | yes | yes | no |
| Work to build | none | a scheduled job and a rehearsed restore | both | none |

---

## 8. What is decided elsewhere, and what is still missing

Not decided here, and not by any agent:

- **D2 itself**: which option, and the RPO and RTO numbers.
- The backup retention window, because it has to match what `RETENTION.md`
  promises schools and it sets the longest time a Rule 9 erasure can take.
- **D12**, whether to pay for a non-production Railway environment. A restore
  drill creates a second live copy of every child's photograph, drawing and voice
  note, so it needs somewhere controlled, EU-hosted and disposable to land. Doing
  it on a laptop is not an option.
- **D14**, the succession and sealed-credential arrangement. Whichever option is
  chosen, one person holds every credential, and Option A specifically means that
  losing the Railway login is now also losing the backups.

Facts not yet obtained, and which should be before money is committed:

- Whether volume backups can be enabled on the current plan, confirmed in the
  dashboard rather than from documentation.
- Whether Railway offers point in time recovery at all, and on which plan. The
  backups documentation page does not mention it.
- The measured wall-clock time of one real restore, which is the only honest
  source for the RTO figure.

Related rule that sits above all of this: `RETENTION.md` and `SAFEGUARDING.md`
outrank this document. Nothing here may be read as changing either.
