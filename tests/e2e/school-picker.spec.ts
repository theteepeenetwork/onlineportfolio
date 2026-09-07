import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { establishmentLabel } from "@/lib/establishmentSearch";
import { pickerAnnouncement } from "@/lib/schoolPicker";
import { clickHydrated } from "./helpers";

// ===========================================================================
// Signup step 2 stores the establishment, and creates nothing.
//
// THE ONE PROPERTY THIS FILE EXISTS FOR: `Teacher.urn` is stored ALONGSIDE
// `Teacher.schoolName`, never instead of it (docs/school-identity.md §2). The
// free text is what the teacher believes their school is called and it is what
// the teacher shell and the ops console already show; the URN is a join key
// that step 4 will use in late September. A change that stored only the URN
// would look fine on every screen until a re-import renamed somebody's school
// out from under them, which is why "both, always" is asserted rather than
// "the URN was captured".
//
// AND WHAT IT MUST NOT DO. No `School` row is created, no admin, no colleagues.
// A teacher who picks their school sees nothing else change. That is asserted
// too, because it is the sort of scope that grows quietly.
//
// The free-text path is a FIRST-CLASS path and is tested as one, not as an
// error case: every teacher in Wales, Scotland and Northern Ireland uses it by
// design, as does any English teacher whose school is newer than the snapshot.
//
// NOT ASSERTED HERE, said plainly rather than left to be noticed: the server's
// own check that a submitted URN is really in the register
// (src/app/actions/auth.ts). A browser cannot send a URN the picker did not
// offer, so nothing this file can drive reaches that branch — it is a guard
// against a tampered client, and testing it needs a harness that calls the
// action directly, which this repo does not have. Read the branch, not this
// file, for that behaviour.
//
// FIXTURES, AND WHY THIS FILE SEEDS ITS OWN. The battery's two-tenant seed
// carries 33 invented schools, but this file runs under playwright.config.ts,
// whose global setup runs the one-school DEMO seed — and that one has no
// register at all. Rather than reach into somebody else's seed script, the one
// row this file needs is created here and deleted afterwards. The register
// holds no person and belongs to no tenant, so adding an institution to it for
// the length of one run isolates nothing and disturbs nothing.
//
// ITS NAME, TOWN AND POSTCODE ARE ALL DISTINCT FROM EVERY SEEDED ROW, and that
// is a stronger requirement than a distinct URN. An earlier version of this file
// reasoned that a `99xxxx` URN could not collide with `seed-test.ts`'s `900001`
// — true, and beside the point. The picker is addressed by its ACCESSIBLE NAME,
// which `establishmentLabel()` composes from name + town + postcode, so two rows
// with different URNs and identical labels are one string as far as
// `getByRole("option", { name, exact: true })` is concerned, and that is a
// strict-mode violation rather than a wrong answer. The old fixture duplicated
// seed-test's Bramblewick exactly. It was safe only because `tests/e2e` never
// runs against the battery seed, which is not a property this file should be
// relying on silently.
//
// The school is INVENTED, as everything in a StoryJar test database is
// (docs/TEST_LOGINS.md) — a real school's name in a fixture is a real school's
// name in a screenshot.
// ===========================================================================

const db = new PrismaClient();
const CREATED: string[] = [];

/** Invented. Two lines' worth of detail, because two lines is what the picker shows. */
const FIXTURE = {
  urn: "990101",
  name: "Quillhaven Meadow Primary School",
  town: "Netherby Cross",
  postcode: "QV9 4XT",
  localAuthority: "Barsetshire",
  phase: "Primary",
} as const;

/** A prefix that matches the fixture and nothing any seed carries. */
const QUERY = "Quillhaven";

/**
 * The picker's options, and ONLY the picker's options.
 *
 * A bare `getByRole("option")` also matches the `<option>` elements inside step
 * 2's two native `<select>`s — Country and Year group — because a native option
 * carries the `option` role exactly as this component's `<li role="option">`
 * does. With the listbox shut, the component's own options are `display: none`
 * and leave the accessibility tree, so `.first()` resolves to a `<select>`'s
 * option instead: an element Playwright cannot click, which surfaces sixty
 * seconds later as a timeout that says nothing about the cause. Scope, and wait
 * for the list, every time.
 */
function optionsOf(page: Page) {
  return page.getByRole("listbox").getByRole("option");
}

test.beforeAll(async () => {
  await db.establishment.upsert({
    where: { urn: FIXTURE.urn },
    update: FIXTURE,
    create: FIXTURE,
  });
});

test.afterAll(async () => {
  // A signup creates a teacher, a subscription, a class and its pupils, and
  // every one of those cascades from the teacher row.
  if (CREATED.length) await db.teacher.deleteMany({ where: { email: { in: CREATED } } });
  await db.establishment.deleteMany({ where: { urn: FIXTURE.urn } });
  await db.$disconnect();
});

function freshEmail() {
  const email = `picker-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;
  CREATED.push(email);
  return email;
}

/** Step 1, valid, and stop on step 2. */
async function toSchoolStep(page: Page, email: string) {
  await page.goto("/signup/teacher");
  await page.getByLabel("Full name").fill("Sam Pearson");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill("a-long-enough-password");
  // F36: Playwright's actionability checks are satisfied by server-rendered
  // HTML, so a click can land before React attaches its onClick and be
  // swallowed in silence. This is the first press after a navigation, which is
  // the window the finding is about.
  await clickHydrated(page, /Continue/);
  await expect(page.getByRole("heading", { name: "Where do you teach?" })).toBeVisible();
}

/** Steps 3 and 4, so the account actually commits and the row can be read. */
async function finishSignup(page: Page, className: string) {
  await clickHydrated(page, /Continue/);
  await page.getByLabel("Class name").fill(className);
  await clickHydrated(page, /Create class/);
  await page.getByLabel("First names").fill("Poppy\nJesse\nAmara");
  await clickHydrated(page, /Add pupils/);
  await page.waitForURL(/\/signup\/teacher\/welcome/);
}

test("the school box is #su-school — four other specs depend on it", async ({ page }) => {
  await toSchoolStep(page, freshEmail());

  // THIS IS A CONTRACT TEST, not a check that a field exists, and it is here
  // because the two specs in this file would not notice if it broke. Both
  // address the box by role and accessible name, so a return to a generated id
  // would leave them green while breaking four specs that address it by id:
  //
  //   tests/e2e/auth.spec.ts            — the F39 guard on children's surnames
  //   tests/e2e/account.spec.ts
  //   tests/e2e/admin.spec.ts           — the non-admin /admin redirect
  //   tests/battery/personas/teacher-first-day.spec.ts
  //
  // The F39 one is why this is worth a test of its own. Its failure mode would
  // be "could not find a box to type in", which does not read as a product
  // fault — it reads as a flaky test, and a safeguarding guard that goes red
  // for a boring reason is one that gets retried and then loosened. A guard is
  // only as strong as the least interesting reason it can fail.
  await expect(page.locator("#su-school")).toBeVisible();
  // And it is the combobox itself, not some wrapper that happens to carry the id.
  await expect(page.locator("#su-school")).toHaveAttribute("role", "combobox");
});

test("choosing a school stores the URN AND the name", async ({ page }) => {
  const email = freshEmail();
  const target = FIXTURE;

  await toSchoolStep(page, email);
  const box = page.getByRole("combobox", { name: "School name" });
  await box.fill(QUERY);
  await expect(page.getByRole("listbox")).toBeVisible();
  await optionsOf(page).filter({ hasText: target.name }).click();

  // The box now holds the register's spelling, and the town and postcode that
  // did the disambiguating are repeated — they are not in the input, and
  // without this the picker's whole job is invisible a second later.
  await expect(box).toHaveValue(target.name);
  await expect(page.locator("#su-school-picker")).toContainText(establishmentLabel(target));

  await finishSignup(page, `Picker Class ${Date.now()}`);

  const teacher = await db.teacher.findUnique({
    where: { email },
    select: { urn: true, schoolName: true, schoolId: true, role: true },
  });
  expect(teacher?.urn, "the URN is the join key").toBe(target.urn);
  expect(teacher?.schoolName, "the free text is kept ALONGSIDE it, never replaced").toBe(target.name);

  // Nothing else changed. No School row, no admin: that is step 4, in late
  // September, and it is gated on payment for safeguarding reasons (rule 5).
  expect(teacher?.schoolId, "picking a school must not create or join one").toBeNull();
  expect(teacher?.role).toBe("TEACHER");
});

test("choosing by KEYBOARD stores the URN AND the name", async ({ page }) => {
  const email = freshEmail();

  await toSchoolStep(page, email);
  const box = page.getByRole("combobox", { name: "School name" });
  await box.fill(QUERY);
  await expect(page.getByRole("listbox")).toBeVisible();

  // The mouse is not the only way in, and this is the path the a11y gate cares
  // about: ArrowDown moves virtual focus, Enter commits, and DOM focus never
  // leaves the input while it happens. Asserted here as well as in the a11y
  // spec because THIS file is the one that reads the database afterwards —
  // "the keyboard highlighted it" and "the keyboard stored it" are different
  // claims, and only the second one is the feature.
  await box.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", "su-school-list-opt-0");
  await expect(box).toBeFocused();
  await box.press("Enter");

  await expect(box).toHaveValue(FIXTURE.name);
  await expect(page.getByRole("listbox")).toBeHidden();

  await finishSignup(page, `Keyboard Class ${Date.now()}`);

  const teacher = await db.teacher.findUnique({
    where: { email },
    select: { urn: true, schoolName: true, schoolId: true },
  });
  expect(teacher?.urn).toBe(FIXTURE.urn);
  expect(teacher?.schoolName).toBe(FIXTURE.name);
  expect(teacher?.schoolId, "still no school row, whichever way it was chosen").toBeNull();
});

test("Continue works while the list of schools is open", async ({ page }) => {
  const email = freshEmail();
  await toSchoolStep(page, email);

  // THE LIST IS DELIBERATELY LEFT OPEN. This is the state a teacher is actually
  // in when they decide to move on — they have typed, the schools are on
  // screen, and theirs is not among them — and until 24 August 2026 pressing
  // Continue here did nothing at all.
  //
  // The mechanism, because "click the button" is not obviously a test worth
  // writing: the list used to sit in normal flow, so opening it pushed the
  // Continue button down by up to 280px. Pressing the mouse down on Continue
  // blurs the input; blur closes the list; the button leaps back up before the
  // mouse is released; and a `click` event requires its down and its up on the
  // same element, so none fires. Pressing again worked, because by then the
  // list was already shut — which is precisely why it would have been reported
  // as "a bit glitchy" and never reproduced.
  //
  // The fix is that the list is positioned rather than in flow, so nothing
  // below it can be pulled out from under a press. This test is what stops that
  // being undone by a future style change.
  await page.getByRole("combobox", { name: "School name" }).fill(QUERY);
  await expect(page.getByRole("listbox")).toBeVisible();

  await clickHydrated(page, /Continue/);
  await expect(
    page.getByRole("heading", { name: "Name your class jar" }),
    "one press of Continue must be enough, with the list open",
  ).toBeVisible();
});

test("moving on with a search in flight is not an error", async ({ page }) => {
  const email = freshEmail();

  await toSchoolStep(page, email);
  // Type and press Continue immediately, so the debounced search — or its
  // answer — arrives after the step has changed and the picker has gone. This
  // is what every other signup spec does by accident; here it is the subject.
  // Nothing is asserted about the list: the point is that the console stays
  // clean, because personas/teacher-first-day.spec.ts treats an unhandled
  // error on a teacher's first day as a blocker rather than a note.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.getByRole("combobox", { name: "School name" }).fill("Quill");
  await clickHydrated(page, /Continue/);
  await expect(page.getByRole("heading", { name: "Name your class jar" })).toBeVisible();
  // Well past the debounce and any round trip.
  await page.waitForTimeout(1_500);

  expect(errors, "a search answered after the step moved on must go quietly").toEqual([]);
});

test("a search that never arrives says so, and still lets the teacher finish", async ({ page }) => {
  const email = freshEmail();
  await toSchoolStep(page, email);

  // Kill the search request itself, which is what a school's connection does
  // several times a day. This is the ONLY way to reach the `busy` state from a
  // test: the other route into it is the per-IP throttle, and grinding that
  // takes 121 real searches against an in-process counter shared by the whole
  // run, leaving every later search throttled for ten minutes. A blocking gate
  // should not contain a flake generator.
  //
  // Routed by METHOD as well as URL. A server action is a POST to the page's own
  // path, so aborting POSTs to it kills the search and leaves the document GET
  // alone — blanket routing breaks hydration and the failure looks nothing like
  // the cause.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/signup/teacher", async (route, request) => {
    if (request.method() === "POST") return route.abort();
    return route.continue();
  });

  await page.getByRole("combobox", { name: "School name" }).fill(QUERY);

  // It reads as a pause, not a telling-off, and it hands over the way out.
  await expect(page.getByText("Type it in yourself — that works too")).toBeVisible();
  // Scoped to the live region rather than matched across the page: the panel
  // above says much the same thing in its own words, so an unscoped text match
  // finds two nodes and fails strict mode for a reason that has nothing to do
  // with the behaviour. Asserted against the module that owns the sentence, so
  // the announced string and the expected string cannot drift.
  await expect(
    page.locator("#su-school-picker [aria-live]"),
    "a dropped request must not be reported as an empty register — those are different sentences",
  ).toHaveText(pickerAnnouncement({ kind: "busy" }));
  await expect(page.getByRole("listbox")).toBeHidden();

  // And nothing was thrown on the way. Before the try/catch this is the point
  // at which an unhandled rejection reached the console, on the one screen the
  // persona suite treats an error as a blocker.
  expect(errors, "a failed search must go quietly").toEqual([]);

  await page.unroute("**/signup/teacher");

  // The teacher is not stuck: the box still holds their answer and the wizard
  // still moves on.
  await finishSignup(page, `Offline Class ${Date.now()}`);
  const teacher = await db.teacher.findUnique({
    where: { email },
    select: { urn: true, schoolName: true },
  });
  expect(teacher?.schoolName).toBe(QUERY);
  expect(teacher?.urn).toBeNull();
});

test("typing a school nobody has heard of stores the name, with no URN", async ({ page }) => {
  const email = freshEmail();
  const typed = "Fairweather Bridge Community Primary";

  await toSchoolStep(page, email);
  const box = page.getByRole("combobox", { name: "School name" });
  await box.fill(typed);

  // The way out is offered as an ordinary way to finish, not as a failure.
  await expect(page.getByText("Type it in yourself — that works too")).toBeVisible();
  await expect(page.getByRole("listbox")).toBeHidden();

  await finishSignup(page, `Free Text Class ${Date.now()}`);

  const teacher = await db.teacher.findUnique({
    where: { email },
    select: { urn: true, schoolName: true },
  });
  expect(teacher?.schoolName, "exactly what they typed, verbatim").toBe(typed);
  expect(teacher?.urn, "null is a real answer here, not a missing one").toBeNull();
});

test("editing the name after choosing drops the URN", async ({ page }) => {
  const email = freshEmail();

  await toSchoolStep(page, email);
  const box = page.getByRole("combobox", { name: "School name" });
  await box.fill(QUERY);
  await expect(page.getByRole("listbox")).toBeVisible();
  await optionsOf(page).first().click();
  await expect(box).not.toHaveValue(QUERY);

  // Now they change their mind and type something else. Storing the old URN
  // beside a new name is the exact quiet mismatch the register exists to
  // remove — a join key that points at a different school from the one on
  // screen, and nothing anywhere would say so.
  await box.fill("Somewhere Else Entirely Primary");

  await finishSignup(page, `Edited Class ${Date.now()}`);

  const teacher = await db.teacher.findUnique({
    where: { email },
    select: { urn: true, schoolName: true },
  });
  expect(teacher?.schoolName).toBe("Somewhere Else Entirely Primary");
  expect(teacher?.urn, "the URN must not survive an edit to the name beside it").toBeNull();
});

test("leaving England drops the URN, and the plain box comes back", async ({ page }) => {
  const email = freshEmail();

  await toSchoolStep(page, email);
  await page.getByRole("combobox", { name: "School name" }).fill(QUERY);
  await expect(page.getByRole("listbox")).toBeVisible();
  await optionsOf(page).first().click();

  // GIAS is the English register. A URN stored beside "Wales" would be a join
  // pointing at the wrong country.
  await page.getByLabel("Country").selectOption("Wales");
  await expect(page.getByRole("combobox", { name: "School name" })).toHaveCount(0);
  const plain = page.getByLabel("School name");
  await plain.fill("Ysgol Bryn Hyfryd");

  await finishSignup(page, `Wales Class ${Date.now()}`);

  const teacher = await db.teacher.findUnique({
    where: { email },
    select: { urn: true, schoolName: true, country: true },
  });
  expect(teacher?.country).toBe("Wales");
  expect(teacher?.schoolName).toBe("Ysgol Bryn Hyfryd");
  expect(teacher?.urn).toBeNull();
});

test("a URN that has left the register is dropped, and the name is kept", async ({ page }) => {
  const email = freshEmail();

  await toSchoolStep(page, email);
  const box = page.getByRole("combobox", { name: "School name" });
  await box.fill(QUERY);
  await expect(page.getByRole("listbox")).toBeVisible();
  await optionsOf(page).filter({ hasText: FIXTURE.name }).click();
  await expect(box).toHaveValue(FIXTURE.name);

  // Take the school out of the register while the teacher is still on step 3.
  // The browser is now holding a URN that WAS real and no longer is, which is
  // the only way to reach the server's check through the ordinary UI — a
  // browser cannot invent one, and this repo has no harness that calls a
  // server action directly. A hand-run import replaces the register wholesale,
  // so a URN going out from under somebody mid-signup is a real sequence and
  // not only a stand-in for a tampered client.
  //
  // WHY THIS TEST EXISTS AT ALL, since the guard is not an access control: the
  // drop is SILENT by design, so a future "the picker already validates, why
  // check twice?" would remove it and nothing anywhere would go red.
  await db.establishment.deleteMany({ where: { urn: FIXTURE.urn } });

  try {
    await finishSignup(page, `Vanished Class ${Date.now()}`);

    const teacher = await db.teacher.findUnique({
      where: { email },
      select: { urn: true, schoolName: true },
    });
    // The name survives, because it is the teacher's own answer and the product
    // shows it everywhere. The URN does not, because null honestly says "this
    // teacher typed it" and a key pointing at a row that is gone is a join
    // somebody will one day follow.
    expect(teacher?.schoolName).toBe(FIXTURE.name);
    expect(teacher?.urn, "a URN not in the register must not be stored").toBeNull();
  } finally {
    // Put it back whatever happened, so this test cannot decide the outcome of
    // any test that runs after it.
    await db.establishment.upsert({
      where: { urn: FIXTURE.urn },
      update: FIXTURE,
      create: FIXTURE,
    });
  }
});
