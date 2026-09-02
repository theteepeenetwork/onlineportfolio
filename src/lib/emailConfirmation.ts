import "server-only";
import { db } from "@/lib/db";
import { originUrl } from "@/lib/appOrigin";
import { sendMail } from "@/lib/mailer";
import { emailConfirmationEmail } from "@/lib/emailTemplates";
import { mintEmailConfirmToken } from "@/lib/passwordTokens";
import {
  allowOutboundMail,
  clientIp,
  isRateLimited,
  recordFailure,
  recordOutboundMail,
} from "@/lib/rateLimit";
import {
  EMAIL_CONFIRMATION_THROTTLED_MESSAGE,
  EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE,
  emailConfirmationSentMessage,
} from "@/lib/passwordTokenPolicy";

// ---------------------------------------------------------------------------
// BUYING REQUIRES A PROVED EMAIL ADDRESS
//
// Owner decision, docs/dpo-decisions.md 2 September 2026. Reaching checkout or
// raising a purchase order requires a confirmed address; FREE TEACHER SIGNUP IS
// UNCHANGED and requires nothing.
//
// THE ASYMMETRY IS THE DECISION, NOT AN OVERSIGHT, and it is worth restating
// here because this is the file somebody will read while thinking "why not just
// verify at signup". Verifying every signup would put a mail-delivery
// dependency in front of every new teacher in the busiest week of the school
// year, and the people it fails are the ones who never say so — a teacher whose
// school filter eats the link simply does not come back, and nothing in any log
// tells you it happened. A teacher blocked at CHECKOUT is by definition trying
// to give StoryJar money, and will say so within the hour.
//
// WHAT IT ACTUALLY BUYS. A purchase order costs the person raising it nothing
// up front, so the invoice route was a free way to claim any school in the DfE
// register. This puts a real mailbox behind that act, at the one point where it
// already costs something. It is the second half of the same change as
// `src/lib/urnRelease.ts`, which takes the claim back when the invoice is never
// paid.
//
// F67 (signup verifies no address) STAYS OPEN, and the four unverified-school
// gates stay whether or not it is ever closed. They were designed on the
// assumption it is unfixed and that assumption should not quietly expire
// because of this file.
//
// WHY THE REFUSAL SENDS THE EMAIL ITSELF
//
// A teacher who is told "confirm your address first" and given nowhere to go
// has been refused twice. The alternative shapes were a new screen or a resend
// button on the account page, and both put this feature into files owned
// elsewhere for no gain: the button a teacher already has their finger on IS
// the resend. Press Buy, get a link; press Buy again, get a fresh one (the
// mint spends the last). The throttle below is what stops that being a way to
// post mail at somebody.
// ---------------------------------------------------------------------------

/**
 * Refusal or nothing. A `null` means the address is proved and the caller
 * carries on; a string is a sentence to hand straight back to the buyer.
 *
 * Deliberately not a `{ ok }` object: every caller does the same thing with it,
 * and a shape with a truthy "everything is fine" member is one `if` away from
 * being read the wrong way round.
 */
export type PurchaseRefusal = string | null;

/**
 * How many confirmation emails one teacher may set off before being asked to
 * wait. Keyed on the TEACHER, not the source address, because this action is
 * authenticated — there is no enumeration to defend against here, and a school
 * behind one NAT must not have its first buyer lock out its second.
 *
 * Uses the shared failure counter, which is per-key and window-based; five is
 * its standard budget and is far more than a person pressing a button they are
 * waiting on.
 */
const CONFIRM_MAIL_KEY = (teacherId: string) => `emailconfirm:${teacherId}`;

/**
 * The gate the two claim purchase routes open with.
 *
 * DENY BY DEFAULT (SAFEGUARDING rule 8). If the teacher row cannot be read, or
 * is not there, this refuses — it does not fall through to "probably fine". The
 * thing being gated creates a `School` and makes the caller its admin, so an
 * unreadable row is not a case to be generous about.
 *
 * IT MUST BE CALLED BEFORE ANYTHING ELSE IN THE ACTION, and both call sites do.
 * Not because of what it reads, but because of what must NOT have happened when
 * it refuses: no Stripe customer, no Stripe subscription, no `School`, no
 * `Subscription`, no claim. The security spec asserts exactly that, by counting
 * rows and by the fact that a refusal arrives at all in an environment with no
 * usable Stripe key — a refusal that landed after the first Stripe call would
 * show up as a network error instead of a sentence.
 */
export async function requireProvedEmailForPurchase(actor: {
  teacherId: string;
  email: string;
}): Promise<PurchaseRefusal> {
  let teacher: { emailConfirmedAt: Date | null; email: string } | null;
  try {
    teacher = await db.teacher.findUnique({
      where: { id: actor.teacherId },
      select: { emailConfirmedAt: true, email: true },
    });
  } catch {
    return EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE;
  }
  if (!teacher) return EMAIL_CONFIRMATION_UNAVAILABLE_MESSAGE;
  if (teacher.emailConfirmedAt !== null) return null;

  // The address is read from the row rather than taken from the session actor,
  // so a stale session cannot aim this email anywhere. They are the same value
  // in every normal case; when they are not, the database is right.
  const sent = await sendEmailConfirmation(actor.teacherId, teacher.email);
  return sent ? emailConfirmationSentMessage(teacher.email) : EMAIL_CONFIRMATION_THROTTLED_MESSAGE;
}

/**
 * Mint a confirmation link and email it. Returns whether an attempt was made.
 *
 * THE THROTTLE COMES FIRST AND MINTS NOTHING WHEN IT BITES. Minting spends the
 * previous token, so a rate-limited call that minted anyway would invalidate
 * the link the teacher is being told to go and open. That would turn a throttle
 * into a denial of the whole purchase route by repeated pressing, which is the
 * opposite of what it is for.
 *
 * The outbound ceiling on top of the per-teacher budget is the sender's
 * reputation rather than this teacher's inbox: every parent magic link in the
 * product rides on it. It is checked after the per-teacher budget so the two
 * counters cannot disagree about who was turned away.
 */
async function sendEmailConfirmation(teacherId: string, email: string): Promise<boolean> {
  const key = CONFIRM_MAIL_KEY(teacherId);
  if (isRateLimited(key)) return false;
  // AND the coarse ceiling on the SOURCE, which is the same counter
  // `requestPasswordReset` uses and is deliberately shared with it: what it
  // protects is StoryJar's sender reputation, which every parent magic link in
  // the product rides on, and that is a property of the deployment rather than
  // of either feature. Checked AFTER the per-teacher budget so the two counters
  // cannot disagree about who was turned away.
  if (!allowOutboundMail(`pwmail:${await clientIp()}`)) return false;
  recordFailure(key);

  const path = await mintEmailConfirmToken(teacherId);
  const mail = emailConfirmationEmail(`${await originUrl()}${path}`);
  // The result is deliberately not surfaced. What a teacher is told is the same
  // whether Mailjet accepted the message or not, because there is nothing they
  // could do differently either way and the mail health of the deployment is an
  // operator question — it is counted, under the "email-confirm" template key,
  // where an operator can see it (src/lib/mailStatus.ts).
  await sendMail({
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    templateKey: "email-confirm",
  });
  recordOutboundMail(`pwmail:${await clientIp()}`);
  return true;
}
