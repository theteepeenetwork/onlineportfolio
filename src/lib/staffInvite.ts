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
 *
 * `school.paid` AND `school.arrangedBy` ARE ON THIS FUNCTION RATHER THAN IN ONE
 * CALLER, for the reason the paragraph above gives: the first invitation and a
 * resend must behave identically, and the failure this module exists to fix was
 * a second path that quietly did less than the first. An unpaid school's
 * invitation has to disclose that it is unpaid on the resend too — a head
 * teacher who receives the second copy is in exactly the position the
 * disclosure is for (docs/dpo-decisions.md, 1 September 2026).
 */
export async function sendStaffInvite(
  teacherId: string,
  schoolName: string,
  email: string,
  school: { paid: boolean; arrangedBy: string },
): Promise<void> {
  const path = await mintPasswordToken(teacherId, "INVITE");
  const mail = staffInviteEmail(
    schoolName,
    `${await originUrl()}${path}`,
    school.paid ? null : { arrangedBy: school.arrangedBy },
  );
  await sendMail({
    to: email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    templateKey: "staff-invite",
  });
}
