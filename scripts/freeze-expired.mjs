#!/usr/bin/env node
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
// Usage:  node scripts/freeze-expired.mjs   (wire to a daily scheduler)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

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

  console.log(`[freeze-expired] checked ${expired.length}, froze ${frozen} account(s).`);
}

main()
  .catch((e) => {
    console.error("[freeze-expired] failed", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
