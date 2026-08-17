import type { ReactNode } from "react";
import { requireOperator } from "@/lib/ops/session";
import { readMailStatus } from "@/lib/ops/reads";
import type { MailWindowDto, MailTemplateTotalsDto } from "@/lib/ops/dto";
import { OpsBar, OpsFootnote, type OpsPath } from "../shell";

// Whether Storyjar's mail is going out, in numbers that describe the system
// rather than anybody using it (PR5, handbook ruling R9).
//
// WHAT IS ON THIS SCREEN
//
//   Today and the last seven days: how many sign-in emails were attempted, how
//   many Mailjet accepted, how many failed and why, in coarse classes.
//   How many addresses Mailjet is currently refusing, as counts by state.
//   When Storyjar last checked that, and how long ago that was.
//
// WHAT IS NOT, on purpose
//
//   - No recipient and no domain, because none is stored. A visible list of
//     sign-in failures by address would rebuild inside Storyjar the
//     account-enumeration signal FINDINGS F6 withholds from the public form:
//     the form answers the same way for an address on file and one that is
//     not, and a failure list answers the question it refuses to.
//   - No per-school split. It would need the recipient. Said in words on the
//     screen rather than left as a gap somebody later "fixes".
//   - No subject and no body, ever. A sign-in email body carries a live token,
//     so a code path that could persist one is a token-disclosure bug.
//   - No list of suppressed addresses, only counts. That list is a list of
//     adults locked out of their children's work.
//   - No export, no CSV, no search box, no controls at all (handbook section 6
//     item 10). Nothing here can be changed from here: unblocking an address is
//     an operation against a named adult record, not a button on a dashboard.
//   - No dot, no badge, no traffic light. Every state is a sentence (section 6
//     item 8), which is also the only way it survives being read out on a phone
//     call at ten to nine.

export const dynamic = "force-dynamic";

// No title, for the reason set out at length in src/app/ops/page.tsx: Next
// renders a page's metadata even when the page answers notFound(), so a title
// travels out in the 404 body and names the area to anybody who asks.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

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

function TemplateRow({ row }: { row: MailTemplateTotalsDto }) {
  return (
    <li className="mt-4">
      <h3 className="font-bold" style={{ color: "var(--ink)" }}>
        {row.label}
      </h3>
      <dl className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-3">
        <Fact term="Attempted" value={row.attempted} />
        <Fact term="Accepted by Mailjet" value={row.accepted} />
        <Fact term="Failed" value={row.failed} />
      </dl>
      {row.unconfigured > 0 ? (
        <p className="mt-2" style={{ color: "var(--ink)" }}>
          {row.unconfigured} attempt(s) were never made at all, because Storyjar had no Mailjet
          credentials at the time. That is the failure nothing else notices: no attempt reaches the
          provider, so there is no bounce and no error there to find.
        </p>
      ) : null}
      {row.failureReasons.length > 0 ? (
        <ul className="mt-2 list-disc ps-5" style={{ color: "var(--ink)" }}>
          {row.failureReasons.map((reason) => (
            <li key={reason.label}>
              {reason.label}: {reason.count}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function WindowCard({ period }: { period: MailWindowDto }) {
  return (
    <li className="card p-5">
      <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
        {period.label}
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
        {period.rangeLabel}
      </p>
      {/* The verdict is a sentence and it is the first thing after the heading,
          because it is the only line most readings of this page need. */}
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        {period.verdictLabel}
      </p>
      <ul>
        {period.byTemplate.map((row) => (
          <TemplateRow key={row.templateKey} row={row} />
        ))}
      </ul>
    </li>
  );
}

export default async function OpsMailPage() {
  await requireOperator();
  const status = await readMailStatus();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/mail" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Mail
        </h1>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          {status.acceptedStatement}
        </p>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          {status.scopeStatement}
        </p>

        <ul className="mt-6 grid gap-4">
          {status.windows.map((period) => (
            <WindowCard key={period.label} period={period} />
          ))}
        </ul>

        <section className="card mt-4 p-5">
          <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            Addresses Mailjet is refusing
          </h2>
          <p className="mt-2" style={{ color: "var(--ink)" }}>
            {status.suppression.statement}
          </p>
          {status.suppression.monitored ? (
            <dl className="mt-3 grid gap-x-6 gap-y-1">
              <Fact term="Total" value={status.suppression.total} />
              {status.suppression.states.map((state) => (
                <Fact key={state.state} term={state.label} value={state.count} />
              ))}
            </dl>
          ) : null}
        </section>

        <section className="card mt-4 p-5">
          <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
            When Storyjar last checked
          </h2>
          {status.lastCheck ? (
            <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Fact term="Last run" value={status.lastCheck.startedAt} />
              <Fact term="That was" value={status.lastCheck.ageLabel} />
              <Fact term="Outcome" value={status.lastCheck.outcomeLabel} />
              <Fact term="Addresses seen" value={status.lastCheck.itemsAffected} />
              {status.lastCheck.note ? (
                <Fact term="What it said" value={status.lastCheck.note} />
              ) : null}
            </dl>
          ) : (
            <p className="mt-2" style={{ color: "var(--ink)" }}>
              Never. Nothing has run the check against Mailjet on this deployment, so the counts
              above are what Storyjar has never looked for rather than what it did not find. The
              check is <code>npm run mail:suppression-sync</code> and it has no schedule yet.
            </p>
          )}
          <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            A check that quietly stops running produces no error at all, so its age is the signal
            rather than its result. There is no alerting attached to any of this: nothing on this
            page will tell you it has gone wrong, and an alert delivered by the mail provider that
            is failing would not be an alert in any case.
          </p>
        </section>

        <p className="mt-6 text-sm" style={{ color: "var(--ink-soft)" }}>
          Nothing here can be changed. Storyjar cannot unblock an address from this page, and there
          is no list to search: the only way to ask about one family is to look their adult up under
          Find an adult, which records who asked and why.
        </p>
      </main>
      <OpsFootnote />
    </div>
  );
}
