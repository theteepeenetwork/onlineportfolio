import Link from "next/link";
import { IDLE_LIFETIME_MINUTES, requireOperator } from "@/lib/ops/session";
import { readMailStatus } from "@/lib/ops/reads";
import { OpsBar, OpsFootnote } from "./shell";

// The way in, and the index of what there is. PR1 built identity and left this
// page empty; PR2 adds the two read-only screens it now points at, which arrive
// after the guard rather than before it, so that no screen is ever written in a
// week when the guard did not exist.
//
// What this page is FOR is proving the guard. Signed in, it renders. Signed out,
// with a teacher's cookie, with a pre-code half-session, or with the kill switch
// off, it is a 404 — not a 403, not a redirect to a page that names the area
// (ruling R17). That pair, on the same URL with two different sessions, is the
// positive control the whole battery convention asks for.

export const dynamic = "force-dynamic";

// Not annotated with Next's `Metadata` type on purpose: importing it would put
// the bare package "next" on the ops import allowlist, and a widening bought
// for a type annotation is a widening bought for nothing. The shape is checked
// by `tsc --noEmit` against the route's generated types either way.
//
// NO TITLE HERE, and that is not an oversight. Next renders a page's metadata
// even when the page itself throws notFound(), so a `title: "Operations"`
// travelled out in the 404 body and named the area to anybody who asked for the
// URL — the exact thing ruling R17 forbids. Verified against `next start`, not
// only in dev: `curl /ops` while signed out returned 404 with the word
// "Operations" in the payload until this was removed. The page inherits the
// site title instead, and the heading below is only ever rendered to somebody
// who is already through the door. The blocking spec asserts the 404 body does
// not contain it.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function OpsConsolePage() {
  await requireOperator();

  // readMailStatus() calls requireOperator() a second time internally — that
  // is fine and deliberate: each read is a self-contained unit that does not
  // rely on a guard in an ancestor. The page guard above remains the canonical
  // one for this route.
  const mailStatus = await readMailStatus();
  const todayVerdict = mailStatus.windows[0];

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 space-y-4">
        {/* Mail verdict tile — F30 render half. The sentence comes from
            readMailStatus().windows[0].verdictLabel, which already contains the
            complete, closed-vocabulary verdict. No colour, badge or icon: a
            delivery state shown as a coloured dot fails handbook section 6
            item 8. The detail screen (/ops/mail) is linked for the operator
            who wants the breakdown. */}
        <div className="card p-6">
          <h2 className="font-display text-lg" style={{ color: "var(--ink)" }}>
            Mail — {todayVerdict.label}
          </h2>
          <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
            {todayVerdict.verdictLabel}
          </p>
          <p className="mt-3 text-sm">
            <Link
              href="/ops/mail"
              style={{
                color: "var(--ink)",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              See the full mail screen for the 7-day breakdown and suppression counts
            </Link>
          </p>
        </div>

        <div className="card p-6">
          <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
            Operations
          </h1>
          <p className="mt-3" style={{ color: "var(--ink-soft)" }}>
            The mail tile above is a live feed. Deploys, backups and cron runs do not yet have one:
            a tile with no feed would be a green light nobody is entitled to. They arrive later,
            each one saying where its number came from.
          </p>
          <ul className="mt-4 list-disc ps-5" style={{ color: "var(--ink)" }}>
            <li>
              <strong>Schools</strong> lists every registered school with what it pays, the band it
              is in, and how many pupils are on roll.
            </li>
            <li>
              <strong>Billing</strong> shows what each school is on and what it owes, with anything
              unpaid or lapsed at the top and a way through to Stripe. It changes nothing: Stripe is
              where a payment is recorded.
            </li>
            <li>
              <strong>Find an adult</strong> looks one member of staff or one parent up by their
              exact email address, and records why you looked.
            </li>
          </ul>
          <p className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
            You are signed out automatically after {IDLE_LIFETIME_MINUTES} minutes without using
            this page, and after 8 hours whatever happens. Nothing here holds unsaved work.
          </p>
        </div>
      </main>
      <OpsFootnote />
    </div>
  );
}
