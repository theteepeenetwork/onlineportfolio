import "server-only";
import { db } from "@/lib/db";

// Record a safeguarding-relevant action for accountability (SAFEGUARDING.md
// rule 16). Auditing must never break the user's action, so failures are logged
// and swallowed rather than thrown.
export async function recordAudit(input: {
  action: string; // e.g. MOMENT_APPROVED
  actorType?: string; // TEACHER | ADMIN | SYSTEM (default TEACHER)
  actorId?: string | null;
  actorName?: string | null;
  schoolId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        actorType: input.actorType ?? "TEACHER",
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        schoolId: input.schoolId ?? null,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        detail: input.detail ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to record", input.action, e);
  }
}
