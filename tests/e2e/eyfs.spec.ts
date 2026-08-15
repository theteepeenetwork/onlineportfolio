import { test, expect, type Page } from "@playwright/test";

// SJ-06 — the EYFS (3–5) register, design 6a "Make first, icon-only".
//
// The youngest, most locked-down register: no reading is required to use it, a
// spoken greeting is the header, and the four capture tiles are icon-only. This
// proves the register reaches the child's screen (Acorns / ACO789 is seeded
// EYFS), that a capture still lands PENDING in the approval queue — celebrated
// INLINE, not via the /popped page — and that the jar bar unfolds the child's
// moments. Safeguarding: nothing here bypasses teacher approval (rule 3).

async function signInAcorns(page: Page, name: string) {
  await page.goto("/login/student?code=ACO789");
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
}

test("the EYFS greeting is the header, and the tiles are icon-only", async ({ page }) => {
  await signInAcorns(page, "Ava");

  // A spoken greeting, not a jar/journal title. No "Ava's jar" anywhere.
  await expect(page.getByRole("heading", { name: "Hello, Ava!" })).toBeVisible();
  await expect(page.getByText("Ava's jar")).toHaveCount(0);

  // The four tiles carry their word only as an aria-label — a pre-reader gets an
  // icon, assistive tech gets the word.
  for (const label of ["photo", "draw", "voice", "words"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});

test("writing words pops the moment in inline (no /popped redirect) and folds shut", async ({ page }) => {
  // Theo has no seeded moments, so the flow is unambiguous.
  await signInAcorns(page, "Theo");

  await page.getByRole("button", { name: "words", exact: true }).click();
  await page.getByLabel("Write your words here").fill("Today I played outside");
  await page.getByRole("button", { name: "Add to my jar" }).click();

  // The celebration shows IN PLACE — the child is not navigated to /popped.
  await expect(page.getByText("Popped in!")).toBeVisible();
  await expect(page).toHaveURL(/\/student$/);

  // ~1.8s later the surface folds itself shut and the tiles return.
  await expect(page.getByRole("button", { name: "Add to my jar" })).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByRole("button", { name: "words", exact: true })).toBeVisible();

  // It really landed: the moment is now waiting for the teacher (PENDING). The
  // jar bar's waiting chip appears (Theo had none before).
  await expect(page.getByRole("button", { name: /in your jar/i })).toContainText("1");
});

test("the jar bar unfolds the child's approved moments", async ({ page }) => {
  await signInAcorns(page, "Ava");

  // The moments window starts folded — the grid-rows fold keeps the cards in the
  // DOM but clipped, so the fold STATE is read from the button's aria-expanded.
  const jar = page.getByRole("button", { name: /in your jar/i });
  await expect(jar).toHaveAttribute("aria-expanded", "false");

  await jar.click();
  await expect(jar).toHaveAttribute("aria-expanded", "true");

  // Ava's two seeded approved moments are shown in the window.
  await expect(page.getByText("My rainbow dragon")).toBeVisible();
  await expect(page.getByText("My words", { exact: true })).toBeVisible();
});

test("EYFS keeps the sticker/praise payoff and the one-tap heart back", async ({ page }) => {
  await signInAcorns(page, "Ava");
  await page.getByRole("button", { name: /in your jar/i }).click();

  // The teacher's praise note rides along on the moment (owner decision: EYFS
  // keeps the feedback loop).
  await expect(page.getByText(/What a bright dragon/)).toBeVisible();

  // The child can send exactly one fixed heart back — never free text (rule 2).
  const heart = page.getByRole("button", { name: /send a heart back/i });
  await expect(heart).toBeVisible();
  await heart.click();
  await expect(page.getByText(/you sent a heart back/i)).toBeVisible();
});
