# Test logins

Every account on this page is fictional test data that already exists in the
repository. Nothing here is a real credential, and nothing real may ever be
added to it: this repository is public (SAFEGUARDING rule 12). Real shared
sign-ins, such as the Storyjar Academy staff accounts and the live operator
account, live in the password manager and are referenced here by address only.

Last checked against the code on 19 August 2026.

---

## The roles, and where each one signs in

There are four kinds of user, and they are four separate tables, not one table
with a role column. That separation is the access control: a parent session
cannot become a teacher session, and nothing in the teacher-facing app can
reach the operator area.

| Who | Table | Signs in at | With |
| --- | --- | --- | --- |
| School staff | `Teacher` (`role` = ADMIN / TEACHER / TA) | `/login/teacher` | Email + password |
| Child | `Student` | `/login/student?code=CLASSCODE` | Class code, then tap their name. No password |
| Parent or carer | `Parent` | `/family` | Family code from the school's letter, or a magic link to their email |
| Platform operator (you) | `Operator` (`role` = OWNER / OPERATOR) | `/ops/sign-in` | Email + password + a 6-digit authenticator code |

Staff roles inside a school:

- **ADMIN**: everything a teacher can do, plus the `/admin` space (staff list,
  invites, roles) and billing. The demo teacher is an ADMIN so `/admin` is
  reachable from the seeded login.
- **TEACHER**: their own classes, activities, approval queue.
- **TA**: teaching assistant.
- A staff row can also be `status: "INVITED"`, which means invited but no
  password set yet. `j.reed@stbedes.sch.uk` in the demo seed is that state, so
  the staff table has a pending invite to look at. It cannot be signed in to.

---

## 1. Local demo data (`npm run setup` or `npm run db:reset`)

One school, the state a new install ships in. Run `npm run db:reset` to get back
to it cleanly.

**St Bede's Primary** (SCHOOL plan, 42-day trial, full access)

| Account | Email | Password | Notes |
| --- | --- | --- | --- |
| Sam Rivera | `teacher@school.uk` | `password` | ADMIN. Owns Sunflower, Ladybird and Acorns |
| Miss Malik | `a.malik@stbedes.sch.uk` | `password` | TEACHER. Owns Butterflies |
| Sam Doyle | `s.doyle@stbedes.sch.uk` | `password` | TA |
| J. Reed | `j.reed@stbedes.sch.uk` | (none) | INVITED, cannot sign in. Deliberate |

Classes, one per age mode, so all three registers are reachable:

| Class | Code | Age mode | Children |
| --- | --- | --- | --- |
| Sunflower | `SUN234` | KS1 | Amara, Ben, Chloe, Dev, Ella, Finn |
| Ladybird | `BUG456` | KS2 | Grace, Harry, Isla |
| Acorns | `ACO789` | EYFS | Ava, Theo, Mia |
| Butterflies | `BTF789` | EYFS (null default) | none seeded |

Child sign-in: go to `/login/student`, type the class code, tap a name. Or jump
straight in with `/login/student?code=SUN234`.

Parent: **Priya Shah**, family code `FAM123`, linked to Amara (Sunflower) and
Grace (Ladybird), so the sibling switcher has two tabs. Magic link address is
`demo-parent@storyjar.co.uk`, which must exist as a forwarding alias or
catch-all on the domain, because this row is live in production and the family
sign-in form is public.

Dev/Ella/Finn carry no seeded work on purpose. The canvas specs rely on them
being clean, so use Ben or Chloe when you want a child who already has
something in the jar.

---

## 2. QA battery fixtures (`npm run db:seed:test`)

Runs the demo seed first, then appends two more tenants and the operator
fixture. This is what the Playwright battery signs in as, and what you want
locally when you are testing isolation or the frozen state.

```bash
MAIL_HMAC_KEY=any-local-string npm run db:seed:test
```

`MAIL_HMAC_KEY` is not optional. The seed hashes fixture email addresses into
the mail suppression table and refuses to run without it, rather than writing
rows the app can never match. The battery passes its own key in
`tests/battery/global-setup.ts`.

Everything from section 1 is still there, plus:

**School B, Oakfield Primary** (SCHOOL plan, trial). A completely separate
tenant, used to prove School B can never reach School A's anything.

| Account | Email | Password | Role |
| --- | --- | --- | --- |
| Mrs Lindqvist | `admin@oakfield.sch.uk` | `password` | ADMIN |
| Mr Okafor | `teacher@oakfield.sch.uk` | `password` | TEACHER, owns Acorn |

- Class **Acorn**, code `ACRN22`, children Zara, Yusuf, Willow.
- **Claimed as URN `900200`**, with a matching fictional `Establishment` row of
  the same name. Oakfield is the school that is *already on StoryJar*, so the
  duplicate-URN refusal has something real to refuse.
- Parent **Nadia Rahman**, family code `OAKFAM1`, linked to Zara only. Her
  address is on the mail suppression list as a BOUNCE, so the delivery line on
  an adult record has something to say.

**School C, Larchwood Primary** (FROZEN, read-only). Trial lapsed 10 days ago,
frozen 3 days ago. Use it to check that viewing and downloading still work
while every write is blocked server-side.

| Account | Email | Password | Role |
| --- | --- | --- | --- |
| Ms Frost | `teacher@larchwood.sch.uk` | `password` | ADMIN, frozen |

- Class **Willow**, code `ARCH22`, children Pip, Robin, Sage.
- The only fixture with Stripe ids (`cus_seedlarchwood0001`,
  `sub_seedlarchwood0001`), so the operator billing screen has a link to build.
  St Bede's has none, which is the negative control on the same render.

**School E, Pennyfields Primary** (ACTIVE but **UNVERIFIED**). Arranged on the
invoice / PO route and not paid for yet, so the subscription is ACTIVE — finance
holding an invoice for thirty days must not freeze a school — while
`School.verifiedAt` is null. Use it to check the three admin powers an unpaid
school does not have: moving a class to another member of staff, removing a
colleague who has already joined, and making somebody else an admin. Everything
else, including inviting staff and removing an INVITED row, stays open.

| Account | Email | Password | Role |
| --- | --- | --- | --- |
| Mrs Okonkwo | `admin@pennyfields.sch.uk` | `password` | ADMIN |
| Mr Vaughan | `teacher@pennyfields.sch.uk` | `password` | TEACHER, owns Kestrel |

- Class **Kestrel**, code `PENN44`, no children — nothing in the unverified gates
  reads a child.
- It is the mirror image of School C: Larchwood is **frozen but verified** (it
  paid once and lapsed), Pennyfields is **unfrozen but unverified**. Billing
  status and verification are separate facts read by different code.

**Platform operator fixture**

| Field | Value |
| --- | --- |
| Email | `ops@storyjar.test` |
| Password | `fixture-operator-pass-9271` |
| TOTP secret | `GBX7MIWQ6ZXBKEIOGA2JYJPNCND2HCHN` |

Ten single-use recovery codes, in order:

```
V5ZZ-JCJE-FQCN   855D-ECC2-C3ZV   PEWY-XZ8W-3SXF   QW55-KRFB-CTXN   6RZS-QJDX-QNXJ
3M47-N6E5-7ZRX   ZRJE-BTG5-ATV3   PCDY-Q39P-443D   TMW9-9Y2F-RYQK   GK9G-CANK-H4XA
```

Two things to know before you try to use it:

1. **The operator area is 404 unless the server was started with
   `OPS_ENABLED=1`.** Locally that means `OPS_ENABLED=1 npm run dev`. The
   battery sets it in `playwright.battery.config.ts`.
2. **There is no TOTP bypass.** No `SKIP_TOTP`, no test-environment branch
   (handbook ruling R6). You need a real 6-digit code computed from the secret
   above. `.opscode.ts` at the repo root prints one:

   ```bash
   npx tsx .opscode.ts
   ```

   That helper is hard-wired to the fixture secret, which is already published
   in `prisma/seed-test.ts`, so it is not a leak. It must never be pointed at
   the real one.

Codes cannot be replayed: a step at or below the last accepted one is refused,
so if you sign out and straight back in, wait for the next code. Five wrong
passwords locks the account for 15 minutes, and the lock is a column on the row,
so restarting does not clear it.

**Storyjar library fixtures**: `seed-autumn-walk` (published) and
`seed-not-published-yet` (unpublished, must be invisible to every teacher).

**School D, StoryJar Studio** (`publisher@studio.storyjar.co.uk` / `password`):
the only fixture school with `canPublishToLibrary`. It stands in for the Academy,
which is far too large to be a fixture, and it exists so the cross-tenant publish
refusals in `shared-activities.spec.ts` are a real test rather than a test of an
empty table.

---

## 3. Storyjar Academy (the production sandbox)

A real tenant, not a special case in the code, seeded by
`scripts/ops/seed-academy.mjs`. 16 classes, nursery to year 6, two forms each,
around 440 fictional children. `School.kind = "DEMO"` keeps it out of pupil
rolls, price bands and revenue lines. It is the only school with
`canPublishToLibrary`.

| Account | Address | Role |
| --- | --- | --- |
| School Manager | `manager@academy.storyjar.co.uk` | ADMIN |
| Class teachers | `<yeargroup>.<form>@academy.storyjar.co.uk`, e.g. `year3.oak@academy.storyjar.co.uk`, `nursery.elm@...` | TEACHER |

Class codes are `ACD` + two-digit year index + form number, so Nursery Oak is
`ACD011`, Nursery Elm `ACD012`, Year 1 Oak `ACD031`, and so on down the list in
the script.

**These accounts can publish to the shared library, and no other account can.**
`School.canPublishToLibrary` is true here alone. Sign in as any class teacher,
build on the real canvas, and publish from the activity's ⋯ menu; the Publishing
screen at `/teacher/activities/library` is where it is made visible or
withdrawn. See [`library-publishing.md`](./library-publishing.md).

**The addresses and codes above are also in the product**, at `/ops/academy` in
the operator console, derived from the same scheme rather than read from the
database. This document stays the source of truth for the wording, and
`tests/battery/security/ops-academy.spec.ts` fails the build if the screen and
the seed script drift apart.

**The password is not in this document and not in the repository.** It is set
once when the script is run and lives in the password manager:

```bash
ACADEMY_PASSWORD='…' node scripts/ops/seed-academy.mjs
```

The script is idempotent. Everything upserts on a natural key, children are
added only to a class that has none, so a re-run never doubles a roll or
disturbs work left in the sandbox.

---

## 4. Creating your own operator account

This is the account that gets you into `/ops`, and it is separate from every
teacher account you will ever have. One account exists (handbook D11). There is
no sign-up page, no password reset email and nothing in the repository that can
mint a signed-in operator session.

### Before you start

`OPS_ENABLED` **is not currently set on Railway**, so `storyjar.co.uk/ops`
answers 404 to everyone including you. Set it first, or you will create the
account and then be unable to reach the door.

Railway, project *Story Jar*, service *onlineportfolio*, production:

```
OPS_ENABLED=1
```

Exactly `1`. Not `true`, not `yes`. A switch with several spellings is a switch
somebody turns on by accident with `OPS_ENABLED=false`.

Have ready, before you run anything:

- An authenticator app on your phone (Google Authenticator, 1Password, Authy).
- Your password manager, open.
- A printer, or paper and a pen.

### The steps

**1. Run the script once, against production — inside the container.**

```bash
railway ssh
```

Then, at the container prompt:

```bash
npx tsx scripts/seed-operator.ts you@example.com
```

**Not `railway run`.** That injects the production variables into a process on
your own Mac, and `DATABASE_URL` is `file:/data/prod.db`, a path on the Railway
volume that is not mounted there. The variables travel; the file does not. You
get SQLite error 14 and no account (F44).

Use an address you will still control in two years. It is only an identifier
for sign-in; the script sends no email.

**2. Copy what it prints. It prints once and nothing below is recoverable from
the database.**

- A 28-character generated password. Straight into the password manager.
- A setup key (and a matching `otpauth://` URI you can paste).
- Ten recovery codes, each usable once.

**3. Sign in at `https://storyjar.co.uk/ops/sign-in`.** Email, then password.
You will then be made to add the setup key to your authenticator app and type a
code back, and you cannot get past that step. Until you do, the account cannot
complete a sign-in, so a leaked password on its own is not a way in.

**4. Print the ten recovery codes and put the paper somewhere physical.** Not in
this repository, not in an email, not in a note on the phone that holds the
authenticator app, and not in the password manager that the same phone unlocks.
One lost phone must not take the password, the second factor and the codes
together. A drawer is the correct answer and is not a joke.

**5. Close the terminal and clear its scrollback.**

### For a local operator account

Same script, run straight on your own machine against your own database, and
start the dev server with the switch on:

```bash
npx tsx scripts/seed-operator.ts you@example.com
OPS_ENABLED=1 npm run dev
```

Note that `npm run db:seed:test` deletes every operator row and writes the
fixture one, so a hand-made local operator will not survive a reseed. That is
deliberate: it means every battery run starts from the same known state.

### What the script will not do, and why

- **It will not run while an operator row already exists.** There is no
  `--force` and no `--reset`, and passing any flag is refused. A script that can
  overwrite the operator account is a script that hands the operator account to
  whoever runs it, and it lives in a public repository.
- **It will not email you anything.** A password or an enrolment secret in an
  inbox is a password or an enrolment secret in an inbox.
- **It will not mint a session** (handbook ruling R8).

### If you get locked out

Read `docs/ops-recovery.md`. Short version:

| Situation | Way back |
| --- | --- |
| Code refused and you are sure it is right | Check your phone's clock. The window is one step (30s) either side, and a code cannot be used twice |
| Five wrong passwords | 15-minute lock, or clear `failedAttempts` / `lockedUntil` from the Railway shell |
| Phone gone | Type a recovery code into the code box instead of the six digits, then rebuild the account the same day |
| Password, phone and codes all gone | Documented row deletion from the Railway shell, then run `seed-operator.ts` again. `OpsAuditLog` survives the rebuild on purpose |

The honest limit, which must be stated in these terms to any school that asks:
none of this constrains whoever holds Railway shell access. The same shell can
read the SQLite file and every media file on the volume. The product is
structurally blind to children's work; the host is not.

---

## What the operator area contains

`/ops` (console), `/ops/schools`, `/ops/lookup`, `/ops/billing`, `/ops/mail`,
`/ops/health`, `/ops/handbook`. Ops never reads `AuditLog`, because its free-text
`detail` routinely contains a child's first name, so reading it would be a
child-data read wearing an operations hat. `OpsAuditLog` is the operator's own
trail (handbook ruling R4). `scripts/check-ops-blindness.mjs` is the gate that
keeps it that way, and it runs in `npm run check`.
