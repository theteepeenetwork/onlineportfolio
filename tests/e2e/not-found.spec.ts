import { test, expect } from "@playwright/test";

// Any URL that matches no route must be a way out, not a wall.
//
// The Wriggler found this by fuzzing /ops, but /ops is the instance and not the
// class. `src/app/student/not-found.tsx` covers the child's own area, and Next
// resolves a boundary up the segment tree from the MATCHED route — so it can
// only catch /student/*. A child who mistypes /studnet, or a parent following a
// link from a letter printed last term, missed it entirely and met the
// framework's default 404: adult reading age, nothing to tap.
//
// So this walks the class. Each of these is somebody's plausible typo or stale
// link, and each is outside /student.
const STRAY = [
  "/ops", // the fuzzing bot's original find — and the one that must give nothing away
  "/studnet", // a child, one key out
  "/teachar", // a teacher, likewise
  "/teacher/class/does-not-exist",
  "/nonsense-nobody-has-ever-typed",
];

for (const path of STRAY) {
  test(`a stray URL is a way out, not a wall: ${path}`, async ({ page }) => {
    await page.goto(path);

    // Signed in as nobody. The boundary must render without a session, because
    // that is the commonest way to arrive at it.
    const out = page.getByRole("link", { name: /back to the start/i });
    await expect(out, "a page with nothing to tap is the dead end this fixes").toBeVisible();

    // The child touch floor (SAFEGUARDING rule 18), because a child can reach
    // this page and the child floor also clears the adult one.
    const box = (await out.boundingBox())!;
    expect(box.height, `the way out is ${box.height}px tall`).toBeGreaterThanOrEqual(64);

    await out.click();
    await page.waitForURL((u) => u.pathname === "/");
  });
}

// The one thing this page must NOT do.
//
// /ops answers notFound() to everyone who is not an operator, precisely so that
// its existence is not discoverable. A helpful "did you mean the operations
// console?" would give that away on the very page designed to be reached by
// accident — and the reader may be a child who mistyped.
test("the boundary says nothing about what does or does not exist", async ({ page }) => {
  await page.goto("/ops");
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const giveaway of ["operator", "operations", "console", "sign in", "permission", "access", "admin"]) {
    expect(text, `the not-found page mentions "${giveaway}"`).not.toContain(giveaway);
  }
  // Nor the framework's default, which is what this replaced.
  expect(text).not.toContain("this page could not be found");
});
