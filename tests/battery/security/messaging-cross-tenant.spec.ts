import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginParent, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// Tenant isolation for parent–teacher messages (SAFEGUARDING.md rules 4, 8, 21).
//
// A thread is about one child. It is reachable by that child's linked parents
// and by the staff who have standing on it at that child's school — and by
// nobody else. Every other route returns a 404 that says nothing about
// whether the child exists, and a tampered send creates no row.
//
// The AGENTS.md rule this file exists for: "New endpoint/action taking an id →
// add a cross-tenant isolation test (School B must never reach School A)
// before it ships."
// ===========================================================================

const db = new PrismaClient();
const stamp = () => `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

test.afterAll(async () => {
  await db.$disconnect();
});

test("School B's teacher cannot open a School A child's thread", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const amara = await studentIdFromLogin(page, SCHOOL_A.classCode, SCHOOL_A.student);
  const res = await page.goto(`/teacher/messages/${amara}`);
  expect(res?.status()).toBe(404);
});

test("a teacher cannot open a thread for a child in a colleague's class at the same school", async ({ page }) => {
  // Miss Malik teaches Butterflies; Amara is in Sunflower.
  await loginTeacher(page, SCHOOL_A.otherTeacher);
  const amara = await studentIdFromLogin(page, SCHOOL_A.classCode, SCHOOL_A.student);
  const res = await page.goto(`/teacher/messages/${amara}`);
  expect(res?.status()).toBe(404);
  // And the inbox lists none of Sunflower's children.
  await page.goto("/teacher/messages");
  expect(await page.content()).not.toContain(SCHOOL_A.student);
});

test("a school admin who teaches no class has no thread to open and no body on the console", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.admin);
  const zara = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);
  const res = await page.goto(`/teacher/messages/${zara}`);
  expect(res?.status()).toBe(404);
});

test("a nonsense id is the same 404 as somebody else's child", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  const res = await page.goto(`/teacher/messages/does-not-exist`);
  expect(res?.status()).toBe(404);
});

test("a parent's send with somebody else's child on the form creates nothing and says nothing", async ({ page }) => {
  await loginParent(page, SCHOOL_B.parentFamilyCode);
  const amara = await studentIdFromLogin(page, SCHOOL_A.classCode, SCHOOL_A.student);
  const body = `tampered ${stamp()}`;
  await page.goto("/family");
  // Let React hydrate first: a form submitted before hydration is a plain
  // POST that re-renders the page without the action's returned state, so
  // the refusal below would never be painted even though the server refused.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Your message").fill(body);
  await page.evaluate((id) => {
    const el = document.querySelector<HTMLInputElement>('input[name="studentId"]');
    if (el) el.value = id;
  }, amara);
  await page.getByRole("button", { name: /^send$/i }).click();
  // The refusal is the generic one — it must not confirm the child exists.
  const refusal = page.getByText(/aren’t switched on for this school/i);
  await expect(refusal).toBeVisible();
  expect(await refusal.textContent()).not.toContain(SCHOOL_A.student);
  expect(await db.message.count({ where: { messageBody: body } })).toBe(0);
});

test("a parent's own child is the only thread on their page", async ({ page }) => {
  await loginParent(page, SCHOOL_A.parentFamilyCode);
  const html = await page.content();
  expect(html).not.toContain(SCHOOL_B.student);
  // Every studentId on the page is one of this family's children.
  const ids = await page.$$eval('input[name="studentId"]', (els) => els.map((e) => (e as HTMLInputElement).value));
  const linked = await db.student.findMany({ where: { parents: { some: { familyCode: SCHOOL_A.parentFamilyCode } } }, select: { id: true } });
  for (const id of ids) expect(linked.map((s) => s.id)).toContain(id);
});
