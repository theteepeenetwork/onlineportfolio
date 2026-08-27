"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { originUrl } from "@/lib/appOrigin";
import { createSession } from "@/lib/auth";
import {
  isRateLimited,
  recordFailure,
  clientIp,
  allowOutboundMail,
  recordOutboundMail,
  RATE_LIMITED_MESSAGE,
} from "@/lib/rateLimit";
import { sendMail } from "@/lib/mailer";
import { signInLinkMayBeShown } from "@/lib/signInLinkPolicy";
import { passwordResetEmail } from "@/lib/emailTemplates";
import { recordAudit } from "@/lib/audit";
import { mintPasswordToken } from "@/lib/passwordTokens";
import {
  TOKEN_REFUSED_MESSAGE,
  hashPasswordToken,
  passwordProblem,
  passwordTokenIsUsable,
} from "@/lib/passwordTokenPolicy";

// Teacher password reset, and the set-password page both it and the staff
// invite land on.
//
// SHAPED ON requestMagicLink (src/app/actions/family.ts), which is the
// reference implementation for this whole thing and has already survived two
// security findings. What is taken from it: the token minting, the per-IP
// throttle, the neutral response, and `signInLinkMayBeShown()` deciding whether
// the URL may reach the browser. What is deliberately different is in
// src/lib/passwordTokenPolicy.ts — the token is stored hashed, and an invite
// lives longer than a reset.

export type ResetRequestState = { sent?: boolean; error?: string; openUrl?: string };
export type SetPasswordState = { error?: string };

/**
 * A teacher asks for a reset link.
 *
 * NEUTRAL, and that is the whole design of the response. This form is public
 * and school staff directories are published on school websites, so a form that
 * said "no account with that email" would confirm, address by address, which of
 * a named school's staff use StoryJar. Identical output for a known address, an
 * unknown one, and a send that failed — the same rule as FINDINGS F6, which is
 * why the mail result is awaited and then ignored.
 */
export async function requestPasswordReset(
  _prev: ResetRequestState | undefined,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email doesn’t look quite right." };
  }

  // Throttled per ADDRESS AND SOURCE, not per source alone — and this is a
  // deliberate departure from `requestMagicLink`, which keys on the IP by itself.
  //
  // The difference is who is behind the IP. Parents are on home broadband, one
  // household per address. A school is behind one NAT: every teacher in the
  // building presents the same `x-forwarded-for` leftmost value. With an
  // IP-only key and MAX_FAILS of 5, the fifth teacher to ask for a reset on the
  // first morning of term locks out everybody else in the school for fifteen
  // minutes — and the first morning of term, with 10 to 15 pilot teachers
  // signing in for the first time, is the exact scenario this feature was built
  // for.
  //
  // Keying on address+source is the pattern `teacherLogin` already uses in this
  // codebase (`login:${email}:${ip}`) for the same reason. It still bounds what
  // matters here, which is using StoryJar to flood one person's inbox: that is
  // per-address by definition. It does NOT weaken enumeration defence, because
  // there is nothing to enumerate — the response is identical either way (F6),
  // so a wide sweep of addresses from one source learns exactly nothing it did
  // not already know.
  const ip = await clientIp();
  const key = `pwreset:${email}:${ip}`;
  if (isRateLimited(key)) return { error: RATE_LIMITED_MESSAGE };
  recordFailure(key);

  // AND a coarse ceiling on the SOURCE, which the per-address key above does not
  // give. Per-address bounds what one teacher's inbox can receive; it does not
  // bound what one source can send across a school's published staff list, and
  // that is inbox flooding and — the part that cannot be repaired quickly —
  // StoryJar's sender reputation, which every parent magic-link rides on.
  //
  // Set where a real school never reaches it (see the reasoning and the assumed
  // school size in src/lib/rateLimit.ts) and trickled rather than blocked, so
  // the pathological case slows down instead of the staffroom closing. Checked
  // AFTER the per-address budget so the two counters cannot disagree about who
  // was turned away.
  if (!allowOutboundMail(`pwmail:${ip}`)) return { error: RATE_LIMITED_MESSAGE };

  const teacher = await db.teacher.findUnique({
    where: { email },
    select: { id: true, status: true },
  });

  // An INVITED teacher has never set a password, so there is nothing to reset —
  // but the response must not say so, because that would disclose the account's
  // state to anybody who can type the address. They are sent the same reset
  // link, which lands on the same page and does the same thing: it sets a
  // password. The flow is correct for them by construction.
  if (teacher) {
    const path = await mintPasswordToken(teacher.id, "RESET");
    const mail = passwordResetEmail(`${await originUrl()}${path}`);
    await sendMail({
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      templateKey: "password-reset",
    });
    // Counted only when an email was actually attempted. An address not on file
    // costs nothing to send and must not consume the ceiling, or the ceiling
    // becomes a way to exhaust a school's budget with addresses that do not
    // exist.
    recordOutboundMail(`pwmail:${ip}`);

    // Development only, and decided by the pure function rather than here
    // (FINDINGS F19). A reset URL on screen is a complete account takeover for
    // anybody who can type a colleague's address.
    if (signInLinkMayBeShown()) return { sent: true, openUrl: path };
  }

  // No `recordAudit` for a request. A completed password change is a
  // safeguarding-relevant account event and is audited below; a REQUEST is
  // unauthenticated and anybody can cause one, so auditing it would hand a
  // stranger a way to flood the school's own audit log.
  return { sent: true };
}

/**
 * Spend a token and set the password.
 *
 * Everything that matters happens in ONE transaction: the token is marked used,
 * the hash is written, and every existing session for that teacher is deleted.
 * If the sessions were deleted afterwards a crash in between would leave the
 * password changed and the old session alive, which is the exact failure the
 * reset exists to prevent — a teacher resets *because* somebody else may be in
 * their account.
 */
export async function setPassword(
  _prev: SetPasswordState | undefined,
  formData: FormData,
): Promise<SetPasswordState> {
  const raw = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };

  // THROTTLED PER TOKEN, NOT PER SOURCE.
  //
  // This was `pwset:${ip}` and that was the same NAT bug the request side had,
  // still live on the side the pilot teachers actually use: ten of them setting
  // invitation passwords from behind one school firewall inside twenty minutes,
  // and five refused links from any of them — a stale email, a link opened
  // twice — hard-blocks every colleague on that address for fifteen minutes,
  // including one holding a perfectly good token.
  //
  // A token is single-use and belongs to one person, so keying on it gives a
  // budget that is naturally small AND cannot touch anybody else by
  // construction rather than by tuning. Keyed on the DIGEST, never the raw
  // token: a limiter key is the kind of string that ends up in a log.
  //
  // An empty submission is not throttled and does not need to be — there is no
  // token to look up, so it costs a render and reaches no database.
  const key = raw ? `pwset:${hashPasswordToken(raw)}` : "";
  if (key && isRateLimited(key)) return { error: RATE_LIMITED_MESSAGE };

  const row = raw
    ? await db.teacherPasswordToken.findUnique({
        where: { resetHash: hashPasswordToken(raw) },
        select: {
          id: true,
          expiresAt: true,
          usedAt: true,
          purpose: true,
          teacher: { select: { id: true, email: true, name: true, schoolId: true, status: true } },
        },
      })
    : null;

  // Never minted, expired, or already spent — all three answered with ONE
  // sentence. `passwordTokenIsUsable` knows which; the screen deliberately does
  // not say, because a page that distinguished them would tell somebody holding
  // a link they found whether it was ever real.
  if (!row || !passwordTokenIsUsable(row)) {
    if (key) recordFailure(key);
    return { error: TOKEN_REFUSED_MESSAGE };
  }
  const token = row;
  const teacher = token.teacher;

  // SPEND IT CONDITIONALLY, INSIDE THE TRANSACTION.
  //
  // The check above (`passwordTokenIsUsable`) happens outside any transaction,
  // and an unconditional `update({ where: { id } })` would let two submissions
  // that interleave between the read and the write BOTH pass: two password
  // writes, two sessions. Sequentially the second is refused, which is what the
  // spec covered and why this stayed green — but a link reaches a shared
  // mailbox, gets forwarded, or is prefetched by a security gateway, and then
  // somebody races the teacher and holds a session where they should have been
  // turned away.
  //
  // `updateMany` with `usedAt: null` in the WHERE makes the database the
  // arbiter: exactly one caller can move it from null, and the loser sees
  // count 0 and is refused like anybody holding a spent link.
  const now = new Date();
  const hash = await bcrypt.hash(password, 10);
  try {
    await db.$transaction(async (tx) => {
      const spent = await tx.teacherPasswordToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (spent.count !== 1) throw new Error("token already spent");
      await tx.teacher.update({
        where: { id: teacher.id },
        data: {
          passwordHash: hash,
          ...(teacher.status === "INVITED" ? { status: "ACTIVE" } : {}),
        },
      });
      await tx.session.deleteMany({ where: { teacherId: teacher.id } });
    });
  } catch {
    if (key) recordFailure(key);
    return { error: TOKEN_REFUSED_MESSAGE };
  }

  await recordAudit({
    action: token.purpose === "INVITE" ? "STAFF_INVITE_ACCEPTED" : "TEACHER_PASSWORD_RESET",
    actorType: "TEACHER",
    actorId: teacher.id,
    actorName: teacher.name,
    schoolId: teacher.schoolId,
    subjectType: "TEACHER",
    subjectId: teacher.id,
    detail:
      token.purpose === "INVITE"
        ? "Set their first password from a staff invitation"
        : "Set a new password from a reset link, and existing sessions were ended",
  });

  // Signed in on the new password, because the alternative is showing a teacher
  // a sign-in form seconds after they proved they hold the address and chose
  // the password. The sessions deleted above are the OLD ones; this is a new
  // one for the person standing here.
  await createSession({ role: "TEACHER", teacherId: teacher.id });
  redirect("/teacher");
}
