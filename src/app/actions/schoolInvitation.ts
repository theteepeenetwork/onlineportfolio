"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// The teacher's side of a school invitation, from the teacher's own account.
//
// WHAT IS HERE: declining. That is all, and the emptiness is the design.
//
// ACCEPTING IS NOT HERE. It lives in `joinSchoolPlan`
// (src/app/actions/billing.ts) because accepting really is a billing act: the
// teacher's own FREE `Subscription` row is deleted in the same transaction and
// the school's plan starts governing them from that moment. DECLINING IS NOT A
// BILLING ACT. Nothing about the teacher's plan, their classes, their pupils or
// their school changes; one row that said "asked" comes to say "answered". A
// decline sitting in billing.ts would invite the next reader to give it a
// subscription write it has no business having.
// ---------------------------------------------------------------------------

/**
 * Say no to an invitation.
 *
 * THE ROW IS NOT DELETED, and that is a deliberate choice rather than a
 * shortcut avoided. The school is entitled to see that its offer was answered
 * — a head who invited a colleague a fortnight ago should not be left unable to
 * tell "she said no" from "the email never arrived", which is exactly the
 * question a deleted row makes unanswerable. DECLINED is one of three distinct
 * closed states for that reason (src/lib/schoolInvitationPolicy.ts).
 *
 * IT ALSO DOES NOT BLOCK A SECOND ASK. `inviteStaff` upserts, so re-typing the
 * address reopens this same row with a fresh clock and `respondedAt` cleared.
 * A teacher who declined by accident is one conversation away from being asked
 * again, and the school never learns anything from the difference.
 *
 * SCOPED IN THE WRITE ITSELF, not checked before it — the same shape as
 * `cancelSchoolInvitation` on the admin side and for the same reasons.
 * `updateMany` carrying `teacherId` and `state: "PENDING"` in its WHERE cannot
 * be raced by a school revoking at the same moment, and cannot be fooled by an
 * id belonging to somebody else's invitation: that is simply zero rows.
 *
 * A MISS REDIRECTS SILENTLY, saying nothing about which of the several ways it
 * missed actually happened, which is `resendInvite`'s instinct applied to a
 * teacher instead of an admin. A different answer for "no such id", "not
 * yours" and "already answered" would let a signed-in teacher probe invitation
 * ids and learn whether a given school has an offer out to a given colleague.
 *
 * AUDITED ONLY WHEN SOMETHING CHANGED. `count > 0` is the condition, so a
 * probe writes nothing into a school's audit log — and no row ever claims an
 * answer that was not given.
 */
export async function declineSchoolInvitation(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  const teacherId = user.teacher.id;
  const invitationId = String(formData.get("invitationId") ?? "");

  // Read first, SCOPED TO THIS TEACHER, so the audit detail can name the
  // school the offer came from. Scoping the read as well as the write means a
  // probed id yields nothing to this function at all, not even a name.
  const invitation = await db.schoolInvitation.findFirst({
    where: { id: invitationId, teacherId },
    select: { schoolId: true, school: { select: { name: true } } },
  });

  const { count } = await db.schoolInvitation.updateMany({
    where: { id: invitationId, teacherId, state: "PENDING" },
    data: { state: "DECLINED", respondedAt: new Date() },
  });

  if (count > 0 && invitation) {
    await recordAudit({
      action: "SCHOOL_INVITATION_DECLINED",
      actorType: "TEACHER",
      actorId: teacherId,
      actorName: user.teacher.displayName,
      // The SCHOOL's log, because the school is who this answer is for. It is
      // the only school that can see the row.
      schoolId: invitation.schoolId,
      subjectType: "SCHOOL_INVITATION",
      subjectId: invitationId,
      // No class name, no pupil name, no count. Nothing of this teacher's own
      // has become the school's, and the record of a refusal must not be the
      // one place the school learns what it did not get.
      detail: `Declined the invitation to join ${invitation.school.name}`,
    });
  }

  // The banner is drawn by the teacher layout, so the whole teacher area is
  // stale the moment this commits.
  revalidatePath("/teacher", "layout");
  redirect("/teacher/account");
}
