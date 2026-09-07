import Link from "next/link";
import { requireOperator } from "@/lib/ops/session";
import { listLibrary } from "@/lib/ops/reads";
import type { SharedLibraryRowDto } from "@/lib/ops/dto";
import { OpsBar, OpsFootnote } from "../shell";

// StoryJar's own activity library, and how much of it teachers are actually
// taking.
//
// WHY THERE IS NOTHING TO PRESS ON THIS SCREEN
//
// Publishing is not an operator operation and is deliberately not in the
// registry. An activity is authored in an ordinary teacher account at StoryJar
// Academy, on the real canvas, and published from there — see /ops/academy for
// the addresses. Withdrawing it happens in the same place, by the same person,
// looking at the same thing a teacher would see.
//
// The alternative, a publish button here, would have meant an operator screen
// that can write a payload column and copy a file, which is four widenings of
// the blindness gate to move a job that has nothing to do with schools or
// children into the one area built to be blind to both.
//
// WHAT THIS SCREEN IS FOR, then: noticing. That an activity was promoted and
// never made visible. That nobody has taken the one written for reception.
// That the library has not been added to since March. None of those are visible
// from inside a teacher account, because a teacher sees only what is published
// and only their own copies.

export const dynamic = "force-dynamic";

// No title, for the reason src/app/ops/page.tsx gives in full: Next renders a
// page's metadata even when the page answers notFound(), so a title naming the
// area travels out in the 404 body (ruling R17).
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

function Row({ row }: { row: SharedLibraryRowDto }) {
  return (
    <li className="card p-5">
      <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
        {row.title}
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div className="py-1">
          <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Visible to teachers
          </dt>
          <dd style={{ color: "var(--ink)" }}>
            {row.published ? "Yes" : "No — promoted but never made visible"}
          </dd>
        </div>
        <div className="py-1">
          <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Copies taken
          </dt>
          <dd style={{ color: "var(--ink)" }}>
            {row.copyCount === 1 ? "1 teacher has added it" : `${row.copyCount} teachers have added it`}
          </dd>
        </div>
        <div className="py-1">
          <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Reference
          </dt>
          <dd style={{ color: "var(--ink)" }}>
            <code>{row.slug}</code>
          </dd>
        </div>
        <div className="py-1">
          <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Order
          </dt>
          <dd style={{ color: "var(--ink)" }}>{row.sortOrder}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function OpsLibraryPage() {
  await requireOperator();
  const rows = await listLibrary();

  const visible = rows.filter((row) => row.published).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/library" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Library
        </h1>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          The activities StoryJar publishes, in the order a teacher sees them, and how many teachers
          have taken a copy of each. A copy is a full copy, files included, so it neither changes nor
          breaks when the original does.
        </p>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          Nothing here can be changed from this console. Activities are written and published in an
          ordinary teacher account at StoryJar Academy, on the same canvas a teacher uses.{" "}
          <Link href="/ops/academy" style={{ textDecoration: "underline" }}>
            The addresses are on the Academy screen.
          </Link>
        </p>

        {rows.length === 0 ? (
          <p className="mt-6" style={{ color: "var(--ink)" }}>
            The library is empty. Nothing has been published in this environment.
          </p>
        ) : (
          <>
            <p className="mt-6 text-sm" style={{ color: "var(--ink-soft)" }}>
              {rows.length === 1 ? "1 activity" : `${rows.length} activities`}, {visible} visible to
              teachers.
            </p>
            <ul className="mt-3 grid gap-4">
              {rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </ul>
          </>
        )}
      </main>
      <OpsFootnote />
    </div>
  );
}
