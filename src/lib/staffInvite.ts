import "server-only";
import { originUrl } from "@/lib/appOrigin";
import { sendMail } from "@/lib/mailer";
import { staffInviteEmail } from "@/lib/emailTemplates";
import { mintPasswordToken } from "@/lib/passwordTokens";

/**
 * Send one member of staff their way in.
 *
 * Its own module rather than a helper inside `admin.ts`, because it is called
 * from two places that must behave identically — the first invitation and a
 * resend — and the failure this whole change exists to fix was a second path
 * that did not do what the first one did.
 *
 * The send result is deliberately not returned. An admin does not need to be
 * told that Mailjet was slow; the mailer records the outcome against the
 * template (src/lib/mailCounters.ts) and the operator mail screen is where a
 * delivery problem is answered. What the admin needs is the row appearing in
 * the staff list, which it does either way.
 */
export async function sendStaffInvite(
  teacherId: string,
  schoolName: string,
  email: string,
): Promise<void> {
  const path = await mintPasswordToken(teacherId, "INVITE");
  const mail = staffInviteEmail(schoolName, `${await originUrl()}${path}`);
  await sendMail({
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    templateKey: "staff-invite",
  });
}
