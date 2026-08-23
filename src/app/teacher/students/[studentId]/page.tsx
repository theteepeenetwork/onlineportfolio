import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { JournalItemCard } from "@/components/JournalItemCard";
import { deleteItem } from "@/app/actions/journal";
import { FamilyAccess } from "./FamilyAccess";

export default async function StudentJournal({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { studentId } = await params;

  // Only allow viewing students in this teacher's own classes.
  const student = await db.student.findFirst({
    where: { id: studentId, class: { teacherId: user.teacher.id } },
    include: {
      class: true,
      journalItems: {
        orderBy: { createdAt: "desc" },
        include: { skills: { select: { id: true, name: true } } },
      },
    },
  });
  if (!student) notFound();

  // The families who can see THIS child, and nothing about any other child they
  // may also be linked to (SAFEGUARDING rule 6 runs both ways: a teacher learns
  // nothing here about another teacher's pupils). Reached only through a pupil
  // the ownership-scoped query above already proved is this teacher's.
  //
  // `inUse` is deliberately the whole picture of the household we show: whether
  // the code has been taken up. Not who took it up — a code belongs to whoever
  // holds the letter, and the parent's own name and address are theirs, given
  // for sign-in links rather than for the register.
  const families = await db.parent.findMany({
    where: { children: { some: { id: student.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, familyCode: true, email: true, _count: { select: { sessions: true } } },
  });

  const published = student.journalItems.filter((i) => i.status === "APPROVED");
  // Work the export will carry that no adult has passed yet — see the note by
  // the export button.
  const notApproved = student.journalItems.length - published.length;

  return (
    <>
      <div className="w-full max-w-2xl">
        <Link href="/teacher" className="text-sm text-muted hover:text-foreground">
          ← All journals
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <Avatar name={student.name} color={student.avatarColor} size={56} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{student.name}</h1>
            <p className="text-sm text-muted">
              {student.class.name} · {published.length} in journal
            </p>
          </div>
          <Link href={`/teacher/students/${student.id}/new`} className="btn-brand">
            ＋ Add
          </Link>
        </div>

        {/* The answer to "a parent has asked what you hold about my child".
            Beside the journal it describes, and nowhere near a delete control.

            The second paragraph is the human gate SAFEGUARDING rule 3 asks for.
            The file deliberately holds work that has not been through the
            approval queue, because the school holds it and the question was
            what the school holds — but nobody has decided that work is suitable
            to share, and a teacher who exports four hundred lines of JSON will
            not discover that by reading them. The count is here, and again at
            the top of the file itself. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href={`/teacher/export/pupil/${student.id}`} download className="btn-ghost">
            Export {student.name}&rsquo;s data
          </a>
          <p className="text-sm text-muted">
            A file listing everything the school holds for this pupil. It names the photos,
            drawings and voice notes but does not contain them &mdash; the files themselves
            are a separate request.
          </p>
        </div>
        {notApproved > 0 && (
          <p role="note" className="mt-2 text-sm font-semibold">
            Read it before you share it. The file includes {notApproved}{" "}
            {notApproved === 1 ? "piece" : "pieces"} of work that {notApproved === 1 ? "has" : "have"}{" "}
            not been through the approval queue &mdash; waiting to be approved, or sent back.
            Nobody has decided yet whether {notApproved === 1 ? "it is" : "they are"} suitable
            to share.
          </p>
        )}

        <div className="mt-6 space-y-4">
          {student.journalItems.length === 0 ? (
            <div className="card p-10 text-center text-muted">
              Nothing in this journal yet.
            </div>
          ) : (
            student.journalItems.map((item) => (
              <div key={item.id}>
                <JournalItemCard item={item} showStatus showQuizScore />
                <form action={deleteItem} className="mt-1 text-right">
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    className="text-xs text-muted hover:text-rose-600"
                  >
                    Delete
                  </button>
                </form>
              </div>
            ))
          )}
        </div>

        <FamilyAccess
          studentId={student.id}
          studentName={student.name}
          families={families.map((f) => ({
            id: f.id,
            code: f.familyCode,
            // Taken up: someone has signed in with it, or the parent has added
            // their own address for sign-in links.
            inUse: f._count.sessions > 0 || f.email !== null,
          }))}
        />
      </div>
    </>
  );
}
