import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireWritableAccount } from "@/lib/billing";
import { FamilyLetter } from "@/components/storyjar/FamilyLetter";
import { familyLetterQr } from "@/lib/familyLetterQr";
import { LetterSheetActions } from "./LetterSheetActions";

export const metadata = { title: "Family letters" };

// Every family letter for one class, on one page, one per sheet of A4.
//
// The problem it solves is not aesthetic. Family access was per-child all the
// way down: create the code on the pupil page, print the letter from the pupil
// page, repeat thirty times. The work all landed in the first week of a new
// term, which is the week a teacher has least of it, so it did not get done and
// the jars stayed unseen at home. One page, two buttons, thirty letters.
//
// Three things this page is careful about:
//
//  1. ONE LETTER PER FAMILY PLACE, not per child. A child in two households has
//     two codes, and printing only the first would quietly cut one home out.
//     Each letter is labelled in screen-only chrome so a teacher collating book
//     bags can tell them apart; the paper itself says nothing about there being
//     another household, because that is the school's business and not the
//     reading parent's.
//  2. It prints EXISTING codes and never rotates. A letter already sent home
//     keeps working, so this is safe to print again mid-term for the four
//     children who lost theirs.
//  3. The QR is generated once and shared by every letter, because it is the
//     same square on all of them: it points at the family sign-in page and never
//     carries the code. See `familyLetterQr`.
export default async function ClassFamilyLettersPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const { classId } = await params;

  // Ownership-scoped like every other class read: another teacher's class is
  // simply not found, which is also what a tampered id gets.
  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    select: {
      id: true,
      name: true,
      students: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          parents: { orderBy: { createdAt: "asc" }, select: { id: true, familyCode: true } },
        },
      },
    },
  });
  if (!klass) notFound();

  // Flatten to one letter per family place, keeping the register order the
  // teacher already has in their head.
  const letters = klass.students.flatMap((student) =>
    student.parents.map((family, index) => ({
      key: family.id,
      studentId: student.id,
      studentName: student.name,
      code: family.familyCode,
      // Only meaningful when a child has more than one household.
      household: student.parents.length > 1 ? index + 1 : null,
      households: student.parents.length,
    })),
  );

  const missing = klass.students.filter((s) => s.parents.length === 0);
  const { qrSvg, prettyUrl } = await familyLetterQr();
  const gate = await requireWritableAccount();

  return (
    <>
      <div className="no-print" style={{ marginBottom: 8 }}>
        <Link href="/teacher/class" style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", textDecoration: "none" }}>
          ← Back to my classes
        </Link>

        <h1 style={{ margin: "14px 0 0", font: "600 32px/1.15 var(--font-fredoka)", color: "var(--ink)" }}>
          Family letters for {klass.name}
        </h1>
        <p style={{ margin: "10px 0 0", maxWidth: 620, font: "400 16px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
          One letter per family, each on its own sheet. Print the lot, then send them home in book
          bags. Codes already in use are printed as they are, so a family who has signed in keeps the
          code they have.
        </p>

        {missing.length > 0 && (
          <p style={{ margin: "14px 0 0", maxWidth: 620, padding: "14px 18px", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 14, font: "400 16px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
            <strong style={{ color: "var(--ink)" }}>
              {missing.length === 1
                ? "One child has no family code yet"
                : `${missing.length} children have no family code yet`}
              :
            </strong>{" "}
            {missing.map((s) => s.name).join(", ")}.{" "}
            {gate.ok
              ? "Make their codes and they will appear in the pile below."
              : "Codes cannot be made while the account is read-only, so these children are not in the pile below."}
          </p>
        )}

        <div style={{ marginTop: 18 }}>
          <LetterSheetActions
            classId={klass.id}
            letterCount={letters.length}
            missingCount={missing.length}
            frozen={!gate.ok}
          />
        </div>
      </div>

      {letters.length === 0 ? (
        <p className="no-print" style={{ margin: "28px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
          There is nothing to print yet. Once this class has family codes, every letter will appear
          here.
        </p>
      ) : (
        <div className="letter-main letters-stack" style={{ marginTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
          {letters.map((letter) => (
            <div key={letter.key} className="letter-page" style={{ width: "100%", maxWidth: 620 }}>
              {/* Screen-only collation help. Never printed: the parent reading
                  the letter has no need to know they are household two. */}
              <p className="no-print" style={{ margin: "0 0 10px", font: "700 14px var(--font-atkinson)", color: "var(--ink-soft)" }}>
                {letter.studentName}
                {letter.household ? ` — household ${letter.household} of ${letter.households}` : ""}
                {" · "}
                <Link href={`/teacher/students/${letter.studentId}`} style={{ color: "var(--jam)" }}>
                  open journal
                </Link>
              </p>
              <FamilyLetter
                studentName={letter.studentName}
                code={letter.code}
                qrSvg={qrSvg}
                prettyUrl={prettyUrl}
                headingLevel="h2"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
