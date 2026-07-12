# Prompt: implement billing (Stripe + Apple Pay + Google Pay)

Copy everything below into a fresh agent session from the repo root.

---

Implement subscription billing for Storyjar using Stripe. Read `AGENTS.md`,
`SAFEGUARDING.md` and `RETENTION.md` **before writing any code** — they are
binding, and this change touches access control so the safeguarding review
checklist in `SAFEGUARDING.md` must pass. Also read the Next.js guides in
`node_modules/next/dist/docs/` before writing routes; this Next.js version has
breaking changes vs your training data.

## Subscription model (fixed — do not redesign)

**Individual teacher plan**
- £3.99/month or £40/year (GBP, VAT-inclusive pricing).
- The teacher pays personally, but the school remains the data controller:
  journals belong to the school context, never to the teacher's personal
  account (see "Individual vs school subscriptions" in `RETENTION.md`).

**School plan**
- £40 per teacher per year, seat-based (`School.seatLimit` is the seat count).
- Payable by card, or by invoice/PO via Stripe Invoicing with BACS — UK
  primary schools mostly cannot do recurring card payments.
- A teacher's existing individual subscription must be convertible to a school
  seat with pro-rata credit (cancel individual sub, credit unused time via a
  Stripe coupon/credit note, attach teacher to school subscription).

**Trial**
- Every new account gets 42 days free from signup ("free half term").
- No card required to start the trial. Do not use Stripe trials for this —
  track `trialEndsAt` locally and only create the Stripe subscription at
  first payment.

**Account states** (must match the table in `RETENTION.md`)
- `TRIAL` → full access.
- `ACTIVE` → full access.
- `PAST_DUE` → full access during Stripe smart-retry grace period (~14 days).
- `FROZEN` → read-only: viewing and downloading work; **all mutations blocked**
  except account management, data export, and deletion. Set `frozenAt` — the
  12-month deletion clock in `RETENTION.md` starts here.
- Nothing in this change deletes data. Freezing is the only downgrade.

## Payment methods

Use **Stripe Checkout** (hosted) for purchase and the **Stripe Customer
Portal** for plan changes/cancellation — this keeps card data entirely out of
our infrastructure (we store only Stripe IDs, never PANs).

- Enable Apple Pay and Google Pay in Checkout via automatic payment methods —
  they are payment methods inside Stripe, not separate integrations.
- Register the production domain for Apple Pay (Stripe dashboard domain
  association file at `/.well-known/apple-developer-merchantid-domain-association`
  — serve it statically).
- Currency GBP only.

## Schema changes (Prisma)

Add a `Subscription` model rather than overloading `School`:
`id, kind (INDIVIDUAL|SCHOOL), status (TRIAL|ACTIVE|PAST_DUE|FROZEN),
stripeCustomerId?, stripeSubscriptionId?, trialEndsAt, frozenAt?, seatLimit?,
currentPeriodEnd?`, linked to either a `Teacher` (individual) or a `School`
(school plan). Replace the placeholder `School.plan` string. Keep
`School.seatLimit` semantics on the school subscription. Update `prisma/seed.ts`
so demo accounts are seeded as `TRIAL` with a future `trialEndsAt`.

## Enforcement (safeguarding-critical)

- One server-side helper, e.g. `requireWritableAccount()`, called at the top of
  **every** server action / route that mutates data (uploads, moment creation,
  approval, student/class/assignment CRUD, parent linking). Deny by default:
  if subscription state cannot be determined, refuse (SAFEGUARDING rule 8).
- Never gate on the client alone. UI shows a frozen banner with
  resubscribe/export links, but the server is the enforcement point.
- Read paths (viewing, media serving, downloads/export) stay open in `FROZEN` —
  parents keep access to approved moments per `RETENTION.md`.
- Audit-log every billing state transition (who/what/when) — these are
  accountability events under SAFEGUARDING rule 16.

## Webhooks

`/api/stripe/webhook` route: verify signature with `STRIPE_WEBHOOK_SECRET`,
handle idempotently (store processed event IDs):
- `checkout.session.completed` → activate subscription.
- `invoice.paid` → set `ACTIVE`, update `currentPeriodEnd`.
- `invoice.payment_failed` → set `PAST_DUE`.
- `customer.subscription.updated` → sync status/seat changes.
- `customer.subscription.deleted` → set `FROZEN`, stamp `frozenAt`.
A daily job (or on-request check) also freezes accounts whose `trialEndsAt`
passed with no subscription.

## Hard constraints

- **No child data ever reaches Stripe.** Customer records carry only teacher
  name/email or school name. No child names in metadata, descriptions, or
  invoice line items.
- Stripe becomes a sub-processor: add it to the sub-processor list with a note
  that it processes **adult billing data only** (SAFEGUARDING rule 11 — the
  UK/EU-only rule applies to personal data of children and account holders;
  document the Stripe data-residency assessment as an open item for DPO
  review).
- Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs) from env
  vars only; add them to `.env.example`, never commit values.
- No Stripe.js on pages children use (class-code login and child journal
  views) — billing UI lives only in teacher/admin areas. No new cookies on
  child-facing pages (PECR: essential cookies only).
- Do not weaken session, CSRF, or header behaviour described in
  `SAFEGUARDING.md` section F.

## Pricing config

Create prices in Stripe (test mode) and reference by env var:
`STRIPE_PRICE_INDIVIDUAL_MONTHLY` (£3.99/mo), `STRIPE_PRICE_INDIVIDUAL_ANNUAL`
(£40/yr), `STRIPE_PRICE_SCHOOL_SEAT_ANNUAL` (£40/seat/yr, quantity = seats).
Document in the README how to create them with the Stripe CLI.

## Deliverables

1. Prisma schema migration + updated seed.
2. Checkout + Customer Portal integration (individual monthly/annual, school
   seat-based, invoice option for schools).
3. Webhook route with signature verification and idempotency.
4. `requireWritableAccount()` enforcement wired into every mutating action,
   plus frozen-state UI banner.
5. Trial-expiry freeze job.
6. Audit-log entries for billing transitions.
7. Playwright tests: trial account can upload; frozen account is blocked
   server-side from every mutation but can view/download; webhook state
   transitions (use Stripe CLI fixtures/mocks); no child-facing page loads
   Stripe.js.
8. A filled-in safeguarding review checklist (from `SAFEGUARDING.md`) in the
   PR description, including the new retention checkbox — billing adds a data
   category (billing records: 6-year retention per `RETENTION.md`).

Work in small commits. If any safeguarding rule conflicts with a Stripe
convenience, the rule wins — stop and flag it rather than working around it.
