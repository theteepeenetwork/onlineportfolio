import { test, expect, type Page } from "@playwright/test";
import { teacherLogin, studentLogin } from "./helpers";

// The nine work tiles fill the jar as you scroll the 220vh hero track. These
// helpers drive that track deterministically and read the styles the ScrollFill
// island sets, rather than the mid-flight animated values.

type TileState = { opacity: string; transform: string; identity: boolean };

// Scroll to a fraction (0..1) of the hero-track's scrollable range. The track
// is 220vh, so its range is (trackHeight - viewportHeight). We scroll instantly
// to defeat the page's `scroll-behavior: smooth`, so getBoundingClientRect is
// settled by the time the scroll listener runs.
async function scrollTrack(page: Page, fraction: number) {
  await page.evaluate((f) => {
    const track = document.getElementById("hero-track")!;
    const range = track.getBoundingClientRect().height - window.innerHeight;
    window.scrollTo({ top: range * f, behavior: "instant" as ScrollBehavior });
  }, fraction);
}

// Read a tile's settled style. getComputedStyle catches the animated value, so
// callers poll (waitForRevealed / expect.poll) until the transition has landed.
async function tileState(page: Page, i: number): Promise<TileState> {
  return page.evaluate((index) => {
    const el = document.querySelectorAll("[data-scroll-tile]")[index];
    const cs = getComputedStyle(el);
    const identity = cs.transform === "none" || cs.transform === "matrix(1, 0, 0, 1, 0, 0)";
    return { opacity: cs.opacity, transform: cs.transform, identity };
  }, i);
}

// Count the tiles whose reveal has fully settled: opacity 1 and identity transform.
async function revealedCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll("[data-scroll-tile]"));
    return tiles.filter((el) => {
      const cs = getComputedStyle(el);
      const identity = cs.transform === "none" || cs.transform === "matrix(1, 0, 0, 1, 0, 0)";
      return cs.opacity === "1" && identity;
    }).length;
  });
}

// Wait until exactly `n` tiles have settled into the revealed state (the reveal
// has a 0.7s transition, so assert on the JS-set target, not the intermediate).
async function waitForRevealed(page: Page, n: number) {
  await page.waitForFunction((expected) => {
    const tiles = Array.from(document.querySelectorAll("[data-scroll-tile]"));
    const shown = tiles.filter((el) => {
      const cs = getComputedStyle(el);
      const identity = cs.transform === "none" || cs.transform === "matrix(1, 0, 0, 1, 0, 0)";
      return cs.opacity === "1" && identity;
    }).length;
    return shown === expected;
  }, n);
}

test.describe("Landing page — jar fills on scroll", () => {
  test("all nine tiles start hidden and off-screen at the top", async ({ page }) => {
    await page.goto("/");
    // The reveal island runs on mount and pushes every tile off-screen.
    await waitForRevealed(page, 0);

    for (let i = 0; i < 9; i++) {
      const state = await tileState(page, i);
      expect(state.opacity, `tile ${i + 1} hidden`).toBe("0");
      expect(state.identity, `tile ${i + 1} off-screen (non-identity transform)`).toBe(false);
    }
  });

  test("about half the tiles are revealed at the middle of the track", async ({ page }) => {
    await page.goto("/");
    await waitForRevealed(page, 0);

    await scrollTrack(page, 0.5);
    // n = round(0.5 * 9) = 5; allow a little slack for rounding/measurement.
    await expect.poll(() => revealedCount(page)).toBeGreaterThanOrEqual(3);
    await expect.poll(() => revealedCount(page)).toBeLessThanOrEqual(6);

    // The lowest tiles fill first; the topmost stays hidden.
    const first = await tileState(page, 0);
    const last = await tileState(page, 8);
    expect(first.opacity).toBe("1");
    expect(last.opacity).toBe("0");
  });

  test("every tile is revealed and the cue fades at the bottom of the track", async ({ page }) => {
    await page.goto("/");
    await waitForRevealed(page, 0);

    await scrollTrack(page, 1);
    await waitForRevealed(page, 9);

    for (let i = 0; i < 9; i++) {
      const state = await tileState(page, i);
      expect(state.opacity, `tile ${i + 1} visible`).toBe("1");
      expect(state.identity, `tile ${i + 1} at identity transform`).toBe(true);
    }

    // The "Scroll to fill the jar" cue fades out once the jar is full.
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.querySelector("[data-scroll-cue]")!).opacity),
      )
      .toBe("0");
  });

  test("scrolling back to the top hides the tiles again", async ({ page }) => {
    await page.goto("/");
    await scrollTrack(page, 1);
    await waitForRevealed(page, 9);

    await scrollTrack(page, 0);
    await waitForRevealed(page, 0);
  });

  test("with reduced motion the tiles stay visible and untransformed", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");

    for (let i = 0; i < 9; i++) {
      const state = await tileState(page, i);
      expect(state.opacity, `tile ${i + 1} visible (fallback)`).toBe("1");
      expect(state.identity, `tile ${i + 1} untransformed (fallback)`).toBe(true);
    }
    await context.close();
  });
});

test.describe("Landing page — navigation and content", () => {
  test("nav links jump to sections that exist", async ({ page }) => {
    await page.goto("/");
    for (const id of ["how", "safeguarding", "pricing", "faq"]) {
      await page.locator(`nav a[href="#${id}"]`).click();
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
  });

  // The hidden tiles are parked at translate(20px,-480px) — over the nav — with
  // opacity 0, and an opacity-0 element still swallows clicks. Decoration must
  // never intercept a pointer, so assert the real thing a visitor does: the
  // topmost element at the centre of each sign-in button IS that button.
  test("the decorative hero tiles never intercept a click on the sign-in buttons", async ({ page }) => {
    await page.goto("/");
    await waitForRevealed(page, 0); // tiles now parked over the header

    for (const href of ["/login/student", "/login/teacher"]) {
      const topmostIsTheLink = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!(hit && hit.closest(sel));
      }, `a[href="${href}"]`);
      expect(topmostIsTheLink, `${href} is clickable, not covered by hero decoration`).toBe(true);
    }
  });

  test("the hero calls-to-action lead to the teacher auth pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Teacher sign in" }).click();
    await expect(page).toHaveURL(/\/login\/teacher$/);

    await page.goto("/");
    await page.getByRole("link", { name: "Start your class jar" }).first().click();
    await expect(page).toHaveURL(/\/signup\/teacher$/);
  });

  test("the six FAQ questions and four promise cards all render", async ({ page }) => {
    await page.goto("/");
    const faqs = [
      "Do children need email addresses or passwords?",
      "Can anything go into a child's jar without me seeing it?",
      "Does it count as assessment evidence?",
      "What devices does it work on?",
      "Where is the data stored?",
      "When can parents see the jar?",
    ];
    for (const q of faqs) {
      await expect(page.getByRole("group").filter({ hasText: q })).toHaveCount(1);
    }

    for (const chip of ["Promise one", "Promise two", "Promise three", "Promise four"]) {
      await expect(page.getByText(chip, { exact: true })).toBeVisible();
    }
  });
});

test.describe("Landing page — redirects", () => {
  test("a signed-in teacher visiting / lands on the teacher app", async ({ page }) => {
    await teacherLogin(page);
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/teacher");
  });

  test("a signed-in student visiting / lands on the student app", async ({ page }) => {
    await studentLogin(page, "Amara");
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/student");
  });

  test("an anonymous visitor sees the marketing page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: /Every child.s story/ })).toBeVisible();
  });
});

test("no console errors on load or through the full scroll sequence", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await waitForRevealed(page, 0);
  await scrollTrack(page, 0.5);
  await scrollTrack(page, 1);
  await waitForRevealed(page, 9);
  await scrollTrack(page, 0);
  await waitForRevealed(page, 0);

  expect(errors).toEqual([]);
});
