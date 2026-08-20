import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, SCHOOL_C, loginTeacher, clearSession } from "../helpers";

// ===========================================================================
// A1 / A8 — "Paste a class list" is school-scoped and write-gated
//
// importClass() takes an `ownerId` — the member of staff the class will belong
// to — so, like every id-taking action, it must be scoped on the SERVER:
//
//   • only a school ADMIN may name someone else as the owner (a teacher acting
//     for a colleague is refused, even with a hand-crafted form field);
//   • the named staff member must be in the ADMIN'S OWN school (School A must
//     never be able to plant a class, or its children, inside School B);
//   • a frozen account cannot import at all — creating children is a mutation
//     (RETENTION.md read-only state);
//   • an admin who sets a class up does not thereby gain sight of it: the
//     console shows classes as name / teacher / count, never a child's name
//     (SAFEGUARDING rule 5).
// ===========================================================================

// Read a real teacher id out of School B's own console — the honest way, from a
// session entitled to it. The Classes tab's teacher picker carries staff ids as
// its option values.
async function schoolBTeacherId(page: Page): Promise<string> {
  await loginTeacher(page, SCHOOL_B.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Classes", exact: true }).click();
  const id = await page.locator('select[name="staffId"] option').first().getAttribute("value");
  expect(id).toBeTruthy();
  return id as string;
}

// Open the admin import panel and fill everything except the owner.
async function openImport(page: Page, className: string, names: string) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Classes", exact: true }).click();
  await page.getByRole("button", { name: /Paste a class list/ }).click();
  await page.fill("#import-name", className);
  await page.fill("#import-names", names);
}

test.describe("A1 · A class can only be imported for staff in your own school", () => {
  test("School A admin cannot plant a class in School B, even with a crafted owner id", async ({ page }) => {
    const foreignId = await schoolBTeacherId(page);
    await clearSession(page);

    await loginTeacher(page, SCHOOL_A.admin);
    await openImport(page, "PlantedInOakfield", "Tamper Child");

    // Force the owner picker to a staff id from the OTHER school.
    await page.locator("#import-owner").evaluate((el, id) => {
      const select = el as HTMLSelectElement;
      const option = document.createElement("option");
      option.value = id as string;
      option.textContent = "crafted";
      select.appendChild(option);
      select.value = id as string;
    }, foreignId);

    await page.getByRole("button", { name: /Create the class/ }).click();

    // The server refuses, and says nothing about the other school.
    // `p[role=alert]` rather than getByRole: Next's route announcer is also a
    // live region with role=alert, so the bare role matches two nodes.
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toContainText(/isn.t in your school/i);
    await expect(alert).not.toContainText(/Oakfield/i);

    // Nothing was created on either side of the seam.
    await expect(page.locator("body")).not.toContainText("PlantedInOakfield");
    await clearSession(page);
    await loginTeacher(page, SCHOOL_B.admin);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Classes", exact: true }).click();
    await expect(page.locator("body")).not.toContainText("PlantedInOakfield");
  });

  test("A plain teacher cannot import a class for a colleague", async ({ page }) => {
    // Read a colleague's id from the admin's own school console first.
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Classes", exact: true }).click();
    const colleagueId = await page.locator('select[name="staffId"] option').first().getAttribute("value");
    expect(colleagueId).toBeTruthy();
    await clearSession(page);

    // A non-admin teacher has no owner picker at all, so one is crafted onto
    // the form — the server must refuse it regardless.
    await loginTeacher(page, SCHOOL_A.otherTeacher); // TEACHER, not ADMIN
    await page.goto("/teacher/class");
    await page.getByRole("button", { name: /Paste a class list/ }).click();
    await page.fill("#import-name", "CraftedOwnerClass");
    await page.fill("#import-names", "Tamper Child");
    await page.locator("#import-name").evaluate((el, id) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "ownerId";
      input.value = id as string;
      (el as HTMLInputElement).form?.appendChild(input);
    }, colleagueId as string);

    await page.getByRole("button", { name: /Create the class/ }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(/Only a school admin/i);
  });
});

test.describe("A8 · Importing is a mutation, so a frozen account cannot do it", () => {
  test("a frozen school's admin is refused, and no class is made", async ({ page }) => {
    await loginTeacher(page, SCHOOL_C.teacher); // ADMIN of Larchwood, FROZEN
    await openImport(page, "FrozenImportShouldFail", "Tamper Child");
    await page.getByRole("button", { name: /Create the class/ }).click();

    await expect(page.locator('p[role="alert"]')).toContainText(/read-only/i);
    await page.reload();
    await page.getByRole("button", { name: "Classes", exact: true }).click();
    await expect(page.locator("body")).not.toContainText("FrozenImportShouldFail");
  });
});

// NOTE: the "an admin sees a count, not a child's name" property is proved in
// tests/e2e/admin.spec.ts rather than here. Every test in this file is a REFUSAL
// and creates nothing; proving the successful path needs a real import, and the
// gates in this project read the two-school fixtures in a known state (the ops
// billing screen asserts St Bede's exact roll). A security spec that grows the
// roll by three breaks an unrelated gate, which is how a suite starts getting
// weakened to make it pass.
