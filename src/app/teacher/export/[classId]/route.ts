import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Data export (FINDINGS F4) — backs the "export your class's data at any time"
// promise and provides DPIA/DSAR evidence. Ownership-scoped: a teacher can only
// export a class they own (deny by default → 404, leaking nothing about other
// classes; SAFEGUARDING.md rules 4 & 8). Returns a structured JSON bundle of the
// class, its pupils (first names only) and every moment's metadata. Media bytes
// stay behind the authorising /uploads route; their paths are included so a full
// archive can be assembled by an authorised user.
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
              assignment: { select: { title: true } },
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
      classCode: klass.classCode,
      createdAt: klass.createdAt,
    },
    pupils: klass.students.map((s) => ({
      firstName: s.name, // first names only — no surnames are ever stored
      createdAt: s.createdAt,
      moments: s.journalItems.map((j) => ({
        type: j.type,
        caption: j.caption,
        text: j.textContent,
        status: j.status,
        activity: j.assignment?.title ?? null,
        skills: j.skills.map((sk) => sk.name),
        media: j.mediaPath,
        mediaPages: j.mediaPathsJson ? safeParse(j.mediaPathsJson) : undefined,
        createdAt: j.createdAt,
        approvedAt: j.approvedAt,
      })),
    })),
  };

  const slug = klass.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "class";
  const filename = `storyjar-${slug}-${data.exportedAt.slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
