"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// One row of the identity-bar search index: a pupil, a class or an activity the
// signed-in teacher already has on their own screens.
export type TeacherSearchItem = {
  id: string;
  kind: "child" | "class" | "activity";
  name: string;
  sub: string;
  href: string;
};

// The index behind the identity-bar search box.
//
// It is fetched on demand — the first time a teacher puts the cursor in the box —
// rather than being built into every teacher page. Two reasons, and the second
// is the one that matters:
//
//  1. It is per-render work (a query across every class, pupil and activity) on
//     a layout that renders on every navigation in the teacher area.
//  2. It is a list of children's names. Building it into the layout would ship
//     that list to the browser on every teacher page, including the ones that
//     show no children at all. Fetching it when the teacher actually searches
//     keeps the names where they are needed and nowhere else — the same
//     data-minimisation reflex as everywhere else in this codebase.
//
// Scoping: every branch is filtered by `teacherId`, so the box can only ever
// reach this teacher's own classes, their pupils and their own activities. It
// narrows what the server already sent; it can never widen it
// (SAFEGUARDING.md rule 4). On any doubt about who is asking, it returns
// nothing (rule 8).
export async function teacherSearchIndex(): Promise<TeacherSearchItem[]> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return [];
  const teacherId = user.teacher.id;

  const [classes, templates] = await Promise.all([
    db.class.findMany({
      where: { teacherId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        students: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    db.activityTemplate.findMany({
      where: { teacherId, archived: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  return [
    ...classes.flatMap((c) =>
      c.students.map((s) => ({
        id: s.id,
        kind: "child" as const,
        name: s.name,
        sub: c.name,
        href: `/teacher/students/${s.id}`,
      })),
    ),
    ...classes.map((c) => ({
      id: c.id,
      kind: "class" as const,
      name: c.name,
      sub: `${c.students.length} ${c.students.length === 1 ? "pupil" : "pupils"}`,
      href: `/teacher/class?class=${encodeURIComponent(c.id)}`,
    })),
    ...templates.map((t) => ({
      id: t.id,
      kind: "activity" as const,
      name: t.title,
      sub: "",
      href: `/teacher/activities/${t.id}`,
    })),
  ];
}
