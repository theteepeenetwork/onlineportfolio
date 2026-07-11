import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

// A moment as a parent sees it: read-only, and only ever an approved one.
export type ParentMoment = {
  id: string;
  type: string; // PHOTO | TEXT | DRAWING
  title: string;
  caption: string | null;
  mediaPath: string | null;
  approvedAt: string; // ISO
};

export type ParentChild = {
  id: string;
  name: string;
  className: string;
  teacherName: string;
  teacherDisplayName: string;
  moments: ParentMoment[];
};

export type ParentSession = {
  id: string;
  name: string;
  children: ParentChild[];
};

// Resolve the current parent from the session cookie, with each linked child's
// APPROVED moments only. Returns null for anyone who isn't a signed-in parent
// (teachers/students/anonymous), so the family space is fully separate.
export async function getCurrentParent(): Promise<ParentSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      parent: {
        include: {
          children: {
            orderBy: { name: "asc" },
            include: {
              class: { include: { teacher: { select: { name: true, displayName: true } } } },
              // Only approved items are ever exposed to a parent.
              journalItems: {
                where: { status: "APPROVED" },
                orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
                include: { assignment: { select: { title: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.role !== "PARENT" || !session.parent) return null;
  if (session.expiresAt < new Date()) return null;

  const p = session.parent;
  return {
    id: p.id,
    name: p.name,
    children: p.children.map((c) => ({
      id: c.id,
      name: c.name,
      className: c.class.name,
      teacherName: c.class.teacher.name,
      teacherDisplayName: c.class.teacher.displayName ?? c.class.teacher.name,
      moments: c.journalItems.map((j) => ({
        id: j.id,
        type: j.type,
        title: j.assignment?.title ?? j.caption ?? "A moment",
        caption: j.caption,
        mediaPath: j.mediaPath,
        approvedAt: (j.approvedAt ?? j.createdAt).toISOString(),
      })),
    })),
  };
}
