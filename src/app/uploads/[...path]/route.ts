import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentParent } from "@/lib/parentAuth";
import { MEDIA_DIR } from "@/lib/mediaPath";

// Authorising media route. Children's photos and drawings are NOT public files
// (SAFEGUARDING.md rules 4 & 7). Every request for /uploads/<file> is resolved
// to the record(s) that reference it and served only if the signed-in requester
// is allowed to see that child's work — otherwise it 404s (deny by default,
// without revealing whether the file exists).

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

// A filename we are willing to serve: a single path segment of safe characters
// with a known image extension. Anything else (slashes, "..", odd extensions)
// is rejected before we touch the filesystem.
const SAFE_NAME = /^[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/;

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const name = parts?.length === 1 ? parts[0] : ""; // media lives in one flat segment
  if (!name || !SAFE_NAME.test(name)) return notFound();

  const urlPath = `/uploads/${name}`;
  if (!(await canAccess(urlPath))) return notFound();

  // Resolve inside MEDIA_DIR and double-check we never escaped it.
  const root = path.resolve(MEDIA_DIR);
  const file = path.resolve(root, name);
  if (file !== path.join(root, name) || !file.startsWith(root + path.sep)) return notFound();

  try {
    const [data, info] = await Promise.all([readFile(file), stat(file)]);
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        // Never store a child's image in a shared/CDN cache.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Defence in depth (FINDINGS F5): if a served file is ever an SVG,
        // sandbox it and forbid any script/resource loads so it can't execute
        // when opened directly. Uploads already reject SVG; this closes the gap
        // for any legacy/placeholder SVG the route might still serve.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return notFound();
  }
}

// The access decision. Returns true only if the current requester is entitled to
// see this media path. Deny by default.
async function canAccess(urlPath: string): Promise<boolean> {
  const user = await getCurrentUser(); // TEACHER | STUDENT | null
  const parent = user ? null : await getCurrentParent(); // only check parent if not a teacher/student
  if (!user && !parent) return false; // never serve to the unauthenticated

  // 1) Is it a child's journal item (a photo/drawing/response)? The most
  //    sensitive case — strict rules.
  const item = await db.journalItem.findFirst({
    where: { OR: [{ mediaPath: urlPath }, { mediaPathsJson: { contains: urlPath } }] },
    select: { studentId: true, status: true, class: { select: { teacherId: true } } },
  });
  if (item) {
    if (user?.role === "TEACHER") return item.class.teacherId === user.teacher.id;
    if (user?.role === "STUDENT") return item.studentId === user.student.id;
    if (parent) return item.status === "APPROVED" && parent.children.some((c) => c.id === item.studentId);
    return false;
  }

  // 2) A cross-device DRAFT page (Stage 2). Owner-only: a child's unsubmitted
  //    draft is their private unfinished work — visible to that child only,
  //    never to a parent, another child, another tenant, or even their teacher.
  if (user) {
    const draft = await db.draft.findFirst({
      where: { pagesJson: { contains: urlPath } },
      select: { teacherId: true, studentId: true },
    });
    if (draft) {
      if (user.role === "TEACHER") return draft.teacherId === user.teacher.id;
      if (user.role === "STUDENT") return draft.studentId === user.student.id;
      return false;
    }
  }

  // 3) Otherwise it may be a teacher-authored activity background (template pages
  //    or a frozen assignment snapshot) OR a quiz answer-option picture (which
  //    lives in quizJson / quizSnapshotJson, not the page list). Both are
  //    teacher-authored content — parents never see either.
  if (user?.role === "TEACHER") {
    const owned = await db.activityTemplate.findFirst({
      where: {
        teacherId: user.teacher.id,
        OR: [{ templatePathsJson: { contains: urlPath } }, { quizJson: { contains: urlPath } }],
      },
      select: { id: true },
    });
    if (owned) return true;
    const assigned = await db.assignment.findFirst({
      where: {
        template: { teacherId: user.teacher.id },
        OR: [{ templateSnapshotJson: { contains: urlPath } }, { quizSnapshotJson: { contains: urlPath } }],
      },
      select: { id: true },
    });
    return !!assigned;
  }
  if (user?.role === "STUDENT") {
    // A child may load the background AND the quiz option pictures of an activity
    // they have been set.
    const assigned = await db.assignment.findFirst({
      where: {
        class: { students: { some: { id: user.student.id } } },
        AND: [
          { OR: [{ templateSnapshotJson: { contains: urlPath } }, { quizSnapshotJson: { contains: urlPath } }] },
          { OR: [{ wholeClass: true }, { students: { some: { studentId: user.student.id } } }] },
        ],
      },
      select: { id: true },
    });
    return !!assigned;
  }

  return false;
}
