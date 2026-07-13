import "server-only";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImagePages, deleteMediaFiles } from "@/lib/media";
import { requireWritableAccount, requireWritableAccountForClass } from "@/lib/billing";

// Cross-device draft sync (Stage 2). All access is owner-scoped and deny-by-
// default; a child's draft is never readable by anyone but that child (not
// parents, not other children, not other tenants, not their teacher — a teacher
// only ever sees the work once it's submitted as a JournalItem).

export const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (see RETENTION.md)
const MAX_PAGES = 40;

type Surface = "TEMPLATE_NEW" | "ACTIVITY_RESPONSE";
type Scope = {
  surface: Surface;
  contextKey: string;
  ownerKey: string;
  owner: { teacherId?: string; studentId?: string; classId?: string; assignmentId?: string };
};

// Resolve who owns a draft at (surface, contextKey) for the CURRENT user, or
// null if they aren't allowed one here. Never trusts the client's identity — it
// re-derives everything from the session, and for a response draft re-checks
// that the assignment actually targets this child (mirrors createJournalItem).
async function resolveScope(surfaceIn: string, contextKey: string): Promise<Scope | null> {
  const user = await getCurrentUser();
  if (surfaceIn === "TEMPLATE_NEW") {
    if (user?.role !== "TEACHER") return null;
    return {
      surface: "TEMPLATE_NEW",
      contextKey: "tmpl-new",
      ownerKey: `t:${user.teacher.id}`,
      owner: { teacherId: user.teacher.id },
    };
  }
  if (surfaceIn === "ACTIVITY_RESPONSE") {
    if (user?.role !== "STUDENT") return null;
    const assignment = await db.assignment.findFirst({
      where: {
        id: contextKey,
        OR: [
          { wholeClass: true, classId: user.student.classId },
          { wholeClass: false, students: { some: { studentId: user.student.id } } },
        ],
      },
      select: { id: true, classId: true },
    });
    if (!assignment) return null;
    return {
      surface: "ACTIVITY_RESPONSE",
      contextKey: assignment.id,
      ownerKey: `s:${user.student.id}`,
      owner: { studentId: user.student.id, classId: assignment.classId, assignmentId: assignment.id },
    };
  }
  return null;
}

function uniqueWhere(scope: Scope) {
  return {
    surface_contextKey_ownerKey: {
      surface: scope.surface,
      contextKey: scope.contextKey,
      ownerKey: scope.ownerKey,
    },
  };
}

export function draftPaths(pagesJson: string | null): string[] {
  if (!pagesJson) return [];
  try {
    const a = JSON.parse(pagesJson);
    return Array.isArray(a) ? a.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

// Collect every media path across a set of drafts, for cascade erasure when the
// owning class/student is deleted (deletion must remove rows AND files).
export function gatherDraftPaths(drafts: Array<{ pagesJson: string | null }>): string[] {
  return drafts.flatMap((d) => draftPaths(d.pagesJson));
}

function parseFields(fieldsJson: string | null): Record<string, string> {
  if (!fieldsJson) return {};
  try {
    const o = JSON.parse(fieldsJson);
    if (!o || typeof o !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

// Lazy retention (no cron): drop expired drafts AND erase their media files.
async function purgeExpiredDrafts(): Promise<void> {
  const expired = await db.draft.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, pagesJson: true },
  });
  if (!expired.length) return;
  await db.draft.deleteMany({ where: { id: { in: expired.map((d) => d.id) } } });
  await deleteMediaFiles(expired.flatMap((d) => draftPaths(d.pagesJson)));
}

export type DraftLoad = { pages: string[]; fields: Record<string, string>; updatedAt: number };

export async function loadDraftServer(surface: string, contextKey: string): Promise<DraftLoad | null> {
  const scope = await resolveScope(surface, contextKey);
  if (!scope) return null;
  await purgeExpiredDrafts();
  const draft = await db.draft.findUnique({
    where: uniqueWhere(scope),
    select: { pagesJson: true, fieldsJson: true, updatedAt: true, expiresAt: true },
  });
  if (!draft || draft.expiresAt < new Date()) return null;
  return {
    pages: draftPaths(draft.pagesJson),
    fields: parseFields(draft.fieldsJson),
    updatedAt: draft.updatedAt.getTime(),
  };
}

export async function saveDraftServer(
  surface: string,
  contextKey: string,
  pages: string[],
  fields: Record<string, string>,
): Promise<{ ok: boolean; updatedAt?: number; error?: string }> {
  const scope = await resolveScope(surface, contextKey);
  if (!scope) return { ok: false, error: "not-allowed" };

  // Write gate: a frozen (read-only) account can't create new work.
  const gate = scope.owner.classId
    ? await requireWritableAccountForClass(scope.owner.classId)
    : await requireWritableAccount();
  if (!gate.ok) return { ok: false, error: "frozen" };

  await purgeExpiredDrafts();

  const clean = pages.filter((p) => typeof p === "string" && p.startsWith("data:image")).slice(0, MAX_PAGES);
  const savedPaths = clean.length ? await saveImagePages(clean) : [];

  // Erase the previously-synced files for this draft (avoid orphan accumulation).
  const existing = await db.draft.findUnique({ where: uniqueWhere(scope), select: { pagesJson: true } });
  const prevPaths = existing ? draftPaths(existing.pagesJson) : [];

  const payload = {
    pagesJson: savedPaths.length ? JSON.stringify(savedPaths) : null,
    fieldsJson: Object.keys(fields).length ? JSON.stringify(fields) : null,
    expiresAt: new Date(Date.now() + DRAFT_RETENTION_MS),
  };
  const draft = await db.draft.upsert({
    where: uniqueWhere(scope),
    create: { surface: scope.surface, contextKey: scope.contextKey, ownerKey: scope.ownerKey, ...scope.owner, ...payload },
    update: payload,
    select: { updatedAt: true },
  });
  if (prevPaths.length) await deleteMediaFiles(prevPaths);
  return { ok: true, updatedAt: draft.updatedAt.getTime() };
}

// Erase a child's activity-response draft by (student, assignment), for use from
// the teacher's approve / "start again" actions — where the current session is
// the teacher, not the draft's owner, so the owner-scoped path above can't run.
// Removes rows AND media files. Safe no-op when there's no draft.
export async function discardResponseDraftFor(studentId: string, assignmentId: string): Promise<void> {
  const drafts = await db.draft.findMany({
    where: { surface: "ACTIVITY_RESPONSE", contextKey: assignmentId, studentId },
    select: { id: true, pagesJson: true },
  });
  if (!drafts.length) return;
  await db.draft.deleteMany({ where: { id: { in: drafts.map((d) => d.id) } } });
  await deleteMediaFiles(drafts.flatMap((d) => draftPaths(d.pagesJson)));
}

// NOT write-gated: erasure stays available even on a frozen account (mirrors
// deleteItem/deleteClass). Removes rows AND media files.
export async function discardDraftServer(surface: string, contextKey: string): Promise<void> {
  const scope = await resolveScope(surface, contextKey);
  if (!scope) return;
  const draft = await db.draft.findUnique({ where: uniqueWhere(scope), select: { id: true, pagesJson: true } });
  if (!draft) return;
  await db.draft.delete({ where: { id: draft.id } });
  await deleteMediaFiles(draftPaths(draft.pagesJson));
}
