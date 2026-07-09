import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateForm } from "@/components/CreateForm";

export default async function TeacherAddForStudent({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { studentId } = await params;

  const student = await db.student.findFirst({
    where: { id: studentId, class: { teacherId: user.teacher.id } },
  });
  if (!student) notFound();

  const skills = await db.skill.findMany({ orderBy: { name: "asc" } });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4">
      <Link
        href={`/teacher/students/${student.id}`}
        className="text-sm text-muted hover:text-foreground"
      >
        ← Back to {student.name}&apos;s journal
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">Add to {student.name}&apos;s journal</h1>
      <p className="mb-5 text-muted">
        This publishes straight away — no approval needed.
      </p>
      <CreateForm mode="teacher" studentId={student.id} skills={skills} />
    </main>
  );
}
