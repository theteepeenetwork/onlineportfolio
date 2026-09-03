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

  // =========================================================================
  // THE CARD ROUTE'S OTHER HALF — checkout.session.completed as a SCHOOL CLAIM
  //
  // `startClaimCheckout` writes NOTHING locally, so `resolveLocalSub` finds no
  // subscription and the whole purchase intent arrives in Stripe metadata.
  // Until 2 September 2026 that was a silent 200: money reached Stripe and no
  // school appeared. These tests are what stops it going quiet again.
  //
  // EVERY FIXTURE HERE IS BUILT IN THE TEST AND TORN DOWN IN A `finally`, as
  // `staff-invite-isolation.spec.ts` does, rather than by widening a seeded
  // one. This file has already sprung that trap once — it borrowed Oakfield's
  // seeded subscription and left it FROZEN, and `uploads.spec.ts` failed two
  // tests in the same shard for a reason that had nothing to do with uploads.
  // A claim test creates a School, a Subscription and an ADMIN, which is a much
  // bigger footprint than a status flag, so none of it touches a shared row.
  //
  // The claim ALSO needs each event to carry an id nothing else has used, and
  // every one below starts `evt_test_` so the describe's afterAll sweeps it.
  // =========================================================================

  // A `checkout.session.completed` payload in the shape `startClaimCheckout`
  // actually produces: `mode: "subscription"`, the six metadata keys from
  // `claimMetadata`, and — load-bearing — NO `client_reference_id`, which is
  // what makes `resolveLocalSub` fall through to the claim branch.
  function claimSession(over: {
    id: string;
    subscription: string | null;
    customer: string;
    teacherId: string;
    schoolName: string;
    urn?: string;
    plan?: string;
    payment_status?: string;
    metadata?: Record<string, string> | null;
  }) {
    const metadata =
      over.metadata !== undefined
        ? over.metadata
        : {
            storyjar_purchase: "school_claim",
            storyjar_teacher_id: over.teacherId,
            storyjar_plan: over.plan ?? "school_1fe",
            storyjar_band: "Up to 210 pupils",
            storyjar_school_name: over.schoolName,
            // Stripe metadata is strings only, so a null URN travels as "".
            storyjar_urn: over.urn ?? "",
          };
    return {
      id: over.id,
      object: "checkout.session",
      mode: "subscription",
      payment_status: over.payment_status ?? "paid",
      customer: over.customer,
      subscription: over.subscription,
      metadata,
    };
  }

  // A teacher who has bought nothing yet: no school, and the FREE plan row
  // every signed-up teacher already has. That row's SURVIVAL is one of the
  // assertions below (docs/school-identity.md §5).
  async function makeBuyer(stamp: number, tag: string) {
    const teacher = await db.teacher.create({
      data: {
        name: `Claim ${tag}`,
        displayName: `Claim ${tag}`,
        email: `claim.${tag}.${stamp}@example.test`,
        passwordHash: "",
        role: "TEACHER",
        status: "ACTIVE",
      },
    });
    const free = await db.subscription.create({
      data: { kind: "FREE", status: "ACTIVE", teacherId: teacher.id },
    });
    return { teacher, free };
  }

  // Remove everything a claim can have created, in an order the FKs allow.
  // `Teacher.school` is `onDelete: SetNull`, so schools go first and the
  // teachers they promoted are detached rather than blocking the delete.
  async function tearDownClaim(teacherIds: string[], schoolIds: string[]) {
    for (const id of schoolIds) {
      await db.auditLog.deleteMany({ where: { schoolId: id } });
      await db.school.deleteMany({ where: { id } }); // cascades its Subscription
    }
    await db.auditLog.deleteMany({ where: { subjectId: { in: teacherIds } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: teacherIds } } });
    await db.subscription.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await db.teacher.deleteMany({ where: { id: { in: teacherIds } } });
  }

  async function post(request: import("@playwright/test").APIRequestContext, payload: object) {
    const { body, sig } = signed(payload);
    return request.post("/api/stripe/webhook", {
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      data: body,
    });
  }

  test("a paid claim creates the school, the subscription and exactly one admin", async ({ request }) => {
    const stamp = Date.now();
    const SUB = `sub_test_claim_${stamp}`;
    const CUS = `cus_test_claim_${stamp}`;
    const NAME = `Claimed Primary ${stamp}`;
    const { teacher, free } = await makeBuyer(stamp, "buyer");
    let schoolId: string | null = null;

    try {
      const res = await post(
        request,
        event(
          "checkout.session.completed",
          claimSession({ id: `cs_test_${stamp}`, subscription: SUB, customer: CUS, teacherId: teacher.id, schoolName: NAME }),
          `evt_test_claim_${stamp}`,
        ),
      );
      expect(res.status(), WARM_SERVER_HINT).toBe(200);

      const schools = await db.school.findMany({ where: { name: NAME } });
      expect(schools, "one payment, one school").toHaveLength(1);
      const school = schools[0];
      schoolId = school.id;
      expect(school.verifiedAt, "a card purchase never passes through the unverified state").not.toBeNull();
      expect(school.claimedByTeacherId, "the buyer is recorded, so a refund can find them").toBe(teacher.id);

      const schoolSub = await db.subscription.findFirstOrThrow({ where: { schoolId: school.id } });
      expect(schoolSub.kind).toBe("SCHOOL");
      expect(schoolSub.status, "ACTIVE, never TRIAL — 1 Sep 2026 replaced the trial with a 42-day refund").toBe("ACTIVE");
      expect(schoolSub.trialEndsAt, "explicitly null, so settleStatus's lapse branch is unreachable").toBeNull();
      expect(schoolSub.stripeSubscriptionId, "the idempotency key is persisted").toBe(SUB);
      expect(schoolSub.stripeCustomerId).toBe(CUS);

      const buyerAfter = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
      expect(buyerAfter.schoolId).toBe(school.id);
      expect(buyerAfter.role, "paying for a school that does not exist is one of exactly two routes to ADMIN").toBe("ADMIN");
      expect(
        await db.teacher.count({ where: { schoolId: school.id, role: "ADMIN" } }),
        "exactly one admin, and it is the person who paid",
      ).toBe(1);

      // THE BUYER'S OWN FREE ROW SURVIVES (docs/school-identity.md §5). This is
      // the assertion that stops the claim being "tidied" into copying
      // `joinSchoolPlan`, which DELETES it — and it is what makes a refund a
      // detach rather than a resurrection.
      const freeAfter = await db.subscription.findUnique({ where: { id: free.id } });
      expect(freeAfter, "the buyer's own free plan is left alone, so a refund has somewhere to put them").not.toBeNull();
      expect(freeAfter?.teacherId).toBe(teacher.id);

      expect(
        await db.auditLog.count({ where: { action: "SCHOOL_CLAIMED", subjectId: school.id } }),
        "a privilege grant with no record is the state rule 16 forbids",
      ).toBe(1);
      expect(await db.auditLog.count({ where: { action: "BILLING_ACTIVATED", schoolId: school.id } })).toBe(1);
    } finally {
      await tearDownClaim([teacher.id], schoolId ? [schoolId] : []);
      await db.school.deleteMany({ where: { name: NAME } });
    }
  });

  test("redelivery cannot make a second school, by either event id", async ({ request }) => {
    const stamp = Date.now();
    const SUB = `sub_test_claim2_${stamp}`;
    const CUS = `cus_test_claim2_${stamp}`;
    const NAME = `Redelivered Primary ${stamp}`;
    const { teacher } = await makeBuyer(stamp, "redeliver");
    let schoolId: string | null = null;

    try {
      const session = claimSession({ id: `cs_test_r_${stamp}`, subscription: SUB, customer: CUS, teacherId: teacher.id, schoolName: NAME });
      const first = await post(request, event("checkout.session.completed", session, `evt_test_claim_r1_${stamp}`));
      expect(first.status(), WARM_SERVER_HINT).toBe(200);
      const school = await db.school.findFirstOrThrow({ where: { name: NAME } });
      schoolId = school.id;
      const stampedAt = school.verifiedAt;

      // SAME event id — the `BillingEvent` unique gate in POST answers before
      // `handleEvent` is reached at all. The outer layer.
      const same = await post(request, event("checkout.session.completed", session, `evt_test_claim_r1_${stamp}`));
      expect(same.status()).toBe(200);
      expect(await same.text()).toBe("Already processed");

      // DIFFERENT event id, SAME `session.subscription`. THIS IS THE ONE A
      // REVIEWER WILL LOOK FOR: it is the shape Stripe delivers after a handler
      // committed and then threw, taking its own `BillingEvent` row with it, so
      // it is the only delivery that reaches the handler against a school that
      // already exists. It resolves the subscription the claim created, so it
      // now takes the EXISTING-subscription arm and calls `stampVerified` on an
      // already-stamped school — harmless because of that function's
      // `verifiedAt: null` guard, not because of any ordering here.
      const again = await post(request, event("checkout.session.completed", session, `evt_test_claim_r2_${stamp}`));
      expect(again.status()).toBe(200);

      expect(await db.school.count({ where: { name: NAME } }), "still exactly one school").toBe(1);
      expect(
        await db.auditLog.count({ where: { action: "SCHOOL_CLAIMED", subjectId: school.id } }),
        "still exactly one SCHOOL_CLAIMED",
      ).toBe(1);
      expect(
        await db.subscription.count({ where: { schoolId: school.id } }),
        "and one subscription — stripeSubscriptionId is @unique as the backstop",
      ).toBe(1);
      const after = await db.school.findUniqueOrThrow({ where: { id: school.id } });
      expect(after.verifiedAt?.getTime(), "a redelivery must not move the verification date").toBe(stampedAt?.getTime());
      expect(
        await db.auditLog.count({ where: { action: "SCHOOL_VERIFIED", subjectId: school.id } }),
        "and must not write a SCHOOL_VERIFIED row on top of the claim's own stamp",
      ).toBe(0);
    } finally {
      await tearDownClaim([teacher.id], schoolId ? [schoolId] : []);
      await db.school.deleteMany({ where: { name: NAME } });
    }
  });

  test("an unpaid session creates nothing — only money creates a school on this route", async ({ request }) => {
    const stamp = Date.now();
    const SUB = `sub_test_unpaid_${stamp}`;
    const NAME = `Unpaid Primary ${stamp}`;
    const { teacher } = await makeBuyer(stamp, "unpaid");

    try {
      // `checkout.session.completed` fires when the CHECKOUT completes, which
      // for an asynchronous method is not when the money arrives. Without the
      // guard the card route would create a VERIFIED school on a payment that
      // has not cleared — the unverified window it exists to avoid, with the
      // admin gates already open.
      const res = await post(
        request,
        event(
          "checkout.session.completed",
          claimSession({
            id: `cs_test_u_${stamp}`,
            subscription: SUB,
            customer: `cus_test_unpaid_${stamp}`,
            teacherId: teacher.id,
            schoolName: NAME,
            payment_status: "unpaid",
          }),
          `evt_test_claim_unpaid_${stamp}`,
        ),
      );
      expect(res.status(), "an unpaid session is acked, not retried").toBe(200);

      expect(await db.school.count({ where: { name: NAME } }), "no school on an unpaid session").toBe(0);
      expect(await db.subscription.count({ where: { stripeSubscriptionId: SUB } })).toBe(0);
      const after = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
      expect(after.schoolId, "and nobody is promoted").toBeNull();
      expect(after.role).toBe("TEACHER");

      // AND IT LEAVES A ROW, not only a `console.error`. Until 2 Sep 2026 this
      // branch logged and returned, so the one person who had pressed Pay and
      // had no school existed nowhere anybody looks: stdout goes to Railway's
      // log store, which erasure cannot reach and which nobody reads on a
      // Tuesday evening (src/lib/safeLog.ts). Every other refusal on this path
      // writes one.
      const withheld = await db.auditLog.findMany({ where: { action: "SCHOOL_CLAIM_WITHHELD", subjectId: SUB } });
      expect(withheld, "a withheld claim has to be findable without log access").toHaveLength(1);
      expect(withheld[0].actorId, "and findable by the buyer, who is the person waiting").toBe(teacher.id);
      expect(withheld[0].detail).toContain("unpaid");
      expect(withheld[0].detail, "and it must not repeat the school's name into a row nobody scoped").not.toContain(NAME);
      expect(withheld[0].schoolId, "no school exists to attach it to").toBeNull();
    } finally {
      await db.auditLog.deleteMany({ where: { subjectId: SUB } });
      await tearDownClaim([teacher.id], []);
      await db.school.deleteMany({ where: { name: NAME } });
    }
  });

  // =========================================================================
  // THE DELAYED PAYMENT THAT LANDS LATER — the case that survived review
  //
  // The withholding above was proved; what happened NEXT was not, and what
  // happened next was nothing. `checkout.session.async_payment_succeeded` was
  // not a case in the switch, so it fell to `default:` and was acked and
  // ignored, and the comment at the withholding said `invoice.paid` would pick
  // the claim up instead. It could not: withholding writes no local row, so
  // `resolveLocalSub` finds nothing there either. For BACS debit and the other
  // delayed-settlement methods the buyer paid and got nothing, permanently.
  //
  // BOTH HALVES ARE ASSERTED BELOW, in order, because the second is what makes
  // the first a bug rather than a curiosity.
  // =========================================================================
  test("a delayed payment that settles later still gets the school it paid for", async ({ request }) => {
    const stamp = Date.now();
    const SUB = `sub_test_async_${stamp}`;
    const CUS = `cus_test_async_${stamp}`;
    const NAME = `Late Settlement Primary ${stamp}`;
    const { teacher } = await makeBuyer(stamp, "async");
    let schoolId: string | null = null;

    try {
      const session = claimSession({
        id: `cs_test_a_${stamp}`,
        subscription: SUB,
        customer: CUS,
        teacherId: teacher.id,
        schoolName: NAME,
        payment_status: "unpaid",
      });

      // 1. The checkout completes before the money moves. Withheld, as it must be.
      const completed = await post(request, event("checkout.session.completed", session, `evt_test_claim_async1_${stamp}`));
      expect(completed.status(), WARM_SERVER_HINT).toBe(200);
      expect(await db.school.count({ where: { name: NAME } }), "an uncleared payment creates no school").toBe(0);

      // 2. THE RECOVERY THE COMMENT USED TO PROMISE, DRIVEN AND SHOWN TO FAIL.
      // An `invoice.paid` carrying the same Stripe ids resolves no local
      // subscription — the claim wrote none — so it returns and nothing is
      // created. This assertion is the diagnosis, kept so the wrong recovery
      // cannot be written back in.
      const invoiced = await post(
        request,
        event(
          "invoice.paid",
          { id: `in_async_${stamp}`, subscription: SUB, customer: CUS, lines: { data: [] } },
          `evt_test_claim_async_inv_${stamp}`,
        ),
      );
      expect(invoiced.status()).toBe(200);
      expect(
        await db.school.count({ where: { name: NAME } }),
        "invoice.paid cannot claim a school, because the withheld claim wrote no local row to resolve",
      ).toBe(0);

      // 3. Days later the payment settles. THIS is the delivery that claims it.
      const settled = { ...session, payment_status: "paid" };
      const settlement = await post(
        request,
        event("checkout.session.async_payment_succeeded", settled, `evt_test_claim_async2_${stamp}`),
      );
      expect(settlement.status(), "the settlement is acked").toBe(200);

      const school = await db.school.findFirstOrThrow({ where: { name: NAME } });
      schoolId = school.id;
      expect(school.verifiedAt, "the money cleared, so the school is verified").not.toBeNull();
      expect(school.claimedByTeacherId, "and the buyer is recorded, so a refund can find them").toBe(teacher.id);

      const buyer = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
      expect(buyer.schoolId).toBe(school.id);
      expect(buyer.role, "the person who paid is the admin, on this route as on the other").toBe("ADMIN");
      expect(
        await db.teacher.count({ where: { schoolId: school.id, role: "ADMIN" } }),
        "exactly one admin",
      ).toBe(1);

      const schoolSub = await db.subscription.findFirstOrThrow({ where: { schoolId: school.id } });
      expect(schoolSub.status, "ACTIVE, never TRIAL").toBe("ACTIVE");
      expect(schoolSub.stripeSubscriptionId).toBe(SUB);
      expect(await db.subscription.count({ where: { stripeSubscriptionId: SUB } }), "one payment, one subscription").toBe(1);
      expect(await db.school.count({ where: { name: NAME } }), "one payment, one school").toBe(1);
      expect(
        await db.auditLog.count({ where: { action: "SCHOOL_CLAIMED", subjectId: school.id } }),
        "a privilege grant with no record is the state rule 16 forbids",
      ).toBe(1);
      expect(
        await db.auditLog.count({ where: { action: "SCHOOL_CLAIM_WITHHELD", subjectId: SUB } }),
        "and the withholding row is still there, as the trail of what happened",
      ).toBe(1);
    } finally {
      await db.auditLog.deleteMany({ where: { subjectId: SUB } });
      await tearDownClaim([teacher.id], schoolId ? [schoolId] : []);
      await db.school.deleteMany({ where: { name: NAME } });
    }
  });

  test("a session with no claim metadata creates nothing and still returns 200", async ({ request }) => {
    const stamp = Date.now();
    const SUB = `sub_test_nometa_${stamp}`;
    const before = await db.school.count();

    // Resolves no local subscription AND carries no claim metadata: a genuine
    // anomaly. It is logged with the session id only — never the metadata,
    // which carries a school name — and acked, because a retry cannot supply a
    // key that was never written.
    const res = await post(
      request,
      event(
        "checkout.session.completed",
        { id: `cs_test_nm_${stamp}`, object: "checkout.session", mode: "subscription", payment_status: "paid", customer: `cus_test_nometa_${stamp}`, subscription: SUB },
        `evt_test_claim_nometa_${stamp}`,
      ),
    );
    expect(res.status(), "an unrecognised session is acked, never retried in a loop").toBe(200);
    expect(await db.school.count(), "no school appears out of a session we did not send").toBe(before);
    expect(await db.subscription.count({ where: { stripeSubscriptionId: SUB } })).toBe(0);
  });

  test("a URN taken since checkout degrades to no URN and never attaches the buyer", async ({ request }) => {
    const stamp = Date.now();
    // Six digits, outside the seeded 9000xx block, and unique to this run.
    const URN = `95${String(stamp).slice(-4)}`;
    const SUB = `sub_test_urn_${stamp}`;
    const INCUMBENT = `Incumbent Primary ${stamp}`;
    const CLAIMED = `Latecomer Primary ${stamp}`;
    const { teacher } = await makeBuyer(stamp, "urn");
    // The school that already holds the register entry. The refusal a human
    // reads lives at checkout time; by the time the webhook lands the money has
    // moved and there is nobody to return an error to, so this is the TOCTOU
    // race and it DEGRADES rather than refusing.
    const incumbent = await db.school.create({ data: { name: INCUMBENT, urn: URN, verifiedAt: new Date() } });
    let schoolId: string | null = null;

    try {
      const res = await post(
        request,
        event(
          "checkout.session.completed",
          claimSession({ id: `cs_test_urn_${stamp}`, subscription: SUB, customer: `cus_test_urn_${stamp}`, teacherId: teacher.id, schoolName: CLAIMED, urn: URN }),
          `evt_test_claim_urn_${stamp}`,
        ),
      );
      expect(res.status()).toBe(200);

      const created = await db.school.findFirstOrThrow({ where: { name: CLAIMED } });
      schoolId = created.id;
      expect(created.urn, "the URN is dropped; a free-text school is a first-class thing").toBeNull();

      // ATTACHING THE BUYER TO THE INCUMBENT IS AUTO-JOIN, WHICH
      // docs/school-identity.md §4 FORBIDS BY NAME. Matching a URN is not
      // evidence of employment, and doing it would drop a stranger into a real
      // school's console with real children behind it.
      const after = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
      expect(after.schoolId, "the buyer joins the school they paid for, never the one holding the URN").toBe(created.id);
      expect(
        await db.teacher.count({ where: { schoolId: incumbent.id } }),
        "nobody is added to the incumbent school",
      ).toBe(0);

      const claimed = await db.auditLog.findFirstOrThrow({ where: { action: "SCHOOL_CLAIMED", subjectId: created.id } });
      expect(claimed.detail, "the audit row is the operator's cue that a URN was dropped").toContain(URN);
    } finally {
      await tearDownClaim([teacher.id], schoolId ? [schoolId] : []);
      await db.school.deleteMany({ where: { name: { in: [CLAIMED, INCUMBENT] } } });
    }
  });

  test("a paid session whose purchase details are unusable is refused, not retried forever", async ({ request }) => {
    const stamp = Date.now();
    const SUB = `sub_test_badplan_${stamp}`;
    const NAME = `Bad Plan Primary ${stamp}`;
    const { teacher } = await makeBuyer(stamp, "badplan");

    try {
      // `claimMetadata` is the only writer of these keys and emits a real
      // `PlanKey`, so this session is one nothing in this application sent. It
      // matters anyway because of HOW it would fail unguarded: `bandFor` throws
      // on an unknown plan, INSIDE the claim transaction, which becomes a 500,
      // which becomes a Stripe redelivery loop against metadata no retry can
      // improve. That is the exact shape the refusal path exists to avoid, so
      // the plan key is narrowed against the catalogue before the claim opens.
      const res = await post(
        request,
        event(
          "checkout.session.completed",
          claimSession({
            id: `cs_test_bp_${stamp}`,
            subscription: SUB,
            customer: `cus_test_badplan_${stamp}`,
            teacherId: teacher.id,
            schoolName: NAME,
            plan: "school_enormous",
          }),
          `evt_test_claim_badplan_${stamp}`,
        ),
      );
      expect(res.status(), "acked, so Stripe stops; the audit row is what a person acts on").toBe(200);

      expect(await db.school.count({ where: { name: NAME } })).toBe(0);
      expect(await db.subscription.count({ where: { stripeSubscriptionId: SUB } })).toBe(0);
      expect((await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).role).toBe("TEACHER");

      const refusals = await db.auditLog.findMany({ where: { action: "SCHOOL_CLAIM_REFUSED", subjectId: SUB } });
      expect(refusals, "money was taken, so the refusal has to be findable").toHaveLength(1);
      expect(refusals[0].detail).toContain("unrecognised plan");
      expect(refusals[0].detail, "and it must not repeat the school's name into a row nobody scoped").not.toContain(NAME);
    } finally {
      await db.auditLog.deleteMany({ where: { subjectId: SUB } });
      await tearDownClaim([teacher.id], []);
      await db.school.deleteMany({ where: { name: NAME } });
    }
  });

  test("a buyer who joined a school in the gap is refused, audited, and answered 200", async ({ request }) => {
    const stamp = Date.now();
    const SUB = `sub_test_hasschool_${stamp}`;
    const HOST = `Host Primary ${stamp}`;
    const WANTED = `Never Made Primary ${stamp}`;
    const { teacher } = await makeBuyer(stamp, "hasschool");
    // They accepted an invitation between pressing the button and the webhook
    // landing. `claimSchool` refuses rather than moving them: moving them would
    // take their classes, and the children's work in them, out from under one
    // school's admins on the strength of a payment neither school made.
    const host = await db.school.create({ data: { name: HOST, verifiedAt: new Date() } });
    await db.teacher.update({ where: { id: teacher.id }, data: { schoolId: host.id } });

    try {
      const res = await post(
        request,
        event(
          "checkout.session.completed",
          claimSession({ id: `cs_test_hs_${stamp}`, subscription: SUB, customer: `cus_test_hasschool_${stamp}`, teacherId: teacher.id, schoolName: WANTED }),
          `evt_test_claim_hs_${stamp}`,
        ),
      );
      // ASSERT THE STATUS, NOT JUST THE ROWS. A 500 here would be invisible in
      // the database and would put Stripe into a redelivery loop against a
      // state no delivery can change.
      expect(res.status(), "a refusal is acked; a retry cannot make this untrue").toBe(200);

      expect(await db.school.count({ where: { name: WANTED } }), "no school is created for a refused claim").toBe(0);
      expect(await db.subscription.count({ where: { stripeSubscriptionId: SUB } })).toBe(0);
      const after = await db.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
      expect(after.schoolId, "and the buyer is NOT moved").toBe(host.id);
      expect(after.role, "nor promoted").toBe("TEACHER");

      const refusals = await db.auditLog.findMany({ where: { action: "SCHOOL_CLAIM_REFUSED", subjectId: teacher.id } });
      expect(refusals, "the audit row is the founder's cue to refund by hand").toHaveLength(1);
      expect(refusals[0].schoolId, "a stranger's failed purchase does not belong in the host school's log").toBeNull();
      expect(refusals[0].detail).toContain("refunded by hand");
    } finally {
      await tearDownClaim([teacher.id], [host.id]);
      await db.school.deleteMany({ where: { name: { in: [HOST, WANTED] } } });
    }
  });
});

