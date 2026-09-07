import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { markReadByStaff, threadForStaff } from "@/lib/messaging/threads";
import { sendStaffMessage } from "@/app/actions/messaging";
import { ThreadPanel } from "@/components/messaging/ThreadPanel";
import { StaffThreadControls } from "./StaffThreadControls";

// One family's conversation, as a member of staff sees it.
//
// Reached only by the class teacher (unless they have passed the family on),
// the colleague holding it, or a colleague it was shared with — resolved in
// threads.ts from the session and the child, never from a thread id on the
// URL. Anyone else gets a 404, which says nothing about whether the child
// exists (SAFEGUARDING rules 4 and 8).
export default async function StaffThreadPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const view = await threadForStaff(user.teacher.id, studentId);
  if (!view) notFound();
  await markReadByStaff(user.teacher.id, studentId);

  const readerNames = view.readers.map((r) => (r.id === user.teacher.id ? `${r.name} (you)` : r.name));

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 32px 60px" }}>
      <p style={{ margin: 0 }}>
        <Link href="/teacher/messages" style={{ font: "700 14px var(--font-atkinson)", color: "var(--sj-muted)", textDecoration: "none" }}>← Messages</Link>
      </p>
      <h1 style={{ margin: "8px 0 0", font: "600 30px var(--font-fredoka)", color: "var(--ink)" }}>{view.childName}&rsquo;s family</h1>
      <p style={{ margin: "6px 0 0", font: "400 15px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        {view.className} · at home: {view.families.length > 0 ? view.families.join(", ") : "no family linked yet"} · who can see this: {readerNames.join(", ")}
        {view.handlerName && <> · <strong>held by {view.handlerName}</strong></>}
      </p>

      <div style={{ marginTop: 20, background: "var(--paper)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "18px 20px" }}>
        <ThreadPanel
          view={view}
          viewer="STAFF"
          send={sendStaffMessage}
          emergencyLine="Families are told messages here aren’t for emergencies and to phone the office. Anything urgent about a child goes through the school’s usual route, not this box."
          emptyLine={`Nothing has been said yet. Write to ${view.childName}’s family — they will see it in their family space.`}
        />
      </div>

      <StaffThreadControls
        studentId={view.studentId}
        childName={view.childName}
        meId={user.teacher.id}
        standing={view.standing}
        readers={view.readers}
        colleagues={view.colleagues}
      />
    </main>
  );
}
