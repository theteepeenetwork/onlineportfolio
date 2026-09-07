# Admin billing and class import

Built 19 August 2026. What the admin console's Billing tab and the
paste-a-class-list import do, and the decisions behind them. The safeguarding
review for the billing gate itself is
[`billing-safeguarding-review.md`](./billing-safeguarding-review.md); the
pricing reasoning is [`pricing-decisions.md`](./pricing-decisions.md).

## Paste a class list

`src/app/actions/classImport.ts` is one server action with two callers:

- a teacher on `/teacher/class`, next to "＋ New class";
- a school admin on `/admin` → Classes, with a "whose class is it?" picker.

Shared UI is `src/components/ImportClassForm.tsx`. It creates the class and its
children in one step, and `deriveChildNames` drops surnames.

Decisions:

- **Paste, never file upload.** A CSV would put a whole register (dates of
  birth, UPNs, surnames) on disk when only first names are kept.
- **No sessionStorage draft**, unlike the add-pupil box. A restored draft in a
  panel now pointed at a different teacher would file one class's children under
  another teacher, and that is the access control. It also stops a register
  sitting in a shared staffroom browser after an abandoned import.
- **The admin gets counts back only**, never the derived names, and never the
  class code, which belongs to the teacher who will use it (rule 5).
- Duplicate class names for the same teacher are refused.

## The admin Billing tab

`src/app/admin/BillingPane.tsx` replaced a one-line stub that showed a staff
count, which read as a seat count on a plan that has never had seats. The shape
is: where you stand, then what happens next, then the button that does it. The
band picker pre-selects the band the school's own roll falls into, card and
invoice/PO sit side by side, and the Stripe portal and billing contact follow.

Four bugs in pre-existing code were found and fixed while building it:

1. **Double-billing.** Buying again while a plan ran created a second Stripe
   subscription. Purchase controls now hide once a subscription is live, and
   both actions refuse when status is ACTIVE or PAST_DUE. FROZEN is deliberately
   still buyable, because a lapsed school must be able to buy its way back.
2. **No product path to a school plan.** `Subscription{kind:"SCHOOL"}` only ever
   came from a seed, so "buy the school plan" would have checked out against the
   admin's own FREE teacher row, naming the teacher as customer and covering
   nobody else. `ensureSchoolSubscription()` in `actions/billing.ts` creates it.
3. **The PO route could freeze mid-invoice.** `settleStatus` freezes a lapsed
   trial on local state alone, so a school raising a PO on day 40 of 42 went
   read-only while finance held the invoice. `requestSchoolInvoice` now writes
   `stripeSubscriptionId` and ACTIVE immediately instead of waiting for a
   webhook.
4. **The audit log named children to every admin.** `MOMENT_*` details read
   "Approved Poppy's moment" and the console showed them school-wide. They are
   redacted server-side in `admin/page.tsx` for any entry whose subject is a
   child, unless the reading admin is the actor. Who, what and when are still
   shown.

## Known gap: the bought band is not stored

`Subscription` has no `planKey` column, so the pane suggests a band by roll and
never claims to know the current one. A migration was written and then pulled
because `prisma generate` could not run on the mounted VM. It is worth adding
properly, because it is what lets a renewal reminder name the price.
