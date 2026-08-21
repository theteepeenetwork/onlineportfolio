import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, loginTeacher, asOperator } from "../helpers";

// ===========================================================================
// The operator handbook: a page of policy, held to the same door as every
// other operator screen, and proved to be as blind as it claims.
//
// Why a page of prose needs a security spec at all:
//
//   R17. Unauthorised access to any ops route is the standard not-found
//   response, and the 404 must not name the area. A page added later is
//   exactly the page that gets added without the guard, and the guard here is
//   `await requireOperator()` as the first statement — the blindness gate
//   checks the shape, this checks the running behaviour.
//
//   Rule 20. The handbook DESCRIBES what this console may never read. A
//   document that quoted a field name, an example class code or a real pupil's
//   name to illustrate the point would be the leak it warns about, in the
//   voice of a policy. So this asserts the page reads nothing: no pupil name
//   from either seeded school appears on it, and it renders identically for a
//   fresh operator session, because it is text and not a report.
// ===========================================================================

const ROUTE = "/ops/handbook";

test(`${ROUTE} is 404 to a stranger and 200 to the operator, on the same URL`, async ({ page }) => {
  await page.context().clearCookies();
  const anonymous = await page.goto(ROUTE);
  expect(anonymous?.status(), "an unauthenticated operator route must answer 404").toBe(404);
  // Not a redirect to a sign-in page either: that would name the area.
  expect(new URL(page.url()).pathname).toBe(ROUTE);
  const denied = ((await page.textContent("body")) ?? "").toLowerCase();
  expect(denied).not.toContain("storyjar operations");
  // Not asserted: the word "handbook" itself. It is the path the requester
  // typed, and Next echoes the requested segments back in its payload, so a
  // rule against it would fail on the visitor's own input rather than on
  // anything we disclosed. What R17 actually forbids is the 404 telling them
  // what lives here, so the assertion is against the page's CONTENT.
  for (const line of ["storyjar works", "break glass", "may never do", "designated officer"]) {
    expect(denied, `the 404 body must not carry handbook content ("${line}")`).not.toContain(line);
  }

  // Positive control: same URL, same fixture, the other session.
  await asOperator(page);
  const authorised = await page.goto(ROUTE);
  expect(authorised?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Handbook", level: 1 })).toBeVisible();
});

test("a signed-in teacher gets 404 from the handbook", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const denied = await page.goto(ROUTE);
  expect(denied?.status(), "a teacher session must not reach the operator area").toBe(404);
});

test("the handbook names no pupil, no class code and no family code", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);
  const summaries = page.locator("main details summary");
  for (let i = 0; i < (await summaries.count()); i += 1) await summaries.nth(i).click();
  const text = (await page.locator("main").textContent()) ?? "";

  // Seeded pupils from both schools, plus the EYFS child. A handbook that
  // illustrated a rule with one of these would be reading a child's name in
  // order to explain that it never does.
  for (const pupil of [SCHOOL_A.student, SCHOOL_B.student, "Ava"]) {
    expect(text, `the handbook must not name the pupil ${pupil}`).not.toContain(pupil);
  }
  // A code on this page would be a code an operator can read (amendment C1).
  expect(text).not.toContain(SCHOOL_A.classCode);
  expect(text).not.toMatch(/\b[A-Z]{3}\d{3}\b/);
});

test("the handbook carries the procedure it exists to carry, and its notification rule", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);

  const breakGlass = page.locator("main details", { hasText: "Break glass" }).first();
  await breakGlass.locator("summary").click();

  // The timing IS the control (docs/exceptional-access.md). A handbook that
  // described break glass without it would describe a diary, not a procedure.
  await expect(breakGlass.getByRole("heading", { name: /Notify before you look, never afterwards/ })).toBeVisible();
  await expect(breakGlass).toContainText("designated officer");
  await expect(breakGlass.getByRole("heading", { name: "Never a trigger" })).toBeVisible();
  // The one instruction that must survive any future trim of this page.
  await expect(breakGlass).toContainText("Do not open it.");
});
