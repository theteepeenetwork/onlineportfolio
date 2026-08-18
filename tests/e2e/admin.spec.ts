import { test, expect } from "@playwright/test";
import { teacherLogin, logout } from "./helpers";

test.describe("School admin", () => {
  test("an admin sees the whole-school staff console", async ({ page }) => {
    // The seeded demo teacher is the admin of St Bede's Primary.
    await teacherLogin(page);
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Staff & whole-school" })).toBeVisible();
    await expect(page.getByText("St Bede’s Primary")).toBeVisible();
    // The staff table lists colleagues with their roles + statuses.
    await expect(page.getByText("Miss Malik")).toBeVisible();
    await expect(page.getByText("Invited")).toBeVisible();
    // The access-rule policy is stated on the page.
    await expect(page.getByText(/never see pupils. work unless they teach the class/)).toBeVisible();
  });

  test("an admin can invite a member of staff", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/admin");

    await page.getByRole("button", { name: /Invite staff/ }).click();
    await page.fill("#inv-name", "Mr Okafor");
    await page.fill("#inv-email", "d.okafor@stbedes.sch.uk");
    await page.getByRole("button", { name: "Send invite" }).click();

    // The new colleague appears in the table as invited.
    await expect(page.getByText("Mr Okafor")).toBeVisible();
    await expect(page.getByText("d.okafor@stbedes.sch.uk")).toBeVisible();
  });

  test("the staff-row menu opens as an overlay and can change a role", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/admin");

    await page.getByRole("button", { name: "Actions for Miss Malik" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Edit role" }).click();
    await menu.getByRole("menuitem", { name: "Teaching assistant" }).click();

    // Sam Doyle was already a TA; Miss Malik becoming one makes two.
    await expect(page.getByText("Teaching assistant")).toHaveCount(2);

    // The action is recorded in the audit log for accountability.
    await page.getByRole("button", { name: "Audit log" }).click();
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("Changed a role")).toBeVisible();
    await expect(page.getByText(/Miss Malik/)).toBeVisible();
  });

  test("the guide says what an admin can do, and leads to it", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/admin");

    await page.getByRole("button", { name: "Guide", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What you can do" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invite a colleague" })).toBeVisible();
    // The guide is a map, so its directions have to actually go somewhere.
    await page.getByRole("heading", { name: "Invite a colleague" }).locator("..").getByRole("button", { name: /Go to Staff/ }).click();
    await expect(page.getByRole("heading", { name: "Staff & whole-school" })).toBeVisible();
  });

  test("the guide names what Storyjar deliberately will not do", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Guide", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Things Storyjar will not do" })).toBeVisible();
    // Rule 5, stated where an admin will look for it rather than only in the policy.
    await expect(page.getByText(/you see a child.s work only if you teach that class/i)).toBeVisible();
  });

  test("the promises tab carries the break-glass procedure, notification first", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/admin");

    await page.getByRole("button", { name: "Promises", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Promises & procedures" })).toBeVisible();
    // Rule 20 is the promise this procedure is the honest limit of.
    await expect(page.getByText("Rule 20", { exact: true })).toBeVisible();

    const breakGlass = page.locator("details", { hasText: "Break glass" }).first();
    await breakGlass.locator("summary").click();

    // The control is the timing: told before, never afterwards (exceptional-access).
    await expect(breakGlass.getByRole("heading", { name: /You are told before we look/ })).toBeVisible();
    await expect(breakGlass.getByText(/designated officer \(LADO\)/)).toBeVisible();
    // And the list of things that are never a reason to look.
    await expect(breakGlass.getByRole("heading", { name: "What is never a trigger" })).toBeVisible();
  });

  test("a non-admin teacher is redirected away from /admin", async ({ page }) => {
    // Make a fresh (non-admin) teacher via signup, then try to reach /admin.
    await page.goto("/signup/teacher");
    await page.selectOption("#su-title", "Ms");
    await page.fill("#su-fullname", "Nadia Khan");
    await page.fill("#su-email", "nadia@school.uk");
    await page.fill("#su-pass", "password123");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.fill("#su-school", "Green Lane Primary");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.fill("#su-class", "Owls");
    await page.getByRole("button", { name: "Create class" }).click();
    await page.fill("#su-children", "Ada");
    await page.getByRole("button", { name: "Add pupils" }).click();
    await expect(page.getByRole("heading", { name: /class code/ })).toBeVisible();

    // This teacher has no admin school → /admin bounces to their teacher view.
    await page.goto("/admin");
    await expect(page).toHaveURL((url) => url.pathname === "/teacher");
    await expect(page.getByRole("heading", { name: /Hello, Ms Khan/ })).toBeVisible();
  });

  test("an anonymous visitor cannot reach /admin", async ({ page }) => {
    await logout(page);
    await page.goto("/admin");
    // Bounced to the marketing site (not signed in at all).
    await expect(page).toHaveURL((url) => url.pathname === "/");
  });
});
