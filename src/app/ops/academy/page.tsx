import type { ReactNode } from "react";
import { requireOperator } from "@/lib/ops/session";
import { OpsBar, OpsFootnote } from "../shell";
import {
  ACADEMY_DOMAIN,
  ACADEMY_MANAGER_EMAIL,
  ACADEMY_SCHOOL_NAME,
  academyClasses,
} from "./roster";

// StoryJar Academy: the addresses and codes that get you into the sandbox.
//
// WHY THIS SCREEN EXISTS
//
// Publishing to the shared activity library happens in an ordinary teacher
// account, on the real canvas, at the one school with School.canPublishToLibrary
// set. That is the right architecture and it has one practical hole in it: the
// person who needs to do it is signed in HERE, and the addresses they need were
// written down in docs/TEST_LOGINS.md, which is not open at half past four.
// This is that page, in the product.
//
// IT READS NOTHING, AND THAT IS THE POINT
//
// Every string on it is derived in ./roster.ts from the same two lists the seed
// script uses. Nothing is queried, because nothing here COULD be queried: Class
// is aggregate-only under the blindness gate, the sign-in code column is a
// denied credential identifier and classId is a child scope key. An operator
// screen that could look up a class list is the widening PR4 refused. A
// reference card for a fictional school StoryJar owns is not that.
//
// THE PASSWORD IS NOT HERE AND WILL NOT BE
//
// These are real sign-ins to a live school. seed-academy.mjs refuses to run
// without ACADEMY_PASSWORD and ships no default for the same reason: a password
// in the repository is a published credential (SAFEGUARDING rule 12). Its own
// header already says what this screen does — "the operator console lists the
// addresses only".

export const dynamic = "force-dynamic";

// No title, for the reason src/app/ops/page.tsx sets out in full: Next renders
// a page's metadata even when the page answers notFound(), so a title naming
// the area travels out in the 404 body (ruling R17).
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// `value`, not the obvious React prop name: the gate refuses the identifier
// `children` anywhere under the ops roots. See src/app/ops/shell.tsx.
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

export default async function OpsAcademyPage() {
  await requireOperator();
  const classes = academyClasses();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/academy" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          {ACADEMY_SCHOOL_NAME}
        </h1>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          The school StoryJar works in. Sixteen classes, nursery to year 6, and around 440 fictional
          pupils. It is an ordinary tenant, scoped exactly like a real school, so a fault you chase
          here lives in the same code path a school would hit. It is also the only school allowed to
          publish to the shared activity library.
        </p>

        <section className="card mt-6 p-5">
          <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            Signing in
          </h2>
          <p className="mt-2" style={{ color: "var(--ink)" }}>
            These accounts are separate from this console. Signing in to one of them does not sign
            you out of here, and this console cannot sign you in to one of them &mdash; you type the
            address and the password yourself, in the ordinary way a teacher does.
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Fact
              term="Staff"
              value={
                <a href="/login/teacher" style={{ textDecoration: "underline" }}>
                  storyjar.co.uk/login/teacher
                </a>
              }
            />
            <Fact
              term="Pupil view"
              value={
                <a href="/login/student" style={{ textDecoration: "underline" }}>
                  storyjar.co.uk/login/student
                </a>
              }
            />
          </dl>
          <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            <strong>The password is not on this screen and is not in the repository.</strong> One
            password is shared by every Academy account and it lives in the password manager. It is
            set when <code>scripts/ops/seed-academy.mjs</code> is run and can be changed only by
            running it again.
          </p>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            School Manager
          </h2>
          <p className="mt-2" style={{ color: "var(--ink)" }}>
            The ADMIN account. Use it to see exactly the controls a real school&rsquo;s business
            manager sees &mdash; billing, staff, the register &mdash; rather than an approximation of
            them.
          </p>
          <dl className="mt-3">
            <Fact term="Address" value={<code>{ACADEMY_MANAGER_EMAIL}</code>} />
          </dl>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            Class teachers
          </h2>
          <p className="mt-2" style={{ color: "var(--ink)" }}>
            One account per class. Sign in as any of them to build an activity on the real canvas and
            publish it to the library. The six-character code is what a pupil types on the pupil
            sign-in screen before tapping their own name.
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
            Every address and code below is worked out from the naming scheme in
            <code> scripts/ops/seed-academy.mjs</code>, not read from the database. If the Academy
            has not been seeded in this environment, none of them will sign in.
          </p>
          <div className="mt-4 overflow-x-auto">
            {/* aria-label rather than the table element that would normally
                carry this: its tag name is a denied identifier under the ops
                roots, because on a JournalItem the same word is a child's own
                words about their work. The accessible name is identical. */}
            <table
              aria-label={`The sixteen ${ACADEMY_SCHOOL_NAME} classes, each with its teacher's sign-in address and the code a pupil types`}
              className="w-full text-left"
              style={{ color: "var(--ink)", borderCollapse: "collapse" }}
            >
              <thead>
                <tr>
                  <th scope="col" className="py-2 pe-4 text-sm font-bold">
                    Class
                  </th>
                  <th scope="col" className="py-2 pe-4 text-sm font-bold">
                    Age mode
                  </th>
                  <th scope="col" className="py-2 pe-4 text-sm font-bold">
                    Teacher signs in as
                  </th>
                  <th scope="col" className="py-2 text-sm font-bold">
                    Pupils type
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes.map((row) => (
                  <tr key={row.signInCode} style={{ borderTop: "1px solid var(--rule, #ddd)" }}>
                    <th scope="row" className="py-2 pe-4 font-normal">
                      {row.className}
                    </th>
                    <td className="py-2 pe-4">{row.ageMode}</td>
                    <td className="py-2 pe-4">
                      <code>{row.teacherEmail}</code>
                    </td>
                    <td className="py-2">
                      <code>{row.signInCode}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
            Every address is at <code>{ACADEMY_DOMAIN}</code>, which is StoryJar&rsquo;s own domain.
            No real school, no real teacher and no real child appears anywhere on this screen.
          </p>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            Seeding it
          </h2>
          <p className="mt-2" style={{ color: "var(--ink)" }}>
            The script is idempotent: the school upserts on its name, staff on their address, classes
            on their code, and a roll is added only to a class that has none. Running it twice
            changes nothing and never disturbs work left in the sandbox.
          </p>
          <pre
            className="mt-3 overflow-x-auto p-3 text-sm"
            style={{ background: "var(--ink)", color: "var(--paper)", borderRadius: 8 }}
          >
            <code>ACADEMY_PASSWORD=&apos;…&apos; node scripts/ops/seed-academy.mjs</code>
          </pre>
        </section>
      </main>
      <OpsFootnote />
    </div>
  );
}
