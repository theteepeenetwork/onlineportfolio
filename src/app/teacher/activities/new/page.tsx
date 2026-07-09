import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActivityBuilder } from "./ActivityBuilder";

export default async function NewActivityPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const classes = await db.class.findMany({
    where: { teacherId: user.teacher.id },
    orderBy: { createdAt: "asc" },
    include: {
      students: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, avatarColor: true },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4">
      <Link href="/teacher/activities" className="text-sm text-muted hover:text-foreground">
        ← Back to activities
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">New activity</h1>
      <p className="mb-5 text-muted">
        Set a task, build an optional template, and choose who gets it.
      </p>
      {classes.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          You need a class first.{" "}
          <Link href="/teacher/class" className="font-semibold text-brand">
            Set one up
          </Link>
          .
        </div>
      ) : (
        <ActivityBuilder classes={classes} />
      )}
    </main>
  );
}
