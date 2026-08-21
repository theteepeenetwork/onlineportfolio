import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// The teacher's half of the Claude connector: making a token, being told once,
// and taking it away again. The API behind it is covered by the blocking
// security spec; this is about whether a teacher can actually work it.

test.describe("Connect Claude", () => {
  test.beforeEach(async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/teacher/account");
  });

  test("says plainly what Claude can and cannot reach", async ({ page }) => {
    const panel = page.getByRole("region", { name: "Connect Claude" });
    await expect(panel).toBeVisible();
    // The promise a teacher is making when they connect it. If this sentence
    // ever stops being true, this test should be what stops it shipping.
    await expect(panel).toContainText("not your pupils");
    await expect(panel).toContainText("until you set it for a class yourself");
  });

  test("makes a token, shows it once, and hands over a command that will work", async ({ page }) => {
    const panel = page.getByRole("region", { name: "Connect Claude" });
    await panel.getByLabel("What's it for?").fill("Playwright");
    await panel.getByRole("button", { name: "Make a token" }).click();

    const command = panel.getByLabel("Command to connect Claude Code");
    await expect(command).toBeVisible();
    const value = await command.inputValue();
    expect(value).toContain("claude mcp add --transport http storyjar");
    expect(value).toContain("/api/mcp");
    expect(value).toContain("Authorization: Bearer sj_live_");
    await expect(panel).toContainText("StoryJar can't show it again");

    // The token really is live, and the connector answers to it.
    const token = /Bearer (sj_live_[A-Za-z0-9_-]+)/.exec(value)?.[1];
    expect(token).toBeTruthy();
    const res = await page.request.get("/api/v1/me", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);

    // Reloading shows the row, and never the token again.
    await page.reload();
    const after = page.getByRole("region", { name: "Connect Claude" });
    await expect(after).toContainText("Playwright");
    expect(await after.textContent()).not.toContain(token!);

    // Revoking is real, not cosmetic: the same token stops working.
    await after.getByRole("listitem").filter({ hasText: "Playwright" }).getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByRole("region", { name: "Connect Claude" })).not.toContainText("Playwright");
    const afterRevoke = await page.request.get("/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });
    expect(afterRevoke.status()).toBe(401);
  });
});
