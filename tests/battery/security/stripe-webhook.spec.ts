import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

// ===========================================================================
// A10 — Stripe webhook: signature, idempotency, and audited state transitions
//
// Verifies the /api/stripe/webhook route end-to-end against a signed payload
// (the Stripe SDK's test signer stands in for the Stripe CLI's `stripe trigger`
// fixtures). We drive events that need no outbound Stripe call so the test is
// hermetic: invoice.payment_failed → PAST_DUE, customer.subscription.deleted →
// FROZEN, plus a bad signature (400) and idempotent redelivery.
//
// Requires the same STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET the server uses
// (the route verifies signatures with them). Run:
//   STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_x \
//     npx playwright test -c playwright.battery.config.ts --project=security \
//     tests/battery/security/stripe-webhook.spec.ts
// Skipped automatically when those aren't set.
// ===========================================================================

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const KEY = process.env.STRIPE_SECRET_KEY;
const configured = Boolean(SECRET && KEY);

const SUB_ID = "sub_test_billing";
const CUS_ID = "cus_test_billing";

const db = new PrismaClient();
const stripe = KEY ? new Stripe(KEY) : null;

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
  const sig = stripe!.webhooks.generateTestHeaderString({ payload: body, secret: SECRET! });
  return { body, sig };
}

function event(type: string, object: object, id = "evt_test_default") {
  return { id, object: "event", api_version: "2026-06-24.dahlia", type, data: { object } };
}

test.describe("A10 · Stripe webhook", () => {
  test.skip(!configured, "set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to run the webhook tests");

  test.afterAll(async () => {
    await db.billingEvent.deleteMany({ where: { id: { startsWith: "evt_test_" } } });
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
    expect(res.status()).toBe(200);
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
});
