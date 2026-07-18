import { test, expect } from "@playwright/test";
import { studentCopy } from "@/lib/copy/student";
import { resolveAgeMode, type AgeMode } from "@/lib/ageMode";

// SJ-06 — the two child-facing registers (KS1 younger / KS2 older).
//
// Two things are guarded here:
//  1. The register actually SWAPS — an older child isn't spoken to like a
//     toddler (the audit's whole complaint).
//  2. The FIVE safeguarding-locked strings keep their promised meaning in BOTH
//     registers. The wording may age up, but the meaning must survive — a future
//     copy edit can't quietly turn "your teacher checks it first" into something
//     that no longer promises the approval gate. (Copy spec, 🔒 table.)

const MODES: AgeMode[] = ["KS1", "KS2"];

test("NULL / unknown age mode resolves to KS1 (the protective default)", () => {
  expect(resolveAgeMode(null)).toBe("KS1");
  expect(resolveAgeMode(undefined)).toBe("KS1");
  expect(resolveAgeMode("")).toBe("KS1");
  expect(resolveAgeMode("nonsense")).toBe("KS1");
  expect(resolveAgeMode("KS2")).toBe("KS2");
});

test("the register genuinely swaps between younger and older", () => {
  const y = studentCopy("KS1");
  const o = studentCopy("KS2");
  expect(y.home.signOut).toBe("Bye bye 👋");
  expect(o.home.signOut).toBe("Sign out");
  expect(y.celebration.heading).not.toBe(o.celebration.heading);
  expect(y.status.returnedShort).not.toBe(o.status.returnedShort);
  // The younger name wall cheers; the older one just instructs.
  expect(y.signIn.namesHeading.endsWith("!")).toBe(true);
  expect(o.signIn.namesHeading.endsWith("!")).toBe(false);
});

// The five locked strings, checked in EVERY register.
for (const mode of MODES) {
  test(`[${mode}] locked meanings survive: nothing public until the teacher approves`, () => {
    const c = studentCopy(mode);
    // 🔒1 — the approval promise. "the teacher … first" is what carries it.
    expect(c.add.teacherWillSee).toMatch(/teacher/i);
    expect(c.add.teacherWillSee).toMatch(/first/i);
    // The celebration subtitle echoes the same promise, never contradicts it.
    expect(c.celebration.subtitle).toMatch(/teacher/i);
  });

  test(`[${mode}] locked meanings survive: the caption is optional`, () => {
    // 🔒2 — a child is never stuck on a field they can skip.
    expect(studentCopy(mode).add.captionOptional).toMatch(/optional|don't have to/i);
  });

  test(`[${mode}] locked meanings survive: empty roster blames no one`, () => {
    // 🔒3 — not the child's fault; the fix is to ask the teacher.
    expect(studentCopy(mode).signIn.noNames).toMatch(/ask your teacher/i);
  });

  test(`[${mode}] locked meanings survive: a wrong code carries no blame`, () => {
    // 🔒4 — invites another try, and never blames: no "invalid" / "error" /
    // "wrong". ("Have another go" younger, "Try again" older.)
    const s = studentCopy(mode).signIn.codeNotFound;
    expect(s).toMatch(/again|another go/i);
    expect(s).not.toMatch(/invalid|error|wrong/i);
  });

  test(`[${mode}] locked meanings survive: a dead key says why`, () => {
    // 🔒5 — the disabled key explains itself rather than just failing.
    const s = studentCopy(mode).signIn.notInCodes("I");
    expect(s).toContain("I");
    expect(s).toMatch(/code/i);
  });
}

// End-to-end: the class's register actually reaches the child's screen. The
// demo seeds Sunflower (SUN234) younger and Ladybird (BUG456) older, so signing
// into each shows the matching sign-out wording. This is the proof the ageMode
// is threaded through, not just that the copy object is correct.
test("a younger class shows the younger register on the jar", async ({ page }) => {
  await page.goto("/login/student?code=SUN234");
  await page.getByRole("button", { name: "Amara", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByRole("button", { name: "Bye bye 👋" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("an older class shows the older register on the jar", async ({ page }) => {
  await page.goto("/login/student?code=BUG456");
  await page.getByRole("button", { name: "Grace", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bye bye 👋" })).toHaveCount(0);
});
