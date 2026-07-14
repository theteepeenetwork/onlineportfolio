import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, loginTeacher, clearSession, fetchStatus } from "../helpers";

// ===========================================================================
// The sticker sheet (/teacher/queue/[id]) takes an item id, so it gets a
// cross-tenant isolation test (AGENTS.md convention; SAFEGUARDING rules 4 & 8):
// a School B teacher must never open a School A child's waiting moment, even
// with a valid id in hand.
// ===========================================================================

test.describe("A1 · Sticker sheet is scoped across tenants (/teacher/queue/[id])", () => {
  // Read a real School A pending-item URL the honest way: from School A's own
  // queue, where each waiting row links to its sticker sheet.
  async function schoolAStickerSheetUrl(page: import("@playwright/test").Page): Promise<string> {
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/teacher/queue");
    const href = await page.locator('a[href^="/teacher/queue/"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    return href!;
  }

  test("School A's own teacher can open their sticker sheet; School B cannot", async ({ page }) => {
    const url = await schoolAStickerSheetUrl(page);

    // The owner sees the sheet.
    expect(await fetchStatus(page, url)).toBe(200);

    // A School B teacher with the exact id gets a 404 — deny by default,
    // revealing nothing about whether the moment exists.
    await clearSession(page);
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, url)).toBe(404);
    await page.goto(url);
    await expect(page.getByText(/sticker sheet/i)).toHaveCount(0);
  });

  test("another School A teacher (different class) cannot open it either", async ({ page }) => {
    const url = await schoolAStickerSheetUrl(page);
    await clearSession(page);
    // Miss Malik teaches Butterflies, not Sunflower — need-to-know applies
    // inside a school too (SAFEGUARDING rule 4).
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, url)).toBe(404);
  });
});
