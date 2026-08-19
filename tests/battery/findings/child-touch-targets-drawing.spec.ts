import { test, expect, type Page } from "@playwright/test";
import { loginStudent } from "../helpers";
import { ACADEMY } from "../personas/world";

// ===========================================================================
// F37 — the child touch-target gate does not cover the drawing canvas.
//
// `a11y/child-touch-targets.spec.ts` is a BLOCKING gate that sweeps whole pages
// for anything under the 64px SAFEGUARDING rule 18 asks for. It covers the
// class-code screen, the name picker, a child's jar, and /student/new/photo,
// /words and /audio.
//
// It does not cover /student/new/drawing, and it does not cover an activity
// response — the two full-screen canvases, which are where a child spends most
// of their time and which carry the densest set of controls in the product.
// Every tool on them is below the floor.
//
// Found by the user-tester team (tests/battery/personas/children.spec.ts): Nell,
// aged six, on a classroom tablet, trying to draw something.
//
// This spec asserts the INTENDED behaviour — rule 18 applied to the canvases
// too — so it FAILS while the gap is open, which is what this project is for
// (see FINDINGS.md). When the canvas controls are fixed, move it into
// `a11y/child-touch-targets.spec.ts` so it stays fixed, and delete F37.
// ===========================================================================

const FLOOR = 64;

// Same exemptions as the blocking gate, for the same reason: the Next dev-tools
// badge is injected in development and is not ours.
const NOT_A_CHILD_TARGET = ["[data-nextjs-dev-tools-button]", "#next-logo"];

async function undersizedControls(page: Page) {
  return page.evaluate(
    ({ floor, exempt }) => {
      const out: { label: string; w: number; h: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type=hidden]), select, textarea, [role="button"]',
      )) {
        if (exempt.some((sel) => el.matches(sel) || el.closest(sel))) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.height < floor || r.width < floor) {
          out.push({
            label:
              el.getAttribute("aria-label") ||
              el.getAttribute("title") ||
              (el.textContent || "").trim().slice(0, 40) ||
              el.tagName.toLowerCase(),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
      return out;
    },
    { floor: FLOOR, exempt: NOT_A_CHILD_TARGET },
  );
}

// The classroom tablet these screens are designed for.
test.use({ viewport: { width: 1024, height: 768 } });

test("F37 — every tool on a child's drawing canvas meets the 64px floor", async ({ page }) => {
  await loginStudent(page, ACADEMY.classes.ks1.code, ACADEMY.classes.ks1.children[2]);
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();

  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px on the drawing canvas: ${JSON.stringify(small)}`).toEqual([]);
});

test("F37 — every control on an EYFS child's jar meets the 64px floor", async ({ page }) => {
  // The blocking gate checks "a child's jar" — as a KS1 child, at 1024×768. The
  // EYFS register renders a different shell entirely (EyfsHome), for the
  // youngest children in the product, and nothing measures it. On a tablet held
  // portrait, which is how a Reception child holds one, its buttons are 56px.
  await page.setViewportSize({ width: 768, height: 1024 });
  await loginStudent(page, ACADEMY.classes.eyfs.code, ACADEMY.classes.eyfs.children[0]);
  await expect(page.getByRole("heading", { name: /hello/i })).toBeVisible();

  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px on an EYFS jar: ${JSON.stringify(small)}`).toEqual([]);
});

test("F37 — every tool on an activity response meets the 64px floor", async ({ page }) => {
  await loginStudent(page, ACADEMY.classes.ks1.code, ACADEMY.classes.ks1.children[3]);
  await page.goto("/student/activities");
  const activity = page.locator('a[href^="/student/activities/"]').first();
  await expect(activity).toBeVisible();
  await activity.click();
  await expect(page.locator("canvas")).toBeVisible();

  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px on an activity response: ${JSON.stringify(small)}`).toEqual([]);
});
