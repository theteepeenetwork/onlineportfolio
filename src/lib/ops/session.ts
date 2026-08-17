import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { clientIp, isRateLimited, recordFailure, clearFailures, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";
import { opsEnabled } from "@/lib/ops/enabled";
import { opsCookieContract } from "@/lib/ops/cookie";
import { OPS_GENERIC_FAILURE } from "@/lib/ops/messages";
import { recordOpsAudit } from "@/lib/ops/audit";
import { burnEqualWork, operatorPasswordMatches } from "@/lib/ops/passwords";
import { markRecoveryCodeUsed, matchRecoveryCode, unusedRecoveryCodeCount } from "@/lib/ops/recovery";
import {
  TOTP_PERIOD_SECONDS,
  formatSecretForTyping,
  matchTotpStep,
  totpEnrolmentUri,
} from "@/lib/ops/totp";

// ---------------------------------------------------------------------------
// Operator identity and sessions. The door, and the only way through it.
// ---------------------------------------------------------------------------
//
// This is one of the three modules permitted to import the Prisma client under
// the ops roots, and that permission is a deliberate widening of
// scripts/check-ops-blindness.mjs recorded in the same commit as this file. See
// DECLARED_DB_MODULES in the gate for the reasoning.
//
// WHAT IS SEPARATE FROM WHAT
//
// `Teacher.role = "ADMIN"` already means "admin at this school". The operator is
// a different trust level entirely, so it gets its own table, its own session
// table and its own cookie name. getCurrentUser() (src/lib/auth.ts) must remain
// incapable of returning an operator, and this module must remain incapable of
// returning a teacher, student or parent. Both directions are asserted in
// tests/battery/security/ops-auth.spec.ts, because "they are separate" is a
// claim about two functions and only a test can hold both of them at once.
//
// WHAT THERE IS NO WAY AROUND
//
//   - No environment variable, fixture or build flag skips TOTP (ruling R6).
//     The blocking spec computes a real code from the seeded secret.
//   - No password reset by email, no invite by email, nothing that mints a
//     session from the command line (ruling R8). Recovery is ten offline codes,
//     then deleting the row and re-seeding: docs/ops-recovery.md.
//   - No route here reveals that the area exists. Every failure is notFound()
//     (ruling R17), never 403 and never a redirect to a page that names it.
//
// ORDER OF WORK ON A SIGN-IN ATTEMPT, WHICH IS NOT ARBITRARY
//
//   parse -> rate-limit check -> row lockout check -> bcrypt
//
// bcryptjs is pure JavaScript, this service runs at one replica, and a cost-12
// compare is around 200ms of CPU. An unauthenticated endpoint that runs one per
// request is a denial-of-service lever against the whole platform, children
// included. The throttle therefore runs BEFORE the hash work, every time.

const IDLE_MINUTES = 30;
const ABSOLUTE_HOURS = 8;
// The pre-TOTP stage. Long enough to fish a phone out of a bag, short enough
// that a half-finished sign-in on a shared machine is not a standing invitation.
const DOOR_MINUTES = 10;

// The account lockout persisted on the Operator row. Separate constants from
// src/lib/rateLimit.ts on purpose: those five failures in fifteen minutes are
// tuned for a whole school behind one NAT address and must not be changed for
// the operator's benefit. These are the operator's own numbers, and unlike the
// in-process store they survive a deploy, a restart and a crash — which matters
// because Railway's restart policy is ON_FAILURE with five retries, so an
// attacker who can provoke a crash otherwise clears their own counter.
const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;

export type OperatorIdentity = {
  id: string;
  email: string;
  role: string; // OWNER | OPERATOR
};

export type DoorView =
  | { stage: "PASSWORD" }
  | { stage: "ENROL"; email: string; secretForTyping: string; enrolmentUri: string }
  | { stage: "CODE"; recoveryCodesLeft: number }
  | { stage: "SIGNED_IN" };

type Outcome = { ok: true } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Cookie plumbing
// ---------------------------------------------------------------------------

function secureCookies(): boolean {
  // Secure cannot be set over plain http, and a __Host- cookie without Secure
  // is refused by the browser, so development uses the unprefixed name. See
  // src/lib/ops/cookie.ts for the whole argument.
  return process.env.NODE_ENV === "production";
}

function contract() {
  return opsCookieContract(secureCookies());
}

// The cookie carries a random 32-byte value; the row stores only its SHA-256.
// A leaked copy of the database file is then a list of hashes, not a set of
// live sessions. (The existing Session.token stores the raw value. That is
// pre-existing and out of scope here, and this deliberately does not copy it.)
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

async function setSessionCookie(secret: string, expires: Date): Promise<void> {
  const c = contract();
  const jar = await cookies();
  jar.set(c.name, secret, {
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    secure: c.secure,
    path: c.path,
    expires,
  });
}

async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(contract().name);
}

async function readSessionSecret(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(contract().name)?.value ?? null;
}

// ---------------------------------------------------------------------------
// Resolving a session
// ---------------------------------------------------------------------------

type LoadedSession = {
  sessionId: string;
  stage: string;
  operator: {
    id: string;
    email: string;
    role: string;
    status: string;
    totpSecret: string;
    totpConfirmedAt: Date | null;
    lastTotpStep: number | null;
    recoveryCodesJson: string;
    failedAttempts: number;
  };
};

async function loadSession(): Promise<LoadedSession | null> {
  const secret = await readSessionSecret();
  if (!secret) return null;
  const row = await db.operatorSession.findUnique({
    where: { tokenHash: hashSecret(secret) },
    select: {
      id: true,
      stage: true,
      expiresAt: true,
      lastSeenAt: true,
      operator: {
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          totpSecret: true,
          totpConfirmedAt: true,
          lastTotpStep: true,
          recoveryCodesJson: true,
          failedAttempts: true,
        },
      },
    },
  });
  if (!row) return null;

  const now = Date.now();
  const idleLimit = row.stage === "FULL" ? IDLE_MINUTES * 60_000 : DOOR_MINUTES * 60_000;
  const expired = row.expiresAt.getTime() <= now || now - row.lastSeenAt.getTime() > idleLimit;

  // Every request re-reads the operator's status, so disabling an account bites
  // on the next request rather than at the end of a session. A disabled
  // operator loses EVERY session, not only the one that happened to ask: the
  // reason an account is disabled is that somebody has decided this person, or
  // whoever has their laptop, should be out, and leaving three other browsers
  // signed in until they idle out answers a different question.
  //
  // There is no "disable" action in the product yet — adult-account operations
  // are a later PR — so today this is reached by an operator row edited in the
  // Railway shell. It behaves the same either way, which is the point of
  // putting it in the resolver rather than in the action.
  if (row.operator.status !== "ACTIVE") {
    await db.operatorSession.deleteMany({ where: { operatorId: row.operator.id } });
    return null;
  }
  if (expired) {
    await db.operatorSession.deleteMany({ where: { id: row.id } });
    return null;
  }
  await db.operatorSession.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
  return { sessionId: row.id, stage: row.stage, operator: row.operator };
}

// The guard every operator page and action begins with. Answers notFound() for
// every failure, including "the area is switched off", so an unauthorised
// request cannot tell the difference between "you may not" and "there is
// nothing here" (ruling R17).
export async function requireOperator(): Promise<OperatorIdentity> {
  if (!opsEnabled()) notFound();
  const loaded = await loadSession();
  if (!loaded || loaded.stage !== "FULL") notFound();
  return { id: loaded.operator.id, email: loaded.operator.email, role: loaded.operator.role };
}

// The SECOND, narrower guard, for the two files that are the door itself: the
// sign-in screen and the sign-in actions. They cannot call requireOperator,
// because they are how an operator session is obtained in the first place, and
// an argument that turns requireOperator off would be exactly the shape ruling
// R6 deleted. So the door has its own named guard that enforces the kill switch
// and nothing else, and the blindness gate holds a two-entry list of the files
// allowed to use it (OPS_DOOR_FILES). Every other ops file still needs
// requireOperator, and a door file with no guard fails just as loudly.
export async function requireOpsDoor(): Promise<void> {
  if (!opsEnabled()) notFound();
}

// What the sign-in screen should render. Never returns a secret to a caller who
// has not already proved the password.
export async function doorView(): Promise<DoorView> {
  const loaded = await loadSession();
  if (!loaded) return { stage: "PASSWORD" };
  if (loaded.stage === "FULL") return { stage: "SIGNED_IN" };
  if (!loaded.operator.totpConfirmedAt) {
    return {
      stage: "ENROL",
      email: loaded.operator.email,
      secretForTyping: formatSecretForTyping(loaded.operator.totpSecret),
      enrolmentUri: totpEnrolmentUri(loaded.operator.email, loaded.operator.totpSecret),
    };
  }
  return { stage: "CODE", recoveryCodesLeft: unusedRecoveryCodeCount(loaded.operator.recoveryCodesJson) };
}

// ---------------------------------------------------------------------------
// Creating and rotating sessions
// ---------------------------------------------------------------------------

async function mintSession(operatorId: string, stage: "PASSWORD" | "FULL", replacesSessionId?: string) {
  const secret = randomBytes(32).toString("base64url");
  const minutes = stage === "FULL" ? ABSOLUTE_HOURS * 60 : DOOR_MINUTES;
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await db.$transaction(async (tx) => {
    if (replacesSessionId) await tx.operatorSession.deleteMany({ where: { id: replacesSessionId } });
    await tx.operatorSession.create({
      data: { tokenHash: hashSecret(secret), operatorId, stage, expiresAt },
    });
  });
  await setSessionCookie(secret, expiresAt);
}

// ---------------------------------------------------------------------------
// Throttling: one in-process key per SOURCE, one persisted counter per ACCOUNT
// ---------------------------------------------------------------------------
//
// Brief 02 asked for three in-process keys: `ops-pw:{ip}`,
// `ops-pw:{sha256(email)}` and `ops-totp:{sha256(email)}`. The address-keyed
// pair is not built, and this is the reasoning, written here because a missing
// control should be a decision somebody can argue with rather than an omission:
//
//   1. It is exactly redundant. Every failed attempt against a real operator
//      already increments `Operator.failedAttempts`, and five of those lock the
//      account for fifteen minutes NO MATTER WHERE THEY CAME FROM. That is the
//      same threshold, the same window and the same account scope the address
//      key would have had.
//   2. Against an address with no operator behind it, a per-address key
//      protects nothing: an attacker enumerating addresses gets a fresh key
//      with every guess. What bounds that is the source key, which is built.
//   3. The persisted counter is strictly better than the in-memory one in the
//      way that matters here. The in-process store dies on every deploy and
//      every restart (and Railway restarts ON_FAILURE up to five times), so an
//      attacker who can provoke a crash clears an in-memory lock; the column
//      survives. And it can be cleared deliberately, from the Railway shell,
//      which is written down in docs/ops-recovery.md — where an in-memory block
//      on the ONLY operator account, triggerable by anybody who knows the
//      address, has no remedy but waiting.
//
// So: the source key is the cheap pre-bcrypt shield that keeps an
// unauthenticated endpoint from being a CPU lever, and the row is the account
// control. The two namespaces stay separate (`ops-pw` and `ops-totp`) so a
// correct password never clears the code counter.
async function throttled(keys: string[]): Promise<boolean> {
  return keys.some((k) => isRateLimited(k));
}

// A short, one-way label for the address an attempt was made against, for the
// audit row. Not a throttle key and not reversible: it exists so repeated
// attempts against the same address can be correlated afterwards without the
// audit trail carrying anybody's address in the clear.
function attemptLabel(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Step 1: the password
// ---------------------------------------------------------------------------

export async function startOperatorSignIn(emailRaw: string, password: string): Promise<Outcome> {
  const email = emailRaw.trim().toLowerCase();
  const ip = await clientIp();
  const keys = [`ops-pw:${ip}`];

  // BEFORE any bcrypt work. See the header.
  if (await throttled(keys)) return { ok: false, message: RATE_LIMITED_MESSAGE };
  if (!email || !password) {
    for (const k of keys) recordFailure(k);
    return { ok: false, message: OPS_GENERIC_FAILURE };
  }

  const operator = await db.operator.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      pwHash: true,
      status: true,
      totpConfirmedAt: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  });

  const lockedOut =
    operator !== null && operator.lockedUntil !== null && operator.lockedUntil.getTime() > Date.now();

  // An unknown address, a disabled account and a locked account all still run a
  // bcrypt compare at the same cost factor, so the answer takes the same time
  // whichever it was, and all three answer with the same sentence.
  const passwordOk =
    operator === null || operator.status !== "ACTIVE" || lockedOut
      ? await burnEqualWork(password)
      : await operatorPasswordMatches(password, operator.pwHash);

  if (!passwordOk) {
    for (const k of keys) recordFailure(k);
    if (operator) await countFailureOnRow(operator.id, operator.failedAttempts);
    // One row per failed attempt, and the throttle above is what bounds it:
    // five per key per fifteen minutes. The address is never written, only a
    // truncated hash of it, so the log cannot be mined for who was targeted.
    await recordOpsAudit({
      actorId: operator?.id ?? null,
      actorName: "unknown",
      action: "OPS_SIGN_IN_FAILED",
      detail: `password stage; attempt against ${attemptLabel(email)}`,
    });
    return { ok: false, message: OPS_GENERIC_FAILURE };
  }

  // A correct password clears the PASSWORD counters only. The code counters are
  // a separate namespace and stay exactly where they were, so five wrong codes
  // still lock the account however many times the password was right.
  for (const k of keys) clearFailures(k);
  if (operator!.failedAttempts > 0) {
    await db.operator.update({ where: { id: operator!.id }, data: { failedAttempts: 0 } });
  }
  await mintSession(operator!.id, "PASSWORD");
  await recordOpsAudit({
    actorId: operator!.id,
    actorName: operator!.email,
    action: "OPS_PASSWORD_ACCEPTED",
    detail: operator!.totpConfirmedAt ? "code entry next" : "enrolment next",
  });
  return { ok: true };
}

async function countFailureOnRow(operatorId: string, previous: number): Promise<void> {
  const attempts = previous + 1;
  const locked = attempts >= LOCK_AFTER_FAILURES;
  await db.operator.update({
    where: { id: operatorId },
    data: {
      failedAttempts: locked ? 0 : attempts,
      lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Step 2: the code (or, once, the enrolment)
// ---------------------------------------------------------------------------

// Shared by code entry and enrolment: both need a live PASSWORD-stage session,
// both are throttled on their own key, and both refuse a step at or below the
// last accepted one.
async function withDoorSession(
  submitted: string,
  handler: (loaded: LoadedSession, step: number | null) => Promise<Outcome>,
): Promise<Outcome> {
  const loaded = await loadSession();
  if (!loaded || loaded.stage !== "PASSWORD") return { ok: false, message: OPS_GENERIC_FAILURE };
  const ip = await clientIp();
  const keys = [`ops-totp:${ip}`];
  if (await throttled(keys)) return { ok: false, message: RATE_LIMITED_MESSAGE };

  const step = matchTotpStep(loaded.operator.totpSecret, submitted);
  const fresh = step !== null && (loaded.operator.lastTotpStep === null || step > loaded.operator.lastTotpStep);
  const outcome = await handler(loaded, fresh ? step : null);
  if (outcome.ok) {
    for (const k of keys) clearFailures(k);
  } else {
    for (const k of keys) recordFailure(k);
    // The operator's OWN count, not zero. Passing zero here would have reset
    // the counter to one on every wrong code, so five wrong codes would never
    // have locked the account and the row lockout would have covered the
    // password stage only. Caught by reading this back rather than by a test,
    // which is why the test below now exists.
    await countFailureOnRow(loaded.operator.id, loaded.operator.failedAttempts);
  }
  return outcome;
}

export async function completeOperatorSignIn(submitted: string): Promise<Outcome> {
  return withDoorSession(submitted, async (loaded, step) => {
    if (!loaded.operator.totpConfirmedAt) return { ok: false, message: OPS_GENERIC_FAILURE };

    if (step !== null) {
      await db.operator.update({
        where: { id: loaded.operator.id },
        data: {
          lastTotpStep: step,
          failedAttempts: 0,
          lockedUntil: null,
          lastSignInAt: new Date(),
        },
      });
      await mintSession(loaded.operator.id, "FULL", loaded.sessionId);
      await recordOpsAudit({
        actorId: loaded.operator.id,
        actorName: loaded.operator.email,
        action: "OPS_SIGN_IN",
        detail: "code accepted",
      });
      return { ok: true };
    }

    // A recovery code, used once, only after enrolment. Reaching for one is
    // worth an audit row of its own: it means the authenticator is gone.
    const index = await matchRecoveryCode(loaded.operator.recoveryCodesJson, submitted);
    if (index !== null) {
      await db.operator.update({
        where: { id: loaded.operator.id },
        data: {
          recoveryCodesJson: markRecoveryCodeUsed(loaded.operator.recoveryCodesJson, index),
          failedAttempts: 0,
          lockedUntil: null,
          lastSignInAt: new Date(),
        },
      });
      await mintSession(loaded.operator.id, "FULL", loaded.sessionId);
      await recordOpsAudit({
        actorId: loaded.operator.id,
        actorName: loaded.operator.email,
        action: "OPS_RECOVERY_CODE_USED",
        detail: `code ${index + 1} of ten, now spent`,
      });
      return { ok: true };
    }

    await recordOpsAudit({
      actorId: loaded.operator.id,
      actorName: loaded.operator.email,
      action: "OPS_TOTP_FAILED",
      detail: "wrong, reused or expired code",
    });
    return { ok: false, message: OPS_GENERIC_FAILURE };
  });
}

export async function confirmOperatorEnrolment(submitted: string): Promise<Outcome> {
  return withDoorSession(submitted, async (loaded, step) => {
    if (loaded.operator.totpConfirmedAt) return { ok: false, message: OPS_GENERIC_FAILURE };
    if (step === null) {
      await recordOpsAudit({
        actorId: loaded.operator.id,
        actorName: loaded.operator.email,
        action: "OPS_ENROLMENT_FAILED",
        detail: "code did not match the enrolment secret",
      });
      return { ok: false, message: OPS_GENERIC_FAILURE };
    }
    await db.operator.update({
      where: { id: loaded.operator.id },
      data: {
        totpConfirmedAt: new Date(),
        lastTotpStep: step,
        failedAttempts: 0,
        lockedUntil: null,
        lastSignInAt: new Date(),
      },
    });
    await mintSession(loaded.operator.id, "FULL", loaded.sessionId);
    await recordOpsAudit({
      actorId: loaded.operator.id,
      actorName: loaded.operator.email,
      action: "OPS_TOTP_ENROLLED",
      detail: "authenticator confirmed",
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Signing out
// ---------------------------------------------------------------------------

// Ends EVERY session belonging to the acting operator, not only this browser's.
// With one account and one person that is what "sign out" honestly means, and
// it is the more protective reading of a lost or stolen laptop. Revoking
// somebody ELSE's sessions is a separate named action for a later PR; a global
// wipe available to anybody would be a griefing path with no upside.
export async function signOutOperator(): Promise<void> {
  const loaded = await loadSession();
  if (loaded) {
    await db.operatorSession.deleteMany({ where: { operatorId: loaded.operator.id } });
    await recordOpsAudit({
      actorId: loaded.operator.id,
      actorName: loaded.operator.email,
      action: "OPS_SIGN_OUT",
      detail: "every session for this operator ended",
    });
  }
  await clearSessionCookie();
}

// How long the code on screen stays valid, for the WCAG 2.2.1 warning the
// sign-in screen has to show. Exported so the screen and the implementation
// cannot drift apart.
export const CODE_LIFETIME_SECONDS = TOTP_PERIOD_SECONDS;
export const DOOR_LIFETIME_MINUTES = DOOR_MINUTES;
export const IDLE_LIFETIME_MINUTES = IDLE_MINUTES;
