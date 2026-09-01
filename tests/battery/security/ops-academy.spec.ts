import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { asOperator, clearSession, loginTeacher, SCHOOL_A } from "../helpers";
import {
  ACADEMY_DOMAIN,
  ACADEMY_MANAGER_EMAIL,
  academyClasses,
} from "@/app/ops/academy/roster";

// ===========================================================================
// The two screens that let an operator find StoryJar's own school and see what
// it has published.
//
// Neither may change anything, and /ops/academy may not read anything. What is
// worth testing is exactly the risk each one carries:
//
//   /ops/academy  — it is a reference card copied from a script. The risk is
//                   DRIFT: the seed changes and the screen keeps confidently
//                   printing yesterday's codes at somebody trying to sign in.
//                   And the risk of a screen that lists sign-in addresses is
//                   that a password joins them.
//   /ops/library  — it reads a table whose payload columns are teacher-authored
//                   content. The risk is that one of them reaches the page.
// ===========================================================================

const SEED = readFileSync(
  path.join(process.cwd(), "scripts", "ops", "seed-academy.mjs"),
  "utf8",
);

test.describe("/ops/academy is a reference card, and it must not drift", () => {
  // src/app/ops/academy/roster.ts derives every address and every code that
  // screen prints. The seed script derives the same strings independently,
  // because it is .mjs and cannot import the TypeScript module. Two copies of
  // one scheme is exactly the arrangement where the second goes quietly wrong,
  // so this is the test that makes the divergence loud.
  test("the roster still matches scripts/ops/seed-academy.mjs", () => {
    expect(SEED, "the domain the screen prints").toContain(`const DOMAIN = "${ACADEMY_DOMAIN}"`);

    // The code formula, character for character.
    expect(
      SEED,
      "the sign-in code formula has changed in the seed and not on the screen",
    ).toContain('`ACD${String(yearIndex + 1).padStart(2, "0")}${formIndex + 1}`');

    // Every year group and form, so adding "Year 7" to one side fails here.
    const rows = academyClasses();
    expect(rows.length, "sixteen classes: eight year groups, two forms").toBe(16);
    for (const row of rows) {
      expect(SEED, `year group "${row.yearGroup}" is on the screen`).toContain(`"${row.yearGroup}"`);
      expect(SEED, `form "${row.form}" is on the screen`).toContain(`"${row.form}"`);
      expect(row.teacherEmail).toContain(`@${ACADEMY_DOMAIN}`);
    }

    // And a worked example each end of the list, because a formula that agrees
    // with itself is not a formula that produces the right string.
    expect(rows[0]).toMatchObject({ className: "Nursery Oak", signInCode: "ACD011", ageMode: "EYFS" });
    expect(rows[15]).toMatchObject({ className: "Year 6 Elm", signInCode: "ACD082", ageMode: "KS2" });
    expect(rows[4]).toMatchObject({ className: "Year 1 Oak", signInCode: "ACD031", ageMode: "KS1" });
  });

  test("it prints the addresses and never a password", async ({ page }) => {
    await asOperator(page);
    await page.goto("/ops/academy");

    await expect(page.getByRole("heading", { name: "StoryJar Academy", level: 1 })).toBeVisible();
    await expect(page.getByText(ACADEMY_MANAGER_EMAIL)).toBeVisible();
    await expect(page.getByText("year3.oak@academy.storyjar.co.uk")).toBeVisible();
    await expect(page.getByText("ACD011", { exact: true })).toBeVisible();

    // THE ASSERTION THIS SCREEN EXISTS TO SURVIVE. seed-academy.mjs refuses to
    // run without ACADEMY_PASSWORD and ships no default, because a password in
    // the repository is a published credential for a live school (rule 12). A
    // screen listing sixteen sign-in addresses is where somebody would helpfully
    // add the password beside them.
    const body = (await page.locator("body").innerText()).toLowerCase();
    // A value assigned to something called "password". The ellipsis in the
    // seed command on the screen is deliberately NOT a value, which is the
    // difference this pattern has to be able to tell.
    expect(body, "the shared password must never be printed here").not.toMatch(
      /password\w*\s*[:=]\s*['"]?[a-z0-9!@#$%^&*_-]{6,}/,
    );
    expect(body).toContain("password manager");

    // It reads nothing, so it must hold nothing a school owns. St Bede's is a
    // real fixture tenant and its teacher's address is an adult record the
    // operator can legitimately reach elsewhere — but not from this screen,
    // which is meant to be a constant.
    expect(body).not.toContain(SCHOOL_A.admin.email);
    expect(body).not.toContain(SCHOOL_A.name.toLowerCase());
  });

  test("a teacher cannot reach either operator screen", async ({ page }) => {
    await clearSession(page);
    await loginTeacher(page, SCHOOL_A.admin);
    for (const url of ["/ops/academy", "/ops/library"]) {
      await page.goto(url);
      await expect(
        page.getByRole("navigation", { name: /operations/i }),
        `${url} must 404 for a teacher, exactly as every other operator screen does`,
      ).toHaveCount(0);
    }
  });
});

test.describe("/ops/library shows uptake and no content", () => {
  test("it lists published and unpublished rows, and offers nothing to press", async ({ page }) => {
    await asOperator(page);
    await page.goto("/ops/library");

    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();

    // Both fixtures, and the unpublished one is the point: it is the state a
    // teacher's own screen cannot show, and the reason an operator is given
    // this screen at all.
    await expect(page.getByText("Our autumn walk")).toBeVisible();
    await expect(page.getByText("Not published yet", { exact: false }).first()).toBeVisible();

    // Read-only. Sign out is the bar's, not this screen's.
    const buttons = await page.locator("main button").count();
    expect(buttons, "the library screen has no controls of its own").toBe(0);
    expect(await page.locator("main form").count()).toBe(0);
  });

  test("no payload column reaches the page", async ({ page }) => {
    const rows = await db.sharedActivity.findMany({
      select: { templatePathsJson: true, quizJson: true, objectsJson: true, instructions: true },
    });

    await asOperator(page);
    await page.goto("/ops/library");
    // The RSC payload, not the rendered text: a field that is fetched and not
    // displayed is still a field that left the server.
    const html = await page.content();

    for (const row of rows) {
      for (const payload of [row.templatePathsJson, row.quizJson, row.objectsJson]) {
        if (!payload) continue;
        expect(
          html,
          "a teacher-authored payload column reached an operator screen",
        ).not.toContain(payload);
      }
      // Instructions are read aloud to a child and are not on this DTO either.
      if (row.instructions) expect(html).not.toContain(row.instructions);
    }

    // No media element of any kind: the blindness gate refuses img/video/url()
    // under the ops roots, and this is the runtime half of that.
    expect(await page.locator("main img, main video, main audio, main iframe").count()).toBe(0);
  });

  test("the copy count is a number and never a list", async ({ page }) => {
    // Give the published fixture a copy, so the figure is non-zero and a
    // regression that leaked the relation would have something to leak. Made
    // directly rather than through the Add button: that journey is already
    // proved in shared-activities.spec.ts, and what is under test here is the
    // operator screen, not the teacher's.
    const shared = await db.sharedActivity.findUniqueOrThrow({
      where: { slug: "seed-autumn-walk" },
      select: { id: true },
    });
    const teacher = await db.teacher.findUniqueOrThrow({
      where: { email: SCHOOL_A.admin.email },
      select: { id: true },
    });
    const copy = await db.activityTemplate.create({
      data: {
        title: "A copy taken for the uptake figure",
        teacherId: teacher.id,
        sourceSharedActivityId: shared.id,
      },
      select: { id: true, title: true },
    });

    await asOperator(page);
    await page.goto("/ops/library");
    await expect(page.getByText(/1 teacher has added it/)).toBeVisible();

    // The count, never the copy. Neither the template's id nor the teacher who
    // took it may appear anywhere in the payload.
    const html = await page.content();
    expect(html, "an operator screen named a teacher's own template").not.toContain(copy.id);
    expect(html).not.toContain(copy.title);
    expect(html).not.toContain(SCHOOL_A.admin.email);

    await db.activityTemplate.delete({ where: { id: copy.id } });
  });
});
