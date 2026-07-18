import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin } from "./helpers";

// SJ-06 — age mode is chosen once, when a class is made.
//
// A class carries a register (younger / older) that later decides how its
// children's screens read. This proves the choice is captured correctly at
// creation, and — the part that matters for the ICO Children's Code — that
// NOTHING is pre-selected, so we never nudge a teacher toward one register.
//
// PR A has no child-facing effect yet, so we assert the stored value straight
// from the database (the same PrismaClient pattern the Stripe webhook spec uses).

const db = new PrismaClient();
const CREATED: string[] = [];

test.afterAll(async () => {
  // Leave the demo DB as we found it — these throwaway classes would otherwise
  // linger in the teacher's list for the rest of the run.
  if (CREATED.length) await db.class.deleteMany({ where: { name: { in: CREATED } } });
  await db.$disconnect();
});

async function openNewClassForm(page: import("@playwright/test").Page) {
  await teacherLogin(page);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: "＋ New class" }).click();
  await expect(page.getByRole("radio", { name: /younger children/i })).toBeVisible();
}

test("neither age option is pre-selected (Children's Code: no nudge)", async ({ page }) => {
  await openNewClassForm(page);
  await expect(page.getByRole("radio", { name: /younger children/i })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: /older children/i })).not.toBeChecked();
});

test("choosing 'older children' stores KS2 on the class", async ({ page }) => {
  const name = `Older Test ${Date.now()}`;
  CREATED.push(name);
  await openNewClassForm(page);
  await page.getByLabel("Class name").fill(name);
  await page.getByRole("radio", { name: /older children/i }).check();
  await page.getByRole("button", { name: "Create class" }).click();

  // The class appears in the teacher's list once the action commits.
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await db.class.findFirst({ where: { name } }))?.ageMode)
    .toBe("KS2");
});

test("skipping the question stores NULL (→ younger by default)", async ({ page }) => {
  const name = `Skipped Test ${Date.now()}`;
  CREATED.push(name);
  await openNewClassForm(page);
  await page.getByLabel("Class name").fill(name);
  // Deliberately touch neither radio.
  await page.getByRole("button", { name: "Create class" }).click();

  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const row = await db.class.findFirst({ where: { name } });
      return row ? row.ageMode : "NO_ROW";
    })
    .toBeNull();
});

// A teacher can correct the register after creation, from Class settings. A
// class made without an answer shows "younger" (the protective default); the
// teacher switches it to "older" and it persists as KS2.
test("changing age mode in Class settings persists the new register", async ({ page }) => {
  const name = `Settings Age ${Date.now()}`;
  CREATED.push(name);

  // Make a class, skipping the age question (stored NULL → younger).
  await openNewClassForm(page);
  await page.getByLabel("Class name").fill(name);
  await page.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  // Open it and reveal Class settings.
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: /Class settings/ }).click();

  // Younger is the current register, so Save is disabled until something changes.
  await expect(page.getByRole("radio", { name: /younger children/i })).toBeChecked();
  const save = page.getByRole("button", { name: /^Save$/ });
  await expect(save).toBeDisabled();

  // Switch to older and save.
  await page.getByRole("radio", { name: /older children/i }).check();
  await expect(save).toBeEnabled();
  await save.click();

  // It persists as KS2 on the class.
  await expect
    .poll(async () => (await db.class.findFirst({ where: { name } }))?.ageMode)
    .toBe("KS2");
});
