import type { ReactNode } from "react";
import { requireOperator } from "@/lib/ops/session";
import { listSchools } from "@/lib/ops/reads";
import { MIN_CELL, type SchoolRowDto } from "@/lib/ops/dto";
import { OpsBar, OpsFootnote } from "../shell";

// Every registered school, with what it is paying, what band it is in, and how
// many children are on roll.
//
// WHY THIS IS A LIST OF CARDS AND NOT A TABLE
//
// Six columns at a 390px phone width is either a horizontal scroll or four
// unreadable characters per column, and the operator reads this on a phone. A
// card per school with a labelled description list carries the same facts,
// wraps naturally, needs no scroll container, and reads the same to a screen
// reader as it does to an eye. With a hundred schools this becomes a table with
// a scroll region; with three it would be scaffolding.
//
// WHAT IS NOT ON THIS SCREEN, on purpose
//
//   - No class names and no per-class figures. A class of one names that child.
//   - No exact headcount below the suppression threshold. The band is what
//     billing needs and the band never needs the exact number.
//   - No row link into anything. A number here is a number, not a way in.
//   - No search box. There is no free-text search endpoint anywhere in this
//     area, because a search endpoint is a thing somebody later points at a
//     child's name.

export const dynamic = "force-dynamic";

// No title, for the reason given at length in src/app/ops/page.tsx: Next
// renders a page's metadata even when the page itself answers notFound(), so a
// title travels out in the 404 body and names the area to anybody who asks.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// `value` rather than the obvious React prop name: the blindness gate refuses
// the identifier `children` anywhere under the ops roots, because on a Parent
// it is the linked-children relation ruling R11 bans. See src/app/ops/shell.tsx.
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

function SchoolCard({ row }: { row: SchoolRowDto }) {
  return (
    <li className="card p-5">
      <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
        {row.schoolName}
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Fact term="Registered" value={row.createdAt} />
        <Fact term="Staff accounts" value={row.staffCount} />
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
    </li>
  );
}

export default async function OpsSchoolsPage() {
  await requireOperator();
  const schools = await listSchools();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/schools" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Schools
        </h1>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          Every registered school, newest first. The price band is worked out on the server from the
          number of pupils on roll. An exact number is shown only where there are at least {MIN_CELL}{" "}
          of them, because a very small number beside a school name and a date starts to describe
          particular children.
        </p>

        {schools.length === 0 ? (
          <p className="mt-6" style={{ color: "var(--ink)" }}>
            No schools are registered yet.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4">
            {schools.map((row) => (
              <SchoolCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </main>
      <OpsFootnote />
    </div>
  );
}
