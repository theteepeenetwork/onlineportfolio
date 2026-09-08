#!/usr/bin/env npx tsx
// Trial-expiry freeze job (RETENTION.md, day 0 of the frozen lifecycle).
//
// Freezes any account whose free trial has ended without a subscription: sets
// the subscription to FROZEN, stamps `frozenAt` (which starts the 12-month
// deletion clock), and writes a SYSTEM audit entry. Safe to run repeatedly —
// already-frozen accounts are skipped by the WHERE clause, so it never
// double-stamps or double-audits.
//
// This is a belt-and-braces backstop to the lazy on-request freeze in
// src/lib/billing.ts: either path reaches the same read-only state. Nothing here
// deletes data — freezing is the only downgrade (the deletion pipeline is a
// separate, still-to-build job per RETENTION.md open items).
//
// AND IT SWEEPS UP SQUATTED REGISTER CLAIMS. An unverified school gives up its
// `School.urn` when it freezes (docs/dpo-decisions.md, 2 Sep 2026). The release
// itself happens inside `freezeSubscription`, which is where the app's own
// freezes all funnel through — but this job freezes rows WITHOUT going through
// that function, and it is not the only thing that could. So the second pass
// below works from STATE rather than from the event: any school that is FROZEN,
// unverified and still holding a URN is released, whoever froze it and however
// long ago. That makes "we found every path to FROZEN" a property of the data
// instead of a claim about the code, which is the only version of it that stays
// true after somebody adds a fourth path.
//
// RUN UNDER tsx, NOT PLAIN node, AND THAT IS WHY THE SHEBANG CHANGED. This file
// imports `@/lib/urnRelease.ts`, so that the release rule has exactly one
// implementation shared with `src/lib/billing.ts` rather than a copy here that
// agrees on the day it is written. Node cannot load TypeScript; tsx can, and it
// resolves the `@/` alias. The npm script (`npm run billing:freeze`) is the
// supported entry point and carries the runner, so a scheduler wired to the
// script name needs no change. The FILENAME is deliberately left as .mjs: it is
// cited by name in FINDINGS.md, docs/ops-facts.md, docs/paid-tier-plan.md and
// docs/pricing-decisions.md, and a rename would leave those pointing at nothing.
//
// Usage:  npm run billing:freeze          (wire this to a daily scheduler)
//         npx tsx scripts/freeze-expired.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { sweepFrozenUnverifiedUrns } from "@/lib/urnRelease";
import { settleSchoolPlanEnd, windowHasClosed } from "@/lib/schoolPlanEnd";

const db = new PrismaClient();

async function main() {
  const now = new Date();

  // Trials that have lapsed with no live Stripe subscription.
  const expired = await db.subscription.findMany({
    where: {
      status: "TRIAL",
      stripeSubscriptionId: null,
      trialEndsAt: { lte: now },
    },
    select: { id: true, schoolId: true, teacherId: true },
  });

  let frozen = 0;
  for (const sub of expired) {
    // Guarded update: only flips a still-unfrozen row, so concurrent runs / the
    // lazy freeze can't race us into a double-stamp.
    const { count } = await db.subscription.updateMany({
      where: { id: sub.id, status: { not: "FROZEN" } },
      data: { status: "FROZEN", frozenAt: now },
    });
    if (count > 0) {
      frozen += 1;
      await db.auditLog.create({
        data: {
          action: "BILLING_FROZEN",
          actorType: "SYSTEM",
          actorName: "Trial-expiry job",
          schoolId: sub.schoolId,
          subjectType: "SUBSCRIPTION",
          subjectId: sub.id,
          detail: "Account frozen (read-only): trial ended without a subscription",
        },
      });
    }
  }

  // The by-state pass. Deliberately NOT limited to the rows frozen above: it
  // asks the database what is true rather than what this run just did.
  const released = await sweepFrozenUnverifiedUrns(
    db,
    "the school froze without ever being verified",
  );

  // THE SECOND BY-STATE PASS: school plans whose frozen window has closed, and
  // the staff who are owed their own accounts back (src/lib/schoolPlanEnd.ts;
  // owner decision, 8 September 2026).
  //
  // FROM STATE, LIKE THE URN SWEEP ABOVE AND FOR ITS REASON. The other path to
  // this is lazy: `requireWritableAccount` settles it when the teacher herself
  // next tries to do something. A teacher who never signs in again would then
  // stay attached to a dead school for ever, and — more to the point — the rule
  // would only be true of people who happened to visit. Asking the database what
  // is true makes it a property of the data instead of a claim about the code.
  //
  // ONE TEACHER AT A TIME, through the same function the request path uses, so
  // the two cannot drift into disagreeing about who gets what. It is guarded and
  // idempotent, so a second run, or a run racing a sign-in, does nothing twice.
  //
  // IF A DELETION JOB IS EVER BUILT, IT RUNS AFTER THIS ONE. RETENTION.md's
  // frozen → deletion pipeline is still an open item; a teacher's own classes
  // must leave the school before anything deletes the school, or they go with it.
  const ended = await db.subscription.findMany({
    where: { kind: "SCHOOL", status: "FROZEN", schoolId: { not: null }, frozenAt: { not: null } },
    select: { schoolId: true, frozenAt: true },
  });
  let detachedStaff = 0;
  let classesReturned = 0;
  for (const plan of ended) {
    if (!plan.schoolId || !windowHasClosed(plan.frozenAt, now)) continue;
    const staff = await db.teacher.findMany({ where: { schoolId: plan.schoolId }, select: { id: true } });
    for (const member of staff) {
      const outcome = await settleSchoolPlanEnd(db, member.id, plan.schoolId, now);
      if (outcome.detached) {
        detachedStaff += 1;
        classesReturned += outcome.classesReturned;
      }
    }
  }

  console.log(
    `[freeze-expired] checked ${expired.length}, froze ${frozen} account(s), ` +
      `released ${released.length} register claim(s)${released.length ? `: URN ${released.join(", ")}` : ""}, ` +
      `returned ${detachedStaff} member(s) of staff to their own plan with ${classesReturned} class(es).`,
  );
}

main()
  .catch((e) => {
    console.error("[freeze-expired] failed", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
