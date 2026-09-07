import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FamilyLetter } from "@/components/storyjar/FamilyLetter";
import { familyLetterQr } from "@/lib/familyLetterQr";
import { PrintLetterButton } from "./PrintLetterButton";

export const metadata = { title: "Family letter" };

// The letter that carries a family code home, for ONE child.
//
// Without this the whole feature is theoretical: the code has no route to the
// parent, because StoryJar has no way to reach them and deliberately never asks
// the teacher for one. The school prints this, puts it in a bag, and that is the
// entire delivery mechanism.
//
// Written for someone who has never heard of StoryJar and is reading it at the
// kitchen table. Short, plain, no jargon, and it says who to ask when it does
// not work. The paper itself now lives in `FamilyLetter`, shared with the
// whole-class sheet at `/teacher/class/[classId]/letters`, so the one letter a
// teacher prints mid-term matches the thirty they printed in September.
export default async function FamilyLetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ family?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const { studentId } = await params;
  const { family: familyId } = await searchParams;

  // Ownership-scoped exactly like the pupil's journal page: a pupil in someone
  // else's class simply is not found, and neither is their family's code.
  const student = await db.student.findFirst({
    where: { id: studentId, class: { teacherId: user.teacher.id } },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (!student) notFound();

  const familyLink = await db.parent.findFirst({
    where: { id: familyId ?? "", children: { some: { id: student.id } } },
    select: { familyCode: true },
  });
  if (!familyLink) notFound();

  const { qrSvg, prettyUrl } = await familyLetterQr();

  return (
    <div
      className="sj"
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", display: "flex", flexDirection: "column", width: "100%" }}
    >
      <nav className="no-print" style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 48px", flexWrap: "wrap" }}>
        <Link href={`/teacher/students/${student.id}`} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", textDecoration: "none" }}>
          ← Back to {student.name}&rsquo;s journal
        </Link>
        <div style={{ marginLeft: "auto" }}>
          <PrintLetterButton />
        </div>
      </nav>

      <div className="letter-main" style={{ flex: 1, display: "flex", justifyContent: "center", padding: "8px 24px 80px" }}>
        <FamilyLetter
          studentName={student.name}
          code={familyLink.familyCode}
          qrSvg={qrSvg}
          prettyUrl={prettyUrl}
        />
      </div>
    </div>
  );
}
