// ---------------------------------------------------------------------------
// Node.js-only half of the instrumentation hook (F31 — in-app mail suppression
// scheduler).
// ---------------------------------------------------------------------------
//
// WHY THIS IS A SEPARATE FILE
//
// Next.js compiles `src/instrumentation.ts` for BOTH runtimes. A
// `process.env.NEXT_RUNTIME` check inside `register` stops the scheduler from
// *running* under Edge, but it does not stop the bundler from *tracing* the
// imports underneath it, so `node:crypto` (via @/lib/mailSuppressionSync) was
// still pulled into the Edge instrumentation bundle and every compile logged
// "A Node.js module is loaded ('node:crypto') which is not supported in the
// Edge Runtime" followed by "Ecmascript file had an error".
//
// The documented fix is to put the runtime-specific code in its own module and
// import it from inside the guard — see
// node_modules/next/dist/docs/01-app/02-guides/instrumentation.md
// ("Importing runtime-specific code"). Nothing in this file is reachable from
// the Edge bundle, so the Node-only imports are safe here.
//
// WHY AN IN-APP SCHEDULER AND NOT A RAILWAY CRON SERVICE
//
// The suppression sync reads from Mailjet and writes to the SQLite database on
// the Railway volume. The volume is mounted to the web service only; a separate
// Railway cron service cannot reach it. Option 1 (launch-triage.md §Platform)
// is therefore the only option that does not require a new inbound endpoint and
// a new shared secret. The web process already has everything it needs.
//
// DOUBLE-FIRE ON ROLLING RESTART
//
// Railway performs rolling restarts: a new instance starts before the old one
// stops, so for a short window two processes are running. The sync writes a
// JobRun on every run. A second run in the same window writes a second JobRun
// and calls Mailjet twice, which is redundant but not harmful — the upserts are
// idempotent and the Mailjet quota for a once-daily poll at pilot volume is not
// a concern. The alternative, a distributed lock over SQLite, would be more
// complex than the problem it solves. The operator screen shows the last-run
// time, and a gap of a few seconds between two runs is not meaningful there.
//
// INTERVAL CHOICE
//
// 24 hours. Tighter polling buys nothing: the signal is already a day-bucket
// (MailCounter is keyed by UTC day) and Mailjet's message list is a retrospective
// view rather than a live event stream. The screen states it is a daily figure.
//
// NEVER THROWS
//
// A scheduler that crashes the server on startup because Mailjet is down is
// worse than no scheduler. All errors are caught in `runMailSuppressionSync`.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { runMailSuppressionSync } from "@/lib/mailSuppressionSync";

// The interval between scheduled runs (once a day). Not a constant the app
// reads at runtime; it only matters here.
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function registerNode(): void {
  // CREDENTIALS ARE NOT CONSENT (FINDINGS.md F43).
  //
  // Every developer's .env holds the production Mailjet keys, because the
  // mailer needs them locally and because `railway run` and the CLI script are
  // the documented way to run this sync by hand. So gating the scheduler on
  // "are the keys present" is not a gate at all: it is true on every dev server
  // and in every battery lane. It scheduled there, called the live Mailjet
  // account five seconds after startup, and upserted real suppression rows —
  // other people's bounced mail — into a test database.
  //
  // Two conditions, because they fail differently and neither covers the other.
  //
  // NODE_ENV is the one that protects the battery. The lanes run `next dev`, so
  // this can never fire there however the rest of the environment is set, and
  // it holds even if somebody copies a production .env onto their laptop.
  //
  // MAIL_SUPPRESSION_SYNC is the one that gives an operator a kill switch in
  // production without a code deploy: if the sync starts misbehaving at 2am,
  // unsetting a Railway variable stops it. Exactly "1", the same convention as
  // OPS_ENABLED (src/lib/ops/enabled.ts), because a switch with several
  // spellings is a switch somebody turns on by accident with =false.
  //
  // Both log. A scheduler that declines silently is indistinguishable from one
  // that is broken, and the next person wondering why the suppression figures
  // are stale needs something to read.
  if (process.env.NODE_ENV !== "production") {
    console.log("[mail-suppression-scheduler] not scheduled: not a production build");
    return;
  }
  if (process.env.MAIL_SUPPRESSION_SYNC !== "1") {
    console.log("[mail-suppression-scheduler] not scheduled: MAIL_SUPPRESSION_SYNC is not 1");
    return;
  }

  function scheduleSync(): void {
    runMailSuppressionSync(db).then((result) => {
      // Deliberately minimal: outcome and count. No address, domain or provider
      // payload (log hygiene, brief 05).
      console.log(
        `[mail-suppression-scheduler] ${result.outcome}: ${result.itemsAffected} suppressed address(es)` +
          `${result.outcomeDetail ? ` — ${result.outcomeDetail}` : ""}`,
      );
    }).catch(() => {
      // runMailSuppressionSync never throws, but catch here as a belt against
      // any future change that re-introduces an exit path.
    });
  }

  // Fire once on startup (5-second delay lets migrations and the health-check
  // complete first) and then daily. The timer ref is kept to prevent Node from
  // garbage-collecting it before the first tick.
  setTimeout(() => {
    scheduleSync();
    setInterval(scheduleSync, SYNC_INTERVAL_MS);
  }, 5_000);
}
