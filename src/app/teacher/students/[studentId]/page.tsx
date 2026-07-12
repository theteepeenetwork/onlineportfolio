import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { JournalItemCard } from "@/components/JournalItemCard";
import { teacherNav } from "@/lib/teacherNav";
import { deleteItem } from "@/app/actions/journal";

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

  const pendingCount = await db.journalItem.count({
    where: { status: "PENDING", class: { teacherId: user.teacher.id } },
  });

  const published = student.journalItems.filter((i) => i.status === "APPROVED");

  return (
    <>
      <TopBar title="" links={teacherNav(pendingCount)} />

      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
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
      </main>
    </>
  );
}
