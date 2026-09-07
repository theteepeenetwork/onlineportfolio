import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runMailSuppressionSync } from "@/lib/mailSuppressionSync";

// ---------------------------------------------------------------------------
// mail-suppression-sync: ask Mailjet which addresses it is refusing, and record
// that fact without recording the addresses (PR5).
// ---------------------------------------------------------------------------
//
// WHY POLLING AND NOT A WEBHOOK
//
// Brief 03 puts the choice as "cron polling (recommended for the pilot) versus
// a signature-verified event webhook" and the pilot answer is the right one
// here, for a reason beyond convenience: a webhook is a new public POST
// endpoint, and brief 05 requires it to "verify the provider's signature
// mechanism and reject unsigned or unverifiable payloads". Whether Mailjet's
// event webhook offers one that can be verified is not established anywhere in
// this repository, and an unauthenticated ingest endpoint that writes rows is
// not a thing to add on an assumption. Polling adds no inbound surface at all:
// it is an outbound read with credentials StoryJar already holds.
//
// WHERE THE SYNC LOGIC LIVES
//
// The sync function is now in src/lib/mailSuppressionSync.ts, shared with the
// in-app scheduler (src/instrumentation.ts). This script is the CLI wrapper:
// it opens a database connection, delegates to the shared function, logs the
// result, and exits. It is the only caller that reads argv for the day window.
//
// THE SCHEDULER'S GUARD DOES NOT APPLY HERE, DELIBERATELY
//
// The in-app scheduler refuses to run outside a production build and without
// MAIL_SUPPRESSION_SYNC=1 (src/instrumentation-node.ts). This script has no
// such guard and should not gain one: running it is a person choosing to make
// the call, which is the consent the scheduler's guard exists to establish. A
// machine deciding to poll a third party needs permission; a human typing the
// command has already given it.
//
// Usage:
//   npm run mail:suppression-sync          # the last 30 days
//   npm run mail:suppression-sync -- 7     # a shorter window
//
// Against production, without the credentials ever touching your disk — inside
// the container, because `main()` below opens a PrismaClient of its own and the
// database is a file on the volume:
//   railway ssh
//   npm run mail:suppression-sync
//
// NOT `railway run`. This wrapper is unlike the other two mail scripts:
// verify-mail.ts and mail-events.mjs only ever reach Mailjet over HTTPS and are
// therefore still correct under `railway run`, but this one also writes rows,
// so it needs the file and not just the variables. It said `railway run` until
// 23 August 2026, which means the documented way to run this by hand had never
// worked. FINDINGS.md F44.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const db = new PrismaClient();
  try {
    const days = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 30);
    const result = await runMailSuppressionSync(db, { days });

    // Deliberately the only thing printed: a count and an outcome. No address,
    // no domain, no subject, and no provider payload (log hygiene, brief 05).
    console.log(
      `[mail-suppression-sync] ${result.outcome}: ${result.itemsAffected} suppressed address(es)` +
        `${result.outcomeDetail ? ` — ${result.outcomeDetail}` : ""}`,
    );

    if (result.outcome !== "SUCCESS") process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  // The error itself is not printed. A fetch or Prisma error can carry the
  // request it failed on, and that request carries the recipient.
  console.error("[mail-suppression-sync] failed:", e instanceof Error ? e.name : "unknown error");
  process.exit(1);
});
