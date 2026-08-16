import "server-only";
import { db } from "@/lib/db";
import { errorLabel } from "@/lib/safeLog";

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
    // The action name and a label, never the error object. A Prisma validation
    // error prints the whole rejected argument object, and the argument object
    // here holds `detail`, which routinely contains a child's first name, and
    // `actorName`. That would put both in Railway's log store, which is the one
    // place erasure cannot reach.
    console.error("[audit] failed to record", input.action, errorLabel(e));
  }
}
