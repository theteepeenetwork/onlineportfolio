import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { teacherNav } from "@/lib/teacherNav";
import { deleteActivity } from "@/app/actions/activities";

function firstPath(item: { mediaPath: string | null; mediaPathsJson: string | null }) {
  if (item.mediaPathsJson) {
    try {
      const p = JSON.parse(item.mediaPathsJson) as string[];
      if (Array.isArray(p) && p.length) return p[0];
    } catch {}
  }
  return item.mediaPath;
}

export default async function ActivityDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { id } = await params;

  const activity = await db.activity.findFirst({
    where: { id, teacherId: user.teacher.id },
    include: {
      class: { select: { name: true } },
      assignments: {
        include: { student: { select: { id: true, name: true, avatarColor: true } } },
      },
      responses: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          studentId: true,
          status: true,
          mediaPath: true,
          mediaPathsJson: true,
          caption: true,
        },
      },
    },
  });
  if (!activity) notFound();

  const pendingCount = await db.journalItem.count({
    where: { status: "PENDING", class: { teacherId: user.teacher.id } },
  });

  // Latest response per student.
  const responseByStudent = new Map<string, (typeof activity.responses)[number]>();
  for (const r of activity.responses) {
    if (!responseByStudent.has(r.studentId)) responseByStudent.set(r.studentId, r);
  }

  const template = activity.templatePathsJson
    ? (JSON.parse(activity.templatePathsJson) as string[])
    : [];
  const done = activity.assignments.filter((a) => responseByStudent.has(a.student.id)).length;

  return (
    <>
      <TopBar title="" links={teacherNav(pendingCount)} />

      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        <Link href="/teacher/activities" className="text-sm text-muted hover:text-foreground">
          ← All activities
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{activity.title}</h1>
            <p className="text-sm text-muted">
              {activity.class.name} · {done} of {activity.assignments.length} responded
            </p>
            {activity.instructions && (
              <p className="mt-2 max-w-2xl whitespace-pre-wrap">{activity.instructions}</p>
            )}
          </div>
          <form action={deleteActivity}>
            <input type="hidden" name="activityId" value={activity.id} />
            <button className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-rose-50 hover:text-rose-600">
              Delete
            </button>
          </form>
        </div>

        {template.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-semibold text-muted">Template</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {template.map((src) => (
                <Image
                  key={src}
                  src={src}
                  alt="Template page"
                  width={200}
                  height={140}
                  unoptimized
                  className="h-28 w-auto rounded-lg border border-border"
                />
              ))}
            </div>
          </div>
        )}

        <h2 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wide text-muted">
          Responses
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {activity.assignments.map((a) => {
            const r = responseByStudent.get(a.student.id);
            const src = r ? firstPath(r) : null;
            return (
              <div key={a.id} className="card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <Avatar name={a.student.name} color={a.student.avatarColor} size={28} />
                  <span className="truncate text-sm font-semibold">{a.student.name}</span>
                </div>
                {r ? (
                  <Link href={`/teacher/students/${a.student.id}`} className="block">
                    {src ? (
                      <Image
                        src={src}
                        alt={`${a.student.name}'s response`}
                        width={300}
                        height={210}
                        unoptimized
                        className="aspect-[10/7] w-full bg-black/5 object-contain"
                      />
                    ) : (
                      <div className="flex aspect-[10/7] items-center justify-center bg-background text-sm text-muted">
                        {r.caption ?? "Response"}
                      </div>
                    )}
                    <div className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </div>
                  </Link>
                ) : (
                  <div className="flex aspect-[10/7] items-center justify-center bg-background text-sm text-muted">
                    Not yet
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
