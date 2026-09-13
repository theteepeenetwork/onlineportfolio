import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SCHOOL_A, loginTeacher } from "../helpers";

// ===========================================================================
// FINDINGS F84: what StoryJar promises about who sees a child's work has to
// match what the product does.
//
// Four published promises said no child's work is seen by anyone before a
// teacher approves it. SAFEGUARDING rule 25 lets a class teacher show pupils'
// pictures on the classroom board, and since 12 September 2026 that includes
// work they have not opened full size. A privacy notice and a promise to the
// controller that are wrong about who sees a child's work are a transparency
// failure, so the wording was rewritten (owner-approved, 13 September 2026)
// and this spec holds it: none of the old absolute promises may come back,
// and every place that makes the promise also names the board exception.
//
// Rendered pages, not source, for everything a school or a parent reads. The
// operator handbook is read from source, because the operator door is not
// what this is about and walking it would cost a TOTP window.
// ===========================================================================

const OLD_PROMISES = [
  /nothing is seen until an adult/i,
  /nobody else can see it/i,
  /shown to anyone until/i,
  /not visible to anyone\s+else until/i,
  /to anybody before a teacher/i,
  /goes nowhere until an adult/i,
  /adult always checks first/i,
];

async function words(page: Page) {
  return (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
}

function holdsTheNewPromise(text: string, where: string, exception: RegExp) {
  for (const old of OLD_PROMISES) expect(text, `${where} must not promise ${old}`).not.toMatch(old);
  expect(text, `${where} names the classroom board exception`).toMatch(exception);
}

for (const [route, exception] of [
  ["/legal/privacy", /class teacher choosing to show pupils' pictures to their own class on the classroom screen/],
  ["/legal/safeguarding", /class teacher may choose to show pupils' pictures to their own class on the classroom screen/],
  ["/legal/privacy-for-families", /show pictures from a lesson to the class on the classroom screen/],
] as const) {
  test(`${route} says who sees work before approval, board included`, async ({ page }) => {
    await page.goto(route);
    holdsTheNewPromise(await words(page), route, exception);
    // A live policy that changed says when.
    await expect(page.getByText("Last updated: 13 September 2026")).toBeVisible();
  });
}

test("the admin Promises and Guide say who sees work before approval, board included", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/admin");

  await page.getByRole("button", { name: "Promises", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nothing leaves the classroom until a teacher approves it" })).toBeVisible();
  holdsTheNewPromise(await words(page), "admin Promises", /show pupils' pictures on the classroom board, including work they have not approved yet/);

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What you can do" })).toBeVisible();
  holdsTheNewPromise(await words(page), "admin Guide", /a class teacher choosing to show it on their classroom board/);
});

test("the operator handbook does not promise that work goes nowhere until an adult has seen it", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/ops/handbook/sections.tsx"), "utf8").replace(/\s+/g, " ");
  for (const old of OLD_PROMISES) expect(source, `the handbook must not promise ${old}`).not.toMatch(old);
  expect(source).toContain("It goes nowhere outside the classroom until a teacher has approved it.");
});
