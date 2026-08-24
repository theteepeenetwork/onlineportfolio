import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { establishmentLabel, SEARCH_MIN_CHARS } from "@/lib/establishmentSearch";
import { pickerAnnouncement } from "@/lib/schoolPicker";
// Reached across from the functional suite rather than copied into
// tests/battery/helpers.ts on purpose. `clickHydrated` exists because of a
// LOGGED FINDING (F36) and its comment carries that finding's reasoning; a
// second copy is a second thing to keep in step with a fix, which is the
// artefact class this repo has logged twice this week. tests/e2e/helpers.ts
// imports nothing but @playwright/test, so nothing comes with it.
import { clickHydrated } from "../../e2e/helpers";

// ===========================================================================
// The school picker is a hand-rolled combobox, and this is the gate that says
// so honestly.
//
// WHY THIS FILE IS STRICTER THAN axe.spec.ts. That sweep tolerates two rules
// (`color-contrast`, `link-in-text-block`) as the tracked F11 baseline, because
// the palette debt predates it and is being burned down. Nothing NEW should
// need that tolerance, so this file scans the picker's own subtree
// (`#su-school-picker`) with NO baseline at all: any serious or critical
// violation inside this component fails, contrast included.
//
// The rule that goes with it, and it is the reason the fallback was decided
// before a line was written: if this cannot be made to pass, the answer is the
// two-stage picker — type a name, submit, choose from a plain list of radio
// buttons — and NEVER an addition to BASELINE_RULES. Baselining is how F18 hid
// for weeks.
//
// WHAT IT ASSERTS BEYOND "THE MARKUP EXISTS", which is the trap with an ARIA
// pattern: every attribute can be present and the thing still be unusable.
//
//   1. axe is clean on the OPEN listbox, not just the closed input. A combobox
//      that passes shut and fails open has been tested in the state nobody
//      uses.
//   2. A keyboard reaches EVERY option — arrowing down N times visits all N —
//      and DOM focus never leaves the input while it does. That second half is
//      the whole point of virtual focus: if focus moved, typing would break
//      mid-word.
//   3. Each option's accessible name EQUALS `establishmentLabel(row)`, computed
//      here from the database row. Not "contains the name", not a hand-typed
//      string: the composed label and the announced label are asserted to be
//      the same value, so the two cannot drift.
//   4. Escape closes it, and the state is reflected in `aria-expanded`.
//   5. The result count is announced in a polite live region, in the exact
//      words `pickerAnnouncement` produces.
//
// NOTHING IS CREATED BY THIS FILE. Step 1 of the wizard is filled in to reach
// step 2, and the run stops there — no account, no class, no cleanup.
//
// Fixtures: prisma/seed-test.ts seeds 32 INVENTED schools, two of them sharing
// the name "St Cuthbert's Catholic Primary School" and differing only by town
// and postcode. That pair is used deliberately: it is the case the two display
// lines exist for, and the case where a single-fragment accessible name would
// leave a screen reader user unable to tell the options apart at all.
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

/** The pair that share a name. Read from the database so the spec follows the seed. */
async function cuthberts() {
  return db.establishment.findMany({
    where: { name: { contains: "Cuthbert" } },
    select: { urn: true, name: true, town: true, postcode: true, localAuthority: true },
    orderBy: [{ name: "asc" }, { urn: "asc" }],
  });
}

/** Fill step 1 with valid throwaway details and land on step 2. Creates nothing. */
async function toSchoolStep(page: Page) {
  await page.goto("/signup/teacher");
  await page.getByLabel("Full name").fill("Sam Pearson");
  await page.getByLabel("School email").fill(`a11y-${Date.now()}@example.invalid`);
  await page.getByLabel("Password").fill("a-long-enough-password");
  // F36: a click can land on server-rendered HTML before React attaches its
  // onClick and be swallowed silently. This is the first press after a
  // navigation, which is exactly that window.
  await clickHydrated(page, /Continue/);
  await expect(page.getByRole("heading", { name: "Where do you teach?" })).toBeVisible();
}

/** Type a query and wait for the listbox to open. */
async function search(page: Page, query: string) {
  const box = page.getByRole("combobox", { name: "School name" });
  await box.fill(query);
  await expect(page.getByRole("listbox")).toBeVisible();
  return box;
}

/**
 * The picker's options, and ONLY the picker's options.
 *
 * SCOPED TO THE LISTBOX, and the leading space in that sentence is the whole
 * bug it fixes. A bare `getByRole("option")` also matches the `<option>`
 * elements inside step 2's two native `<select>`s — Country has five and Year
 * group has nine — because a native option carries the `option` role just as
 * this component's `<li role="option">` does. An unscoped count on this step is
 * therefore fourteen larger than the number of schools, which is not a subtle
 * failure: a loop bounded by it walked past the end of the real list and read
 * the wrap-around as a broken component.
 *
 * The same trap makes `.first()` dangerous rather than merely imprecise. With
 * the listbox shut, this component's options are `display: none` and drop out
 * of the accessibility tree, so `.first()` silently resolves to a `<select>`'s
 * first option instead — an element Playwright cannot click, which surfaces
 * sixty seconds later as a click timeout with nothing in it pointing at the
 * cause.
 */
function optionsOf(page: Page) {
  return page.getByRole("listbox").getByRole("option");
}

test("the picker is the England path, and only the England path", async ({ page }) => {
  await toSchoolStep(page);
  await expect(page.getByRole("combobox", { name: "School name" })).toBeVisible();

  // Wales has no register to search, so it keeps the plain box — a first-class
  // path, not a degraded one.
  await page.getByLabel("Country").selectOption("Wales");
  await expect(page.getByRole("combobox", { name: "School name" })).toHaveCount(0);
  await expect(page.getByLabel("School name")).toBeVisible();
});

test("axe is clean on the picker with the list OPEN — no baseline, contrast included", async ({ page }) => {
  await toSchoolStep(page);
  await search(page, "Cuthbert");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .include("#su-school-picker")
    .analyze();

  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = results.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
  if (minor.length) {
    console.log(`[a11y] school picker: ${minor.length} minor/moderate item(s): ${minor.map((v) => v.id).join(", ")}`);
  }

  expect(
    serious.map((v) => `(${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s)]`),
    "Serious/critical WCAG 2.2 AA violations inside the school picker. Do NOT baseline these — fix them, or switch to the two-stage picker.",
  ).toEqual([]);
});

test("axe is clean on the no-results state too", async ({ page }) => {
  await toSchoolStep(page);
  // Nothing in the register matches, which is the state Wales, Scotland and NI
  // reach by design and an English teacher reaches whenever the snapshot is
  // behind. It renders a panel of its own, so it gets its own scan.
  await page.getByRole("combobox", { name: "School name" }).fill("Zzzzqx");
  await expect(page.getByText("Type it in yourself — that works too")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .include("#su-school-picker")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `(${v.impact}) ${v.id}: ${v.help}`)).toEqual([]);
});

test("a keyboard reaches every option, and DOM focus never leaves the input", async ({ page }) => {
  await toSchoolStep(page);
  const box = await search(page, "Cuthbert");

  const options = optionsOf(page);
  const n = await options.count();
  expect(n, "the seeded pair should both match").toBeGreaterThanOrEqual(2);

  // NOTHING IS HIGHLIGHTED BEFORE THE FIRST PRESS. The component sets the
  // active index to -1 when results arrive, deliberately (see the comment at
  // that line in SchoolPicker.tsx: aria-activedescendant is a claim about where
  // the user is, and Enter on this field stores a join key rather than running
  // a search). So press number i+1 lands on option i, and the assertion below
  // is what pins that decision down — if anyone ever pre-highlights the first
  // row, this is the line that argues with them.
  await expect(box).not.toHaveAttribute("aria-activedescendant", /./);

  const visited: string[] = [];
  for (let i = 0; i < n; i += 1) {
    await box.press("ArrowDown");

    // Virtual focus: the ACTIVE option is named by aria-activedescendant...
    const active = await box.getAttribute("aria-activedescendant");
    expect(active, "aria-activedescendant must name an option after ArrowDown").toBe(`su-school-list-opt-${i}`);
    // ...and it must point at an element that is actually there and showing.
    // An id referencing nothing is the failure mode this pattern invites.
    await expect(page.locator(`#${active}`)).toBeVisible();
    await expect(page.locator(`#${active}`)).toHaveAttribute("aria-selected", "true");
    visited.push(await options.nth(i).getAttribute("aria-label") ?? "");

    // ...while DOM focus has not moved. If it had, the next keystroke would go
    // somewhere else and typing would break mid-word.
    await expect(box).toBeFocused();
  }

  expect(visited.length, "every option was reached by keyboard alone").toBe(n);

  // And it wraps, so there is no dead end at the bottom of a twenty-row list.
  await box.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", "su-school-list-opt-0");
});

test("an option's accessible name is the ONE composed string", async ({ page }) => {
  const rows = await cuthberts();
  expect(rows.length, "seed-test should hold two schools sharing a name").toBeGreaterThanOrEqual(2);

  await toSchoolStep(page);
  await search(page, "Cuthbert");

  for (const row of rows) {
    const expected = establishmentLabel(row);
    // "St Cuthbert's Catholic Primary School, Ambledon, AB1 3EF" — one label,
    // asserted EQUAL to what the shared helper composes rather than merely
    // containing the school's name. This is what a screen reader announces.
    const option = page
      .getByRole("listbox")
      .getByRole("option", { name: expected, exact: true });
    await expect(option, `no option is announced as "${expected}"`).toHaveCount(1);

    // The two lines are still both on screen: the name, and the place beneath.
    await expect(option).toContainText(row.name);
    await expect(option).toContainText(row.postcode);
  }

  // The pair differ ONLY below the name, which is the whole reason the second
  // line exists. If the accessible names were equal, the picker would be
  // unusable by ear.
  const labels = rows.map(establishmentLabel);
  expect(new Set(labels).size, "two same-named schools must not share one label").toBe(labels.length);
});

test("Escape closes the list and says so in aria-expanded", async ({ page }) => {
  await toSchoolStep(page);
  const box = await search(page, "Cuthbert");
  await expect(box).toHaveAttribute("aria-expanded", "true");

  await box.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(box).toHaveAttribute("aria-expanded", "false");
  // Nothing is being pointed at any more, so the attribute is gone rather than
  // left holding a stale id.
  expect(await box.getAttribute("aria-activedescendant")).toBeNull();
  // The typing is untouched — Escape closes a list, it does not undo work.
  await expect(box).toHaveValue("Cuthbert");
  await expect(box).toBeFocused();
});

test("the result count is announced politely, in the words the module owns", async ({ page }) => {
  const rows = await cuthberts();
  await toSchoolStep(page);
  await search(page, "Cuthbert");

  const live = page.locator("#su-school-picker [aria-live]");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText(
    pickerAnnouncement({ kind: "results", items: rows, truncated: false }),
  );
});

test("too short is a sentence, not silence", async ({ page }) => {
  await toSchoolStep(page);
  await page.getByRole("combobox", { name: "School name" }).fill("S".repeat(SEARCH_MIN_CHARS - 1));
  await expect(page.locator("#su-school-picker [aria-live]")).toHaveText(
    pickerAnnouncement({ kind: "too-short" }),
  );
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("the licence link is not distinguished by colour alone", async ({ page }) => {
  await toSchoolStep(page);
  // Open Government Licence v3.0 attribution, on the page that uses the data.
  const link = page.getByRole("link", { name: /read the licence/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveCSS("text-decoration-line", "underline");
});
