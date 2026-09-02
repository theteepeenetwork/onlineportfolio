import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loginTeacher, clearSession } from "../helpers";
import { hashPasswordToken } from "@/lib/passwordTokenPolicy";

// ===========================================================================
// BUYING REQUIRES A PROVED EMAIL ADDRESS — AND SIGNING UP STILL REQUIRES NONE
//
// Owner decision, docs/dpo-decisions.md 2 September 2026. Reaching checkout or
// raising a purchase order requires a confirmed address; free teacher signup is
// unchanged. That asymmetry is the decision rather than an oversight: a teacher
// blocked at checkout is trying to give StoryJar money and will say so, while
// one blocked at signup simply never comes back and nothing in any log records
// that they were there.
//
// WHY IT IS A SECURITY TEST AND NOT A BILLING ONE. `createTeacherAccount` has
// no email verification and no domain check (F67), so anybody could sign up
// with any school name, raise a purchase order — which costs the person raising
// it nothing up front — and become the ADMIN of a real school. Day thirty, a
// real teacher at that school signs up, is told to ask the squatter to add
// them, joins, and can be removed with their classes and their pupils'
// journals inherited. This gate puts a real mailbox behind that act at the one
// point where it already costs something.
//
// WHAT EVERY REFUSAL BELOW HAS TO BE TRUE OF, and it is asserted every time
// rather than once: NO STRIPE CALL AND NO ROW. Not a School, not a
// Subscription, not a claim, not an audit line. A gate that refused after
// creating the school would be a gate in name only.
//
// AND A THIRD TOKEN PURPOSE SHIPS WITH IT, so the two doors are held apart:
// a confirmation link must not set a password, and a password link must not
// confirm an address. The first of those is the sharp one — a confirmation
// link goes to an address NOBODY HAS PROVED YET, which is the whole reason it
// is being sent, so a token that could also set a password would hand the
// account to whoever received a mistyped address.
// ===========================================================================

const db = new PrismaClient();

// The message the gate produces, matched on a fragment that is about the
// DECISION rather than about the wording, so a copy edit does not fail a
// security gate but a removed gate does.
const REFUSED = /we need to know we can reach you/i;

/**
 * One unproved teacher with no school, ready to try to buy one.
 *
 * `schoolName` is nullable and one fixture below deliberately has none.
 * `resolveClaimTarget` falls back to the STORED name when the posted one is
 * empty, so a teacher who has one can never produce the "tell us your school's
 * name" refusal — they sail past it into Stripe. That fallback is what the
 * first version of this file got wrong, and it cost a Stripe call in a test
 * that claimed to make none.
 */
async function unprovedBuyer(email: string, name: string, schoolName: string | null) {
  const teacher = await db.teacher.create({
    data: {
      name,
      displayName: name.split(" ")[0],
      email,
      passwordHash: await bcrypt.hash("password", 10),
      schoolName,
      // The point of every fixture in this file: NULL. It is also what a real
      // signup produces, because signup asks for nothing.
      emailConfirmedAt: null,
    },
  });
  await db.subscription.create({
    data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: teacher.id },
  });
  return teacher.id;
}

const BUYER = { email: "unproved.buyer@wraysbury.test", password: "password" };
const CONFIRMER = { email: "unproved.confirmer@ashendon.test", password: "password" };
const LINK_OWNER = { email: "link.owner@padbury.test", password: "password" };
const BYSTANDER = { email: "bystander@padbury.test", password: "password" };
const PWD_TARGET = { email: "confirm.not.password@illey.test", password: "password" };
const TRAP = { email: "two.links.at.once@ockbrook.test", password: "password" };
const ALL = [BUYER, CONFIRMER, LINK_OWNER, BYSTANDER, PWD_TARGET, TRAP].map((t) => t.email);

let buyerId = "";
let confirmerId = "";
let linkOwnerId = "";
let bystanderId = "";
let pwdTargetId = "";
let trapId = "";

test.beforeAll(async () => {
  // Idempotent: a failed test discards the worker and this runs again.
  await db.teacher.deleteMany({ where: { email: { in: ALL } } });

  // ONE TEACHER PER TEST, deliberately. The gate mints and sends on refusal, so
  // a shared fixture would carry one test's rate-limit budget and one test's
  // confirmed state into the next, and the file would pass or fail by ordering.
  buyerId = await unprovedBuyer(BUYER.email, "Ines Wraysbury", "Wraysbury Primary");
  // NO STORED SCHOOL NAME, and that is load-bearing rather than an oversight:
  // it is the only way to reach a refusal that lands AFTER the confirmation
  // gate and BEFORE the first Stripe call, which is how the test below proves
  // the gate opened without needing a Stripe environment to be reachable.
  confirmerId = await unprovedBuyer(CONFIRMER.email, "Owen Ashendon", null);
  linkOwnerId = await unprovedBuyer(LINK_OWNER.email, "Cara Padbury", "Padbury Primary");
  bystanderId = await unprovedBuyer(BYSTANDER.email, "Tom Padbury", "Padbury Primary");
  pwdTargetId = await unprovedBuyer(PWD_TARGET.email, "Rhys Illey", "Illey Primary");
  trapId = await unprovedBuyer(TRAP.email, "Mina Ockbrook", "Ockbrook Primary");
});

test.afterAll(async () => {
  await db.teacher.deleteMany({ where: { email: { in: ALL } } });
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Dispatching the purchase actions the way a tampered client would.
//
// COPIED, NOT SHARED, from school-purchase-guard.spec.ts: a spec file cannot
// import another spec file without registering its tests. The wire format and
// the reason it is sent by the BROWSER rather than by `page.request.post` are
// documented in full there — Playwright's own multipart encoder produces a body
// Next accepts and hands to the action with an EMPTY FormData, so every
// assertion would pass for the wrong reason.
// ---------------------------------------------------------------------------
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

async function postAction(page: Page, exportedName: string, fields: Record<string, string>) {
  const id = actionId(exportedName);
  const out = await page.evaluate(
    async ({ id, fields }: { id: string; fields: Record<string, string> }) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(`_1_${k}`, v);
      fd.append("0", '[{},"$K1"]');
      const res = await fetch(location.pathname, { method: "POST", headers: { "Next-Action": id }, body: fd });
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

/**
 * Put a usable token of a given purpose in front of a teacher, and hand back
 * the raw value.
 *
 * The raw token is never stored by the application, so a test cannot read one
 * out of the database — it writes one in, through the SAME digest function the
 * application uses. If the two ever disagreed about the digest every link in
 * the product would stop working, and this would be the first thing to say so.
 */
async function plantToken(teacherId: string, purpose: "CONFIRM" | "RESET" | "INVITE"): Promise<string> {
  const raw = `test-${purpose.toLowerCase()}-${teacherId}-${Date.now()}`;
  await db.teacherPasswordToken.create({
    data: {
      resetHash: hashPasswordToken(raw),
      teacherId,
      purpose,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return raw;
}

// ===========================================================================

test("the card route refuses an unproved address before Stripe and before any row", async ({ page }) => {
  const schoolsBefore = await db.school.count();
  const mailBefore = await db.mailCounter.aggregate({
    where: { templateKey: "email-confirm" },
    _sum: { count: true },
  });

  await warmAccountPage(page, BUYER);
  const answer = await postAction(page, "startCheckout", {
    plan: "school_1fe",
    claim: "free-text",
    schoolName: "Wraysbury Primary",
  });

  expect(answer, "an unproved address must not reach checkout").toMatch(REFUSED);
  expect(answer, "and the refusal names the address, so a typo at signup is visible here").toContain(BUYER.email);
  // NO STRIPE CALL. This environment HAS a Stripe key, so a gate placed one
  // line too low produces Stripe's own failure sentence instead of this one —
  // which is exactly how the third test in this file first failed. The absence
  // of that sentence is the evidence, and it is only evidence because the key
  // is there.
  expect(answer, "the refusal must land before the first Stripe call").not.toContain("couldn’t start checkout");

  // NOTHING WAS CREATED. Each of these is a different way the gate could have
  // been put in the wrong place.
  expect(await db.school.count(), "a refused purchase must create no school").toBe(schoolsBefore);
  const after = await db.teacher.findUniqueOrThrow({
    where: { id: buyerId },
    select: { schoolId: true, role: true, emailConfirmedAt: true },
  });
  expect(after.schoolId, "and must attach the buyer to nothing").toBeNull();
  expect(after.role, "and must promote nobody").toBe("TEACHER");
  expect(after.emailConfirmedAt, "and must certainly not confirm the address it just refused").toBeNull();
  expect(
    await db.subscription.count({ where: { kind: "SCHOOL", school: { is: { name: "Wraysbury Primary" } } } }),
    "and must open no school subscription",
  ).toBe(0);
  expect(await db.auditLog.count({ where: { actorId: buyerId } }), "and leaves no trace in anybody's audit log").toBe(0);

  // WHAT IT DID DO: minted exactly one confirmation and sent it, so the teacher
  // has somewhere to go. The mail counter is what proves the send was attempted
  // AND that "email-confirm" is wired into MAIL_TEMPLATE_KEYS — a template key
  // added without a send path puts a permanently empty row on the operator
  // screen, and a send path with no key is invisible to the operator entirely.
  const tokens = await db.teacherPasswordToken.findMany({ where: { teacherId: buyerId } });
  expect(tokens, "a refusal that sends no link has refused the teacher twice").toHaveLength(1);
  expect(tokens[0].purpose).toBe("CONFIRM");
  expect(tokens[0].usedAt, "and it must still be spendable").toBeNull();

  const mailAfter = await db.mailCounter.aggregate({
    where: { templateKey: "email-confirm" },
    _sum: { count: true },
  });
  expect(
    (mailAfter._sum.count ?? 0) - (mailBefore._sum.count ?? 0),
    "the confirmation must be counted where an operator can see it",
  ).toBeGreaterThan(0);
});

test("the purchase-order route refuses identically — it is the route the gate exists for", async ({ page }) => {
  const schoolsBefore = await db.school.count();
  await warmAccountPage(page, CONFIRMER);

  const answer = await postAction(page, "requestSchoolInvoice", {
    plan: "school_1fe",
    claim: "free-text",
    schoolName: "Ashendon Primary",
  });

  // A PO route that admitted somebody the card route refuses would be a way
  // round the check rather than a second way in — and it is the cheaper of the
  // two to abuse, because raising an invoice costs nothing up front.
  expect(answer, "the invoice route must refuse an unproved address too").toMatch(REFUSED);
  expect(answer, "and land before the first Stripe call, as the card route does").not.toContain("couldn’t raise the invoice");
  expect(await db.school.count(), "and create no school on the way").toBe(schoolsBefore);
  const after = await db.teacher.findUniqueOrThrow({ where: { id: confirmerId }, select: { schoolId: true } });
  expect(after.schoolId).toBeNull();
});

test("opening the confirmation link proves the address, and only then does the gate open", async ({ page }) => {
  const raw = await plantToken(confirmerId, "CONFIRM");

  await warmAccountPage(page, CONFIRMER);
  await page.goto(`/confirm-email?token=${raw}`);

  const teacher = await db.teacher.findUniqueOrThrow({
    where: { id: confirmerId },
    select: { emailConfirmedAt: true },
  });
  expect(teacher.emailConfirmedAt, "opening the link must stamp the confirmation").not.toBeNull();

  const spent = await db.teacherPasswordToken.findFirstOrThrow({
    where: { resetHash: hashPasswordToken(raw) },
  });
  expect(spent.usedAt, "and spend the link, in the same transaction as the stamp").not.toBeNull();

  // THE GATE IS OPEN, PROVED WITHOUT A STRIPE ENVIRONMENT. Posting an empty
  // school name lands on the refusal that comes AFTER the confirmation gate and
  // BEFORE the first Stripe call, so the sentence itself is the evidence that
  // the buyer got past.
  const answer = await postAction(page, "requestSchoolInvoice", {
    plan: "school_1fe",
    claim: "free-text",
    schoolName: "",
  });
  expect(answer, "a proved address must reach the ordinary refusals").toContain("Please tell us your school’s name");
  expect(answer, "and must not be stopped by the confirmation gate any more").not.toMatch(REFUSED);

  // SINGLE USE. A link that worked twice would survive being forwarded.
  await db.teacher.update({ where: { id: confirmerId }, data: { emailConfirmedAt: null } });
  await page.goto(`/confirm-email?token=${raw}`);
  const again = await db.teacher.findUniqueOrThrow({
    where: { id: confirmerId },
    select: { emailConfirmedAt: true },
  });
  expect(again.emailConfirmedAt, "a spent confirmation link must confirm nothing").toBeNull();
});

test("one teacher's confirmation link cannot confirm another teacher's address", async ({ page }) => {
  // CROSS-TENANT, in the direction that would matter. The link carries no id
  // and no address, and the route consults no session — so the only thing that
  // can decide whose address is confirmed is the token row's `teacherId`. This
  // asserts that by handing the link to a browser signed in as somebody else.
  const raw = await plantToken(linkOwnerId, "CONFIRM");

  await warmAccountPage(page, BYSTANDER);
  await page.goto(`/confirm-email?token=${raw}`);

  const owner = await db.teacher.findUniqueOrThrow({
    where: { id: linkOwnerId },
    select: { emailConfirmedAt: true },
  });
  const bystander = await db.teacher.findUniqueOrThrow({
    where: { id: bystanderId },
    select: { emailConfirmedAt: true },
  });
  expect(owner.emailConfirmedAt, "the link confirms the account it was minted for").not.toBeNull();
  expect(
    bystander.emailConfirmedAt,
    "and never the account that happened to be signed in when it was opened",
  ).toBeNull();

  // And with no session at all it behaves the same way, because the session was
  // never consulted.
  await clearSession(page);
  const raw2 = await plantToken(bystanderId, "CONFIRM");
  await page.goto(`/confirm-email?token=${raw2}`);
  const bystanderAfter = await db.teacher.findUniqueOrThrow({
    where: { id: bystanderId },
    select: { emailConfirmedAt: true },
  });
  expect(bystanderAfter.emailConfirmedAt, "a confirmation link needs no session, and gets none").not.toBeNull();
});

test("a confirmation link cannot set a password", async ({ page }) => {
  // THE SHARP ONE. A confirmation link is emailed to an address nobody has
  // proved — that is the entire reason it is being sent. If `setPassword`
  // accepted it, a teacher who mistyped their own address at signup would have
  // handed a complete account takeover to whichever stranger received it. Today
  // that stranger gets an email asking them to reply to us instead.
  const before = await db.teacher.findUniqueOrThrow({
    where: { id: pwdTargetId },
    select: { passwordHash: true },
  });
  const raw = await plantToken(pwdTargetId, "CONFIRM");

  await clearSession(page);
  await page.goto(`/set-password?token=${raw}`);
  await page.fill("#password", "a-stranger-chose-this");
  await page.fill("#confirm", "a-stranger-chose-this");
  await page.getByRole("button", { name: /save and sign in/i }).click();

  await expect(
    page.getByText(/expired or has already been used/i),
    "a confirmation link offered at the password door is refused like any other bad link",
  ).toBeVisible();

  const after = await db.teacher.findUniqueOrThrow({
    where: { id: pwdTargetId },
    select: { passwordHash: true, emailConfirmedAt: true },
  });
  expect(after.passwordHash, "and the password is untouched").toBe(before.passwordHash);
  expect(after.emailConfirmedAt, "and nothing was confirmed at the wrong door either").toBeNull();
  expect(page.url(), "and nobody was signed in").not.toMatch(/\/teacher(\/|$)/);

  // The token must NOT have been spent by a refusal: the real owner may still
  // be about to use it.
  const token = await db.teacherPasswordToken.findFirstOrThrow({ where: { resetHash: hashPasswordToken(raw) } });
  expect(token.usedAt, "a link refused at the wrong door is still the right link at the right one").toBeNull();
});

test("a password reset and a confirmation do not spend each other", async ({ page }) => {
  // THE TRAP IN `mintPasswordToken`, ASSERTED IN BOTH DIRECTIONS.
  //
  // That function spends every unspent token the teacher holds when it mints a
  // new one, which is right for the two purposes that SET A PASSWORD — only one
  // such link may be live. A confirmation sets no password and lives in its own
  // pool. Without that split, a teacher who asked for a reset while a
  // confirmation was in flight would be blocked at checkout holding a dead
  // link, and neither screen would say why.
  const reset = await plantToken(trapId, "RESET");

  // Pressing Buy mints a CONFIRM. The outstanding RESET must survive it.
  await warmAccountPage(page, TRAP);
  await postAction(page, "startCheckout", { plan: "school_1fe", claim: "free-text", schoolName: "Ockbrook Primary" });

  const resetRow = await db.teacherPasswordToken.findFirstOrThrow({
    where: { resetHash: hashPasswordToken(reset) },
  });
  expect(resetRow.usedAt, "minting a confirmation must not kill a password reset the teacher is waiting for").toBeNull();

  const confirm = await db.teacherPasswordToken.findFirstOrThrow({
    where: { teacherId: trapId, purpose: "CONFIRM" },
  });
  expect(confirm.usedAt).toBeNull();

  // And now the other direction: asking for a password reset mints a RESET,
  // which must leave the confirmation alone.
  await clearSession(page);
  await page.goto("/login/teacher/forgotten");
  await page.fill("#email", TRAP.email);
  await page.getByRole("button", { name: /send me a link/i }).click();
  await page
    .getByText(/if that address is on our system|doesn.t look quite right|too many attempts/i)
    .waitFor({ state: "visible", timeout: 15_000 });

  const confirmAfter = await db.teacherPasswordToken.findUniqueOrThrow({ where: { id: confirm.id } });
  expect(
    confirmAfter.usedAt,
    "a password reset must not silently invalidate the confirmation blocking this teacher's purchase",
  ).toBeNull();

  // The old RESET, by contrast, IS spent by the new one — that behaviour is
  // correct and this change does not touch it. Asserted so that a future
  // "simplify the pools" edit has to break something visible.
  const oldReset = await db.teacherPasswordToken.findUniqueOrThrow({ where: { id: resetRow.id } });
  expect(oldReset.usedAt, "two live password links is one more than anybody needs").not.toBeNull();
});
