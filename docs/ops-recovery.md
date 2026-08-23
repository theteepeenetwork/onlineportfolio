# Operator recovery: what to do when you cannot get in

**Who this is for:** the person who runs StoryJar. Today that is one person, and
that is exactly why this document exists. There is no colleague to reset your
account, no "forgot password" email, and nothing in the repository that can
issue a signed-in session. Those absences are deliberate (handbook ruling R8: a
committed script that mints a session is an unaudited authentication bypass
living in the repository). The price of that is that the way back in has to be
written down before you need it, which is this page.

Read it once now, while you can still sign in.

---

## What the door is made of

| Thing | Where it lives | What happens if you lose it |
| --- | --- | --- |
| Password | Your password manager | Recovery code, then a rebuild (below) |
| Authenticator app entry (TOTP) | Your phone | Recovery code |
| Ten recovery codes | **Printed, on paper, somewhere physical** | Rebuild (below) |
| `OPS_ENABLED=1` | Railway environment variables | The area answers 404 to everyone, including you |

All four are needed. Two of them are only ever printed once, by
`scripts/seed-operator.ts`, at the moment the account is created.

**Where the recovery codes must not be.** Not in this repository. Not in an
email. Not in a note on the phone that holds the authenticator app, and not in
the password manager that the same phone unlocks, because then one lost phone
takes the password, the codes and the second factor together. Paper, in a
drawer, is the correct answer here and is not a joke.

---

## How to run any command on this page

Every database command below runs **inside the container**, because that is the
only place the database exists. Open a shell on the running service:

```bash
railway ssh
```

Then type the command at the container prompt. Before you type anything else,
run `ls` and check you can see `package.json`, `prisma/` and `scripts/`; if you
cannot, `cd /app`.

The commands are given as two steps rather than as `railway ssh node -e "..."`
on one line on purpose. The one-liners contain double quotes and `$`, and
passing them through your own shell as well as the container's is how you end up
debugging quoting instead of getting back into your account.

**Why not `railway run`. The variables come to your machine; the file does
not.** `railway run` fetches the production environment variables and runs the
command **on your Mac** with those variables set. `DATABASE_URL` is
`file:/data/prod.db` — a path on the Railway volume, and the volume is not
mounted on your Mac. So Prisma opens nothing and fails with SQLite error 14,
"unable to open database file". Every command on this page said `railway run`
until 23 August 2026, and not one of them had ever worked; see F44 in
`FINDINGS.md`.

`railway run` is still right for the scripts that only speak to Mailjet over
HTTPS and never open the database — `scripts/verify-mail.ts` and
`scripts/mail-events.mjs`. The test is not which command is newer. It is whether
what you are running needs the file on the volume.

**Which container you get.** `railway ssh` attaches to the deployment that is
*running*. If the service is crash-looping there is nothing to attach to, and no
command on this page will help until the boot is fixed.

---

## Situation 1: you have the password and the phone

Sign in normally. Email, password, then the six-digit code.

If the code is refused and you are sure it is right, check that your phone's
clock is correct: codes are computed from the time, and the server accepts one
step either side (30 seconds). Also note that the **same code cannot be used
twice**. If you have just signed in, signed out and come straight back, wait
for the next code rather than retyping the one on screen.

## Situation 2: five wrong passwords, and now nothing works

The account locks itself for **15 minutes** after five failed attempts, and the
lock is a column on the row rather than something held in memory, so restarting
the service does not clear it. Wait it out, or clear it deliberately:

```bash
railway ssh
```

Then, at the container prompt:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const d=new PrismaClient();d.operator.updateMany({data:{failedAttempts:0,lockedUntil:null}}).then(r=>console.log('cleared',r)).finally(()=>d.\$disconnect())"
```

The message on screen never says "locked", on purpose: it is the same sentence
as every other failure, because "this account is locked" tells a stranger the
account exists.

## Situation 3: you have the password, the phone is gone

Use a recovery code in the code box instead of the six digits. Each code works
**once** and is then spent; the screen tells you how many are left.

Then, the same day, rebuild the account (situation 4) so that you have a fresh
authenticator entry and a fresh set of ten codes. Do not run on two or three
remaining codes: that is the state in which the next mishap is unrecoverable.

## Situation 4: break-glass. The password, the phone and the codes are all gone

This is the last resort, and it is a **documented row deletion**, not a script.
There is nothing to run that will let you back in without a credential, and that
is the point: a tool that could do that would be a tool anyone with shell access
could do it with, silently.

You need Railway shell access to the production service. If you have that, you
already have more power than the operator area gives you: see "the honest
limit" at the end.

One `railway ssh` shell serves steps 1 to 3 — stay in it rather than opening
three. It is repeated in each block below so that a block copied on its own is
still correct.

**Step 1. Confirm what you are about to delete.**

```bash
railway ssh
```

Then, at the container prompt:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const d=new PrismaClient();d.operator.findMany({select:{id:true,email:true,role:true,status:true,createdAt:true,lastSignInAt:true}}).then(r=>console.log(r)).finally(()=>d.\$disconnect())"
```

**Step 2. Delete the operator row.** Its sessions go with it, because
`OperatorSession.operatorId` cascades. Nothing else in the database references
an operator, so no school, teacher, child or family record is touched by this.

```bash
railway ssh
```

Then, at the container prompt:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const d=new PrismaClient();d.operator.deleteMany().then(r=>console.log('deleted',r)).finally(()=>d.\$disconnect())"
```

**Step 3. Create a new account and print the new credentials.**

```bash
railway ssh
```

Then, at the container prompt:

```bash
npx tsx scripts/seed-operator.ts you@example.com
```

`tsx` is a runtime dependency rather than a dev one, and the container carries
the repository (its start command is `bash scripts/railway-start.sh`, which
reads `prisma/schema.prisma`), so this resolves locally and fetches nothing.

The script refuses to run while an operator row exists, which is why step 2 has
to happen first and cannot be skipped by adding a flag. There is no flag.

**Step 4. Sign in, enrol the authenticator, print the ten new codes.** The
account cannot complete a sign-in until the authenticator is enrolled, so a
password on its own is not a way in even in the minutes between steps 3 and 4.

**Step 5. Read the audit trail.** `OpsAuditLog` is not deleted with the account
(`actorId` is a plain column, not a foreign key), so the record of what the old
account did survives the rebuild. That is deliberate: an account rebuild must
not be a way to erase the trail behind it.

```bash
railway ssh
```

Then, at the container prompt:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const d=new PrismaClient();d.opsAuditLog.findMany({orderBy:{at:'desc'},take:50}).then(r=>console.table(r)).finally(()=>d.\$disconnect())"
```

---

## Rehearsal

Rehearsed on **2026-08-17** against a throwaway SQLite database built by
`prisma migrate deploy` from the committed migrations, which is what production
boots from. What was actually run, in order, and what it did:

1. `scripts/seed-operator.ts` into an empty database: created the account and
   printed the password, the setup key and ten recovery codes once.
2. The same command again: **refused, exit code 1**, with no row written. There
   is no flag that changes that, and passing one is also refused.
3. The delete command in step 2 of situation 4: removed the row.
4. `scripts/seed-operator.ts` again: created a fresh account with a new
   password, a new setup key and ten new codes.
5. Session cascade: an operator session row created by hand was gone the moment
   the operator row was deleted.
6. Audit survival: an `OpsAuditLog` row written before the delete was still
   there afterwards, so the rebuild does not erase the trail.

The sign-in, enrolment, recovery-code and sign-out halves are exercised on every
battery run by `tests/battery/security/ops-auth.spec.ts`, against real
credentials and a real code.

**The wrapper was wrong, and being unrehearsed is how it stayed wrong.** Until
23 August 2026 every command above said `railway run`, and the paragraph here
said only that the wrapper was "not yet proved". It was not unproved. It could
not work, for a reason that was already written down two sections up: the
database is a file on the volume. Mark found it for real on 23 August, trying to
seed the operator account, and got SQLite error 14. Logged as **F44**.

The commands themselves were rehearsed and are unchanged. What was never
executed was the one word in front of them.

**Still not rehearsed:** the `railway ssh` half, end to end, against the real
service. There is no non-production environment to try it on — paying for one is
owner decision **D12**, still open — and a full break-glass rehearsal against
production would mean deleting the live operator account to see what happens.
What can be rehearsed without that, and should be before the pilot, is narrow
and cheap: that `railway ssh` reaches a shell in the running container, that the
container has `prisma/` and `scripts/` in it, and that the *read-only* command in
situation 4 step 1 lists the operator rows. Steps 2 and 3 are the destructive
ones and stay unrehearsed by choice.

Rehearse that much once, on a day nothing is wrong, and write the date here:

- Rehearsed against a throwaway local database: **2026-08-17**
- `railway ssh` reaches the container, and the read-only operator list runs
  there: **2026-08-23 — PASSED.** See below.
- Full break-glass against Railway: *(not planned; needs D12)*

**What the 2026-08-23 rehearsal actually covered**, so nobody has to guess later:

- `railway ssh` reached a shell on the running service.
- The prompt starts in **`/app`**, with the repository there. The "if `ls` does
  not show `package.json`, `cd /app`" hedge above is now a confirmed fact rather
  than an assumption, and can be relied on.
- It is genuinely the container and not the operator's own machine — checked
  deliberately, because a first `ls` can look enough like a local checkout to be
  worth distrusting. `/data` is mounted and holds `media/` and `media-shared/`;
  the hostname is a container id.
- The **read-only** command from situation 4 step 1 ran there and returned one
  operator row, `role: OWNER`, `status: ACTIVE`.

So the wrapper, the working directory, the availability of `node` and `npx`, and
Prisma's path to the database are proved end to end. **The destructive steps —
situation 4 steps 2 and 3, which delete and recreate the live operator account —
remain unrehearsed by choice**, and that is not a gap to close: rehearsing them
against production means deleting the live account to watch what happens.

---

## The honest limit

None of this constrains the person with Railway shell access, and neither does
anything else in the operator programme. The same shell that runs the commands
above can read the SQLite file and every media file on the volume. The product
is structurally blind to children's work; the host is not. That gap is recorded
in `docs/DPIA.md` and must be stated in exactly those terms to any school that
asks, because a guarantee that overstates itself is worse than none.
