import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { jsonAttachment, momentRecord, slugify } from "@/lib/exportBundle";

// Data export (FINDINGS F4) — backs the "export your class's data at any time"
// promise and provides DPIA/DSAR evidence. Ownership-scoped: a teacher can only
// export a class they own (deny by default → 404, leaking nothing about other
// classes; SAFEGUARDING.md rules 4 & 8). Returns a structured JSON bundle of the
// class, its pupils (first names only) and every moment's metadata. Media bytes
// stay behind the authorising /uploads route; their paths are included so a full
// archive can be assembled by an authorised user.
//
// The per-moment record is assembled by `@/lib/exportBundle`, shared with the
// per-pupil export at `/teacher/export/pupil/[studentId]`. Read the rules at the
// top of that file before adding a field to either.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return new NextResponse("Not found", { status: 404 });

  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    include: {
      students: {
        orderBy: { name: "asc" },
        include: {
          journalItems: {
            orderBy: { createdAt: "asc" },
            include: {
              skills: { select: { name: true } },
              assignment: { select: { title: true, quizSnapshotJson: true } },
            },
          },
        },
      },
    },
  });
  if (!klass) return new NextResponse("Not found", { status: 404 });

  const data = {
    schema: "storyjar-class-export-v1",
    exportedAt: new Date().toISOString(),
    exportedBy: user.teacher.displayName,
    class: {
      name: klass.name,
      yearGroup: klass.yearGroup,
      // The class code is a live sign-in credential, and it is here only because
      // this file goes to the teacher who owns the class and already has it on
      // screen. The per-pupil export deliberately omits it — see exportBundle.
      classCode: klass.classCode,
      createdAt: klass.createdAt,
    },
    pupils: klass.students.map((s) => ({
      firstName: s.name, // first names only — no surnames are ever stored
      createdAt: s.createdAt,
      moments: s.journalItems.map(momentRecord),
    })),
  };

  // Audited for the same reason the per-pupil export is: rule 16 names data
  // exports, and this one carries every child in the class. It went unaudited
  // from the day it was written, which is the same gap one size larger — and it
  // is unrecoverable, because rows not written now cannot be reconstructed
  // later. Subject is the CLASS, so no child is named.
  const pupilCount = klass.students.length;
  await recordAudit({
    action: "CLASS_DATA_EXPORTED",
    actorType: user.teacher.staffRole === "ADMIN" ? "ADMIN" : "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId,
    subjectType: "CLASS",
    subjectId: klass.id,
    detail: `Exported ${klass.name} (${pupilCount} pupil${pupilCount === 1 ? "" : "s"}; file paths only, no media files)`,
  });

  const filename = `storyjar-${slugify(klass.name, "class")}-${data.exportedAt.slice(0, 10)}.json`;
  return jsonAttachment(data, filename);
}
