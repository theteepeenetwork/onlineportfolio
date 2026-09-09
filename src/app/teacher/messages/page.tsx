import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { inboxForStaff } from "@/lib/messaging/threads";
import { resolveMayMessageParents } from "@/lib/messaging/policy";
import { db } from "@/lib/db";
import { takeFamilyBack } from "@/app/actions/messaging";
import { relativeDay } from "@/lib/relativeDay";
import { noticesForTeacher } from "@/lib/noticeBoard";
import { schoolMessaging } from "@/lib/messaging/policy";
import { SendClassNotice } from "./SendClassNotice";

// A member of staff's messages: one row per child in their own classes, plus
// any family a colleague has handed them or shared with them. Held to the
// school's office hours in both directions (SAFEGUARDING rule 21).
//
// Every row here is a child this teacher already sees in their register, or a
// thread a colleague chose to give them — the same scoping as the queue. A
// teaching assistant who is not set up to message families is told so in
// words rather than shown an empty page (persona finding: "nothing says what
// a teaching assistant is allowed to do").
export default async function MessagesInbox() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [me, inbox] = await Promise.all([
    db.teacher.findUnique({ where: { id: user.teacher.id }, select: { role: true, mayMessageParents: true, schoolId: true } }),
    inboxForStaff(user.teacher.id),
  ]);
  const permitted = me ? resolveMayMessageParents(me) : false;

  // NOTICES (rule 24). Offered when the school is on a plan and this member of
  // staff may write to families — the school's per-staff switch, not the
  // conversations switch: a school that wants notices without a two-way channel
  // is a real case. `inboxForStaff` does not return the classes a teacher holds,
  // so they are loaded here for the picker; the action re-resolves them.
  const onSchoolPlan = me?.schoolId ? (await schoolMessaging(me.schoolId)).onSchoolPlan : false;
  const [heldClasses, sentNotices] =
    onSchoolPlan && permitted
      ? await Promise.all([
          db.class.findMany({ where: { teacherId: user.teacher.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
          noticesForTeacher(user.teacher.id),
        ])
      : [[], []];

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 32px 60px" }}>
      <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)", color: "var(--ink)" }}>Messages</h1>
      <p style={{ margin: "8px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 680 }}>
        Conversations with families about a child. Nothing is delivered outside the school&rsquo;s office hours — a parent who
        writes at nine at night is told it reaches you when the school opens, and your replies are held the same way.
      </p>

      {!me?.schoolId ? (
        <Notice>Parent messages come with a school plan: the school sets the office hours, and a teacher on their own has nobody to set them. There is nothing to do here.</Notice>
      ) : !inbox.available ? (
        <Notice>Parent messages aren&rsquo;t switched on for your school yet. Your school admin can turn them on, and set the office hours, on the school console.</Notice>
      ) : !permitted ? (
        <Notice>You aren&rsquo;t set up to message families. That is decided per member of staff by your school admin — ask them if you think you should be. Nothing here is broken.</Notice>
      ) : null}

      {onSchoolPlan && permitted && heldClasses.length > 0 && <SendClassNotice classes={heldClasses} sent={sentNotices} />}

      {inbox.rows.length > 0 && (
        <div style={{ marginTop: 22, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 16, overflow: "hidden" }}>
          {inbox.rows.map((r) => (
            <Link
              key={r.studentId}
              href={`/teacher/messages/${r.studentId}`}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #F5F0E6", textDecoration: "none", color: "var(--ink)" }}
            >
              <span>
                <span style={{ font: "700 16px var(--font-atkinson)" }}>{r.childName}</span>
                <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}> · {r.className}</span>
                {r.because !== "CLASS_TEACHER" && (
                  <span style={{ marginLeft: 8, font: "700 11px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {r.because === "HANDLER" ? "passed to you" : "shared with you"}
                  </span>
                )}
                {r.closed && <span style={{ marginLeft: 8, font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)" }}>closed by the school</span>}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {r.unread > 0 && (
                  <span aria-label={`${r.unread} new`} style={{ font: "700 13px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", borderRadius: 999, padding: "3px 10px" }}>{r.unread} new</span>
                )}
                <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>{r.lastMessageAtISO ? relativeDay(new Date(r.lastMessageAtISO)) : "nothing yet"}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {inbox.passed.length > 0 && (
        <section style={{ marginTop: 26 }} aria-labelledby="passed-heading">
          <h2 id="passed-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>Families you have passed to a colleague</h2>
          <p style={{ margin: "6px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>You don&rsquo;t see these conversations while a colleague holds them. Take one back at any time.</p>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {inbox.passed.map((p) => (
              <li key={p.studentId} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 12, padding: "10px 16px" }}>
                <span style={{ flex: 1, font: "400 15px var(--font-atkinson)", color: "var(--ink)" }}>
                  <strong>{p.childName}</strong> · {p.className} — with {p.handlerName}
                </span>
                <form action={takeFamilyBack}>
                  <input type="hidden" name="studentId" value={p.studentId} />
                  <button type="submit" style={{ font: "700 14px var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>Take back</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "22px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--ink-soft)", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 14, padding: "16px 20px", maxWidth: 680 }}>
      {children}
    </p>
  );
}
