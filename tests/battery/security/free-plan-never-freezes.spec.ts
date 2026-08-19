import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginTeacher } from "../helpers";

// ===========================================================================
// The free teacher plan has nothing to lapse
//
// StoryJar's teacher plan is free permanently: one teacher, ALL of their own
// classes, no card and no countdown (docs/pricing-decisions.md). Two promises
// follow, and both are the kind that rot silently:
//
//   1. A free account is never FROZEN for non-payment. `settleStatus` only
//      lapses a TRIAL with a real `trialEndsAt`, and a free row has neither —
//      so there is no route from free to read-only. This matters beyond
//      billing: FROZEN starts the 12-month deletion clock in RETENTION.md, so
//      a regression here would put children's work in every free account on a
//      deletion path nobody intended.
//
//   2. There is no class cap. The old "1 class free" shape was deliberately
//      dropped — a capacity wall hits the most engaged teachers first and is
//      exactly the price creep the product positions against.
//
// Both are asserted against the DATABASE after driving the real UI, so what is
// proved is what the server did, not what a screen said.
// ===========================================================================

const db = new PrismaClient();

const FREE_TEACHER = { email: "free.teacher@independent.test", password: "password" };

test.beforeAll(async () => {
  // A teacher with their OWN free plan and no school — the plain free account
  // a September signup gets. Built here rather than in the shared fixtures so
  // this spec can't shift any other spec's counts.
  await db.teacher.deleteMany({ where: { email: FREE_TEACHER.email } });
  const teacher = await db.teacher.create({
    data: {
      name: "Frankie Free",
      displayName: "Miss Free",
      email: FREE_TEACHER.email,
      passwordHash: await bcrypt.hash(FREE_TEACHER.password, 10),
      // No schoolId: nothing else can be governing this account's writes.
    },
  });
  // Exactly what actions/auth.ts creates at signup: FREE + ACTIVE + no trial end.
  await db.subscription.create({
    data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: teacher.id },
  });
});

test.afterAll(async () => {
  await db.teacher.deleteMany({ where: { email: FREE_TEACHER.email } });
  await db.$disconnect();
});

test("a free plan stays ACTIVE and writable — there is no route to FROZEN", async ({ page }) => {
  await loginTeacher(page, FREE_TEACHER);

  // Load the account page: this is the surface that resolves the account state,
  // which is where the lazy trial-expiry freeze would fire if it applied here.
  const res = await page.goto("/teacher/account");
  expect(res?.status()).toBe(200);

  const sub = await db.subscription.findFirst({
    where: { teacher: { email: FREE_TEACHER.email } },
    select: { kind: true, status: true, frozenAt: true, trialEndsAt: true },
  });
  expect(sub, "the free teacher still has their plan").toBeTruthy();
  expect(sub!.kind).toBe("FREE");
  expect(sub!.status, "a free plan is never frozen — nothing was owed").toBe("ACTIVE");
  expect(sub!.frozenAt, "no deletion clock was ever started").toBeNull();
  expect(sub!.trialEndsAt, "a free plan carries no countdown at all").toBeNull();

  // And the teacher is told so plainly — no countdown, no nag.
  await expect(page.getByText(/free teacher plan|Founding teacher/i)).toBeVisible();
  await expect(page.getByText(/day.? left/i)).toHaveCount(0);
});

test("a free teacher can create more than one class — no capacity wall", async ({ page }) => {
  await loginTeacher(page, FREE_TEACHER);

  // Three classes, because the wall we removed used to stand after the first.
  for (const name of ["Free Robins", "Free Wrens", "Free Swifts"]) {
    await page.goto("/teacher/class");
    await page.getByRole("button", { name: /New class/i }).click();
    await page.fill("#className", name);
    await page.getByRole("button", { name: /^Create class/ }).click();
    await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  }

  // The server made all three — not just the UI showing them optimistically.
  const classes = await db.class.count({ where: { teacher: { email: FREE_TEACHER.email } } });
  expect(classes, "every class a free teacher makes is really created").toBe(3);
});
