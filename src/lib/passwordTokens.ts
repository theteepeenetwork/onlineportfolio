import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  PASSWORD_SETTING_PURPOSES,
  hashPasswordToken,
  passwordTokenExpiry,
  type PasswordTokenPurpose,
} from "@/lib/passwordTokenPolicy";

/** The two purposes `mintPasswordToken` mints and spends. */
type PasswordSettingPurpose = Extract<PasswordTokenPurpose, "RESET" | "INVITE">;

/**
 * Mint a single-use token that lets one adult set a password, and return the
 * path it lives at.
 *
 * WHY THIS IS NOT IN src/app/actions/password.ts, WHERE IT STARTED.
 *
 * That file carries `"use server"`, and in Next every export from such a file
 * becomes a callable server action with its own action id. This function takes
 * a teacherId and RETURNS A PATH CONTAINING THE RAW TOKEN, so as an exported
 * action it is a network-reachable primitive for minting a working
 * set-password link for any teacher whose id you can supply — no session, no
 * authentication, no rate limit, because it is the helper the guarded callers
 * use rather than a guarded caller itself.
 *
 * Whether an action id is practically obtainable is not the question worth
 * arguing. The two guards that matter here — you must be able to receive that
 * teacher's email, or you must already be an admin of their school — live in
 * `requestPasswordReset` and in `sendStaffInvite`, and an export that steps
 * around both of them should not exist at all. `server-only` and a plain module
 * cost nothing and remove the question.
 *
 * Found by asking a reviewer whether it was a hole and then not waiting for the
 * answer, which was the right order: the fix is cheaper than the argument.
 */
export async function mintPasswordToken(
  teacherId: string,
  purpose: PasswordSettingPurpose,
): Promise<string> {
  const raw = randomBytes(24).toString("hex");

  // Any PASSWORD-SETTING token this teacher already holds is spent, so the
  // newest link is the only one that works. Without this, "send me another"
  // leaves both live and a resent invitation doubles the number of inboxes
  // holding a working key rather than replacing it.
  //
  // THE `purpose` FILTER IS NEW AND IT CHANGES NOTHING ABOUT RESET OR INVITE.
  // Those two were the only purposes that existed when this was written, so
  // "every unspent token" and "every unspent password-setting token" named the
  // same rows; the filter states the rule that was always meant. It matters now
  // because CONFIRM exists, and a confirmation link is not a spare key to this
  // account — it sets no password. Left unscoped, a teacher who asked for a
  // reset while a confirmation was in flight would silently lose the
  // confirmation and be refused at checkout holding a dead link, and a
  // confirmation would silently kill a reset the teacher was waiting for. Both
  // directions are wrong, and neither is visible from any screen.
  //
  // The other half of the same rule is in `mintEmailConfirmToken` below, which
  // spends only CONFIRM. Two pools, and neither reaches into the other.
  await db.$transaction([
    db.teacherPasswordToken.updateMany({
      where: { teacherId, usedAt: null, purpose: { in: [...PASSWORD_SETTING_PURPOSES] } },
      data: { usedAt: new Date() },
    }),
    db.teacherPasswordToken.create({
      data: {
        resetHash: hashPasswordToken(raw),
        teacherId,
        purpose,
        expiresAt: passwordTokenExpiry(purpose),
      },
    }),
  ]);

  return `/set-password?token=${raw}`;
}

/**
 * Mint a single-use token that PROVES A MAILBOX ANSWERS, and return the path it
 * lives at.
 *
 * WHY THIS IS A SECOND FUNCTION RATHER THAN A THIRD ARGUMENT TO THE FIRST.
 *
 * `mintPasswordToken` spends every unspent token in its pool when it mints
 * another, which is exactly right for what it does: only one link that can set
 * a password may be live at a time. Reusing it for confirmation would have
 * dragged CONFIRM into that pool, and both directions of that are bugs — a
 * reset would kill an outstanding confirmation and block a teacher at checkout,
 * a confirmation would kill a reset the teacher is sitting waiting for. Neither
 * failure appears on any screen; both look like "the link didn't work".
 *
 * The alternative was to scope the spend by purpose inside the one function,
 * which would have changed what a RESET does to an outstanding INVITE — today
 * it spends it, and it should, because both end in a password write and two
 * live password links is one more than anybody needs. That behaviour is not
 * this feature's to change, so it is untouched and this is a separate pool.
 *
 * IT RETURNS A DIFFERENT PATH, and that is the second reason the two cannot be
 * one function. `/set-password` writes a password; `/confirm-email` stamps
 * `Teacher.emailConfirmedAt` and writes nothing else. Each consumer checks the
 * purpose it expects, so neither link works at the other's door.
 *
 * `server-only`, for the reason given at length above: this returns a working
 * link for any teacher id handed to it, so it must not be reachable as an
 * action.
 */
export async function mintEmailConfirmToken(teacherId: string): Promise<string> {
  const raw = randomBytes(24).toString("hex");

  await db.$transaction([
    // Only CONFIRM. The newest confirmation link is the only one that works —
    // "send me another" must replace rather than add — and a password reset or
    // a staff invitation this teacher is holding is none of this function's
    // business.
    db.teacherPasswordToken.updateMany({
      where: { teacherId, usedAt: null, purpose: "CONFIRM" },
      data: { usedAt: new Date() },
    }),
    db.teacherPasswordToken.create({
      data: {
        resetHash: hashPasswordToken(raw),
        teacherId,
        purpose: "CONFIRM",
        expiresAt: passwordTokenExpiry("CONFIRM"),
      },
    }),
  ]);

  return `/confirm-email?token=${raw}`;
}
