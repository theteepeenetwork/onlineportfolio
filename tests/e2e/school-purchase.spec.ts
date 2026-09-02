import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// ===========================================================================
// A teacher buys their school a plan, from the account page.
//
// This screen replaced a dead end — "Ask your head or business manager to get
// in touch and we'll set it up" — which every real account was on the wrong
// side of, because nothing a user could reach created a `School`
// (docs/pricing-decisions.md, 30 Aug 2026).
//
// WHAT THIS FILE COVERS, AND WHERE IT STOPS, said plainly because the boundary
// is not where you would guess. The invoice / PO route is a server action with
// an error channel and NO WEBHOOK, so the whole claim can be driven from a
// browser — but it still makes two Stripe calls (a customer and a subscription)
// before it writes anything locally, and `playwright.config.ts` sets no Stripe
// key. So everything up to the Stripe boundary is asserted here, deterministically
// in any environment:
//
//   • the register branch: the school's name as TEXT, its town and postcode,
//     and the sentence explaining where that name comes from;
//   • the escape from a stale URN, and the way back;
//   • the free-text branch, defaulted from what the teacher typed at signup;
//   • that BOTH pay buttons carry the same band, name and claim (the bug
//     recorded in BillingPanel.tsx, from the user's side of it);
//   • the duplicate-URN refusal, driven through the real form, which is a real
//     end-to-end pass through the action: it lands before the first Stripe call.
//
// The half that CREATES a school needs a Stripe environment, and is the manual
// check in the plan's verification list rather than a gate that would pass on a
// developer's machine and refuse in CI.
//
// FIXTURES ARE SEEDED HERE. This file runs under playwright.config.ts, whose
// global setup runs the one-school DEMO seed — which has no register at all and
// no second school. The same reasoning as tests/e2e/school-picker.spec.ts: the
// register holds no person and belongs to no tenant, and the school created
// below is deleted afterwards. Names, town and postcode are all distinct from
// every seeded row so nothing here can be confused with the demo school.
// ===========================================================================

const db = new PrismaClient();

const REGISTER_URN = "991201";
const REGISTER_NAME = "Fennelbrook Community Primary School";
const REGISTER_TOWN = "Nettlecombe";
const REGISTER_POSTCODE = "ZZ9 4QW";

const CLAIMED_URN = "991202";
const CLAIMED_NAME = "Hollowmead Church of England Primary School";

// A teacher who signed up this morning: no school, and a URN picked from the
// register at signup.
const BUYER = { email: "buyer@fennelbrook.test", password: "password" };
// A teacher whose school is already on StoryJar, set up by a colleague.
const LATECOMER = { email: "latecomer@hollowmead.test", password: "password" };

let claimedSchoolId = "";

test.beforeAll(async () => {
  await db.teacher.deleteMany({ where: { email: { in: [BUYER.email, LATECOMER.email] } } });
  await db.teacher.deleteMany({ where: { email: "head@hollowmead.test" } });
  await db.school.deleteMany({ where: { urn: { in: [REGISTER_URN, CLAIMED_URN] } } });
  await db.establishment.deleteMany({ where: { urn: { in: [REGISTER_URN, CLAIMED_URN] } } });

  await db.establishment.createMany({
    data: [
      { urn: REGISTER_URN, name: REGISTER_NAME, postcode: REGISTER_POSTCODE, localAuthority: "Nettleshire", phase: "Primary", town: REGISTER_TOWN },
      { urn: CLAIMED_URN, name: CLAIMED_NAME, postcode: "ZZ9 5RT", localAuthority: "Nettleshire", phase: "Primary", town: "Hollowmead" },
    ],
  });

  await db.teacher.create({
    data: {
      name: "Jo Fennel",
      displayName: "Miss Fennel",
      email: BUYER.email,
      passwordHash: await bcrypt.hash(BUYER.password, 10),
      urn: REGISTER_URN,
      // Deliberately NOT the register's name: the screen must show the register
      // one, and the free-text branch must fall back to this.
      schoolName: "Fennelbrook Primary",
      subscription: { create: { kind: "FREE", status: "ACTIVE", trialEndsAt: null } },
    },
  });

  // The school a colleague already bought, and the admin the refusal names.
  const claimed = await db.school.create({
    data: { name: CLAIMED_NAME, urn: CLAIMED_URN, verifiedAt: new Date() },
  });
  claimedSchoolId = claimed.id;
  await db.subscription.create({
    data: { kind: "SCHOOL", status: "ACTIVE", trialEndsAt: null, schoolId: claimed.id },
  });
  await db.teacher.create({
    data: {
      name: "Ada Hollow",
      title: "Mrs",
      displayName: "Mrs Hollow",
      email: "head@hollowmead.test",
      passwordHash: await bcrypt.hash("password", 10),
      role: "ADMIN",
      status: "ACTIVE",
      schoolId: claimed.id,
    },
  });
  await db.teacher.create({
    data: {
      name: "Sam Late",
      displayName: "Mr Late",
      email: LATECOMER.email,
      passwordHash: await bcrypt.hash(LATECOMER.password, 10),
      urn: CLAIMED_URN,
      schoolName: CLAIMED_NAME,
      subscription: { create: { kind: "FREE", status: "ACTIVE", trialEndsAt: null } },
    },
  });
});

test.afterAll(async () => {
  await db.teacher.deleteMany({
    where: { email: { in: [BUYER.email, LATECOMER.email, "head@hollowmead.test"] } },
  });
  await db.school.deleteMany({ where: { urn: { in: [REGISTER_URN, CLAIMED_URN] } } });
  await db.establishment.deleteMany({ where: { urn: { in: [REGISTER_URN, CLAIMED_URN] } } });
  await db.$disconnect();
});

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login/teacher");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/teacher" || url.pathname === "/admin");
}

async function purchaseSection(page: Page) {
  await page.goto("/teacher/account");
  const section = page.getByRole("region", { name: "Set your school up" });
  await expect(section).toBeVisible();
  return section;
}

/** What each form would actually post, read off the hidden fields. */
async function postedFields(page: Page, name: string) {
  return page.locator(`input[type="hidden"][name="${name}"]`).evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );
}

test("the register names the school, and says where the name comes from", async ({ page }) => {
  await signIn(page, BUYER);
  const section = await purchaseSection(page);

  // As TEXT, not an input. Somebody is about to be invoiced under this name and
  // their colleagues invited under it, so it is shown rather than offered for
  // editing.
  await expect(section.getByText(`You’re setting up ${REGISTER_NAME}`)).toBeVisible();
  await expect(section.getByText(`${REGISTER_TOWN}, ${REGISTER_POSTCODE}`)).toBeVisible();
  await expect(section.getByText(/listed on the DfE register/)).toBeVisible();
  await expect(section.getByText(/appear on your invoice and on your colleagues’ invitations/)).toBeVisible();
  await expect(section.getByRole("textbox"), "the register name is not an editable field").toHaveCount(0);

  // Both forms are carrying the register name and the register claim.
  expect(await postedFields(page, "schoolName")).toEqual([REGISTER_NAME, REGISTER_NAME]);
  expect(await postedFields(page, "claim")).toEqual(["register", "register"]);
});

test("a teacher who has moved schools can say so, and type their own name", async ({ page }) => {
  await signIn(page, BUYER);
  const section = await purchaseSection(page);

  await section.getByRole("button", { name: "That’s not my school" }).click();

  // The free text defaults to what this teacher said their school was at signup
  // — which is NOT the register's name, and is the honest starting point.
  const input = section.getByLabel("Your school’s name");
  await expect(input).toHaveValue("Fennelbrook Primary");
  await expect(section.getByText(/Use the name your finance office will recognise/)).toBeVisible();

  await input.fill("Fennelbrook Federation");
  expect(await postedFields(page, "schoolName")).toEqual(["Fennelbrook Federation", "Fennelbrook Federation"]);
  expect(await postedFields(page, "claim")).toEqual(["free-text", "free-text"]);

  // An empty name buys nothing, and the buttons say so before the server has to.
  await input.fill("");
  await expect(section.getByRole("button", { name: "Pay by card" })).toBeDisabled();
  await expect(section.getByRole("button", { name: "Request an invoice / PO instead" })).toBeDisabled();

  // And the way back, for somebody who pressed the escape by mistake.
  await section.getByRole("button", { name: /^Use Fennelbrook Community Primary School/ }).click();
  await expect(section.getByText(`You’re setting up ${REGISTER_NAME}`)).toBeVisible();
});

test("the band a teacher chooses reaches BOTH ways to pay", async ({ page }) => {
  // The bug this asserts against really happened on this screen: the band radios
  // lived inside the card checkout form only, so the invoice route posted no
  // band and silently billed the default one. A teacher choosing the smallest
  // band and pressing the PO button was invoiced for a bigger school.
  await signIn(page, BUYER);
  const section = await purchaseSection(page);

  await section.getByRole("radio", { name: /Over 420 pupils/ }).check();
  expect(await postedFields(page, "plan")).toEqual(["school_large", "school_large"]);

  await section.getByRole("radio", { name: /Up to 105 pupils/ }).check();
  expect(await postedFields(page, "plan")).toEqual(["school_small", "school_small"]);
});

test("a school that is already on StoryJar is refused, with the colleague to ask", async ({ page }) => {
  const schoolsBefore = await db.school.count();

  await signIn(page, LATECOMER);
  const section = await purchaseSection(page);
  await expect(section.getByText(`You’re setting up ${CLAIMED_NAME}`)).toBeVisible();

  // Through the real form, the real action, the real answer. This lands before
  // the first Stripe call, which is why it is a gate rather than a manual check.
  await section.getByRole("button", { name: "Request an invoice / PO instead" }).click();

  const notice = page.getByRole("status").filter({ hasText: /already set up on StoryJar/ });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(`${CLAIMED_NAME} is already set up on StoryJar`);
  await expect(notice, "the colleague to ask, by name — never an address").toContainText("Ask Mrs Hollow to add you to it");
  expect((await notice.textContent()) ?? "").not.toContain("@");

  // Nothing was created and nobody joined anything.
  expect(await db.school.count()).toBe(schoolsBefore);
  const after = await db.teacher.findUniqueOrThrow({
    where: { email: LATECOMER.email },
    select: { schoolId: true, role: true },
  });
  expect(after.schoolId, "matching a URN is not joining a school").toBeNull();
  expect(after.role).toBe("TEACHER");
  expect(await db.teacher.count({ where: { schoolId: claimedSchoolId } }), "and the real school gained nobody").toBe(1);
});
