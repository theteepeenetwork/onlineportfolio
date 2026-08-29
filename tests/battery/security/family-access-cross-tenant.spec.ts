import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginTeacher, fetchStatus, ownThrottleKey } from "../helpers";

// ===========================================================================
// Family access: a teacher may only ever reach their own pupils' families
//
// This is the highest-stakes ownership check in the product: it decides which
// adult can see which child's photographs (SAFEGUARDING rules 4 and 6). Every
// action takes a pupil id, and one takes a family id as well, so every one of
// them is scoped through `where: { id, class: { teacherId } }` and denies by
// default (rule 8).
//
// The convention this repo adopted after the class-code-rotation gap: EVERY
// cross-tenant negative is paired with a positive control on the same resource
// and the same actor. Without that pairing, a route that has simply stopped
// working (a renamed button, a broken form) passes the negative for the wrong
// reason and the isolation claim is worthless.
//
// So School B's teacher does all four things to their own pupil (all must
// succeed) and all four to a School A pupil (all must fail), one action per
// test, on the same run.
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

async function pupil(classCode: string, name: string) {
  const student = await db.student.findFirst({
    where: { name, class: { classCode } },
    select: { id: true, name: true },
  });
  expect(student, `fixture pupil ${name} in ${classCode}`).not.toBeNull();
  return student!;
}

// The families linked to one child, straight from the database. The only
// honest place to check whether an action landed.
async function familiesFor(studentId: string) {
  return db.parent.findMany({
    where: { children: { some: { id: studentId } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, familyCode: true },
  });
}

// Press "Add family access" on the pupil page that is already open, and wait
// until the new row is actually in the database.
async function addFamily(page: Page, studentId: string) {
  const before = await familiesFor(studentId);
  await page.getByRole("button", { name: /Add (family access|another family)/ }).click();
  await expect
    .poll(async () => (await familiesFor(studentId)).length, { message: "a family row should appear" })
    .toBe(before.length + 1);
  const after = await familiesFor(studentId);
  const fresh = after.find((f) => !before.some((b) => b.id === f.id));
  expect(fresh, "the new family row").toBeDefined();
  return fresh!;
}

// Put a family on a School A pupil for a School B teacher to fail to reach,
// and leave the page signed in as that School B teacher, on their own pupil.
//
// Each of the four actions gets its OWN test rather than four steps of one, so
// that breaking the ownership check makes every one of them go red on its own.
// Four steps in a row would stop at the first, and the other three would never
// have been watched failing.
async function stage(page: Page) {
  const ben = await pupil(SCHOOL_A.classCode, "Ben"); // St Bede's, teacher@school.uk
  const zara = await pupil(SCHOOL_B.classCode, SCHOOL_B.student); // Oakfield, teacher@oakfield.sch.uk

  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto(`/teacher/students/${ben.id}`);
  const benFamily = await addFamily(page, ben.id);
  expect(benFamily.familyCode, "a real 8-character code").toMatch(/^[A-Z0-9]{8}$/);

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${zara.id}`);
  return { ben, zara, benFamily };
}

// Point a form's hidden ids somewhere they have no business going.
async function tamper(page: Page, form: string, ids: Record<string, string>) {
  for (const [name, value] of Object.entries(ids)) {
    await page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: new RegExp(form) }) })
      .locator(`input[name="${name}"]`)
      .evaluate((el, v) => {
        (el as HTMLInputElement).value = v as string;
      }, value);
  }
}

const ADD = /Add (family access|another family)/;

test("VIEW: a teacher sees their own pupil's family access, and not another school's", async ({ page }) => {
  const { ben, zara, benFamily } = await stage(page);
  try {
    // Positive control: their own pupil's page carries the section, and their
    // own family's letter prints.
    await expect(page.getByRole("heading", { name: "Family access" })).toBeVisible();
    const [zaraSeeded] = await familiesFor(zara.id);
    expect(await fetchStatus(page, `/teacher/students/${zara.id}/letter?family=${zaraSeeded.id}`)).toBe(200);

    // Negative: School A's pupil, and School A's family letter, are not there.
    expect(await fetchStatus(page, `/teacher/students/${ben.id}`)).toBe(404);
    expect(await fetchStatus(page, `/teacher/students/${ben.id}/letter?family=${benFamily.id}`)).toBe(404);
    // Nor by hanging School A's family off a pupil they DO own.
    expect(await fetchStatus(page, `/teacher/students/${zara.id}/letter?family=${benFamily.id}`)).toBe(404);
  } finally {
    await db.parent.deleteMany({ where: { id: benFamily.id } });
  }
});

test("CREATE: a teacher cannot open a family place on another school's child", async ({ page }) => {
  const { ben, zara, benFamily } = await stage(page);
  const zaraFamily = await addFamily(page, zara.id); // positive control
  try {
    expect(zaraFamily.familyCode).toMatch(/^[A-Z0-9]{8}$/);

    // Negative: tamper ONLY the hidden pupil id on a page they are entitled to
    // be on, and submit. Same shape as the age-mode and f15 specs.
    const benBefore = await familiesFor(ben.id);
    await tamper(page, ADD.source, { studentId: ben.id });
    await page.getByRole("button", { name: ADD }).click();
    await page.waitForLoadState("networkidle");

    expect(await familiesFor(ben.id), "a School B teacher created access to a School A child").toEqual(benBefore);
  } finally {
    await db.parent.deleteMany({ where: { id: { in: [benFamily.id, zaraFamily.id] } } });
  }
});

test("ROTATE: a teacher cannot re-issue another school's family code", async ({ page }) => {
  const { ben, zara, benFamily } = await stage(page);
  const zaraFamily = await addFamily(page, zara.id);
  try {
    // Negative first, from a confirm they are entitled to have open: point BOTH
    // ids at School A.
    await page.locator("li").filter({ hasText: zaraFamily.familyCode }).getByRole("button", { name: "New code" }).click();
    await tamper(page, "Yes, new code", { studentId: ben.id, parentId: benFamily.id });
    await page.getByRole("button", { name: /Yes, new code/ }).click();
    await page.waitForLoadState("networkidle");

    expect(
      (await familiesFor(ben.id))[0]?.familyCode,
      "a School B teacher rotated a School A family's code",
    ).toBe(benFamily.familyCode);

    // Positive control: the same button, untampered, does change their own.
    await page.goto(`/teacher/students/${zara.id}`);
    await page.locator("li").filter({ hasText: zaraFamily.familyCode }).getByRole("button", { name: "New code" }).click();
    await page.getByRole("button", { name: /Yes, new code/ }).click();
    await expect
      .poll(async () => (await db.parent.findUnique({ where: { id: zaraFamily.id } }))?.familyCode)
      .not.toBe(zaraFamily.familyCode);
  } finally {
    await db.parent.deleteMany({ where: { id: { in: [benFamily.id, zaraFamily.id] } } });
  }
});

test("REMOVE: a teacher cannot cut another school's family off", async ({ page }) => {
  const { ben, zara, benFamily } = await stage(page);
  const zaraFamily = await addFamily(page, zara.id);
  try {
    // Negative first: aim the open confirm at School A's pupil and family.
    await page.locator("li").filter({ hasText: zaraFamily.familyCode }).getByRole("button", { name: "Remove" }).click();
    await tamper(page, "Yes, remove access", { studentId: ben.id, parentId: benFamily.id });
    await page.getByRole("button", { name: /Yes, remove access/ }).click();
    await page.waitForLoadState("networkidle");

    expect(
      (await familiesFor(ben.id)).map((f) => f.id),
      "a School B teacher removed a School A family's access",
    ).toEqual([benFamily.id]);

    // Positive control: untampered, the same button does remove their own.
    await page.goto(`/teacher/students/${zara.id}`);
    await page.locator("li").filter({ hasText: zaraFamily.familyCode }).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: /Yes, remove access/ }).click();
    await expect.poll(async () => db.parent.count({ where: { id: zaraFamily.id } })).toBe(0);
  } finally {
    await db.parent.deleteMany({ where: { id: { in: [benFamily.id, zaraFamily.id] } } });
  }
});

test("a family code opens the linked child's jar and no classmate's", async ({ page, browser }) => {
  // Yusuf and Zara are in the SAME class at Oakfield. A code made for one of
  // them must not open the other, which is the case a "same school, same
  // teacher" bug would sail through (SAFEGUARDING rule 6).
  const yusuf = await pupil(SCHOOL_B.classCode, "Yusuf");

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${yusuf.id}`);
  const family = await addFamily(page, yusuf.id);

  const ctx = await browser.newContext();
  const parent = await ctx.newPage();
  try {
    await parent.goto("/family");
    await parent.getByRole("button", { name: /family code from your letter/i }).click();
    await parent.getByLabel(/family code from your letter/i).fill(family.familyCode);
    await parent.getByRole("button", { name: /^sign in$/i }).click();

    await expect(parent.getByRole("heading", { name: /Hello, Yusuf/ })).toBeVisible();
    // No sibling switcher, and above all no Zara.
    await expect(parent.getByRole("button", { name: /Zara/ })).toHaveCount(0);
    await expect(parent.getByText(/Zara/)).toHaveCount(0);

    // Nor her media, even though her moment is approved and in the same class.
    expect(await fetchStatus(parent, SCHOOL_B.approvedMedia)).toBe(404);
    // Nor Yusuf's OWN pending moment: approval is still the gate (rule 3).
    expect(await fetchStatus(parent, SCHOOL_B.pendingMedia)).toBe(404);
    await expect(parent.getByText("Waiting to be checked")).toHaveCount(0);
  } finally {
    await ctx.close();
    await db.parent.deleteMany({ where: { id: family.id } });
  }
});

test("a rotated family code stops working at once, and the new one works", async ({ page, browser }) => {
  const willow = await pupil(SCHOOL_B.classCode, "Willow");

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${willow.id}`);
  const family = await addFamily(page, willow.id);
  const oldCode = family.familyCode;

  // The letter goes astray, so the teacher issues a new code.
  const row = page.locator("li").filter({ hasText: oldCode });
  await row.getByRole("button", { name: "New code" }).click();
  await page.getByRole("button", { name: /Yes, new code/ }).click();
  await expect.poll(async () => (await db.parent.findUnique({ where: { id: family.id } }))?.familyCode).not.toBe(oldCode);
  const newCode = (await db.parent.findUnique({ where: { id: family.id } }))!.familyCode;

  const ctx = await browser.newContext();
  const stranger = await ctx.newPage();
  try {
    // Whoever picked the old letter up gets nothing.
    await stranger.goto("/family");
    await stranger.getByRole("button", { name: /family code from your letter/i }).click();
    await stranger.getByLabel(/family code from your letter/i).fill(oldCode);
    await stranger.getByRole("button", { name: /^sign in$/i }).click();
    await expect(stranger.getByText(/family code isn.t right/i)).toBeVisible();
    await expect(stranger.getByRole("heading", { name: /grown-ups/i })).toHaveCount(0);

    // The reprinted letter does work.
    await stranger.getByLabel(/family code from your letter/i).fill(newCode);
    await stranger.getByRole("button", { name: /^sign in$/i }).click();
    await expect(stranger.getByRole("heading", { name: /Hello, Willow/ })).toBeVisible();
  } finally {
    await ctx.close();
    await db.parent.deleteMany({ where: { id: family.id } });
  }
});

test("removing a link ends access at once, even mid-session", async ({ page, browser }) => {
  // The family is linked to TWO children, so removing one leaves a live account
  // to check: the child must vanish from a session that is already signed in,
  // not at the next sign-in.
  const yusuf = await pupil(SCHOOL_B.classCode, "Yusuf");
  const willow = await pupil(SCHOOL_B.classCode, "Willow");

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${yusuf.id}`);
  const first = await addFamily(page, yusuf.id);
  await page.goto(`/teacher/students/${willow.id}`);
  const second = await addFamily(page, willow.id);

  const ctx = await browser.newContext();
  const parent = await ctx.newPage();
  try {
    // The parent joins the two children up themselves, which is the only route that does.
    await parent.goto("/family");
    await parent.getByRole("button", { name: /family code from your letter/i }).click();
    await parent.getByLabel(/family code from your letter/i).fill(first.familyCode);
    await parent.getByRole("button", { name: /^sign in$/i }).click();
    await expect(parent.getByRole("heading", { name: /Hello, Yusuf/ })).toBeVisible();

    await parent.getByRole("button", { name: /Your family space/ }).click();
    await parent.getByLabel(/Family code from their letter/i).fill(second.familyCode);
    await parent.getByRole("button", { name: /Add this child/ }).click();
    await expect(parent.getByText(/Willow is in your family space now/)).toBeVisible();

    // Both children are now behind the one sign-in (the sibling switcher).
    await parent.reload();
    await expect(parent.getByRole("button", { name: /Yusuf/ })).toBeVisible();
    await expect(parent.getByRole("button", { name: /Willow/ })).toBeVisible();
    // The second placeholder is gone: one household, one row, one code.
    expect(await db.parent.count({ where: { id: second.id } })).toBe(0);

    // The teacher takes Willow's access away while the parent is sitting there.
    await page.goto(`/teacher/students/${willow.id}`);
    const willowRow = page.locator("li").filter({ hasText: first.familyCode });
    await willowRow.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: /Yes, remove access/ }).click();
    await expect.poll(async () => (await familiesFor(willow.id)).length).toBe(0);

    // The already-signed-in parent loses Willow on their very next request.
    await parent.reload();
    await expect(parent.getByRole("heading", { name: /Hello, Yusuf/ })).toBeVisible();
    await expect(parent.getByRole("button", { name: /Willow/ })).toHaveCount(0);
  } finally {
    await ctx.close();
    await db.parent.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  }
});

test("removing the last link deletes the family row, its sessions and its sign-in links", async ({ page, browser }) => {
  // Erasure has to be real, not merely inaccessible (SAFEGUARDING rule 9,
  // RETENTION.md: "deleted when last linked child is deleted"). So this builds a
  // family that has everything to lose, a session and a magic token, and then
  // asserts the rows are GONE, not just unreachable.
  const willow = await pupil(SCHOOL_B.classCode, "Willow");

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${willow.id}`);
  const family = await addFamily(page, willow.id);

  const address = `erasure-${Date.now()}@storyjar.co.uk`;
  // Its own throttle key: asking for a sign-in link spends the shared
  // magic-link budget, and this spec must not use up a real family's.
  const ctx = await browser.newContext({ extraHTTPHeaders: ownThrottleKey("40") });
  const parent = await ctx.newPage();
  try {
    await parent.goto("/family");
    await parent.getByRole("button", { name: /family code from your letter/i }).click();
    await parent.getByLabel(/family code from your letter/i).fill(family.familyCode);
    await parent.getByRole("button", { name: /^sign in$/i }).click();
    await expect(parent.getByRole("heading", { name: /Hello, Willow/ })).toBeVisible();

    // The parent chooses to add their own address, then asks for a link, so the
    // family has a session AND a magic token behind it.
    await parent.getByRole("button", { name: /Your family space/ }).click();
    await parent.getByLabel(/Your email/i).fill(address);
    await parent.getByRole("button", { name: /^Save$/ }).click();
    await expect(parent.getByText("✓ Saved.")).toBeVisible();

    // Ask for a sign-in link from a SECOND device, so the first stays signed in
    // and there is a live session to erase as well as a token.
    const other = await ctx.browser()!.newContext({ extraHTTPHeaders: ownThrottleKey("42") });
    const phone = await other.newPage();
    await phone.goto("/family");
    await phone.getByLabel(/Email your school has on file/i).fill(address);
    await phone.getByRole("button", { name: /magic link/i }).click();
    await expect
      .poll(async () => db.magicToken.count({ where: { parentId: family.id } }), {
        message: "the parent asked for a sign-in link",
      })
      .toBeGreaterThan(0);
    await other.close();

    expect(await db.session.count({ where: { parentId: family.id } })).toBeGreaterThan(0);

    // Willow was their only child, so removing the link ends the family.
    await page.goto(`/teacher/students/${willow.id}`);
    const row = page.locator("li").filter({ hasText: family.familyCode });
    await row.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: /Yes, remove access/ }).click();
    await expect.poll(async () => (await familiesFor(willow.id)).length).toBe(0);

    expect(await db.parent.count({ where: { id: family.id } }), "the family row survived").toBe(0);
    expect(await db.session.count({ where: { parentId: family.id } }), "a session survived").toBe(0);
    expect(await db.magicToken.count({ where: { parentId: family.id } }), "a sign-in link survived").toBe(0);
  } finally {
    await ctx.close();
    await db.parent.deleteMany({ where: { id: family.id } });
  }
});

test("a family with no email is unreachable by a sign-in link, and a blank box matches nobody", async ({ page, browser }) => {
  // Almost every family has no address on file: a teacher never types one, and
  // adding one is the parent's own choice. `Parent.email` is therefore nullable
  // and unique at the same time, which is the shape that invites the classic
  // bug: an empty submission matching a row that has no address.
  const dev = await pupil(SCHOOL_A.classCode, "Dev");

  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto(`/teacher/students/${dev.id}`);
  const family = await addFamily(page, dev.id);

  // Its own throttle key, so the shared magic-link budget is left alone.
  const ctx = await browser.newContext({ extraHTTPHeaders: ownThrottleKey("41") });
  const visitor = await ctx.newPage();
  try {
    const stored = await db.parent.findUnique({ where: { id: family.id }, select: { name: true, email: true } });
    expect(stored?.email, "a teacher-made family holds no address").toBeNull();
    expect(stored?.name, "a teacher-made family holds no name").toBeNull();

    await visitor.goto("/family");

    // An empty box: turned away before any lookup, and nothing is issued.
    // The browser's own `required` + `type=email` would normally stop this
    // reaching the app at all. That client gate is real, and it is exactly why
    // it is switched off here: the thing worth proving is that the SERVER also
    // refuses, because an attacker is not using our form.
    await visitor.locator("form:has(#pl-email)").evaluate((f) => f.setAttribute("novalidate", ""));
    await visitor.getByLabel(/Email your school has on file/i).fill("   ");
    await visitor.getByRole("button", { name: /magic link/i }).click();
    await expect(visitor.getByText(/doesn.t look quite right/i)).toBeVisible();

    // A well-formed address nobody has: the same neutral answer as a known one
    // (F6), and still nothing issued.
    await visitor.getByLabel(/Email your school has on file/i).fill("no-such-family@storyjar.co.uk");
    await visitor.getByRole("button", { name: /magic link/i }).click();
    await expect(visitor.getByText(/if that email is on file/i)).toBeVisible();

    expect(
      await db.magicToken.count({ where: { parentId: family.id } }),
      "a family with no address was sent a sign-in link",
    ).toBe(0);
    expect(
      await db.magicToken.count({ where: { parent: { email: null } } }),
      "a sign-in link was issued to a family with no address",
    ).toBe(0);
  } finally {
    await ctx.close();
    await db.parent.deleteMany({ where: { id: family.id } });
  }
});

// ---------------------------------------------------------------------------
// The whole-class sheet: /teacher/class/[classId]/letters
//
// It is the same ownership question asked with a CLASS id instead of a pupil
// id, which makes it a new front door on the highest-stakes check in the
// product. One page renders every family code in a class, and one action mints
// codes for a whole register at once, so a scoping mistake here leaks thirty
// families rather than one.
//
// Paired positive and negative on the same actor, per the convention at the top
// of this file.
// ---------------------------------------------------------------------------

async function klass(classCode: string) {
  const found = await db.class.findFirst({ where: { classCode }, select: { id: true, name: true } });
  expect(found, `fixture class ${classCode}`).not.toBeNull();
  return found!;
}

async function familyCount(classId: string) {
  return db.parent.count({ where: { children: { some: { classId } } } });
}

test("LETTERS: a teacher opens their own class sheet and not another school's", async ({ page }) => {
  const sunflower = await klass(SCHOOL_A.classCode);
  const acorn = await klass(SCHOOL_B.classCode);

  await loginTeacher(page, SCHOOL_B.teacher);

  // Positive control: their own class sheet renders.
  expect(await fetchStatus(page, `/teacher/class/${acorn.id}/letters`)).toBe(200);

  // Negative: School A's class is not found, exactly as a tampered id would be.
  expect(await fetchStatus(page, `/teacher/class/${sunflower.id}/letters`)).toBe(404);
});

test("LETTERS: the sheet prints a code per family and never rotates one", async ({ page }) => {
  const acorn = await klass(SCHOOL_B.classCode);
  await loginTeacher(page, SCHOOL_B.teacher);

  const before = await db.parent.findMany({
    where: { children: { some: { classId: acorn.id } } },
    select: { id: true, familyCode: true },
    orderBy: { createdAt: "asc" },
  });

  await page.goto(`/teacher/class/${acorn.id}/letters`);
  await expect(page.getByRole("heading", { name: /Family letters for/ })).toBeVisible();

  // Every existing code is on the paper, character by character: the tiles
  // render one <span> per character, so assert on the page text instead.
  const text = (await page.locator("body").innerText()).replace(/\s+/g, "");
  for (const family of before) {
    expect(text, `${family.familyCode} should be printed`).toContain(family.familyCode);
  }

  // And printing changed nothing. A letter already sent home keeps working.
  const after = await db.parent.findMany({
    where: { children: { some: { classId: acorn.id } } },
    select: { id: true, familyCode: true },
    orderBy: { createdAt: "asc" },
  });
  expect(after, "opening the sheet must not rotate or create anything").toEqual(before);
});

test("MINT ALL: a teacher cannot mint family codes across another school's class", async ({ page }) => {
  const sunflower = await klass(SCHOOL_A.classCode);
  const acorn = await klass(SCHOOL_B.classCode);

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/class/${acorn.id}/letters`);

  const sunflowerBefore = await familyCount(sunflower.id);
  const acornBefore = await db.parent.findMany({
    where: { children: { some: { classId: acorn.id } } },
    select: { id: true },
  });

  // The button only exists while somebody in the class has no code, and the
  // positive control below removes that state. So the NEGATIVE runs first,
  // while the form is still on the page to tamper with. Ordering it the other
  // way silently skips the negative on a fixture where the positive succeeded,
  // which is exactly the "passed for the wrong reason" trap this file warns
  // about at the top.
  const MINT = "Make codes for the";
  const mint = page.getByRole("button", { name: new RegExp(MINT) });
  expect(
    await mint.count(),
    "fixture expectation: Acorn has at least one child without a family code, so the mint button is on the page",
  ).toBeGreaterThan(0);

  await tamper(page, MINT, { classId: sunflower.id });
  await mint.click();
  await page.waitForLoadState("networkidle");
  expect(
    await familyCount(sunflower.id),
    "a School B teacher minted family codes across a School A class",
  ).toBe(sunflowerBefore);

  // Positive control on the same actor and the same button: their own class.
  try {
    await page.goto(`/teacher/class/${acorn.id}/letters`);
    await page.getByRole("button", { name: new RegExp(MINT) }).click();
    await expect
      .poll(async () => db.student.count({ where: { classId: acorn.id, parents: { none: {} } } }), {
        message: "one press should leave nobody in their own class without a code",
      })
      .toBe(0);
  } finally {
    // Put the fixture back: delete only the rows this test made.
    await db.parent.deleteMany({
      where: {
        children: { some: { classId: acorn.id } },
        id: { notIn: acornBefore.map((f) => f.id) },
      },
    });
  }
});
