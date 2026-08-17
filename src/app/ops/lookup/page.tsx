import { requireOperator } from "@/lib/ops/session";
import { OpsBar, OpsFootnote } from "../shell";
import { LookupForm } from "./forms";

// Find one adult account by its exact email address.
//
// This is the whole of "search" in the operator area, and its shape is the
// control (handbook ruling R11). An exact match on a unique column can only
// find an address somebody already holds: there is no substring match, no
// browse, no list and no endpoint that could later be pointed at a child's
// name. Every lookup is recorded with the address searched for and the reason
// given, and the record is written by the same function that does the read.
//
// A parent's address comes back masked (owner amendment C4). Revealing one in
// full is a named operation with its own reason and its own audit row, and
// named operations arrive with the frozen registry in a later PR, so this
// screen says so rather than leaving the operator to wonder.

export const dynamic = "force-dynamic";

// No title. See the note in src/app/ops/page.tsx: metadata is rendered even for
// a page that answers notFound(), so a title names the area to a stranger.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function OpsLookupPage() {
  await requireOperator();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/lookup" />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Find an adult
        </h1>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          A member of school staff, or a parent or carer who has an account. You need their whole
          email address: nothing here searches for part of one, and nothing here can search for a
          child.
        </p>
        <LookupForm />
      </main>
      <OpsFootnote />
    </div>
  );
}
