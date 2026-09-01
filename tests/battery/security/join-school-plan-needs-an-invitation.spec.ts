import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loginTeacher } from "../helpers";

// ===========================================================================
// Nobody joins a school by naming it
//
// `joinSchoolPlan` (src/app/actions/billing.ts) used to take a `schoolId`
// straight from a posted form and attach any signed-in schoolless teacher to
// that school: set `Teacher.schoolId`, delete their own FREE `Subscription`,
// audit BILLING_JOINED_SCHOOL. The only thing it checked was that the named
// school ran a school plan — never that the school had asked for this teacher.
// From that moment the teacher's classes, and their pupils' work, would be
// governed by, and appear in the audit log of, a school they have no connection
// to.
//
// `docs/dpo-decisions.md` (1 September 2026) rules that it must succeed only
// against an unspent invitation for that teacher and that school, which it
// consumes. No invitation model exists yet, so until one does the action
// refuses everything and reads and writes nothing.
//
// This spec holds two separate things, because they can rot independently:
//
//   1. The action is not dispatchable at all today. That is asserted rather
//      than assumed — see the note in the first test, which is the one claim
//      in this area that turned out NOT to be true as written.
//   2. Whatever a signed-in schoolless teacher posts, they stay schoolless and
//      keep their own free plan. That is the invariant, and it is the one that
//      matters the day phase 2 wires this action into a screen.
// ===========================================================================

const db = new PrismaClient();

// A teacher with their own free plan and no school — the plain free account a
// September signup gets, and the only account `joinSchoolPlan` ever applied to.
// Built here rather than in the shared fixtures so this spec cannot shift any
// other spec's counts.
const JOINER = { email: "wants.to.join@independent.test", password: "password" };

// The exact sentence the action returns. If this is edited, it must stay a
// sentence a teacher would say: `scripts/error-string-audit.mjs` (npm run
// audit:errors) is what checks that, and it is NOT part of `npm run check`.
const REFUSAL = "Joining a school needs an invitation from that school.";

let joinerId = "";

test.beforeAll(async () => {
  await db.teacher.deleteMany({ where: { email: JOINER.email } });
  const teacher = await db.teacher.create({
    data: {
      name: "Jo Joiner",
      displayName: "Miss Joiner",
      email: JOINER.email,
      passwordHash: await bcrypt.hash(JOINER.password, 10),
      // No schoolId. Nothing but their own free row governs this account.
    },
  });
  joinerId = teacher.id;
  // Exactly what actions/auth.ts creates at signup: FREE + ACTIVE + no trial end.
  await db.subscription.create({
    data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: teacher.id },
  });
});

test.afterAll(async () => {
  await db.teacher.deleteMany({ where: { email: JOINER.email } });
  await db.$disconnect();
});

// Every Server Action Next has compiled for this server, read out of its own
// build output. An action is dispatchable if and only if it has an id here:
// that is the table `Next-Action` is looked up in. `NEXT_DIST_DIR` is set per
// lane by scripts/run-suites.mjs and inherited by the test process.
function compiledActions(): { id: string; exportedName: string; filename: string }[] {
  const dist = path.join(process.cwd(), process.env.NEXT_DIST_DIR || ".next");
  const found: { id: string; exportedName: string; filename: string }[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // a dist directory that does not exist contributes nothing
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (entry === "server-reference-manifest.json") {
        try {
          const manifest = JSON.parse(readFileSync(full, "utf8"));
          for (const runtime of ["node", "edge"] as const) {
            for (const [id, v] of Object.entries(manifest[runtime] ?? {})) {
              const rec = v as { exportedName?: string; filename?: string };
              if (rec.exportedName && rec.filename) {
                found.push({ id, exportedName: rec.exportedName, filename: rec.filename });
              }
            }
          }
        } catch {
          // a manifest half-written by a compile in flight is not evidence
        }
        continue;
      }
      if (!entry.includes(".")) walk(full); // directories only; skip chunk files
    }
  };
  walk(dist);
  // The same action is listed in the global manifest and again in the
  // per-route one, so dedupe by id or the positive control below counts each
  // action twice.
  return [...new Map(found.map((a) => [a.id, a])).values()];
}

test("joinSchoolPlan has no action id, so there is no way to dispatch it", async ({ page }) => {
  // Compile the route that imports src/app/actions/billing.ts before reading
  // the manifest. In dev, actions appear in it only once their route has been
  // built, so scanning first would prove nothing about anything.
  await loginTeacher(page, JOINER);
  await page.goto("/teacher/account");
  await expect(page.getByRole("heading", { name: /account/i }).first()).toBeVisible();

  const actions = compiledActions();
  const billing = actions.filter((a) => a.filename.endsWith("src/app/actions/billing.ts"));

  // POSITIVE CONTROL FIRST, and it is what makes the negative mean anything.
  // Without it a scan that found no manifest at all, or looked in the wrong
  // dist directory, would "prove" the action is unreachable by finding nothing
  // anywhere. These three are the exports BillingPanel.tsx really imports.
  expect(
    [...new Set(billing.map((a) => a.exportedName))].sort(),
    "the scan must be able to see billing.ts's live actions, or its silence about joinSchoolPlan means nothing",
  ).toEqual(["openCustomerPortal", "requestSchoolInvoice", "startCheckout"]);

  // THE NEGATIVE. Next registers only the exports a client component
  // references, so an exported Server Action with no caller is given no id and
  // cannot be reached: there is nothing for `Next-Action` to name.
  //
  // This corrects the premise this change was written on — that a caller-less
  // Server Action is "still a live POST endpoint with a stable action id".
  // Verified on Next 16.3.1 in both a dev compile and `next build`; the ids are
  // not stable across the two either. Shutting the action is still right (the
  // day it is wired into a screen it becomes reachable, and phase 2 wires it
  // into a screen), but the urgency argument was overstated and this assertion
  // is what will tell us the moment it stops being true.
  expect(
    billing.filter((a) => a.exportedName === "joinSchoolPlan"),
    "joinSchoolPlan is not wired to any screen, so it must have no action id — if this fails it has been given one, and the test below is now the load-bearing one",
  ).toEqual([]);
});

test("a schoolless teacher cannot post their way into any school", async ({ page }) => {
  await loginTeacher(page, JOINER);
  await page.goto("/teacher/account");

  // Real school ids, including one that really is running a school plan —
  // which is the single condition the old body checked before attaching.
  const oakfield = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });
  const bedes = await db.school.findFirstOrThrow({ where: { name: { contains: "Bede" } } });
  const oakfieldSub = await db.subscription.findUnique({ where: { schoolId: oakfield.id } });
  expect(
    oakfieldSub?.kind,
    "Oakfield must really be on a school plan, or the strongest input is not being tested",
  ).toBe("SCHOOL");

  const inputs = [oakfield.id, bedes.id, "", "   ", "not-a-school-id", "'; DROP TABLE School;--"];

  // If the action ever gains an id, dispatch it for real — the point of this
  // test is the endpoint, not the function. Dormant today (see the test above),
  // which is why the invariant below is asserted whether or not this runs.
  const actionId = compiledActions().find(
    (a) => a.exportedName === "joinSchoolPlan" && a.filename.endsWith("src/app/actions/billing.ts"),
  )?.id;

  for (const schoolId of inputs) {
    if (actionId) {
      // The wire format a `useActionState` form really uses, captured from a
      // live submission by this app rather than guessed: the arguments array
      // goes in field `0` — arg 0 is the previous state, arg 1 is the FormData,
      // referenced as `$K1` — and each form field is carried under the matching
      // `_1_` prefix. To re-capture it after a React upgrade, listen for a POST
      // carrying a `next-action` header and print `request.postData()`.
      const res = await page.request.post("/teacher/account", {
        headers: { "Next-Action": actionId },
        multipart: { "_1_schoolId": schoolId, "0": '[{},"$K1"]' },
        failOnStatusCode: false,
      });
      expect(res.status(), "a refusal is an answer, not a crash").toBeLessThan(500);
      expect(await res.text(), "the action must say why it refused, in a teacher's words").toContain(REFUSAL);
    } else {
      // No id to dispatch. Post the same body the way an attacker with no
      // action id can — which is also what csrf.spec.ts proves is refused —
      // so the invariant below is asserted against a request that was really
      // made rather than against nothing at all.
      const res = await page.request.post("/teacher/account", {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        data: `schoolId=${encodeURIComponent(schoolId)}`,
        failOnStatusCode: false,
      });
      expect(res.status(), "a refusal is an answer, not a crash").toBeLessThan(500);
    }
  }

  // THE INVARIANT, asserted against the database rather than against a screen.
  const after = await db.teacher.findUniqueOrThrow({
    where: { id: joinerId },
    select: { schoolId: true, subscription: { select: { kind: true, status: true, trialEndsAt: true } } },
  });
  expect(after.schoolId, "no post attached this teacher to a school").toBeNull();
  expect(after.subscription, "their own free plan was not deleted from under them").toBeTruthy();
  expect(after.subscription!.kind).toBe("FREE");
  expect(after.subscription!.status).toBe("ACTIVE");
  expect(after.subscription!.trialEndsAt, "a free plan carries no countdown").toBeNull();

  // And nothing was written into either school's audit log in this teacher's
  // name — the trail a school reads to know who is in it.
  expect(
    await db.auditLog.count({ where: { actorId: joinerId } }),
    "a refused join leaves no trace in a school's audit log",
  ).toBe(0);
});
