# Safeguarding review — subscription billing (Stripe)

Completed against the checklist in [`SAFEGUARDING.md`](../SAFEGUARDING.md). This
change touches **access control** (it adds the read-only FROZEN state), so the
checklist is mandatory.

## Summary

Adds Stripe subscription billing: a `Subscription` model governing write access,
a deny-by-default server-side gate (`requireWritableAccount()`) on every mutating
action, Stripe Checkout/Customer Portal (hosted — no card data on our servers,
no Stripe.js on any page), a signature-verified idempotent webhook, a
trial-expiry freeze job, and audited billing state transitions.

## Checklist

- [x] **Child data stays ownership-scoped, server-side.** No new/changed query
  returns child data. The write gate resolves the governing subscription by
  `teacherId` / `schoolId`, and for pupil-initiated writes via the class's own
  teacher (`requireWritableAccountForClass`). Existing child-data queries are
  unchanged and still scoped by `teacherId` / `classId` / parent link.
- [x] **No child content can reach anyone before teacher approval.** The approval
  queue is untouched. FROZEN is strictly *more* restrictive — it blocks creation
  and approval. No auto-publish or bypass added.
- [x] **No unnecessary personal data.** `Subscription` holds only Stripe IDs,
  billing status/dates, and a seat count. `BillingEvent` holds only an event id
  and type. No personal data, and **no child data**, on either.
- [x] **Uploaded media stays access-controlled.** The `/uploads` authorising
  route is unchanged. Reads (view/download/export) deliberately stay open in
  FROZEN so parents keep access to approved moments (RETENTION.md).
- [x] **Nothing stores/sends children's or account-holders' personal data outside
  the UK/EU.** Stripe receives **adult billing data only** (billing-contact name
  & email, or a school name). No child data is ever sent to Stripe. The residency
  of Stripe's billing processing is logged as an **open item for DPO review**
  (sub-processors page) before real payments are taken.
- [x] **New sub-processor listed & assessed.** Stripe added to the sub-processor
  list with purpose, the adult-billing-only data scope, and the data-residency
  open item. No analytics/advertising/profiling. DPA via Stripe's processor terms
  (to be countersigned by the DPO).
- [x] **Denies and leaks nothing on error/uncertainty.** `requireWritableAccount()`
  returns non-writable (`UNKNOWN`) whenever the subscription can't be resolved or
  read. The webhook rejects bad/missing signatures (400). Checkout/portal errors
  are generic; no other-user data appears in any response, log, or error.
- [x] **Deletion still removes rows *and* files.** Deletion actions
  (`deleteItem`, `deleteClass`, `removeStudent`) are deliberately left ungated so
  right-to-erasure stays available even in FROZEN. Nothing in this change deletes
  data — freezing is the only downgrade.
- [x] **Retention: no over-long storage, no undocumented category.** Billing
  records (subscription state + Stripe IDs + invoices/status) are covered by the
  existing 6-year billing-records entry in `RETENTION.md`, clarified in this PR.
  `frozenAt` starts the 12-month deletion clock exactly as the schedule requires.
  **(New retention checkbox — billing data category: 6-year retention. ✔)**
- [x] **Security headers / cookies / input handling unchanged or improved.** CSP
  stays strict — billing is hosted by Stripe via redirect, so no Stripe.js is
  embedded and `script-src` is untouched. **No new cookies** anywhere, and none
  on child-facing pages (PECR: essential cookies only). Mutations remain
  same-origin Server Actions (CSRF-resistant); the webhook verifies the Stripe
  signature. The only new route/rewrite is the public Apple Pay well-known file.
- [x] **Accessibility floor still met.** The billing page (teacher-only) uses
  labelled inputs, semantic headings, and `role="status"` notices; the frozen
  banner is `role="status"` text. No new child-facing UI.

## Notes for the DPO / open items

- Stripe data-residency assessment (billing processing region) — **open**.
- Counter-sign Stripe's data-processing terms; add to the DPA pack.
- No child data reaches Stripe: enforced by construction (customers carry only a
  teacher/school name & email; metadata carries internal ids only).
