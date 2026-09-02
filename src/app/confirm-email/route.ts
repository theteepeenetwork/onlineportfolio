import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPasswordToken, passwordTokenIsUsable } from "@/lib/passwordTokenPolicy";

// ---------------------------------------------------------------------------
// The target of the "confirm your email address" link.
//
// Spends a CONFIRM token and stamps `Teacher.emailConfirmedAt`. It does nothing
// else: no session is created, no password is written, no school is touched.
// Whoever holds this link ends up signed in as nobody.
//
// SHAPED ON src/app/family/enter/route.ts, which is this repo's pattern for
// consuming an emailed link — a GET route handler, a single-use record, and a
// redirect either way. What is deliberately different is that the parent's
// magic link SIGNS SOMEBODY IN and this one does not, so the whole question of
// setting a cookie on a redirect does not arise.
//
// A GET THAT WRITES, AND WHY THAT IS ALL RIGHT HERE. It is what an email link
// can be, and the CSRF question people reach for does not bite: the only thing
// a forged request can achieve is to stamp a confirmation on the account the
// token already belongs to, which is the token's entire purpose and requires
// possession of a 192-bit secret sent to that mailbox. There is no state an
// attacker prefers over the state a legitimate click produces. What a
// prefetching mail gateway can do is spend the link before the teacher clicks
// it — the same exposure `/family/enter` has always had — and the answer is the
// same: press Buy again for a fresh one.
//
// WHOSE ADDRESS IT CONFIRMS is decided by the token row's `teacherId` and by
// nothing else. There is no id in the URL, no email in the URL and no session
// consulted, so one teacher's link cannot confirm another teacher's address —
// there is no parameter through which it could be asked to. The security spec
// asserts that in the direction that would matter, by handing teacher A's link
// to a browser signed in as teacher B.
//
// THE PURPOSE IS CHECKED, AND THE CHECK IS NOT SYMMETRICAL WITH `setPassword`'S.
// This door accepts CONFIRM and refuses RESET and INVITE, so a password link
// cannot be spent here — spending it would consume the teacher's only way back
// into their account and stamp a confirmation they never gave. `setPassword`
// refuses CONFIRM for a much sharper reason: a confirmation link goes to an
// address nobody has proved yet, so a token that could also set a password
// would hand the account to whoever received a mistyped address.
// ---------------------------------------------------------------------------

// Where a person ends up afterwards. Both land on the account page, which is
// where the purchase they were part-way through lives; it is behind the teacher
// sign-in, so somebody who opened the link on their phone is asked to sign in
// and then sees the result. The query parameter is the same shape
// `?checkout=success` uses on the same page.
const DONE = "/teacher/account?confirmed=1";
const REFUSED = "/teacher/account?confirmed=0";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("token") ?? "";
  const base = req.nextUrl.origin;
  if (!raw) return NextResponse.redirect(`${base}${REFUSED}`);

  const row = await db.teacherPasswordToken.findUnique({
    // The digest, never the token. One function for both directions
    // (`hashPasswordToken`), so a mint and a lookup cannot disagree.
    where: { resetHash: hashPasswordToken(raw) },
    select: { id: true, expiresAt: true, usedAt: true, purpose: true, teacherId: true },
  });

  // Never minted, expired, already spent, or the wrong kind of link — ONE
  // outcome, for the reason `TOKEN_REFUSED_MESSAGE` gives at length: a screen
  // that distinguished them would tell somebody holding a link they found
  // whether it was ever real.
  //
  // The purpose is named POSITIVELY — "is it CONFIRM" rather than "is it not a
  // password link" — so a fourth purpose added later is refused here by default
  // until somebody decides otherwise. Deny by default, rule 8, and the same
  // shape `setPassword` uses in the other direction.
  if (!row || row.purpose !== "CONFIRM") {
    return NextResponse.redirect(`${base}${REFUSED}`);
  }
  if (!passwordTokenIsUsable(row)) return NextResponse.redirect(`${base}${REFUSED}`);

  // SPEND IT CONDITIONALLY, INSIDE THE TRANSACTION, exactly as `setPassword`
  // does. The usability check above is outside any transaction, so an
  // unconditional update would let two requests that interleave between the
  // read and the write both pass. `usedAt: null` in the WHERE makes the
  // database the arbiter; the loser sees count 0 and is refused.
  //
  // The stamp and the spend commit together or not at all. A confirmation that
  // outlived its token would be a fact with nothing behind it.
  try {
    await db.$transaction(async (tx) => {
      const spent = await tx.teacherPasswordToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (spent.count !== 1) throw new Error("already spent");
      // Guarded so a second confirmation cannot move a date that is already
      // set. Nothing depends on the exact instant, but a column that records
      // when something was established should record the first time.
      await tx.teacher.updateMany({
        where: { id: row.teacherId, emailConfirmedAt: null },
        data: { emailConfirmedAt: new Date() },
      });
    });
  } catch {
    return NextResponse.redirect(`${base}${REFUSED}`);
  }

  // No audit row. A confirmation is not a safeguarding-relevant account event
  // in the way a password change is: it grants no access, moves no data and
  // ends no session. What it unlocks — the purchase — audits itself, loudly,
  // through `SCHOOL_CLAIMED` and `BILLING_INVOICE_REQUESTED`.
  return NextResponse.redirect(`${base}${DONE}`);
}
