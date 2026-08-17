import "server-only";
import { db } from "@/lib/db";

// The operator's audit writer (handbook ruling R4 and R5).
//
// TWO THINGS THIS DELIBERATELY DOES DIFFERENTLY FROM src/lib/audit.ts
//
// 1. It writes OpsAuditLog, never AuditLog. `AuditLog.detail` is free text
//    written by teacher-facing actions and routinely contains a child's first
//    name ("Approved Amara's moment"), so an operator reading that table is a
//    child-data read wearing an operations hat. A runtime `where actorType`
//    filter would be a promise; a separate table is a structure, and the
//    blindness gate can see the difference. (The one permitted AuditLog shape
//    from ops is `db.auditLog.create` from this file, for the school-visible
//    transparency row of a platform action. PR1 has no such action: signing in
//    is not something any school needs told, so nothing here writes one yet.)
//
// 2. It THROWS. `recordAudit()` swallows write failures on purpose, because an
//    audit failure must never break a teacher's lesson. That trade is right for
//    a teacher mid-lesson and wrong for the operator: one person runs this
//    service, so this table is the only external check that an action happened
//    at all. An unaudited privileged action is worse than a failed one.
//
// The actor is taken from the resolved session by the caller in
// src/lib/ops/session.ts and never from a form field.

// Just enough of the client to write one row, so a caller inside a
// db.$transaction can pass the transaction handle and get the mutation and its
// audit row in the same transaction (ruling R5).
type AuditWriter = Pick<typeof db, "opsAuditLog">;

export type OpsAuditEntry = {
  // null for a failed sign-in against an address that matches no operator.
  actorId?: string | null;
  actorName: string;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  // The operator's stated reason, verbatim, on mutating actions. PR1 has none.
  reason?: string | null;
  // Never a child's name, never a credential value, never an email address.
  detail?: string | null;
  // Unique. Lets QA force a genuine constraint violation and watch the
  // operation fail with it, so "an audit failure fails the operation" is proved
  // by a real database error rather than by a fault switch in the product.
  idempotencyKey?: string | null;
};

export async function recordOpsAudit(entry: OpsAuditEntry, writer: AuditWriter = db): Promise<void> {
  await writer.opsAuditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorName: entry.actorName,
      action: entry.action,
      subjectType: entry.subjectType ?? null,
      subjectId: entry.subjectId ?? null,
      reason: entry.reason ?? null,
      detail: entry.detail ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
    },
  });
}
