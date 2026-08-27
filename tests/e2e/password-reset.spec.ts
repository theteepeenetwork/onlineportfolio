import { test, expect } from "@playwright/test";

// ===========================================================================
// THE ACCEPTANCE TEST for F61, written as the thing that has to be true rather
// than as a list of properties.
//
// A teacher who does not know their password gets back into their own account,
// from the sign-in page, without anybody touching a terminal. That sentence is
// the deliverable. Ten to fifteen pilot teachers arrive from 1 September and
// before this existed the whole of the recovery story was the owner opening
// `railway ssh`.
//
// It is written the way a locked-out teacher moves: fail at sign-in first,
// because that is where a person actually is when they discover the problem,
// and the link out has to be there rather than on a help page.
// ===========================================================================

const TEACHER = { email: "teacher@school.uk", password: "password" };

test("a teacher who has forgotten their password gets back in, unaided", async ({ page }) => {
  // 1. The Monday morning. She types the password she thinks it is.
  await page.goto("/login/teacher");
  await page.fill("#email", TEACHER.email);
  await page.fill("#password", "definitely-not-my-password");
  await page.click('button[type="submit"]');
  // The app's own words, quoted rather than approximated — the sign-in error
  // copy was settled by the error-string audit and is out of scope here, so the
  // test matches it instead of asking it to change.
  await expect(page.getByText("That email and password don't match.")).toBeVisible();

  // 2. The way out is HERE, on the page where it went wrong.
  const forgotten = page.getByRole("link", { name: /forgotten your password/i });
  await expect(
    forgotten,
    "a reset reachable only from a help page is a reset a teacher rings the school office about",
  ).toBeVisible();
  await forgotten.click();
  await expect(page).toHaveURL(/forgotten/);

  // 3. She asks for a link with the address she knows.
  await page.fill("#email", TEACHER.email);
  await page.getByRole("button", { name: /send me a link/i }).click();
  await expect(page.getByText(/if that address is on our system/i)).toBeVisible();

  // 4. The link. In development it is on the page; in production it is in her
  //    inbox and `signInLinkMayBeShown()` keeps it off the screen. The test
  //    takes the development route because a test cannot read her email — the
  //    point being proved here is what happens AFTER she opens it.
  const openIt = page.getByRole("link", { name: /open the link now/i });
  await expect(
    openIt,
    "outside production the link is shown so local development needs no mail server",
  ).toBeVisible();
  await openIt.click();
  await expect(page).toHaveURL(/set-password\?token=/);

  // 5. She chooses a password she will remember.
  const NEW_PASSWORD = "three-hens-and-a-lantern";
  await page.fill("#password", NEW_PASSWORD);
  await page.fill("#confirm", NEW_PASSWORD);
  await page.getByRole("button", { name: /save and sign in/i }).click();

  // 6. And she is IN — not looking at a sign-in form having just proved she
  //    holds the address and chosen the password.
  await page.waitForURL(/\/teacher/);
  await expect(page.locator("body")).toContainText(/queue|classes|journals|good (morning|afternoon)/i);

  // 7. It is not a one-off session: the new password is the password.
  await page.goto("/teacher/logout").catch(() => {});
  await page.context().clearCookies();
  await page.goto("/login/teacher");
  await page.fill("#email", TEACHER.email);
  await page.fill("#password", NEW_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/teacher/);

});

// Put the fixture password back in the DATABASE, not by signing in with it.
//
// globalSetup reseeds once per RUN, not per test, and every other spec in this
// suite signs in as teacher@school.uk with "password". A spec that changes a
// shared credential and leaves it changed takes the rest of the suite down
// behind it, and the failures land somewhere unrelated — which is the shape
// FINDINGS F40 is about.
test.afterAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const db = new PrismaClient();
  try {
    await db.teacher.update({
      where: { email: TEACHER.email },
      data: { passwordHash: await bcrypt.hash(TEACHER.password, 10) },
    });
  } finally {
    await db.$disconnect();
  }
});
