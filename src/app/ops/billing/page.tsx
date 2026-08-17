import type { ReactNode } from "react";
import { requireOperator } from "@/lib/ops/session";
import { listBilling } from "@/lib/ops/reads";
import { MIN_CELL, type BillingRowDto } from "@/lib/ops/dto";
import { OpsBar, OpsFootnote } from "../shell";

// What each school is paying, what it is on, and the way through to Stripe.
//
// THIS SCREEN CHANGES NOTHING, AND THAT IS THE DESIGN
//
// Owner decision D6, 17 August 2026, recorded in docs/ops-architecture.md:
// manual payment recording is dropped from v1. The reasoning is worth repeating
// where somebody might otherwise think it an omission. Storyjar's Subscription
// row is a MIRROR of Stripe, written by the webhook at
// src/app/api/stripe/webhook/route.ts. A "mark this school as paid" button
// would write a value that the next Stripe event overwrites, without saying so,
// and the operator would have gone away believing the school was sorted. A
// control that silently reverts is worse than no control, because somebody will
// trust it.
//
// So there is no form on this page, no button, and no field to type into. The
// only thing to do here is read, and then go to Stripe. The copy says that out
// loud rather than leaving the absence to be discovered.
//
// WHY IT IS SEPARATE FROM /ops/schools
//
// The schools list is the register: who is signed up, when, how many staff. It
// deliberately links nowhere at all, and that property is asserted in the
// blocking spec. This screen is the money, sorted by what needs attention
// rather than by when a school joined, and it is the one place in the operator
// area that links out. Keeping them apart means the register can go on being
// provably link-free.
//
// WHAT IS NOT HERE, on purpose
//
//   - No exact headcount below the suppression threshold. The band is what
//     billing needs and the band never needs the exact number.
//   - No class names and no per-class figures. A class of one names that child.
//   - No invoice amounts, no card details, no payment history. Storyjar holds
//     none of those; Stripe does, which is where the link goes.
//   - No free teacher plans. A free plan has no price, no band and no Stripe
//     customer.

export const dynamic = "force-dynamic";

// No title, for the reason given at length in src/app/ops/page.tsx: Next
// renders a page's metadata even when the page itself answers notFound(), so a
// title travels out in the 404 body and names the area to anybody who asks.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// `value` rather than the obvious React prop name: the blindness gate refuses
// the identifier `children` anywhere under the ops roots, because on a Parent it
// is the linked-children relation ruling R11 bans. See src/app/ops/shell.tsx.
function Fact({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div className="py-1">
      <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
        {term}
      </dt>
      <dd style={{ color: "var(--ink)" }}>{value}</dd>
    </div>
  );
}

// The one outbound link in the operator area.
//
//   rel="noreferrer" is not decoration. Without it the browser sends the ops
//   URL to Stripe in the Referer header, which hands a third party the path of
//   an area that answers 404 to everybody else and is named nowhere public.
//   noopener rides along with noreferrer in every current browser and is stated
//   anyway, because a rule you can read is worth more than one you have to know.
//
//   The link text names the destination, the object and the fact that it leaves
//   Storyjar, so it makes sense read out of context by a screen reader and
//   nobody has to hover to find out where a bare id goes.
function StripeLink({ what, id, href }: { what: string; id: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      style={{
        color: "var(--ink)",
        textDecoration: "underline",
        textUnderlineOffset: "4px",
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        overflowWrap: "anywhere",
      }}
    >
      Open {what.toLowerCase()} {id} in Stripe (leaves Storyjar, opens in a new tab)
    </a>
  );
}

function BillingCard({ row }: { row: BillingRowDto }) {
  return (
    <li className="card p-5">
      <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
        {row.schoolName}
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Fact
          term="Registration"
          value={row.billing ? row.billing.registrationLabel : "No subscription record"}
        />
        <Fact
          term="Payment"
          value={row.billing ? row.billing.statusLabel : "Nothing has been set up to pay"}
        />
        <Fact term="Price band" value={`${row.band.label}, ${row.band.priceLabel}`} />
        <Fact term="On roll" value={row.pupils.label} />
        {row.billing?.trialEndsAt ? (
          <Fact term="Trial ends" value={row.billing.trialEndsAt} />
        ) : null}
        {row.billing?.currentPeriodEnd ? (
          <Fact term="Paid until" value={row.billing.currentPeriodEnd} />
        ) : null}
        {row.billing?.frozenAt ? <Fact term="Went read-only" value={row.billing.frozenAt} /> : null}
      </dl>
      <div className="mt-3">
        {row.stripe.absence ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {row.stripe.absence}
          </p>
        ) : (
          <ul>
            {row.stripe.links.map((link) => (
              <li key={link.href}>
                <StripeLink what={link.what} id={link.id} href={link.href} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default async function OpsBillingPage() {
  await requireOperator();
  const view = await listBilling();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/billing" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Billing
        </h1>
        <p className="mt-2" style={{ color: "var(--ink)" }}>
          Anything unpaid or lapsed is at the top. Everything on this page is a copy of what Stripe
          says, kept up to date by Stripe itself.
        </p>
        <p className="mt-2" style={{ color: "var(--ink)" }}>
          <strong>Nothing here can be changed.</strong> There is deliberately no way to record a
          payment or mark a school as paid, because Stripe would overwrite it at the next update
          without saying so, and you would have walked away thinking the school was sorted. To change
          what a school pays, or to chase a failed payment, do it in Stripe.
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          {view.stripeStatement} The price band is worked out on the server from the number of pupils
          on roll, and an exact number is shown only where there are at least {MIN_CELL} of them,
          because a very small number beside a school name starts to describe particular children.
        </p>

        {view.rows.length === 0 ? (
          <p className="mt-6" style={{ color: "var(--ink)" }}>
            No schools are registered yet, so there is nothing to bill.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4">
            {view.rows.map((row) => (
              <BillingCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </main>
      <OpsFootnote />
    </div>
  );
}
