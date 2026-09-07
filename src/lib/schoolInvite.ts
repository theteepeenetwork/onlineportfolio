import "server-only";
import { originUrl } from "@/lib/appOrigin";
import { sendMail } from "@/lib/mailer";
import { schoolInvitationEmail } from "@/lib/emailTemplates";

/**
 * Tell a teacher who already has a StoryJar account that a school has invited
 * them, so that they know to go and look.
 *
 * Its own module rather than a helper inside `admin.ts`, mirroring
 * `src/lib/staffInvite.ts`, because the same failure is available here: a
 * second caller that quietly does less than the first. There is one caller
 * today — `inviteStaff`'s schoolless-account branch — and re-typing the address
 * goes through that same branch, which is why there is deliberately no
 * "resend".
 *
 * IT MINTS NOTHING, and that is the one difference from `staffInvite.ts`. There
 * is no `mintPasswordToken` line here and there must not be one: the URL is
 * `${originUrl()}/teacher`, carries no token and grants nothing, because the
 * offer is answered in the app by the signed-in holder of the account
 * (docs/dpo-decisions.md, 2 September 2026). A token here would be a
 * forwardable credential whose payload is "attach my classes and my pupils to
 * this school", mailed to an address an admin typed and nobody checked.
 *
 * The send result is deliberately not returned, exactly as in
 * `staffInvite.ts`. An admin does not need to be told that Mailjet was slow;
 * the mailer records the outcome against the template
 * (src/lib/mailCounters.ts) and the operator mail screen is where a delivery
 * problem is answered. What the admin needs is the row appearing in the staff
 * list, which it does either way — and here it matters more than usual, because
 * an invitation that was written but whose email failed is still answerable:
 * the teacher finds it the next time they sign in.
 *
 * `schoolName` and `invitedByName` are passed in rather than read here, so this
 * module touches no database and the caller — which has already read the school
 * inside its own gates — reads it once.
 */
export async function sendSchoolInvitation(
  email: string,
  schoolName: string,
  invitedByName: string,
): Promise<void> {
  const mail = schoolInvitationEmail(schoolName, invitedByName, `${await originUrl()}/teacher`);
  await sendMail({
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    templateKey: "school-invitation",
  });
}
