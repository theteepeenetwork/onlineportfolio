import Link from "next/link";
import { workCover } from "@/lib/journalMedia";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/icons/Icon";
import { momentKind } from "@/lib/momentKind";
import { classTint } from "@/lib/classTints";

// Journals — the teacher's home. It answers two questions and no others: what
// needs me, and how is this class doing.

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const CARD: React.CSSProperties = {
  border: "3px solid var(--ink)",
  borderRadius: 18,
  boxShadow: "var(--pop-shadow)",
  padding: "16px 18px",
  textAlign: "left",
  color: "var(--ink)",
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  gap: 14,
};

function StatCard({
  href,
  bg,
  icon,
  value,
  label,
  labelColor,
}: {
  href: string;
  bg: string;
  icon: IconName;
  value: number;
  label: string;
  labelColor: string;
}) {
  return (
    <Link href={href} style={{ ...CARD, background: bg }}>
      <span style={{ display: "flex", flex: "none" }} aria-hidden>
        <Icon name={icon} size={34} decorative />
      </span>
      <span>
        <span style={{ display: "block", font: "600 30px/1.1 var(--font-fredoka)" }}>{value}</span>
        <span style={{ display: "block", font: "700 14px var(--font-atkinson)", color: labelColor }}>{label}</span>
      </span>
    </Link>
  );
}

export default async function TeacherDashboard({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const teacherId = user.teacher.id;
  const { class: classParam } = await searchParams;

  const [classes, liveRuns, recent] = await Promise.all([
    db.class.findMany({
      where: { teacherId },
      orderBy: { createdAt: "asc" },
      include: {
        students: {
          orderBy: { name: "asc" },
          include: { journalItems: { select: { status: true } } },
        },
      },
    }),
    db.assignment.count({ where: { status: "LIVE", template: { teacherId } } }),
    db.journalItem.findMany({
      where: { status: "APPROVED", class: { teacherId } },
      orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        type: true,
        mediaPath: true,
        mediaPathsJson: true,
        previewPathsJson: true,
        studentId: true,
        student: { select: { name: true } },
        assignment: { select: { title: true } },
      },
    }),
  ]);

  const pupils = classes.reduce((n, c) => n + c.students.length, 0);
  const pending = classes.reduce(
    (n, c) => n + c.students.reduce((s, st) => s + st.journalItems.filter((i) => i.status === "PENDING").length, 0),
    0,
  );

  // The open class comes from the URL, so a reload or a bookmark is predictable
  // and a bare /teacher is never "wherever I was last". With no ?class, the
  // first class opens.
  const active = classes.find((c) => c.id === classParam) ?? classes[0] ?? null;
  const activeIndex = active ? classes.findIndex((c) => c.id === active.id) : 0;

  const today = new Date();
  const longDate = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* ── header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, font: "600 32px var(--font-fredoka)" }}>
            {greeting(today)}, {user.teacher.displayName}
          </h1>
          <p style={{ margin: "5px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            {longDate} · {pending === 0 ? "nothing waiting" : `${pending} waiting across your classes`}
          </p>
        </div>
        <Link
          href="/teacher/queue"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            font: "700 16px var(--font-atkinson)",
            padding: "12px 22px",
            borderRadius: 999,
            background: "var(--jam)",
            color: "var(--paper)",
            textDecoration: "none",
            boxShadow: "0 3px 0 var(--jam-deep)",
            minHeight: 48,
            boxSizing: "border-box",
          }}
        >
          Open the queue →
        </Link>
      </div>

      {/* ── the three numbers that decide what to do next ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard href="/teacher/queue" bg="var(--honey-tint)" icon="waiting" value={pending} label="waiting for you" labelColor="var(--honey-ink)" />
        <StatCard href="/teacher/calendar" bg="var(--glass-light)" icon="calendar" value={liveRuns} label="activities live now" labelColor="var(--glass-ink)" />
        <StatCard
          href="/teacher/class"
          bg="var(--cream)"
          icon="class"
          value={pupils}
          label={`pupils in ${classes.length} ${classes.length === 1 ? "class" : "classes"}`}
          labelColor="var(--sj-muted)"
        />
      </div>

      {/* ── just added to their jars ── */}
      {recent.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>Just added to their jars</h2>
            {active && (
              <Link
                href={`/teacher/class?class=${encodeURIComponent(active.id)}`}
                style={{ marginLeft: "auto", font: "600 13px var(--font-atkinson)", color: "var(--sj-muted)", textDecoration: "none" }}
              >
                See all →
              </Link>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            {recent.map((r) => {
              const k = momentKind(r.type);
              return (
                <Link
                  key={r.id}
                  href={`/teacher/students/${r.studentId}`}
                  style={{ textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column", gap: 7 }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 104,
                      borderRadius: 14,
                      border: "3px solid var(--ink)",
                      boxShadow: "0 3px 0 rgba(34,48,74,.15)",
                      background: k.bg,
                      overflow: "hidden",
                    }}
                  >
                    {r.type !== "AUDIO" && workCover(r) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={workCover(r)!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name={k.icon} size={30} decorative />
                    )}
                  </span>
                  <span style={{ font: "700 14px var(--font-atkinson)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.student.name}
                  </span>
                  <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.assignment?.title ?? "Free choice"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── the open class, and its register ── */}
      {!active ? (
        <div className="sj-card" style={{ padding: "40px 32px", textAlign: "center" }}>
          {user.teacher.staffRole === "ADMIN" ? (
            // An admin with no classes of their own belongs in the school
            // console, not the "make a class" flow.
            <>
              <p style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Your team&apos;s classes are in the school console</p>
              <p style={{ margin: "6px 0 18px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                As a school admin you manage your whole school&apos;s setup from one place.
              </p>
              <Link
                href="/admin"
                style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", borderRadius: 999, padding: "12px 24px", boxShadow: "0 3px 0 var(--jam-deep)" }}
              >
                Go to school console →
              </Link>
            </>
          ) : (
            <>
              <p style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>You don&apos;t have a class yet</p>
              <p style={{ margin: "6px 0 18px", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
                Make one and its code is ready for your pupils to sign in with &mdash; or, if somebody
                else set StoryJar up for your school, ask them to give you one. Everything you can see
                and do here follows the classes you hold.
              </p>
              <Link
                href="/teacher/class"
                style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", borderRadius: 999, padding: "12px 24px", boxShadow: "0 3px 0 var(--jam-deep)" }}
              >
                Make a class
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              background: classTint(activeIndex).color,
              border: "3px solid var(--ink)",
              borderRadius: "16px 16px 0 0",
              borderBottom: "none",
              padding: "14px 18px",
            }}
          >
            <h2 style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>{active.name}</h2>
            <span style={{ display: "inline-block", background: "var(--cream)", border: "2px solid var(--ink)", borderRadius: 8, padding: "1px 9px", font: "600 12px var(--font-fredoka)" }}>
              {active.yearGroup ?? "Class jar"}
            </span>
            <span style={{ font: "700 15px ui-monospace, Menlo, monospace", letterSpacing: ".08em", background: "var(--cream)", border: "2px solid var(--ink)", borderRadius: 8, padding: "3px 12px" }}>
              {active.classCode}
            </span>
            <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              {active.students.length} {active.students.length === 1 ? "pupil" : "pupils"} ·{" "}
              {active.students.reduce((n, s) => n + s.journalItems.filter((i) => i.status === "APPROVED").length, 0)} moments
            </span>
            <Link
              href={`/teacher/class?class=${encodeURIComponent(active.id)}`}
              style={{ marginLeft: "auto", font: "600 14px var(--font-atkinson)", color: "var(--sj-muted)", textDecoration: "none" }}
            >
              Manage class →
            </Link>
          </div>

          <div
            style={{
              background: "var(--cream)",
              border: "3px solid var(--ink)",
              borderRadius: "0 0 16px 16px",
              padding: 16,
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            }}
          >
            {active.students.length === 0 ? (
              <p style={{ margin: 0, font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                No pupils yet.{" "}
                <Link href={`/teacher/class?class=${encodeURIComponent(active.id)}`} style={{ font: "700 15px var(--font-atkinson)" }}>
                  Add some
                </Link>
                .
              </p>
            ) : (
              active.students.map((s) => {
                const inJar = s.journalItems.filter((i) => i.status === "APPROVED").length;
                const waiting = s.journalItems.filter((i) => i.status === "PENDING").length;
                return (
                  <Link
                    key={s.id}
                    href={`/teacher/students/${s.id}`}
                    style={{
                      background: "var(--paper)",
                      border: "2px solid var(--calm-border)",
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: 12,
                      textDecoration: "none",
                      color: "var(--ink)",
                      minHeight: 68,
                      boxSizing: "border-box",
                    }}
                  >
                    <Avatar name={s.name} color={s.avatarColor} size={44} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", font: "700 15px var(--font-atkinson)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name}
                      </span>
                      <span style={{ display: "block", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                        {inJar === 0 && waiting === 0
                          ? "Nothing yet"
                          : `${inJar} in journal${waiting > 0 ? ` · ${waiting} waiting` : ""}`}
                      </span>
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
