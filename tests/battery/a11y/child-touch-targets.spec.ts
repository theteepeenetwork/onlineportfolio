import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, loginStudent } from "../helpers";

// ===========================================================================
// B3 — Every control a CHILD taps is at least 64px
//
// SAFEGUARDING rule 18 sits under "Access for every child": ">=64px child touch
// targets". Not 44 — 44 is the general web floor, written for adults with adult
// fingers and adult motor control. A four-year-old's aim is not an adult's, and
// a child who cannot hit the button cannot use the tool.
//
// This lives in the BLOCKING a11y gate rather than the report-only UX project
// because rule 18 is a safeguarding rule, not a nicety. It sweeps whole pages
// rather than naming buttons, so a control added tomorrow is covered without
// anyone remembering to come back here.
//
// Why it exists: three child controls shipped at 44px this week — including the
// read-aloud buttons, which are the affordance FOR the pre-readers the floor is
// written to protect. Nothing caught them. axe has no touch-target rule at AA,
// and the one existing 64px assertion (ux/responsive.spec.ts) checks name-cards
// only, and is report-only.
// ===========================================================================

const FLOOR = 64;

// Controls that are legitimately not a child's target, even on a child's page.
// Keep this list tiny and justify every entry — it is the whole way this gate
// can be weakened.
const NOT_A_CHILD_TARGET = [
  // The Next.js dev-tools badge, injected only in dev. Not ours, not shipped.
  "[data-nextjs-dev-tools-button]",
  "#next-logo",
];

async function undersizedControls(page: Page) {
  return page.evaluate(
    ({ floor, exempt }) => {
      const out: { label: string; w: number; h: number }[] = [];
      const controls = document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), select, textarea");
      for (const el of controls) {
        if (exempt.some((sel) => el.matches(sel) || el.closest(sel))) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // not rendered
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.height < floor || r.width < floor) {
          const label =
            el.getAttribute("aria-label") ||
            (el.textContent || "").trim().slice(0, 40) ||
            el.tagName.toLowerCase();
          out.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      return out;
    },
    { floor: FLOOR, exempt: NOT_A_CHILD_TARGET },
  );
}

// The classroom iPad in landscape — the device these screens are designed for.
test.use({ viewport: { width: 1024, height: 768 } });

test("every control on the class-code screen meets the child touch floor", async ({ page }) => {
  await page.goto("/login/student");
  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
});

test("every control on the name picker meets the child touch floor", async ({ page }) => {
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);
  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
});

test("every control on a child's jar meets the child touch floor", async ({ page }) => {
  // Chloe carries seeded waiting work, so the status strips — and their
  // read-aloud buttons — are on screen to be measured.
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  const small = await undersizedControls(page);
  expect(small, `controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
});

test("every control on the add-work screens meets the child touch floor", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, "Chloe");
  for (const path of ["/student/new/photo", "/student/new/words"]) {
    await page.goto(path);
    const small = await undersizedControls(page);
    expect(small, `${path} — controls below ${FLOOR}px: ${JSON.stringify(small)}`).toEqual([]);
  }
});
