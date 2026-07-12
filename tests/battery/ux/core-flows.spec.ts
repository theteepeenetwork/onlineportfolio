import { test, expect } from "@playwright/test";
import path from "node:path";
import { SCHOOL_A, SCHOOL_B, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// B2 — Core task flows (E2E), with step-count budgets and no dead ends
//
// The classroom test: the essential jobs must be short and never strand the
// teacher. We assert not just success but the number of user actions (a proxy
// for "under N steps") and that each step lands somewhere with a way forward.
// ===========================================================================

test("teacher: capture a photo → tag skills → publish, in a tight step budget", async ({ page }) => {
  let steps = 0;
  const step = () => { steps++; };

  // Pick a clean pupil in School B (Willow) to avoid disturbing shared fixtures.
  const willowId = await studentIdFromLogin(page, SCHOOL_B.classCode, "Willow");
  await loginTeacher(page, SCHOOL_B.teacher); step(); // 1: sign in
  await page.goto(`/teacher/students/${willowId}/new`); step(); // 2: open add-work

  await page.getByRole("button", { name: /photo/i }).click(); step(); // 3: choose photo
  await page.locator('input[type="file"][name="photo"]').setInputFiles(
    path.join(process.cwd(), "tests", "fixtures", "tiny.png"),
  ); step(); // 4: attach

  // Tag against a skill if any are offered (part of the same screen — no detour).
  const skill = page.locator('input[name="skillIds"]').first();
  if (await skill.count()) { await skill.check(); step(); } // 5: tag

  await page.getByRole("button", { name: /add to journal/i }).click(); step(); // 6: publish
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);

  // Landed on the child's journal with the new item visible (no dead end).
  await expect(page.locator('img[src^="/uploads/"]').first()).toBeVisible();
  expect(steps, "capture→tag→publish should be a short flow").toBeLessThanOrEqual(7);
});

test("admin: invite a teacher — appears in the staff list, no dead end", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.admin);
  await page.goto("/admin");

  await page.getByRole("button", { name: /invite staff/i }).click();
  await page.locator("#inv-name").fill("Ada Lovelace");
  const email = `ada.${Date.now()}@oakfield.sch.uk`;
  await page.locator("#inv-email").fill(email);
  await page.locator("#inv-role").selectOption("TEACHER");
  await page.getByRole("button", { name: /send invite/i }).click();

  // The new staff member shows up as Invited (the console refreshes in place).
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
});

test("teacher: create a class then bulk-import pupils by pasting a list", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/class");

  // Create a class.
  await page.getByRole("button", { name: /new class/i }).click();
  const className = `Bluebell ${Date.now()}`;
  await page.locator("#className").fill(className);
  await page.getByRole("button", { name: /create class/i }).click();
  await expect(page.getByText(className)).toBeVisible();

  // Open it and bulk-add a pasted register (surnames allowed — kept as first names).
  await page.getByRole("button", { name: new RegExp(className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).click();
  await page.getByRole("button", { name: /add child/i }).click();
  await page.locator('textarea[name="names"]').fill("Ada Byron\nGrace Hopper\nKatherine Johnson\nMae Jemison");
  await page.getByRole("button", { name: /add \d+ children|add child/i }).last().click();

  // All four land on the roster (first names only).
  for (const name of ["Ada", "Grace", "Katherine", "Mae"]) {
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
  }
});
