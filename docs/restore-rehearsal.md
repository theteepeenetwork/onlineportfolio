# Rehearsing a restore

**Who this is for:** the person who runs StoryJar. You will be doing this on
production, and the point of this page is that you should not be deciding
anything while you do it. Read it through once first; every judgement it needs
has been made here, in advance, in the quiet.

**What it is for.** Handbook **R12** blocks every deletion path in the product
until one restore has been performed end to end with a media checksum sample.
That is not a formality. `RETENTION.md` line 149 puts it plainly:

> An untested backup is a belief.

Until this is done, three things stay shut: school deletion (owner decision
**D5**, `docs/ops-architecture.md`), the erasure half of school account closure,
and any honest RTO figure. `docs/ops-architecture.md` records RTO as "back within
a day" — that is an estimate nobody has measured, and this drill is what turns it
into a number.

**What this page is not.** It is not the incident runbook. If production is down
*right now*, the steps below still apply, but read
[`docs/ops-recovery.md`](./ops-recovery.md) first — this one assumes you have
time, which is exactly why it should be done before you need it.

---

## What "passed" means

Written down before the drill rather than judged afterwards, because the person
deciding whether a restore worked should not be the person who has just spent an
hour wanting it to.

The drill has **passed** only if all six are true:

1. A backup was restored into a running service, and the app came up on it.
2. A teacher can sign in and see their classes.
3. A child's journal item made **before** the backup was taken is present, with
   its text and its caption.
4. **The media file attached to that item downloads, and its SHA-256 matches the
   one recorded before the restore.** This is the clause R12 names. A database
   that restores without its media is a restore that loses every photograph, and
   nothing else in this list would catch it.
5. The elapsed time from "decide to restore" to "app serving on restored data"
   was measured and written down.
6. The original volume still exists, and the service was returned to it.

Anything less is a **fail**, and a fail is a result: it goes in `FINDINGS.md`
with what happened, and R12 stays unsatisfied. A drill that is quietly not
finished is worse than one not attempted, because the next person reads the tick
and believes it.

---

## What you are working with

Facts from `docs/ops-backup-options.md` and `RETENTION.md`, current at
8 September 2026. **Check each one in the dashboard before you rely on it** —
this file is a copy, and the dashboard is the authority.

| | |
| --- | --- |
| Project | **Story Jar** |
| Service | **onlineportfolio** |
| Environments | **production**, **staging** |
| The volume | mounted at `/data`, holding `prod.db` and `media/` |
| Backups since | 2026-08-17, Railway Pro |
| Schedules | daily kept 6 days · weekly kept 1 month · monthly kept 3 months |
| Where they are | EU West (Amsterdam), confirmed in writing 2026-09-05 (F35) |

**Three properties of a Railway restore that shape everything below.**

- **It does not overwrite.** A restore creates a **new volume**, mounted at the
  same path and named after the backup date, and leaves the existing volume in
  place, unmounted. The damaged one is still there if the restore turns out to
  be the wrong one. This is the single reason this drill is safe to do on
  production at all.
- **It is staged, not applied.** The change waits for you to deploy it. Nothing
  happens to the running service until you press deploy.
- **It cannot cross an environment.** A backup can only be restored into the
  same project *and the same environment*. A production backup cannot be
  restored into staging.

That last one is why this drill happens on production, and it is worth being
blunt about: `docs/ops-architecture.md` records **D12** — "pay for a
non-production Railway environment" — as an unanswered decision blocking this
drill. A **staging** environment does now exist in the project (observed
8 September 2026; its configuration was not readable from here, so **confirm what
it is before assuming it is usable**). It does not remove the constraint. Staging
can rehearse the *mechanics* on fictional data; only production can prove that
*this school's* backup restores.

---

## Before you start

- [ ] **Pick a quiet hour.** A UK school holiday, or before 07:00 on a Saturday.
      Step 7 puts production briefly on restored data.
- [ ] **Have `docs/ops-recovery.md` open** in another tab, so that if you lose
      your own way into the operator area mid-drill you are not looking for it.
- [ ] **Tell nobody's children about it, and no school.** Nothing here is
      user-visible if it goes right, and if it goes wrong the original volume is
      untouched. There is nothing to announce in advance.
- [ ] **Know which backup you are restoring.** Pick yesterday's daily, not the
      oldest monthly: you want to prove the ordinary path works, not the extreme.

---

## The drill

Commands run **inside the container**, the same way every command in
`docs/ops-recovery.md` does. Open a shell on the running service:

```bash
railway ssh
```

Then `ls` and check you can see `package.json`, `prisma/` and `scripts/`; if not,
`cd /app`.

### 1. Record what you expect to get back — and start the clock

Take the fingerprint **now**, from the live volume, while it is still the live
volume. This is what you will compare against.

```bash
# Where the data actually is.
ls -la /data /data/media | head -20

# The database, and how big it is.
sha256sum /data/prod.db
stat -c '%s %y' /data/prod.db

# THE MEDIA CHECKSUM SAMPLE — the clause R12 names. Ten files, oldest first, so
# the sample is stable across a restore rather than picking up new uploads.
ls -1 /data/media | sort | head -10 | while read -r f; do sha256sum "/data/media/$f"; done

# How many files there are in total, so a restore that loses most of them is
# obvious even before the checksums.
ls -1 /data/media | wc -l
```

**Copy all of that output into a scratch file on your own machine.** Not into
this repository — the filenames are children's media paths.

Then write down the time. The clock starts at the moment you decide to restore,
not at the moment the restore finishes; that is what an RTO is.

### 2. Note the current volume

In the Railway dashboard, on **Story Jar → production → onlineportfolio →
Volumes**: write down the volume's name and id. You are going to come back to it
in step 8, and the whole safety of this drill rests on it still being there.

### 3. Restore the backup

Dashboard → the volume → **Backups** → yesterday's daily → **Restore**.

Railway creates a new volume from the backup and stages the change. **Read what
it says it is going to do before you accept it.** If it offers to delete or
replace the existing volume rather than to add one, stop: that is not the
behaviour this drill was designed around, and it means this page is out of date.
Write down what it actually offered and stop the drill.

### 4. Deploy the staged change

This is the moment production starts serving from restored data. Press it, and
watch the deployment come up.

### 5. Prove the database came back

```bash
railway ssh
sha256sum /data/prod.db
```

It will **not** match step 1 — the backup is from yesterday, so it should not.
What you are checking is that it is a real database of roughly the right size,
not an empty file. Then:

```bash
npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  console.log('schools ', await db.school.count());
  console.log('teachers', await db.teacher.count());
  console.log('classes ', await db.class.count());
  console.log('pupils  ', await db.student.count());
  console.log('moments ', await db.journalItem.count());
  await db.\$disconnect();
})();
"
```

Every number should be close to what it was, and none should be zero.

### 6. Prove a child's work came back — and its file with it

This is criterion 3 and criterion 4, and criterion 4 is the one that matters.

```bash
# The ten oldest media files again, from the restored volume.
ls -1 /data/media | sort | head -10 | while read -r f; do sha256sum "/data/media/$f"; done
ls -1 /data/media | wc -l
```

**Compare against step 1, line by line.** The ten checksums must match exactly.
The total count may be slightly lower — anything uploaded since the backup was
taken is legitimately not there — but it must not be dramatically lower, and it
must not be zero.

Then, in a browser, on the real site: sign in as a teacher (use the demo school,
not a real one, if there is a choice), open a class, open a child, and confirm a
moment made before the backup shows its text **and its picture**. A broken image
here with matching checksums means the path mapping is wrong, which is a
different failure and a real one.

### 7. Measure

Stop the clock. Write down the elapsed time from step 1 to a working page in
step 6. **That is the RTO**, and it is the first true one StoryJar has.

### 8. Put it back

Restore the service to the original volume from step 2, and deploy. Then repeat
step 5's counts and confirm you are back on live data — the row counts should be
the *current* ones again, not yesterday's.

**Do not delete the restored volume for at least a week.** It costs a little and
it is the only evidence the drill happened.

---

## Afterwards: write it down in five places

The drill is not finished until this is done. A rehearsal nobody recorded has to
be done again.

| File | What changes |
| --- | --- |
| `FINDINGS.md` | **F20**'s residual — "a restore has never been rehearsed" — becomes the date it was, with the measured RTO. If the drill failed, that is what goes there instead. |
| `RETENTION.md` | The open item "Rehearse a restore before the pilot" is ticked with the date, and the backup row gains the measured RTO. |
| `docs/ops-architecture.md` | The **D2** row's "R12 is NOT yet satisfied" becomes satisfied, with the date. **D5** — school deletion — stops being blocked by R12 and becomes a plain owner decision again. |
| `docs/DPIA.md` | **R15**'s residual "the volume holding all of this is backed up but the restore has never been rehearsed" is replaced with what is now true. |
| `docs/ops-recovery.md` | Anything you found out the hard way. If a step on this page was wrong, fix it here **while you remember**, not next time. |

---

## If it fails

A failed drill is a good outcome bought cheaply, and it is the reason to do this
before a pilot rather than during an incident.

- **The old volume is still there.** Step 8 works whether the drill passed or
  failed; do it first, before anything else.
- **Write the finding before you start fixing anything.** What you expected,
  what happened, which of the six criteria failed. `FINDINGS.md`, in the house
  style, with a severity you are comfortable defending.
- **R12 stays unsatisfied**, which means school deletion stays out of the
  product. That is the system working: the gate exists precisely so that a
  deletion feature cannot ship on top of a backup nobody has restored.
- **Do not re-run it immediately to get a green.** Find out why first. A drill
  run twice until it passes proves less than one run once and understood.
