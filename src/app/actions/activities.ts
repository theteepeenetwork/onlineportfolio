"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { saveImagePages } from "@/lib/media";

function parsePages(raw: string): string[] {
  try {
    const pages = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(pages) ? pages.filter((p) => typeof p === "string" && p.startsWith("data:image")) : [];
  } catch {
    return [];
  }
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

  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim() || null;
  const tags = parseTags(String(formData.get("tags") ?? ""));
  if (!title) return { error: "Please give the template a title." };

  let templatePathsJson: string | null = null;
  try {
    const pages = parsePages(String(formData.get("templatePages") ?? ""));
    if (pages.length) templatePathsJson = JSON.stringify(await saveImagePages(pages));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the template." };
  }

  const template = await db.activityTemplate.create({
    data: {
      title,
      instructions,
      templatePathsJson,
      tagsJson: tags.length ? JSON.stringify(tags) : null,
      teacherId: user.teacher.id,
    },
  });

  revalidatePath("/teacher/activities");
  redirect(`/teacher/activities/${template.id}`);
}

// Assign a template to a class (whole class or chosen children). Each call is a
// new independent run and snapshots the template so future edits don't change it.
export async function assignTemplate(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const templateId = String(formData.get("templateId") ?? "");
  const classId = String(formData.get("classId") ?? "");
  const mode = String(formData.get("mode") ?? "class"); // class | children
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

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
      return { error: "Please choose at least one child, or assign to the whole class." };
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
  const id = String(formData.get("templateId") ?? "");
  const t = await db.activityTemplate.findFirst({ where: { id, teacherId: user.teacher.id } });
  if (!t) redirect("/teacher/activities");

  const copy = await db.activityTemplate.create({
    data: {
      title: `${t.title} (copy)`,
      instructions: t.instructions,
      templatePathsJson: t.templatePathsJson,
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
  const id = String(formData.get("templateId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";
  await db.activityTemplate.updateMany({
    where: { id, teacherId: user.teacher.id },
    data: { archived },
  });
  revalidatePath("/teacher/activities");
  revalidatePath(`/teacher/activities/${id}`);
}

// Close a run so no more responses are expected (kept as evidence forever).
export async function setRunStatus(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
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
