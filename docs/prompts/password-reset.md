# Delegation brief — teacher password reset (and staff invite)

**Owner:** teacher-lead, with platform-lead on schema and mail, safeguarding-reviewer before merge.
**Deadline:** the schema migration must land before pilot teachers sign in. 10–15 arrive from 1 September.
**Log as:** F61 in `FINDINGS.md`.

## The gap

There is no password reset anywhere in the application. `src/app/actions/auth.ts`
signs a teacher in and that is all. A pilot teacher who mistypes their password on
a Monday morning has no route back into their account except the owner resetting it
by hand over `railway ssh`. That is the whole of the recovery story today.

There is a second, related hole. `staffInviteEmail()` exists in
`src/lib/emailTemplates.ts:167` — written, styled, with "Set your password" copy —
and **nothing calls it**. `src/lib/mailStatus.ts:48` states this explicitly. So a
teacher added to a school has no way to receive credentials either.

Both holes are the same missing mechanism: *a single-use token that lets an adult
set a password*. Build it once and wire both paths, or the second one gets built
again from scratch in October.

## What already exists — reuse it, do not reinvent it

`requestMagicLink` in `src/app/actions/family.ts:36` is the reference implementation
for this whole shape, and it has already survived two security findings. Read it
before writing anything. It gives you:

- `randomBytes(24).toString("hex")` token minting
- a 30-minute expiry
- per-IP throttling via `isRateLimited` / `recordFailure` (`src/lib/rateLimit.ts`)
- the **neutral response**: identical output for a known address, an unknown
  address, and a failed send (FINDINGS F6, account enumeration)
- `signInLinkMayBeShown()` (`src/lib/signInLinkPolicy.ts`) — the pure function that
  keeps the URL off the screen in production (FINDINGS F19). That module is
  deliberately tiny and free of `server-only` so a test can assert the rule
  directly. Follow that pattern rather than an inline `if`.

Also in scope to reuse: `sendMail` (`src/lib/mailer.ts`), `recordAudit`
(`src/lib/audit.ts`), `createSession` / `destroySession` (`src/lib/auth.ts`).

## Constraints that are not negotiable

1. **Do not reuse `MagicToken`.** It is bound to `Parent` by a required relation
   (`prisma/schema.prisma:255`). Widening it into a shared adult/parent token space
   is exactly the kind of cross-role join SAFEGUARDING rule 4 exists to prevent.
   Add a separate model for teacher password tokens.
2. **The response must be neutral.** A reset form that says "no account with that
   email" is an account enumeration oracle against a directory of named school
   staff. Same message every time — sent, not found, send failed.
3. **The link never renders on screen in production.** Same rule as F19, same
   mechanism. A reset URL on screen is a full account takeover for anyone who can
   type a colleague's address.
4. **Changing a password must destroy that teacher's existing sessions.** Otherwise
   a reset does not evict whoever prompted it. `Session` rows are
   `prisma/schema.prisma:496` and cascade on teacher delete; you want an explicit
   `deleteMany` on the teacher id at the moment the hash changes.
5. **Single use, and short.** Mark the token used at the moment it is spent, in the
   same transaction as the password write. 30 minutes matches the parent flow;
   argue for a different number if you have a reason, don't drift into one.
6. **`MAIL_TEMPLATE_KEYS` gains its entries in the same commit as the send path.**
   `src/lib/mailStatus.ts:55` says why: an entry added early puts a permanently
   empty row on the operator screen that reads as "no mail has gone out" rather
   than "this mail does not exist yet".
7. **Audit the reset**, not the request. A completed password change is a
   safeguarding-relevant account event (rule 16). A request is noise and an
   audit row per request is a log-flooding vector.

## One decision to make deliberately, not by default

`MagicToken` stores the raw token. For a password reset token, storing a **hash**
of the token (and looking up by hash) means a database read cannot be replayed into
an account takeover. That is the stronger position and it is cheap here.

The counter-argument is consistency with the parent flow, and that a second pattern
in the same codebase invites confusion.

Decide it explicitly, write the reasoning into the model's schema comment, and if
you choose hashing, say in `FINDINGS.md` whether `MagicToken` should follow later.
Do not just copy the parent flow because it is there.

## Deliverables

- Prisma model + migration for the teacher password token
- `requestPasswordReset` and `setPassword` server actions
- A request page (email form) and a token-consuming set-password page, matching the
  visual and copy register of `src/app/login/teacher`
- `passwordResetEmail()` in `src/lib/emailTemplates.ts`, alongside the existing
  templates and using the same `shell()` / `button()` helpers
- Wire the **already-written** `staffInviteEmail()` to a real invite path so a
  teacher added to a school receives a set-password link
- Both new template keys in `MAIL_TEMPLATE_KEYS` and `MAIL_TEMPLATE_LABEL`
- A "Forgotten your password?" link on `/login/teacher` — the flow is worthless if
  it is not reachable from where the failure happens
- Tests, including: neutral response for an unknown address; link absent from the
  production response; token single-use; expired token refused; sessions destroyed
  on password change; rate limit engages
- `FINDINGS.md` entry F61

## What "done" means

`npm run check` green, the persona battery green, and one cold run where a teacher
who does not know their password gets back into their account without the owner
touching a terminal. That last one is the actual acceptance test — the pilot
teachers are the reason this exists.

## Explicitly out of scope

Operator password reset (`Operator` / `OperatorSession` are a separate space with
their own handbook), parent password reset (parents have no password — they have
family codes and magic links), and any change to the sign-in error copy, which was
settled by the error-string audit.
