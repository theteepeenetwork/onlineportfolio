import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// WHO MAY BUY A SCHOOL, AND WHOSE SCHOOL THEY MAY BUY
//
// Until this change both purchase actions opened with
// `if (!actor.isAdmin || !actor.schoolId) return`, which shut the only revenue
// path in the product to every real account: nothing a user can reach creates a
// `School`, so nobody was ever an admin of one (docs/pricing-decisions.md,
// 30 Aug 2026). The guard now INVERTS rather than disappearing:
//
//     if (actor.schoolId && !actor.isAdmin) return
//
// Belong to a school and you must be its admin. Belong to none and you are
// buying one into existence, so there is nothing yet to be an admin of.
//
// THE HALF THAT IS EASY TO LOSE is the first clause, and this file is mostly
// about it: buying against somebody else's school is exactly what the original
// check existed to stop, and an inversion written one character wrong ("||" for
// "&&") opens it to every colleague in every school. So the refusal is asserted
// by DIRECT POST of the server action, not by the absence of a button.
//
// AND THE URN NEVER COMES OFF THE WIRE. The form posts `plan`, `schoolName` and
// `claim` — never a URN. The server reads `Teacher.urn` and re-resolves the
// `Establishment` row itself, so a tampered client can choose only WHETHER to
// use its own teacher's URN, never which one (docs/school-identity.md §2). That
// is what makes the name↔URN mismatch unreachable instead of merely checked
// for, and it is asserted here in the direction that would matter: posting the
// URN of a school that is already on StoryJar buys nothing and reveals nothing.
//
// NOTHING HERE REACHES STRIPE, deliberately. Every case is a refusal that lands
// before the first Stripe call — the guard, the school name, the duplicate URN —
// so the suite stays hermetic and cannot go red because a fictional key got a
// 401 from api.stripe.com. What happens AFTER those refusals is the invoice
// route's own end-to-end walk, which needs a Stripe environment.
// ===========================================================================

const db = new PrismaClient();

// A teacher who signed up this morning, has no school, and whose stored URN
// names a school that is ALREADY on StoryJar. Oakfield is seeded claimed as URN
// 900200 with a matching register row, so this is the collision as a real
// teacher meets it: they typed their own school at signup, and a colleague got
// there first.
const SQUATTER = { email: "second.claim@oakfield.test", password: "password" };

// A teacher with no school, NO URN and NO stored school name. The positive
// control for every refusal below: this account gets past the guard and past
// the register, and is stopped by the one thing left — an empty name. That
// sentence is the proof the guard admitted them, and it costs no Stripe call.
const NAMELESS = { email: "no.school.name@independent.test", password: "password" };

let squatterId = "";
let namelessId = "";

test.beforeAll(async () => {
  await db.teacher.deleteMany({ where: { email: { in: [SQUATTER.email, NAMELESS.email] } } });

  const squatter = await db.teacher.create({
    data: {
      name: "Priya Second",
      displayName: "Miss Second",
      email: SQUATTER.email,
      passwordHash: await bcrypt.hash(SQUATTER.password, 10),
      // The URN Oakfield was claimed as. Stored on THIS teacher's row, which is
      // the only place the server will read one from.
      urn: "900200",
      schoolName: "Oakfield Primary",
    },
  });
  squatterId = squatter.id;
  await db.subscription.create({
    data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: squatter.id },
  });

  const nameless = await db.teacher.create({
    data: {
      name: "Alex Nameless",
      displayName: "Mx Nameless",
      email: NAMELESS.email,
      passwordHash: await bcrypt.hash(NAMELESS.password, 10),
      // No urn, no schoolName. Both are ordinary states: null is what every
      // teacher outside England has.
    },
  });
  namelessId = nameless.id;
  await db.subscription.create({
    data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: nameless.id },
  });
});

test.afterAll(async () => {
  await db.teacher.deleteMany({ where: { email: { in: [SQUATTER.email, NAMELESS.email] } } });
  await db.$disconnect();
});

// Every Server Action Next has compiled for this server, read out of its own
// build output — the table `Next-Action` is looked up in. Copied from
// join-school-plan-needs-an-invitation.spec.ts rather than shared, because a
// spec file cannot import another spec file without registering its tests.
function compiledActions(): { id: string; exportedName: string; filename: string }[] {
  const dist = path.join(process.cwd(), process.env.NEXT_DIST_DIR || ".next");
  const found: { id: string; exportedName: string; filename: string }[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (entry === "server-reference-manifest.json") {
        try {
          const manifest = JSON.parse(readFileSync(full, "utf8"));
          for (const runtime of ["node", "edge"] as const) {
            for (const [id, v] of Object.entries(manifest[runtime] ?? {})) {
              const rec = v as { exportedName?: string; filename?: string };
              if (rec.exportedName && rec.filename) found.push({ id, exportedName: rec.exportedName, filename: rec.filename });
            }
          }
        } catch {
          // a manifest half-written by a compile in flight is not evidence
        }
        continue;
      }
      if (!entry.includes(".")) walk(full);
    }
  };
  walk(dist);
  return [...new Map(found.map((a) => [a.id, a])).values()];
}

function actionId(exportedName: string): string {
  const found = compiledActions().find(
    (a) => a.exportedName === exportedName && a.filename.endsWith("src/app/actions/billing.ts"),
  );
  expect(found, `${exportedName} must have an action id, or nothing below is dispatching anything`).toBeTruthy();
  return found!.id;
}

/**
 * Dispatch a purchase action the way a tampered client would, carrying whatever
 * fields the test names — including ones no form on the screen has.
 *
 * THE WIRE FORMAT was captured from a live submission by this app on 2 Sep 2026
 * (listen for a POST carrying a `next-action` header and print
 * `request.postData()`) rather than guessed: the arguments array goes in field
 * `0` — arg 0 is the previous state, arg 1 is the FormData, referenced as `$K1`
 * — and each form field is carried under the matching `_1_` prefix.
 *
 * IT IS SENT BY THE BROWSER, NOT BY `page.request.post`, AND THAT IS NOT A
 * STYLE CHOICE. Playwright's own `multipart` encoder produces a body Next
 * accepts, dispatches and hands to the action with an EMPTY FormData — in any
 * part order, with or without the `$ACTION_*` parts. Every assertion in this
 * file would then be testing an empty form rather than the input it names, and
 * each refusal would look right for the wrong reason: "please choose a plan"
 * instead of "only a school admin". `fetch` from inside the page uses the
 * browser's own multipart encoder and the page's own cookies, and it is also a
 * truer model of the attacker being described.
 *
 * Anything on this machine reading the copy in
 * tests/battery/security/join-school-plan-needs-an-invitation.spec.ts should
 * know the same: its `page.request.post` branch has never run (the action it
 * dispatches has no id), and the day it does it will post nothing.
 */
async function postAction(page: Page, exportedName: string, fields: Record<string, string>) {
  const id = actionId(exportedName);
  const out = await page.evaluate(
    async ({ id, fields }: { id: string; fields: Record<string, string> }) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(`_1_${k}`, v);
      fd.append("0", '[{},"$K1"]');
      const res = await fetch(location.pathname, {
        method: "POST",
        headers: { "Next-Action": id },
        body: fd,
      });
      return { status: res.status, body: await res.text() };
    },
    { id, fields },
  );
  expect(out.status, "a refusal is an answer, not a crash").toBeLessThan(500);
  return out.body;
}

// Compile the route that imports billing.ts before any manifest is read: in dev
// an action appears there only once its route has been built.
async function warmAccountPage(page: Page, who: { email: string; password: string }) {
  await loginTeacher(page, who);
  await page.goto("/teacher/account");
  await expect(page.getByRole("heading", { name: /account/i }).first()).toBeVisible();
}

test("a teacher with no school can buy one, and both routes carry the band they chose", async ({ page }) => {
  await warmAccountPage(page, NAMELESS);

  const section = page.getByRole("region", { name: "Set your school up" });
  await expect(section, "a schoolless teacher must have somewhere to buy").toBeVisible();

  // THE TWO-FORM BUG, ASSERTED RATHER THAN REMEMBERED. The band radios once sat
  // inside the card checkout form only, so pressing "Request an invoice / PO
  // instead" posted no band at all and silently billed the default one. Both
  // forms now render the same hidden fields from one component, so choosing the
  // smallest band must change BOTH.
  await section.getByRole("radio", { name: /Up to 105 pupils/ }).check();
  const plans = await page.locator('input[type="hidden"][name="plan"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );
  expect(plans, "every purchase form must post the band that is selected").toEqual(["school_small", "school_small"]);

  const claims = await page.locator('input[type="hidden"][name="claim"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );
  expect(claims, "and the same claim, or the two buttons buy two different things").toEqual(["free-text", "free-text"]);

  // THE GUARD ADMITTED THEM. This teacher has no school and is not an admin of
  // anything, and the refusal they get is about their school's NAME — which is
  // several steps past the check that used to turn them away.
  const answer = await postAction(page, "requestSchoolInvoice", { plan: "school_1fe", claim: "free-text", schoolName: "" });
  expect(answer).toContain("Please tell us your school’s name");
  expect(answer, "the old guard must not still be turning a schoolless teacher away").not.toContain("Only a school admin");
});

test("a school somebody has already set up is refused by name, with a colleague to ask and never an email", async ({ page }) => {
  const schoolsBefore = await db.school.count();
  await warmAccountPage(page, SQUATTER);

  const section = page.getByRole("region", { name: "Set your school up" });
  await section.getByRole("button", { name: "Request an invoice / PO instead" }).click();

  const notice = page.getByRole("status").filter({ hasText: /already set up on StoryJar/ });
  await expect(notice).toBeVisible();
  const words = (await notice.textContent()) ?? "";

  // The school by name, so the teacher knows this is not a mistake…
  expect(words).toContain("Oakfield Primary is already set up on StoryJar");
  // …and a colleague to ask, by DISPLAY name. Mrs Lindqvist is Oakfield's first
  // ACTIVE admin in prisma/seed-test.ts.
  expect(words).toContain("Ask Mrs Lindqvist to add you to it");
  // NEVER AN ADDRESS. The sentence's job is to send this teacher to a colleague,
  // and "Mrs Lindqvist" does that job; an address would hand anybody who can
  // guess a URN a staff email out of a school they have no connection to.
  expect(words, "the refusal must not disclose a staff email address").not.toContain("@");

  // The card route refuses identically. Two buttons, one rule — a route that
  // refused more quietly would be the route people used.
  await section.getByRole("button", { name: "Pay by card" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Oakfield Primary is already set up/ })).toBeVisible();

  // AND NOTHING WAS CREATED OR MOVED by either press.
  expect(await db.school.count(), "a refused claim must create no school").toBe(schoolsBefore);
  const after = await db.teacher.findUniqueOrThrow({
    where: { id: squatterId },
    select: { schoolId: true, role: true },
  });
  expect(after.schoolId, "a refused claim must not attach the buyer to the school that holds the URN").toBeNull();
  expect(after.role, "and must not promote anybody").toBe("TEACHER");
  expect(
    await db.auditLog.count({ where: { actorId: squatterId } }),
    "a refused claim leaves no trace in anybody's audit log",
  ).toBe(0);
});

test("the URN is read from the teacher's own row and never off the wire", async ({ page }) => {
  // A posted URN naming a school that IS on StoryJar. If the server read it, the
  // answer would be the Oakfield refusal. It reads `Teacher.urn` — which is null
  // for this account — so the answer is about a missing name instead.
  await warmAccountPage(page, NAMELESS);
  const forged = await postAction(page, "requestSchoolInvoice", {
    plan: "school_1fe",
    claim: "register",
    schoolName: "",
    urn: "900200",
  });
  expect(forged, "a posted URN must not resolve a school this teacher has no claim on").not.toContain("already set up on StoryJar");
  expect(forged).toContain("Please tell us your school’s name");

  // And the other direction: a teacher whose OWN row names a claimed school
  // cannot post their way off it. Their stored URN decides, whatever the form
  // says the school is called or which URN it names.
  await warmAccountPage(page, SQUATTER);
  const evaded = await postAction(page, "requestSchoolInvoice", {
    plan: "school_1fe",
    claim: "register",
    schoolName: "Somewhere Else Entirely",
    urn: "900001",
  });
  expect(evaded, "the refusal follows the teacher's stored URN, not the posted one").toContain(
    "Oakfield Primary is already set up on StoryJar",
  );
  expect(
    await db.school.findFirst({ where: { name: "Somewhere Else Entirely" } }),
    "and no school was created under the posted name",
  ).toBeNull();
});

test("a teacher who belongs to a school but is not its admin still cannot buy", async ({ page }) => {
  const schoolsBefore = await db.school.count();
  await warmAccountPage(page, SCHOOL_B.teacher); // Mr Okafor: Oakfield, TEACHER

  // Nothing on screen offers it…
  await expect(page.getByRole("region", { name: "Set your school up" })).toHaveCount(0);

  // …and the server refuses the POST, which is the assertion that matters.
  for (const action of ["startCheckout", "requestSchoolInvoice"]) {
    const answer = await postAction(page, action, {
      plan: "school_large",
      claim: "free-text",
      schoolName: "Oakfield Primary (mine now)",
    });
    expect(answer, `${action} must refuse a member of staff who is not an admin`).toContain("Only a school admin");
  }

  const okafor = await db.teacher.findUniqueOrThrow({
    where: { email: SCHOOL_B.teacher.email },
    select: { role: true, schoolId: true },
  });
  expect(okafor.role, "a refused purchase must not promote anybody").toBe("TEACHER");
  expect(await db.school.count(), "a refused purchase must create no school").toBe(schoolsBefore);
  expect(await db.school.findFirst({ where: { name: "Oakfield Primary (mine now)" } })).toBeNull();

  // Oakfield's own plan is exactly as it was: no second Stripe subscription was
  // opened against the school by somebody who is not its admin.
  const oak = await db.school.findFirstOrThrow({ where: { name: "Oakfield Primary" }, select: { id: true } });
  const oakSub = await db.subscription.findUniqueOrThrow({ where: { schoolId: oak.id } });
  expect(oakSub.stripeSubscriptionId).toBeNull();
});

test("cross-tenant: School B's teacher cannot buy against School A", async ({ page }) => {
  const bedes = await db.school.findFirstOrThrow({ where: { name: { contains: "Bede" } }, select: { id: true, urn: true } });
  const before = await db.subscription.findUniqueOrThrow({ where: { schoolId: bedes.id } });
  const staffBefore = await db.teacher.count({ where: { schoolId: bedes.id } });

  await warmAccountPage(page, SCHOOL_B.teacher);

  // Every shape of "buy that one instead" this action could be asked for: the
  // other school by name, by id, and by the URN of the register entry. None of
  // these fields exists on the form; all of them are refused before anything is
  // read about School A.
  for (const fields of [
    { plan: "school_2fe", claim: "free-text", schoolName: "St Bede's Primary" },
    { plan: "school_2fe", claim: "free-text", schoolName: "St Bede's Primary", schoolId: bedes.id },
    { plan: "school_2fe", claim: "register", schoolName: "St Bede's Primary", urn: "900001" },
  ]) {
    const answer = await postAction(page, "requestSchoolInvoice", fields);
    expect(answer).toContain("Only a school admin");
  }

  const after = await db.subscription.findUniqueOrThrow({ where: { schoolId: bedes.id } });
  expect(after.status, "School A's plan was not touched by School B").toBe(before.status);
  expect(after.stripeSubscriptionId).toBe(before.stripeSubscriptionId);
  expect(after.stripeCustomerId).toBe(before.stripeCustomerId);
  expect(await db.school.findUniqueOrThrow({ where: { id: bedes.id }, select: { urn: true } })).toEqual({ urn: bedes.urn });
  expect(await db.teacher.count({ where: { schoolId: bedes.id } }), "and gained no staff").toBe(staffBefore);
  expect(
    await db.auditLog.count({ where: { schoolId: bedes.id, actorId: (await db.teacher.findUniqueOrThrow({ where: { email: SCHOOL_B.teacher.email }, select: { id: true } })).id } }),
    "School B's teacher wrote nothing into School A's audit log",
  ).toBe(0);
});

test("no refusal in this file moved anybody between schools", async () => {
  // The invariant, swept at the end rather than assumed test by test: the two
  // accounts this file created still belong to nobody, still hold their own free
  // plan, and are still ordinary teachers.
  for (const id of [squatterId, namelessId]) {
    const teacher = await db.teacher.findUniqueOrThrow({
      where: { id },
      select: { schoolId: true, role: true, subscription: { select: { kind: true, status: true, trialEndsAt: true } } },
    });
    expect(teacher.schoolId).toBeNull();
    expect(teacher.role).toBe("TEACHER");
    expect(teacher.subscription?.kind, "their own free plan is untouched").toBe("FREE");
    expect(teacher.subscription?.status).toBe("ACTIVE");
    expect(teacher.subscription?.trialEndsAt, "a free plan carries no countdown").toBeNull();
  }
});
