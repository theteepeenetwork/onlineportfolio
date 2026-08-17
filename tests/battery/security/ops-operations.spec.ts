import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SCHOOL_C, loginTeacher, signInOperator } from "../helpers";
import {
  OPS_OPERATIONS,
  OPS_OPERATION_IDS,
  OPS_REPEAT_MESSAGE,
  opsIdempotencyKey,
  opsOperation,
} from "@/lib/ops/registry";

// ===========================================================================
// A27 - The operation registry, and the two operations in it (PR4)
//
// This is the first PR in the operator programme where the answer to "what can
// Storyjar staff do?" stops being "look". So the spec is arranged around the
// three properties that have to hold before that is safe:
//
//   1. THE LIST IS CLOSED. There is one registry, it is frozen, and the ids in
//      it match a literal list written here and a table in the decision log. An
//      operation added in code and nowhere a person reads is a red build.
//
//   2. THE OPERATOR NEVER SEES A CODE (owner amendment C1). Rotation replaces a
//      family code without returning it, and that is asserted from the outside
//      on the same record, paired on ROLE, which is the pairing axis for this
//      area (handbook section 6 item 3): the teacher's own page shows the new
//      code, and no operator surface, RSC payload or audit row contains it.
//
//   3. AN AUDIT FAILURE FAILS THE OPERATION (ruling R5). Proved with a genuine
//      unique-index violation and no fault flag anywhere in the product: the
//      same operation, with the same stated reason, produces the same derived
//      idempotency key, SQLite refuses the second audit row, and the mutation
//      in the same transaction is rolled back. The code is asserted UNCHANGED
//      afterwards, which is the only thing that distinguishes "the transaction
//      rolled back" from "the second attempt never got that far".
//
// HOW THIS SPEC SIGNS IN: as a person does, with the password and a real TOTP
// code computed from the seeded secret. There is no bypass (ruling R6).
//
// THE FIXTURE IS THIS SPEC'S OWN. It creates one family space for Larchwood's
// pupil and removes it afterwards, rather than rotating a seeded code. Two
// reasons, and the second is the important one: Larchwood is the FROZEN school,
// so rotation is exercised where it matters most (taking access away must never
// be blocked by billing, exactly as the teacher's own rotation is not); and
// rotating a seeded code would silently hollow out every other spec that
// asserts that code never appears on an operator screen, because a code that no
// longer exists cannot appear anywhere.
// ===========================================================================

const db = new PrismaClient();

const FIXTURE_EMAIL = "pr4-family@storyjar.test";
const REASON = "School office rang about a letter that went to the wrong address.";

let parentId = "";
let pupilId = "";

test.beforeAll(async () => {
  const pupil = await db.student.findFirst({
    where: { name: SCHOOL_C.student, class: { classCode: SCHOOL_C.classCode } },
    select: { id: true },
  });
  expect(pupil, "the frozen school's fixture pupil").not.toBeNull();
  pupilId = pupil!.id;

  await db.parent.deleteMany({ where: { email: FIXTURE_EMAIL } });
  const family = await db.parent.create({
    data: {
      email: FIXTURE_EMAIL,
      familyCode: "PR4SEED1",
      children: { connect: { id: pupilId } },
    },
    select: { id: true },
  });
  parentId = family.id;
});

test.afterAll(async () => {
  await db.opsAuditLog.deleteMany({ where: { subjectId: parentId } });
  await db.parent.deleteMany({ where: { email: FIXTURE_EMAIL } });
  await db.$disconnect();
});

async function currentCode(): Promise<string> {
  const row = await db.parent.findUnique({
    where: { id: parentId },
    select: { familyCode: true },
  });
  return row!.familyCode;
}

async function rowsFor(action: string): Promise<number> {
  return db.opsAuditLog.count({ where: { action, subjectId: parentId } });
}

/** Find the fixture family through the operator's own screen, as a person does. */
async function findTheFamily(page: Page) {
  await page.goto("/ops/lookup");
  await page.check("#kind-PARENT");
  await page.fill("#email", FIXTURE_EMAIL);
  await page.fill("#reason", "Checking the record before acting on it, as asked.");
  await page.getByRole("button", { name: /search and record the reason/i }).click();
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
}

/** Open one operation's panel, type a reason and confirm it. */
async function runOperation(page: Page, title: RegExp, confirm: RegExp, reason: string) {
  await page.getByRole("button", { name: title }).click();
  const panel = page.getByRole("region", { name: title });
  await expect(panel).toBeVisible();
  await panel.getByRole("textbox").fill(reason);
  await panel.getByRole("button", { name: confirm }).click();
  return panel;
}

const ROTATE = /issue a new family code/i;
const ROTATE_CONFIRM = /yes, issue a new code/i;
const REVEAL = /show this address in full/i;
const REVEAL_CONFIRM = /yes, show the address/i;

// ---------------------------------------------------------------------------
// 1. The registry is a closed list, in more than one place
// ---------------------------------------------------------------------------

test("the registry holds exactly these operations, and adding one is four edits", () => {
  // The literal list. Changing the registry without changing this line turns
  // the battery red, in both directions, which is the whole mechanism: a new
  // operation cannot ship until somebody has written its name into a blocking
  // test and been asked why in review.
  const EXPECTED_IDS = ["OPS_FAMILY_CODE_ROTATED", "OPS_PARENT_EMAIL_REVEALED"];
  expect([...OPS_OPERATION_IDS]).toEqual(EXPECTED_IDS);

  const repo = process.cwd();
  // Edit three: the implementation. Every id is implemented in the one module
  // the blindness gate permits to write anything.
  const operations = readFileSync(path.join(repo, "src/lib/ops/operations.ts"), "utf8");
  // Edit four: the dated decision log, which is the document a school's data
  // protection lead can be shown. An operation that exists in code and nowhere
  // a human reads is not a closed list, it is a closed file.
  const decisions = readFileSync(path.join(repo, "docs/ops-architecture.md"), "utf8");
  for (const id of EXPECTED_IDS) {
    expect(operations, `${id} has no implementation`).toContain(id);
    expect(decisions, `${id} is not in docs/ops-architecture.md`).toContain(id);
  }

  // Every row is complete enough to render a confirm step. A row with no
  // consequences would be a confirm dialog that says nothing.
  for (const id of OPS_OPERATION_IDS) {
    const spec = opsOperation(id);
    expect(spec.consequences.length, `${id} states no consequences`).toBeGreaterThan(0);
    expect(spec.confirmLabel.length).toBeGreaterThan(0);
    expect(["MUTATION", "DISCLOSURE"]).toContain(spec.kind);
  }

  // Frozen, and unknown means throw rather than fall back to something.
  expect(Object.isFrozen(OPS_OPERATIONS)).toBe(true);
  expect(Object.isFrozen(OPS_OPERATIONS.OPS_FAMILY_CODE_ROTATED)).toBe(true);
  expect(() => opsOperation("OPS_DELETE_EVERYTHING")).toThrow(/registry is closed/i);
});

test("the idempotency key is derived from the operation, the operator, the record and the reason", () => {
  const base = {
    action: "OPS_FAMILY_CODE_ROTATED",
    actorId: "operator-1",
    subjectId: "parent-1",
    reason: REASON,
  };
  const key = opsIdempotencyKey(base);

  // Stable, so the same operation twice really does collide. This is the whole
  // mechanism behind ruling R5's "forced without a fault switch".
  expect(opsIdempotencyKey({ ...base })).toBe(key);
  // Whitespace is not a new reason.
  expect(opsIdempotencyKey({ ...base, reason: `  ${REASON}  ` })).toBe(key);

  // And every part of it matters, or two different operations would block each
  // other.
  expect(opsIdempotencyKey({ ...base, action: "OPS_PARENT_EMAIL_REVEALED" })).not.toBe(key);
  expect(opsIdempotencyKey({ ...base, actorId: "operator-2" })).not.toBe(key);
  expect(opsIdempotencyKey({ ...base, subjectId: "parent-2" })).not.toBe(key);
  expect(opsIdempotencyKey({ ...base, reason: `${REASON} Second one.` })).not.toBe(key);
});

// ---------------------------------------------------------------------------
// 2. Who can reach the operations at all
// ---------------------------------------------------------------------------

test("the operations exist for the operator and not for a teacher, on the same URL", async ({
  page,
}) => {
  await signInOperator(page);
  await findTheFamily(page);
  // Positive control: both operations are on the record, as buttons.
  await expect(page.getByRole("button", { name: REVEAL })).toBeVisible();
  await expect(page.getByRole("button", { name: ROTATE })).toBeVisible();

  // The same URL, the same fixture, the other session.
  await page.context().clearCookies();
  await loginTeacher(page, SCHOOL_C.teacher);
  const refused = await page.goto("/ops/lookup");
  expect(refused?.status(), "a teacher session must not reach the operator area").toBe(404);
  const body = (await page.textContent("body")) ?? "";
  expect(body.toLowerCase()).not.toContain("issue a new family code");

  // Positive control on the same cookie: it is a working session, just not this
  // one. Larchwood's teacher is an ADMIN, so their own console answers.
  const allowed = await page.goto("/admin");
  expect(allowed?.status()).toBe(200);
});

// ---------------------------------------------------------------------------
// 3. Reveal: the disclosure half of amendment C4
// ---------------------------------------------------------------------------

test("a parent's address is masked until it is asked for, and asking is recorded", async ({
  page,
}) => {
  await signInOperator(page);
  await findTheFamily(page);

  // Negative first: the record hands over a mask, and the address is not
  // hiding in the payload behind it.
  const result = page.locator("section[aria-labelledby='ops-lookup-result']");
  await expect(result).toContainText("pr***@storyjar.test");
  expect((await result.textContent()) ?? "").not.toContain(FIXTURE_EMAIL);

  const before = await rowsFor("OPS_PARENT_EMAIL_REVEALED");
  const reason = `Parent says no sign-in link is arriving, ${Date.now()}`;
  const panel = await runOperation(page, REVEAL, REVEAL_CONFIRM, reason);

  // Positive control on the same record: asked for, with a reason, it is shown.
  await expect(panel).toContainText(FIXTURE_EMAIL);
  await expect(panel).toContainText("the reason has been recorded");

  expect(await rowsFor("OPS_PARENT_EMAIL_REVEALED")).toBe(before + 1);
  const row = await db.opsAuditLog.findFirst({
    where: { action: "OPS_PARENT_EMAIL_REVEALED", reason },
    orderBy: { at: "desc" },
  });
  expect(row, "a disclosure that is not recorded is a disclosure nobody can check").not.toBeNull();
  expect(row!.reason, "stored verbatim").toBe(reason);
  expect(row!.detail, "the row says which address was shown").toContain(FIXTURE_EMAIL);
  expect(row!.subjectType).toBe("PARENT");
  expect(row!.subjectId).toBe(parentId);
  expect(row!.actorName).toBe("ops@storyjar.test");
});

test("the server refuses a short reason, and nothing is shown or recorded", async ({ page }) => {
  await signInOperator(page);
  await findTheFamily(page);
  const before = await rowsFor("OPS_PARENT_EMAIL_REVEALED");

  const panel = await runOperation(page, REVEAL, REVEAL_CONFIRM, "too short");
  await expect(panel.getByRole("alert")).toContainText("At least 12 characters");
  await expect(panel, "a refused disclosure must not disclose").not.toContainText(FIXTURE_EMAIL);
  expect(await rowsFor("OPS_PARENT_EMAIL_REVEALED"), "a refusal is not an operation").toBe(before);

  // Submit is never disabled, not for a short reason and not in flight
  // (ruling R16). A disabled control announces nothing and cannot be focused.
  await expect(panel.getByRole("button", { name: REVEAL_CONFIRM })).not.toBeDisabled();

  // Positive control: the same panel, a long enough reason, goes through. So
  // the refusal was the reason and not a broken form.
  await panel.getByRole("textbox").fill(`Same call, saying more this time, ${Date.now()}`);
  await panel.getByRole("button", { name: REVEAL_CONFIRM }).click();
  await expect(panel).toContainText(FIXTURE_EMAIL);
  expect(await rowsFor("OPS_PARENT_EMAIL_REVEALED")).toBe(before + 1);
});

// ---------------------------------------------------------------------------
// 4. Rotation: the operator changes a credential without ever seeing one
// ---------------------------------------------------------------------------

test("rotation replaces the family code, and the operator never sees either one", async ({
  page,
}) => {
  const old = await currentCode();
  await signInOperator(page);
  await findTheFamily(page);

  const reason = `Letter went to the wrong address, school asked us to reissue, ${Date.now()}`;
  const panel = await runOperation(page, ROTATE, ROTATE_CONFIRM, reason);
  await expect(panel).toContainText("A new family code has been issued");

  // Positive control: something really happened. The stored code changed, and
  // the leaked one is gone from the table rather than merely superseded, so it
  // cannot sign anybody in.
  const fresh = await currentCode();
  expect(fresh, "the code did not change").not.toBe(old);
  expect(await db.parent.count({ where: { familyCode: old } }), "the old code still exists").toBe(0);

  // The negative this operation exists to keep. page.content() is the whole
  // document INCLUDING the serialised payload, so a value passed as a prop and
  // never rendered is caught too.
  const html = await page.content();
  expect(html, "the new code reached the operator's screen").not.toContain(fresh);
  expect(html, "the old code reached the operator's screen").not.toContain(old);

  // Nor the audit trail. RETENTION.md is explicit: the log records that a code
  // was re-issued, never the code itself.
  const rows = await db.opsAuditLog.findMany({ where: { subjectId: parentId } });
  expect(rows.length, "there is something to check").toBeGreaterThan(0);
  const blob = JSON.stringify(rows);
  expect(blob, "a credential value reached the operator audit trail").not.toContain(fresh);
  expect(blob).not.toContain(old);
  // The row that was written says what happened, with the address masked: the
  // subject id identifies the family space exactly, so a second full copy of an
  // address already in this table would not be minimisation.
  const row = await db.opsAuditLog.findFirst({ where: { action: "OPS_FAMILY_CODE_ROTATED", reason } });
  expect(row!.detail).toContain("Issued a new family code");
  expect(row!.detail).toContain("pr***@storyjar.test");
  expect(row!.detail).not.toContain(FIXTURE_EMAIL);

  // The other half of amendment C1, paired on role rather than on tenant: the
  // teacher whose pupil this is DOES see the new code, in their own interface,
  // which is why the operator does not need to. Larchwood is frozen, and
  // rotation still worked, exactly as the teacher's own rotation is not
  // write-gated: taking access away must never be blocked by billing.
  await page.context().clearCookies();
  await loginTeacher(page, SCHOOL_C.teacher);
  await page.goto(`/teacher/students/${pupilId}`);
  await expect(page.locator("main")).toContainText(fresh);
});

// ---------------------------------------------------------------------------
// 5. Ruling R5: one transaction, and a real audit failure
// ---------------------------------------------------------------------------

test("an audit row that cannot be written rolls the mutation back", async ({ page }) => {
  await signInOperator(page);
  await findTheFamily(page);

  // The same operator, the same record, the same stated reason produces the
  // same derived idempotency key, and OpsAuditLog.idempotencyKey is unique. So
  // the second attempt fails on a genuine database constraint rather than on
  // anything the product can be told to do. There is no fault flag in this path
  // and there must never be one.
  const reason = `Reissuing after the office called, ${Date.now()}`;
  const panel = await runOperation(page, ROTATE, ROTATE_CONFIRM, reason);
  await expect(panel).toContainText("A new family code has been issued");
  const afterFirst = await currentCode();
  expect(await rowsFor("OPS_FAMILY_CODE_ROTATED")).toBeGreaterThan(0);
  const rowsAfterFirst = await rowsFor("OPS_FAMILY_CODE_ROTATED");

  // Identical again.
  await panel.getByRole("button", { name: /^close$/i }).click();
  const second = await runOperation(page, ROTATE, ROTATE_CONFIRM, reason);
  await expect(second.getByRole("alert")).toContainText(OPS_REPEAT_MESSAGE);

  // The two assertions that make this mean something. One row, not two: the
  // audit write really did fail. And the code is UNCHANGED: the mutation ran
  // inside the same transaction and was rolled back with it. Without this
  // second assertion the test would prove only that the second attempt stopped
  // somewhere.
  expect(await rowsFor("OPS_FAMILY_CODE_ROTATED"), "a second audit row was written").toBe(
    rowsAfterFirst,
  );
  expect(await currentCode(), "the mutation was not rolled back with its audit row").toBe(
    afterFirst,
  );

  // Positive control: the refusal was the duplicate key and not a broken panel.
  // A different reason is a different key, and it goes through.
  await second.getByRole("textbox").fill(`Second, separate reissue the same day, ${Date.now()}`);
  await second.getByRole("button", { name: ROTATE_CONFIRM }).click();
  await expect(second).toContainText("A new family code has been issued");
  expect(await currentCode()).not.toBe(afterFirst);
  expect(await rowsFor("OPS_FAMILY_CODE_ROTATED")).toBe(rowsAfterFirst + 1);
});

test("a disclosure that cannot be recorded does not happen either", async ({ page }) => {
  await signInOperator(page);
  await findTheFamily(page);

  const reason = `Checking the stored address against what they read out, ${Date.now()}`;
  const panel = await runOperation(page, REVEAL, REVEAL_CONFIRM, reason);
  await expect(panel).toContainText(FIXTURE_EMAIL);
  const rowsAfterFirst = await rowsFor("OPS_PARENT_EMAIL_REVEALED");

  await panel.getByRole("button", { name: /^close$/i }).click();
  const second = await runOperation(page, REVEAL, REVEAL_CONFIRM, reason);
  await expect(second.getByRole("alert")).toContainText(OPS_REPEAT_MESSAGE);
  // The address is not shown by the refused attempt. A disclosure that could
  // happen without its record would let "I only looked" be a defence.
  await expect(second).not.toContainText(FIXTURE_EMAIL);
  expect(await rowsFor("OPS_PARENT_EMAIL_REVEALED")).toBe(rowsAfterFirst);
});

// ---------------------------------------------------------------------------
// 6. What the operations are NOT (handbook section 6 items 9 and 10)
// ---------------------------------------------------------------------------

test("the operations carry no address box, no export, no media and no way in", async ({ page }) => {
  await signInOperator(page);
  await findTheFamily(page);
  await page.getByRole("button", { name: REVEAL }).click();
  await page.getByRole("button", { name: ROTATE }).click();

  // Positive control: both panels are open, so the negatives below are being
  // asserted against something.
  await expect(page.getByRole("region", { name: REVEAL })).toBeVisible();
  await expect(page.getByRole("region", { name: ROTATE })).toBeVisible();

  // Amendment C4: reachable only from an existing adult record, never from a
  // free-text address box. The only email input on this page is the lookup's
  // own, above; neither panel adds a second way to name a record.
  expect(await page.locator("main input[type='email']").count()).toBe(1);
  for (const name of [REVEAL, ROTATE]) {
    const region = page.getByRole("region", { name });
    // A hidden subject id and a reason box, and nothing else to type into.
    expect(await region.locator("input:not([type='hidden'])").count()).toBe(0);
    expect(await region.locator("textarea").count()).toBe(1);
  }

  const html = await page.content();
  for (const forbidden of ["<img", "<video", "<audio", "<iframe", "download="]) {
    expect(html, `an operator screen carries ${forbidden}`).not.toContain(forbidden);
  }
  const body = ((await page.textContent("body")) ?? "").toLowerCase();
  for (const word of ["sign in as", "view as", "impersonat", "export", "download", "csv"]) {
    expect(body, `an operator screen offers "${word}"`).not.toContain(word);
  }
  // And the one capability the owner refused by name is refused on screen too,
  // rather than merely absent (owner decision D9).
  expect(body).toContain("cannot change an adult");
});
