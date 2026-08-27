import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPasswordToken, passwordTokenExpiry, type PasswordTokenPurpose } from "@/lib/passwordTokenPolicy";

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
  purpose: PasswordTokenPurpose,
): Promise<string> {
  const raw = randomBytes(24).toString("hex");

  // Any token this teacher already holds is spent, so the newest link is the
  // only one that works. Without this, "send me another" leaves both live and a
  // resent invitation doubles the number of inboxes holding a working key
  // rather than replacing it.
  await db.$transaction([
    db.teacherPasswordToken.updateMany({
      where: { teacherId, usedAt: null },
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
