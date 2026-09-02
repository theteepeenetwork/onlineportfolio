import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { BATTERY_STRIPE_KEY } from "../stripeFixtureKey";
import { BATTERY_STRIPE_WEBHOOK_SECRET } from "../stripeWebhookFixtureKey";

// ===========================================================================
// A10 — Stripe webhook: signature, idempotency, and audited state transitions
//
// Verifies the /api/stripe/webhook route end-to-end against a signed payload
// (the Stripe SDK's test signer stands in for the Stripe CLI's `stripe trigger`
// fixtures). We drive events that need no outbound Stripe call so the test is
// hermetic: invoice.payment_failed → PAST_DUE, invoice.paid → verifiedAt,
// customer.subscription.deleted → FROZEN + the refund detach, plus a bad
// signature (400) and idempotent redelivery.
//
// THIS FILE HAD NEVER RUN IN CI UNTIL 2 SEP 2026. It carried a describe-level
// `test.skip` on two environment variables nothing set in the worker process,
// so all three of its tests were skipped on every PR and every push to main:
// signature rejection, idempotent redelivery and the freeze on cancellation
// were none of them gated on anything. Both halves are now repository
// constants — tests/battery/stripeFixtureKey.ts and
// tests/battery/stripeWebhookFixtureKey.ts, the second of which
// playwright.battery.config.ts also hands to the server — so there is nothing
// left to configure and nothing left to skip. Signature verification is local
// HMAC over the raw body and opens no socket, so this stays hermetic.
//
// Run it on its own with:
//   npx playwright test -c playwright.battery.config.ts --project=security \
//     tests/battery/security/stripe-webhook.spec.ts
//
// A NOTE ON WHAT "REDELIVERY" TESTS, because the two kinds prove different
// things and the difference is easy to lose. A redelivery carrying the SAME
// event id never reaches `handleEvent` at all: the `BillingEvent` unique id
// gate in POST answers 200 "Already processed" first. That is worth asserting,
// but it tests the outer gate. To reach a handler's OWN guard — the
// `updateMany where verifiedAt: null` in `stampVerified`, the "not our buyer
// any more" no-ops in `detachBuyer` — the second delivery must carry a
// DIFFERENT event id and the same body, which is precisely what Stripe does
// when an earlier delivery errored after committing. Both shapes appear below
// and are labelled.
// ===========================================================================

// The credentials the battery's own server was started with, taken from the
// constants playwright.battery.config.ts hands it rather than from THIS
// process's environment, which is a different environment and would quietly
// disagree — the same reasoning, and the same trap, as ops-billing.spec.ts.
//
// READING `process.env` HERE IS WHAT KEPT THIS SPEC SKIPPED, and it is worth
// spelling out because it is not obvious and it cost a run to find. Setting
// STRIPE_WEBHOOK_SECRET in `webServer.env` gives it to the SERVER, which is
// where the route verifies signatures. It does not reach the Playwright worker,
// which is where this file signs them and where the describe-level skip was
// evaluated. So a config that had correctly configured the server still left
// every test here skipped, and the run went green while proving nothing. The
// fix is to sign with the constant the server is verifying with.
//
// There is deliberately NO `process.env` fallback. An exported real
// STRIPE_WEBHOOK_SECRET in someone's shell would make this file sign with one
// secret while the battery's server verifies with another, and every test would
// fail on a 400 for a reason nothing on screen would explain.
const SECRET = BATTERY_STRIPE_WEBHOOK_SECRET;
const KEY = BATTERY_STRIPE_KEY;

// A warm dev server started outside the battery has neither. Same trap as
// OPS_ENABLED, same treatment: name the cause rather than leave a puzzling 400.
const WARM_SERVER_HINT =
  "If this failed on a warm dev server, it was started without STRIPE_WEBHOOK_SECRET, " +
  "so it cannot verify a signature this spec signed. Kill it and let the battery " +
  "start its own: pkill -f 'next dev'.";

const SUB_ID = "sub_test_billing";
const CUS_ID = "cus_test_billing";

// Separate ids for School E (Pennyfields, the ACTIVE-but-UNVERIFIED fixture).
// `Subscription.stripeSubscriptionId` and `.stripeCustomerId` are both @unique,
// so two subscriptions cannot share a pair.
const PENNY_SUB_ID = "sub_test_penny";
const PENNY_CUS_ID = "cus_test_penny";

const db = new PrismaClient();
const stripe = new Stripe(KEY);

// Attach known Stripe ids to School B's school subscription so events resolve to
// it, and reset it to ACTIVE before each test.
async function resetSchoolBSub() {
  const oak = await db.school.findFirst({ where: { name: "Oakfield Primary" }, include: { subscription: true } });
  if (!oak?.subscription) throw new Error("Oakfield subscription fixture missing");
  await db.subscription.update({
    where: { id: oak.subscription.id },
    data: { status: "ACTIVE", stripeSubscriptionId: SUB_ID, stripeCustomerId: CUS_ID, frozenAt: null },
  });
  return oak.subscription.id;
}

function signed(payload: object): { body: string; sig: string } {
  const body = JSON.stringify(payload);
  const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  return { body, sig };
}

function event(type: string, object: object, id = "evt_test_default") {
  return { id, object: "event", api_version: "2026-06-24.dahlia", type, data: { object } };
}

// NO describe-level `test.skip` ANY MORE, and its absence is the point. It read
// `process.env` for two variables nothing ever set in the worker, so it was
// permanently true and this whole file was permanently skipped. Both inputs are
// now repository constants, so there is no condition left to test — and a guard
// that can only ever be true is a guard that hides a suite.
test.describe("A10 · Stripe webhook", () => {

  test.afterAll(async () => {
    await db.billingEvent.deleteMany({ where: { id: { startsWith: "evt_test_" } } });
    // PUT SCHOOL B BACK, because the last test leaves it FROZEN.
    //
    // This file borrows a SEEDED subscription rather than building its own, and
    // until 2 September 2026 that cost nothing: the whole suite was skipped by a
    // condition nothing could falsify, so its fixture mutations never happened.
    // The moment it actually ran, it began handing every spec that sorts after
    // it in the same shard a frozen Oakfield — and `uploads.spec.ts` then fails
    // its two rejection tests for a reason that has nothing to do with uploads,
    // because the write gate refuses before the MIME message can render. The
    // failure lands on whichever spec was added most recently, which is the
    // worst possible place for it to land.
    //
    // Restoring to ACTIVE rather than to the seed's TRIAL is deliberate: what
    // the next spec needs is a WRITABLE school, and `ops-billing.spec.ts`
    // already records that it does not assert Oakfield's status because this
    // file rewrites it. The fictional Stripe ids are left behind for the same
    // reason. The stronger fix is to give this file a school it creates itself,
    // as `class-code-rotation.spec.ts` does; that is a bigger change than the
    // one that exposed the leak.
    await resetSchoolBSub();
    await db.$disconnect();
  });

  test("rejects a bad signature (400) and does not process", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": "t=1,v1=deadbeef", "content-type": "application/json" },
      data: JSON.stringify(event("invoice.payment_failed", { id: "in_x", subscription: SUB_ID, customer: CUS_ID })),
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test("invoice.payment_failed → PAST_DUE (access kept during retry)", async ({ request }) => {
    const localId = await resetSchoolBSub();
    const { body, sig } = signed(
      event("invoice.payment_failed", { id: "in_pf", subscription: SUB_ID, customer: CUS_ID, lines: { data: [] } }, "evt_test_pf"),
    );
    const res = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      data: body,
    });
    // The first SIGNED post in the file, so it is where a server running on a
    // different secret shows up. Every other 400 in this suite would have the
    // same cause.
    expect(res.status(), WARM_SERVER_HINT).toBe(200);
    const after = await db.subscription.findUnique({ where: { id: localId } });
    expect(after?.status).toBe("PAST_DUE");
  });

  test("customer.subscription.deleted → FROZEN (frozenAt stamped) + idempotent", async ({ request }) => {
    const localId = await resetSchoolBSub();
    // Start from a clean slate for this subscription's freeze audit so the
    // "exactly one" idempotency assertion is deterministic across reruns.
    await db.auditLog.deleteMany({ where: { action: "BILLING_FROZEN", subjectId: localId } });
    const payload = event(
      "customer.subscription.deleted",
      { id: SUB_ID, customer: CUS_ID, status: "canceled", items: { data: [{ quantity: 1 }] } },
      "evt_test_del",
    );
    const { body, sig } = signed(payload);

    const first = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      data: body,
    });
    expect(first.status()).toBe(200);
    const afterFirst = await db.subscription.findUnique({ where: { id: localId } });
    expect(afterFirst?.status).toBe("FROZEN");
    expect(afterFirst?.frozenAt).not.toBeNull();

    // Redelivery of the SAME event id is a no-op (idempotency) and still 200.
    const second = await request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      data: body,
    });
    expect(second.status()).toBe(200);

    // Exactly one freeze audit entry for this subscription.
    const freezes = await db.auditLog.count({
      where: { action: "BILLING_FROZEN", subjectId: localId },
    });
    expect(freezes).toBe(1);
  });

  // =========================================================================
  // invoice.paid stamps verifiedAt — the PO route's unverified window closing
  //
  // School E (Pennyfields) is the fixture for this and is seeded exactly for
  // it: ACTIVE because finance sitting on a 30-day invoice must not freeze a
  // school, and `verifiedAt: null` because the money has not arrived
  // (docs/pricing-decisions.md, 1 Sep 2026). `invoice.paid` is the event that
  // closes that window and opens the three admin gates.
  // =========================================================================
  test("invoice.paid on an unverified school stamps verifiedAt once and audits once", async ({ request }) => {
    const penny = await db.school.findFirstOrThrow({
      where: { name: "Pennyfields Primary" },
      include: { subscription: true },
    });
    if (!penny.subscription) throw new Error("Pennyfields subscription fixture missing");

    // Attach known Stripe ids so the event resolves, and put the school back
    // into the unverified state the seed creates it in. Both are undone in the
    // finally, because every other spec that reads School E depends on it.
    await db.school.update({ where: { id: penny.id }, data: { verifiedAt: null } });
    await db.subscription.update({
      where: { id: penny.subscription.id },
      data: { status: "ACTIVE", stripeSubscriptionId: PENNY_SUB_ID, stripeCustomerId: PENNY_CUS_ID, frozenAt: null },
    });
    await db.auditLog.deleteMany({ where: { action: "SCHOOL_VERIFIED", subjectId: penny.id } });

    try {
      const invoice = {
        id: "in_paid",
        subscription: PENNY_SUB_ID,
        customer: PENNY_CUS_ID,
        lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 365 * 86_400 } }] },
      };
      const first = signed(event("invoice.paid", invoice, "evt_test_paid_1"));
      const res1 = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": first.sig, "content-type": "application/json" },
        data: first.body,
      });
      expect(res1.status()).toBe(200);

      const afterFirst = await db.school.findUniqueOrThrow({ where: { id: penny.id } });
      expect(afterFirst.verifiedAt, "money confirmed must stamp verifiedAt").not.toBeNull();
      expect(
        await db.auditLog.count({ where: { action: "SCHOOL_VERIFIED", subjectId: penny.id } }),
        "exactly one SCHOOL_VERIFIED row",
      ).toBe(1);

      // Same event id: stopped by the BillingEvent gate before `handleEvent`.
      const res2 = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": first.sig, "content-type": "application/json" },
        data: first.body,
      });
      expect(res2.status()).toBe(200);

      // DIFFERENT event id, same invoice — this one reaches the handler, so it
      // is the delivery that actually exercises `stampVerified`'s guarded
      // `updateMany where verifiedAt: null`. Without that guard the date would
      // move and a second audit row would appear, and a school's verification
      // timestamp would silently follow its most recent renewal.
      const again = signed(event("invoice.paid", invoice, "evt_test_paid_2"));
      const res3 = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": again.sig, "content-type": "application/json" },
        data: again.body,
      });
      expect(res3.status()).toBe(200);

      const afterSecond = await db.school.findUniqueOrThrow({ where: { id: penny.id } });
      expect(
        afterSecond.verifiedAt?.getTime(),
        "a redelivery must not move the verification date",
      ).toBe(afterFirst.verifiedAt?.getTime());
      expect(
        await db.auditLog.count({ where: { action: "SCHOOL_VERIFIED", subjectId: penny.id } }),
        "a redelivery must not write a second SCHOOL_VERIFIED row",
      ).toBe(1);
    } finally {
      await db.auditLog.deleteMany({ where: { action: "SCHOOL_VERIFIED", subjectId: penny.id } });
      await db.school.update({ where: { id: penny.id }, data: { verifiedAt: null } });
      await db.subscription.update({
        where: { id: penny.subscription.id },
        data: { status: "ACTIVE", stripeSubscriptionId: null, stripeCustomerId: null, frozenAt: null },
      });
    }
  });

  // =========================================================================
  // The refund detach — customer.subscription.deleted on a CLAIMED school
  //
  // The buyer goes back to a free teacher plan; the school and everyone else
  // stay FROZEN, because they did not pay (docs/pricing-decisions.md, 1 Sep
  // 2026). The fixture is built here rather than in prisma/seed-test.ts: School
  // E has no `claimedByTeacherId`, and widening a shared fixture so one spec
  // can assert against it changes what every other spec is reading.
  // =========================================================================
  test("customer.subscription.deleted detaches the buyer and leaves the school frozen", async ({ request }) => {
    const stamp = Date.now();
    const REFUND_SUB_ID = `sub_test_refund_${stamp}`;
    const REFUND_CUS_ID = `cus_test_refund_${stamp}`;

    const school = await db.school.create({
      data: { name: `Refunded Primary ${stamp}`, verifiedAt: new Date() },
    });
    const mkStaff = (role: string, tag: string) =>
      db.teacher.create({
        data: {
          name: `Refund ${tag}`,
          displayName: `Refund ${tag}`,
          email: `refund.${tag}.${stamp}@example.test`,
          passwordHash: "",
          role,
          status: "ACTIVE",
          schoolId: school.id,
        },
      });
    // The buyer deliberately has NO free Subscription row of their own. A school
    // claimed through `claimSchool` leaves one in place, so `restoreFreePlan`
    // is a no-op there and this test would pass with the call missing. Starting
    // without a row is the branch that proves the call is actually made.
    const buyer = await mkStaff("ADMIN", "Buyer");
    const colleague = await mkStaff("TEACHER", "Colleague");
    await db.school.update({ where: { id: school.id }, data: { claimedByTeacherId: buyer.id } });
    const schoolSub = await db.subscription.create({
      data: {
        kind: "SCHOOL",
        status: "ACTIVE",
        schoolId: school.id,
        stripeSubscriptionId: REFUND_SUB_ID,
        stripeCustomerId: REFUND_CUS_ID,
      },
    });

    try {
      const payload = {
        id: REFUND_SUB_ID,
        customer: REFUND_CUS_ID,
        status: "canceled",
        items: { data: [{ quantity: 1 }] },
      };
      const first = signed(event("customer.subscription.deleted", payload, `evt_test_refund_1_${stamp}`));
      const res1 = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": first.sig, "content-type": "application/json" },
        data: first.body,
      });
      expect(res1.status()).toBe(200);

      // The buyer is out, on a free plan, and no longer an admin of anything.
      const buyerAfter = await db.teacher.findUniqueOrThrow({
        where: { id: buyer.id },
        include: { subscription: true },
      });
      expect(buyerAfter.schoolId, "the buyer detaches from the school").toBeNull();
      expect(buyerAfter.role, "the claim made them ADMIN, so undoing it undoes the promotion").toBe("TEACHER");
      expect(buyerAfter.subscription, "a detached teacher with no plan is worse off than a frozen one").not.toBeNull();
      expect(buyerAfter.subscription?.kind).toBe("FREE");
      expect(buyerAfter.subscription?.status).toBe("ACTIVE");
      expect(buyerAfter.subscription?.frozenAt, "a writable account must not still be counting down to erasure").toBeNull();

      // The school and everyone who did not pay stay read-only.
      const subAfter = await db.subscription.findUniqueOrThrow({ where: { id: schoolSub.id } });
      expect(subAfter.status, "the school did not pay, so it stays frozen").toBe("FROZEN");
      expect(subAfter.frozenAt).not.toBeNull();
      const colleagueAfter = await db.teacher.findUniqueOrThrow({
        where: { id: colleague.id },
        include: { subscription: true },
      });
      expect(colleagueAfter.schoolId, "a remaining colleague is not detached").toBe(school.id);
      expect(colleagueAfter.subscription, "and gets no free plan of their own out of it").toBeNull();

      expect(
        await db.auditLog.count({ where: { action: "BILLING_DETACHED_ON_REFUND", subjectId: buyer.id } }),
        "exactly one detach audit row",
      ).toBe(1);

      // Same event id: stopped by the BillingEvent gate.
      const res2 = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": first.sig, "content-type": "application/json" },
        data: first.body,
      });
      expect(res2.status()).toBe(200);

      // DIFFERENT event id, same subscription — reaches the handler, so it is
      // what tests `detachBuyer`'s own no-op: the buyer's `schoolId` no longer
      // matches, which is the same shape as a buyer who has since moved on.
      const again = signed(event("customer.subscription.deleted", payload, `evt_test_refund_2_${stamp}`));
      const res3 = await request.post("/api/stripe/webhook", {
        headers: { "stripe-signature": again.sig, "content-type": "application/json" },
        data: again.body,
      });
      expect(res3.status()).toBe(200);

      expect(
        await db.auditLog.count({ where: { action: "BILLING_FROZEN", subjectId: schoolSub.id } }),
        "exactly one freeze, however many times Stripe delivers",
      ).toBe(1);
      expect(
        await db.auditLog.count({ where: { action: "BILLING_DETACHED_ON_REFUND", subjectId: buyer.id } }),
        "exactly one detach, however many times Stripe delivers",
      ).toBe(1);
      const buyerFinal = await db.teacher.findUniqueOrThrow({ where: { id: buyer.id } });
      expect(buyerFinal.schoolId, "a redelivery must not move the buyer again").toBeNull();
    } finally {
      await db.auditLog.deleteMany({ where: { schoolId: school.id } });
      await db.auditLog.deleteMany({ where: { subjectId: { in: [buyer.id, colleague.id, schoolSub.id] } } });
      await db.subscription.deleteMany({ where: { teacherId: { in: [buyer.id, colleague.id] } } });
      await db.teacher.deleteMany({ where: { id: { in: [buyer.id, colleague.id] } } });
      // Cascades the school's Subscription row.
      await db.school.delete({ where: { id: school.id } });
    }
  });
});
