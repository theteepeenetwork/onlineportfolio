import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// The current user as a school ADMIN, or bounce them out.
//
// Every admin mutation goes through this, so a non-admin, or a teacher with no
// school, can never touch staff, class assignment, billing, or the school's
// parent-messaging settings. It lived inside src/app/actions/admin.ts until
// parent messaging needed the same guard from a second actions file; lifted
// here rather than copied so there is one definition of "is an admin".
//
// It answers WHO, not WHAT. An admin manages the school and is not all-seeing
// (SAFEGUARDING.md rule 5): passing this check says nothing about reading a
// child's work, and no caller may treat it as if it did.
export type AdminContext = { teacherId: string; schoolId: string; actorName: string };

export async function requireAdmin(): Promise<AdminContext> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (user.teacher.staffRole !== "ADMIN" || !user.teacher.schoolId) redirect("/teacher");
  return { teacherId: user.teacher.id, schoolId: user.teacher.schoolId, actorName: user.teacher.displayName };
}
