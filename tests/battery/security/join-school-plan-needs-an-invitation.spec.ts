import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SCHOOL_A, loginTeacher } from "../helpers";

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
// WHAT CHANGED ON 2 SEPTEMBER 2026, AND WHAT THIS FILE IS NOW. The action was
// emptied to a flat refusal while phase 2 was built, and this spec asserted two
// things: that it had no action id at all (nothing imported it), and that
// whatever a schoolless teacher posted, they stayed schoolless. Phase 2's
// acceptance screen imports it, so THE FIRST OF THOSE IS NOW FALSE BY DESIGN
// and the file's own comment said to replace it rather than extend it when the
// day came. This is that replacement:
//
//   1. The action IS dispatchable now. Asserted as a positive control, because
//      every refusal below means nothing if the request never reached the
//      action at all.
//   2. It takes an INVITATION id, and a posted `schoolId` is not a thing it
//      reads. That is the fix at the root rather than a validation around it,
//      and it is the invariant this file has always been about.
//
// The invitation-shaped attacks — somebody else's id, a spent one, an expired
// one, a school that lost verification — are in
// school-invitation-accept.spec.ts, which is where the transaction lives.
// ===========================================================================

const db = new PrismaClient();

// A teacher with their own free plan and no school — the plain free account a
// September signup gets, and the only account `joinSchoolPlan` ever applied to.
// Built here rather than in the shared fixtures so this spec cannot shift any
// other spec's counts.
const JOINER = { email: "wants.to.join@independent.test", password: "password" };

// The one sentence the action returns for every refusal, from
// src/lib/schoolInvitationPolicy.ts. If it is edited it must stay a sentence a
// teacher would say: `scripts/error-string-audit.mjs` (npm run audit:errors) is
// what checks that, and it is NOT part of `npm run check`.
//
// A SUBSTRING WITH NO APOSTROPHE IN IT, deliberately. The sentence itself
// carries a typographic apostrophe (isn’t), and a server action's reply is a
// React flight payload in which that character does not survive a `toContain`
// comparison intact. Matching on the clause that has no punctuation in it
// asserts the same sentence and cannot fail for a reason nobody cares about.
const REFUSAL = "may have been answered already, withdrawn, or run out of time";

let joinerId = "";
let invitationId = "";

test.beforeAll(async () => {
  await db.teacher.deleteMany({ where: { email: JOINER.email } });
  const teacher = await db.teacher.create({
    data: {
      name: "Jo Joiner",
      displayName: "Miss Joiner",
      email: JOINER.email,
      passwordHash: await bcrypt.hash(JOINER.password, 10),
      // No schoolId. Nothing but their own free row governs this account.
      //
      // BUT A PROVED ADDRESS, which a real September signup does NOT have
      // (F67). Accepting an invitation now requires one — guard 0 of
      // `joinSchoolPlan`, added in phase 2's Rule 1 review, and it runs before
      // the invitation is even read so that the message cannot become an oracle
      // about somebody's offer. Without this line every post below would be
      // answered by that gate instead of by the guard it is aiming at, and the
      // file would go on passing while proving nothing about a posted
      // `schoolId`. Seeded teachers need no such line: prisma/seed-test.ts
      // stamps every one of them in a single pass at the end.
      emailConfirmedAt: new Date(),
    },
  });
  joinerId = teacher.id;
  // Exactly what actions/auth.ts creates at signup: FREE + ACTIVE + no trial end.
  await db.subscription.create({
    data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: teacher.id },
  });

  // A REAL, OPEN INVITATION, and it is here for one reason: an action only
  // appears in Next's server-reference manifest once a route that imports it
  // has been compiled, and the only route that imports this one is the
  // acceptance screen. Without a renderable invitation there is no acceptance
  // screen, so the positive control below could not tell "unreachable" from
  // "never built". It is never accepted in this file.
  const school = await db.school.findFirstOrThrow({ where: { name: SCHOOL_A.name } });
  const invitation = await db.schoolInvitation.create({
    data: {
      schoolId: school.id,
      teacherId: teacher.id,
      role: "TEACHER",
      invitedName: "Jo Joiner",
      invitedByName: "Mrs Lindqvist",
      state: "PENDING",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  invitationId = invitation.id;
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

/**
 * Dispatch a server action the way a tampered client would, carrying whatever
 * fields the test names — including ones no form on the screen has.
 *
 * IT IS SENT BY THE BROWSER, NOT BY `page.request.post`, AND THAT IS NOT A
 * STYLE CHOICE. Playwright's own `multipart` encoder produces a body Next
 * accepts, dispatches, and hands to the action with an EMPTY FormData, in any
 * part order and with or without the `$ACTION_*` parts. Every refusal asserted
 * through it therefore passes for the wrong reason: the action refuses an empty
 * input rather than the input under test. That is exactly what the previous
 * version of this file would have done the day the action became live, and it
 * is why it was replaced rather than extended.
 *
 * The wire format was captured from a real submission by this app rather than
 * guessed: the arguments array goes in field `0`, arg 0 being the previous
 * state and arg 1 the FormData referenced as `$K1`, with each field carried
 * under a matching `_1_` prefix.
 */
async function postAction(page: Page, id: string, fields: Record<string, string>) {
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

/** Sign in and land on the acceptance screen, which is what compiles the action. */
async function onTheAcceptanceScreen(page: Page) {
  await loginTeacher(page, JOINER);
  await page.goto(`/teacher/account/invitation/${invitationId}`);
  await expect(page.getByRole("button", { name: /^Join / })).toBeVisible();
}

test("joinSchoolPlan is live now, and it is the acceptance screen that made it so", async ({ page }) => {
  await onTheAcceptanceScreen(page);

  const billing = compiledActions().filter((a) => a.filename.endsWith("src/app/actions/billing.ts"));

  // THE POSITIVE CONTROL, and it is what makes every refusal below mean
  // anything. Without it a scan that found no manifest, or looked in the wrong
  // dist directory, would "prove" any claim by finding nothing anywhere.
  //
  // Until 2 September 2026 this list was the three exports BillingPanel.tsx
  // imports, and `joinSchoolPlan` was asserted ABSENT: Next registers only the
  // exports a client component references, so a caller-less Server Action gets
  // no id and cannot be dispatched. That is still true of caller-less actions,
  // and it is no longer true of this one. The fourth entry IS the change.
  expect(
    [...new Set(billing.map((a) => a.exportedName))].sort(),
    "the scan must see billing.ts's live actions, including the one this file is about",
  ).toEqual(["joinSchoolPlan", "openCustomerPortal", "requestSchoolInvoice", "startCheckout"]);
});

test("a schoolless teacher cannot post their way into any school", async ({ page }) => {
  await onTheAcceptanceScreen(page);
  const id = compiledActions().find(
    (a) => a.exportedName === "joinSchoolPlan" && a.filename.endsWith("src/app/actions/billing.ts"),
  )!.id;

  // Real school ids, including one that really is running a school plan —
  // the single condition the old body checked before attaching.
  const oakfield = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });
  const bedes = await db.school.findFirstOrThrow({ where: { name: { contains: "Bede" } } });
  const oakfieldSub = await db.subscription.findUnique({ where: { schoolId: oakfield.id } });
  expect(
    oakfieldSub?.kind,
    "Oakfield must really be on a school plan, or the strongest input is not being tested",
  ).toBe("SCHOOL");

  const schoolIds = [oakfield.id, bedes.id, "", "   ", "not-a-school-id", "'; DROP TABLE School;--"];

  for (const schoolId of schoolIds) {
    // A POSTED `schoolId` IS NOT A FIELD THIS ACTION READS. The refusal is not
    // "that school said no"; it is that nothing named an invitation, so there
    // was nothing to answer. Sent alongside a real, live invitation id in the
    // same account — see beforeAll — so this is the strongest version of the
    // attack: the teacher genuinely has an open offer, and is trying to spend
    // it somewhere else.
    const answer = await postAction(page, id, { schoolId });
    expect(answer, "the action must say why it refused, in a teacher's words").toContain(REFUSAL);

    // And the same thing with the invitation id present TOO, so a school id
    // cannot ride along and redirect a legitimate acceptance.
    const both = await postAction(page, id, { schoolId, invitationId: "" });
    expect(both).toContain(REFUSAL);
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

  // The invitation they really do hold is untouched: a refused post must not
  // spend an offer either.
  expect(
    (await db.schoolInvitation.findUniqueOrThrow({ where: { id: invitationId } })).state,
    "a refused post must not consume the invitation the teacher actually holds",
  ).toBe("PENDING");

  // And nothing was written into any school's audit log in this teacher's
  // name — the trail a school reads to know who is in it.
  expect(
    await db.auditLog.count({ where: { actorId: joinerId } }),
    "a refused join leaves no trace in a school's audit log",
  ).toBe(0);
});
