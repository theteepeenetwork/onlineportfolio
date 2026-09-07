import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, loginTeacher } from "../helpers";

// ===========================================================================
// B4 — Every control in the teacher and admin SHELL is at least 44px
//
// The sibling of child-touch-targets.spec.ts, for the adults. That one sweeps
// whole child-facing pages at 64px (SAFEGUARDING rule 18); this one sweeps the
// navigation furniture at 44 and deliberately does not sweep page bodies. Read
// the two paragraphs below before widening it, because both limits are choices
// rather than laziness.
//
// WHICH FLOOR, AND WHY IT IS ONE FLOOR AND NOT TWO
//
// WCAG 2.2 AA 2.5.8 asks for 24px. 44 is the figure the persona team measures
// adults against, and the reason is the device rather than the standard: the
// shell below renders on a classroom iPad, held one-handed, by a teacher with a
// class in front of them. 24px is the floor for a control that is demonstrably
// pointer-only, and nothing in these regions is — the same rail is tapped on a
// tablet and clicked on a staffroom laptop. So this gate uses 44 everywhere
// inside them, and the next person to read it should not "fix" a 30px control
// elsewhere in the product to 44 on the strength of this file. Where 24 is the
// applicable standard, 24 is the answer.
//
// WHY IT SWEEPS THE SHELL AND NOT THE WHOLE PAGE
//
// Because a gate that lands red is a gate somebody deletes. The shell's regions
// are bounded and every control in them has been measured and fixed; page
// bodies have not, and there are known controls below the floor still in them —
// the per-moment "Delete" links on a child's journal among others. Those are
// logged in FINDINGS.md (F49) with their measurements rather than left in
// somebody's head, and they are not this gate's business until they are fixed.
// A sweep of a region whose universe is known is a real sweep: a control added
// to the rail tomorrow is caught without anybody remembering to come back here.
//
// A NOTE ON COUNTING, because it cost an hour. USER_TESTING.md lists one
// finding per *label*, so four classes named in the rail are four findings and
// one component. The triage read that report's count as a count of controls and
// said "seven"; there were thirteen distinct controls behind those findings.
// When a persona report and a component disagree about how many things are
// wrong, the component is right.
// ===========================================================================

const FLOOR = 44;

// The regions this gate owns, marked in the components themselves.
const SHELL = "[data-shell]";

async function undersizedInShell(page: Page) {
  return page.evaluate(
    ({ floor, region }) => {
      const out: { where: string; label: string; w: number; h: number }[] = [];
      for (const shell of document.querySelectorAll<HTMLElement>(region)) {
        const controls = shell.querySelectorAll<HTMLElement>(
          'button, a[href], input:not([type=hidden]), select, textarea, [role="button"]',
        );
        for (const el of controls) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue; // not rendered
          if (getComputedStyle(el).visibility === "hidden") continue;
          if (r.height < floor || r.width < floor) {
            out.push({
              where: shell.getAttribute("data-shell") ?? "?",
              label:
                el.getAttribute("aria-label") ||
                (el.textContent || "").trim().slice(0, 40) ||
                el.getAttribute("placeholder") ||
                el.tagName.toLowerCase(),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
      }
      return out;
    },
    { floor: FLOOR, region: SHELL },
  );
}

async function expectShellMeetsFloor(page: Page, where: string) {
  const small = await undersizedInShell(page);
  expect(small, `${where}: shell controls below ${FLOOR}px — ${JSON.stringify(small)}`).toEqual([]);
}

// The classroom iPad in landscape, which is also the width at which the rail
// starts collapsed (the shell's own `(max-width: 1024px)` default).
test.use({ viewport: { width: 1024, height: 768 } });

// Every screen the shell renders on. The rail and the identity bar are the same
// components throughout, but the page decides what is in the rail — the class
// list, the queue badge — so each one is walked rather than trusted.
const TEACHER_SCREENS = [
  ["the dashboard", "/teacher"],
  ["my classes", "/teacher/class"],
  ["the approval queue", "/teacher/queue"],
  ["the activity library", "/teacher/activities"],
  ["the calendar", "/teacher/calendar"],
  ["the account page", "/teacher/account"],
] as const;

for (const [name, path] of TEACHER_SCREENS) {
  test(`the shell meets the adult touch floor on ${name}`, async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto(path);
    await expectShellMeetsFloor(page, name);
  });
}

test("the rail meets the floor expanded as well as collapsed", async ({ page }) => {
  // Both states matter and they are measured differently: collapsed, a class
  // link is a 44-wide square and it was the WIDTH that used to fail; expanded it
  // is 206 wide and it was the height. Testing one state would have found one of
  // the two bugs.
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher");
  await expectShellMeetsFloor(page, "rail collapsed");

  await page.getByRole("button", { name: /expand the menu/i }).click();
  await expect(page.getByRole("button", { name: /collapse the menu/i })).toBeVisible();
  await expectShellMeetsFloor(page, "rail expanded");
});

test("the school console header meets the adult touch floor", async ({ page }) => {
  // A different component from the teacher shell, with the same job and the
  // same reader — and "My teaching →" is the only way out of this console.
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/admin");
  await expectShellMeetsFloor(page, "the school console");
});
