"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImagePages, saveImageDataUrl } from "@/lib/media";
import { requireWritableAccount, FROZEN_TEACHER_MESSAGE } from "@/lib/billing";
import { parseQuizPayload } from "@/lib/quiz";

function parsePages(raw: string): string[] {
  try {
    const pages = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(pages) ? pages.filter((p) => typeof p === "string" && p.startsWith("data:image")) : [];
  } catch {
    return [];
  }
}

// Validate the quiz payload from the editor and persist any freshly-authored
// option images (data URLs → private /uploads paths, like template pages).
// Returns the JSON to store, or null when there are no questions. Throws a
// teacher-friendly Error on invalid input (surfaced by the caller).
async function persistQuizPayload(raw: string): Promise<string | null> {
  const quiz = parseQuizPayload(raw);
  if (quiz.questions.length === 0) return null;
  for (const q of quiz.questions) {
    for (const o of q.options) {
      if (o.imagePath && o.imagePath.startsWith("data:image")) {
        o.imagePath = await saveImageDataUrl(o.imagePath);
      }
    }
  }
  return JSON.stringify(quiz);
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

// Teacher creates a reusable template (from the ActivityBuilder). Assignment is
// a separate step (the assign sheet), so this only makes the template.
export async function createTemplate(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim() || null;
  const tags = parseTags(String(formData.get("tags") ?? ""));
  if (!title) return { error: "Please give the template a title." };

  let templatePathsJson: string | null = null;
  let quizJson: string | null = null;
  try {
    const pages = parsePages(String(formData.get("templatePages") ?? ""));
    if (pages.length) templatePathsJson = JSON.stringify(await saveImagePages(pages));
    quizJson = await persistQuizPayload(String(formData.get("quizPayload") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the template." };
  }

  const template = await db.activityTemplate.create({
    data: {
      title,
      instructions,
      templatePathsJson,
      quizJson,
      tagsJson: tags.length ? JSON.stringify(tags) : null,
      teacherId: user.teacher.id,
    },
  });

  revalidatePath("/teacher/activities");
  redirect(`/teacher/activities/${template.id}`);
}

// Teacher edits an existing template (reopened in the same builder / canvas).
// Unlike the original snapshot-at-assign design, edits here are pushed onto the
// template's LIVE runs too, so a class working on it right now sees the change.
// CLOSED runs are left untouched — they're kept as an accurate record of what
// was actually set at the time.
export async function updateTemplate(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const templateId = String(formData.get("templateId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim() || null;
  const tags = parseTags(String(formData.get("tags") ?? ""));
  if (!title) return { error: "Please give the template a title." };

  // Must be one of this teacher's templates (tenant scoping).
  const existing = await db.activityTemplate.findFirst({
    where: { id: templateId, teacherId: user.teacher.id },
    select: { id: true },
  });
  if (!existing) return { error: "Template not found." };

  let templatePathsJson: string | null = null;
  let quizJson: string | null = null;
  try {
    // The builder re-composites every page, so pages come back as fresh data
    // URLs even when unchanged; save them like a new template would.
    const pages = parsePages(String(formData.get("templatePages") ?? ""));
    if (pages.length) templatePathsJson = JSON.stringify(await saveImagePages(pages));
    quizJson = await persistQuizPayload(String(formData.get("quizPayload") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the template." };
  }

  await db.activityTemplate.update({
    where: { id: existing.id },
    data: {
      title,
      instructions,
      templatePathsJson,
      quizJson,
      tagsJson: tags.length ? JSON.stringify(tags) : null,
    },
  });

  // Push the edit onto any LIVE runs so already-assigned classes see it now.
  await db.assignment.updateMany({
    where: { templateId: existing.id, status: "LIVE" },
    data: {
      title,
      instructions,
      templateSnapshotJson: templatePathsJson,
      quizSnapshotJson: quizJson,
    },
  });

  revalidatePath("/teacher/activities");
  revalidatePath(`/teacher/activities/${existing.id}`);
  redirect(`/teacher/activities/${existing.id}`);
}

// Assign a template to a class (whole class or chosen children). Each call is a
// new independent run and snapshots the template so future edits don't change it.
export async function assignTemplate(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const templateId = String(formData.get("templateId") ?? "");
  const classId = String(formData.get("classId") ?? "");
  const mode = String(formData.get("mode") ?? "class"); // class | children
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

  // Optional due date (YYYY-MM-DD from a <input type="date">). Anchor to local
  // noon so the run lands on the intended calendar day regardless of timezone.
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? new Date(`${dueRaw}T12:00:00`) : null;

  const template = await db.activityTemplate.findFirst({
    where: { id: templateId, teacherId: user.teacher.id },
  });
  if (!template) return { error: "Template not found." };

  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    include: { students: { select: { id: true } } },
  });
  if (!klass) return { error: "Please choose one of your classes." };

  const wholeClass = mode !== "children";
  let chosen: string[] = [];
  if (!wholeClass) {
    const inClass = new Set(klass.students.map((s) => s.id));
    chosen = studentIds.filter((id) => inClass.has(id));
    if (chosen.length === 0) {
      return { error: "Please choose at least one pupil, or assign to the whole class." };
    }
  }

  const assignment = await db.assignment.create({
    data: {
      templateId: template.id,
      classId,
      wholeClass,
      status: "LIVE",
      title: template.title,
      instructions: template.instructions,
      templateSnapshotJson: template.templatePathsJson,
      quizSnapshotJson: template.quizJson,
      dueDate,
      students: wholeClass ? undefined : { create: chosen.map((studentId) => ({ studentId })) },
    },
  });

  revalidatePath("/teacher/activities");
  revalidatePath(`/teacher/activities/${template.id}`);
  redirect(`/teacher/activities/${template.id}?run=${assignment.id}`);
}

// Copy a template (title + " (copy)"), with no runs.
export async function duplicateTemplate(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (!(await requireWritableAccount()).ok) redirect("/teacher/account?frozen=1");
  const id = String(formData.get("templateId") ?? "");
  const t = await db.activityTemplate.findFirst({ where: { id, teacherId: user.teacher.id } });
  if (!t) redirect("/teacher/activities");

  const copy = await db.activityTemplate.create({
    data: {
      title: `${t.title} (copy)`,
      instructions: t.instructions,
      templatePathsJson: t.templatePathsJson,
      quizJson: t.quizJson,
      tagsJson: t.tagsJson,
      teacherId: user.teacher.id,
    },
  });
  revalidatePath("/teacher/activities");
  redirect(`/teacher/activities/${copy.id}`);
}

// Archive / unarchive (never deletes runs or responses).
export async function setTemplateArchived(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (!(await requireWritableAccount()).ok) redirect("/teacher/account?frozen=1");
  const id = String(formData.get("templateId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";
  await db.activityTemplate.updateMany({
    where: { id, teacherId: user.teacher.id },
    data: { archived },
  });
  revalidatePath("/teacher/activities");
  revalidatePath(`/teacher/activities/${id}`);
}

// The dot-colour palette new folders cycle through.
const FOLDER_COLORS = ["#F0B441", "#8AB9D6", "#E08A9B", "#A6C979", "#B99CD6", "#E8A06A", "#37796f"];

// Teacher makes a new folder in the activity library.
export async function createFolder(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the folder a name." };

  const count = await db.folder.count({ where: { teacherId: user.teacher.id } });
  await db.folder.create({
    data: { name, color: FOLDER_COLORS[count % FOLDER_COLORS.length], teacherId: user.teacher.id },
  });
  revalidatePath("/teacher/activities");
  return {};
}

// Move a template into a folder (or out of any folder when folderId is empty).
export async function moveTemplateToFolder(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (!(await requireWritableAccount()).ok) redirect("/teacher/account?frozen=1");
  const id = String(formData.get("templateId") ?? "");
  const folderId = String(formData.get("folderId") ?? "") || null;

  // Guard: the folder (when given) must belong to this teacher.
  if (folderId) {
    const folder = await db.folder.findFirst({ where: { id: folderId, teacherId: user.teacher.id } });
    if (!folder) redirect("/teacher/activities");
  }
  await db.activityTemplate.updateMany({
    where: { id, teacherId: user.teacher.id },
    data: { folderId },
  });
  revalidatePath("/teacher/activities");
}

// Close a run so no more responses are expected (kept as evidence forever).
export async function setRunStatus(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (!(await requireWritableAccount()).ok) redirect("/teacher/account?frozen=1");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const status = String(formData.get("status") ?? "CLOSED") === "LIVE" ? "LIVE" : "CLOSED";
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, template: { teacherId: user.teacher.id } },
    include: { template: { select: { id: true } } },
  });
  if (!a) redirect("/teacher/activities");
  await db.assignment.update({ where: { id: assignmentId }, data: { status } });
  revalidatePath(`/teacher/activities/${a.template.id}`);
}
