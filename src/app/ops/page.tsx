import { IDLE_LIFETIME_MINUTES, requireOperator } from "@/lib/ops/session";
import { opsSignOut } from "@/app/actions/ops/session";

// The console, empty on purpose. PR1 builds identity and nothing else: the
// screens that show schools, subscriptions and adult accounts are PR2 onwards,
// and they arrive after the guard rather than before it, so that no screen is
// ever written in a week when the guard did not exist.
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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="card p-6">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Operations
        </h1>
        <p className="mt-3" style={{ color: "var(--ink-soft)" }}>
          Nothing is built here yet. This page exists so that the way in can be tested before there is
          anything to see: reaching it took a password and a code from an authenticator app, and every
          other way of reaching it answers &ldquo;not found&rdquo;.
        </p>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
          You are signed out automatically after {IDLE_LIFETIME_MINUTES} minutes without using this page,
          and after 8 hours whatever happens. Nothing here holds unsaved work.
        </p>
        <form action={opsSignOut} className="mt-6">
          <button className="btn-ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
