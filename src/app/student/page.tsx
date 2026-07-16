import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LogoutForm } from "@/components/LogoutForm";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Sticker } from "@/components/stickers/Sticker";
import { readStickers } from "@/lib/stickers";
import { StickerArrival } from "./StickerArrival";

// Look of a moment by its kind.
const KIND = {
  PHOTO: { label: "photo", bg: "#D8ECE8", fallback: "My photo", icon: "camera" },
  DRAWING: { label: "drawing", bg: "#FBEED3", fallback: "My drawing", icon: "draw" },
  TEXT: { label: "my words", bg: "#F7E0E6", fallback: "My words", icon: "write" },
} as const satisfies Record<string, { label: string; bg: string; fallback: string; icon: IconName }>;

function kindOf(type: string) {
  return KIND[type as keyof typeof KIND] ?? KIND.PHOTO;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

// Each tile deep-links to the capture surface it names — no screen in between
// asking the child to choose again (SJ-03). The labels are the ones a child
// reads on their own jar, so the capture screens use the same words: the old
// add screen called these "Photo / Write / Draw" while the jar called them
// "Photo / Drawing / My words", which is two names for the same three things.
const ADD_BUTTONS: { href: string; icon: IconName; label: string; bg: string }[] = [
  { href: "/student/new/photo", icon: "camera", label: "Photo", bg: "#D8ECE8" },
  { href: "/student/new/drawing", icon: "draw", label: "Drawing", bg: "#FBEED3" },
  { href: "/student/new/words", icon: "write", label: "My words", bg: "#F7E0E6" },
];

export default async function StudentHome() {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { student } = user;

  const items = await db.journalItem.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
  });
  const published = items.filter((i) => i.status === "APPROVED");
  const inProgress = items.filter((i) => i.status !== "APPROVED");

  // A newly arrived sticker: the most recent approved moment with stickers the
  // child hasn't sent a heart back for yet. Shown as the big arrival panel.
  const arrived = published
    .filter((i) => readStickers(i.stickersJson).length > 0 && !i.stickerReply)
    .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0))[0];
  const teacherName = arrived
    ? (
        await db.class.findUnique({
          where: { id: student.classId },
          select: { teacher: { select: { displayName: true } } },
        })
      )?.teacher.displayName ?? "your teacher"
    : null;

  // How many assigned activities are still to do?
  const assignedIds = (
    await db.assignment.findMany({
      where: {
        status: "LIVE",
        OR: [
          { wholeClass: true, classId: student.classId },
          { wholeClass: false, students: { some: { studentId: student.id } } },
        ],
      },
      select: { id: true },
    })
  ).map((a) => a.id);
  const respondedIds = new Set(
    (
      await db.journalItem.findMany({
        // A RETURNED response counts as still "to do" — the teacher sent it back.
        where: { studentId: student.id, assignmentId: { not: null }, status: { not: "RETURNED" } },
        select: { assignmentId: true },
      })
    ).map((r) => r.assignmentId),
  );
  const todoCount = assignedIds.filter((id) => !respondedIds.has(id)).length;

  return (
    <div className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
      {/* header */}
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "22px 40px", background: "var(--cream)", borderBottom: "3px solid var(--ink)", flexWrap: "wrap" }}>
        <span style={{ width: 64, height: 64, borderRadius: "50%", background: student.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", font: "600 30px var(--font-fredoka)", color: "#FFFDF7", flexShrink: 0 }}>{student.name.charAt(0).toUpperCase()}</span>
        <div>
          <p style={{ margin: 0, font: "600 28px var(--font-fredoka)" }}>{student.name}&apos;s jar</p>
          <p style={{ margin: 0, font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>{student.className}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="46" height="58" viewBox="0 0 100 120" aria-label={`${published.length} moments in the jar`}>
            <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
            <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />
            {published.length > 0 && <rect x="24" y="92" width="17" height="17" rx="4" fill="#C2476B" transform="rotate(-6 32 100)" />}
            {published.length > 1 && <rect x="45" y="96" width="17" height="17" rx="4" fill="#F0B441" transform="rotate(5 53 104)" />}
            {published.length > 2 && <rect x="60" y="90" width="17" height="17" rx="4" fill="#37796f" transform="rotate(-4 68 98)" />}
            {published.length > 3 && <rect x="34" y="74" width="17" height="17" rx="4" fill="#8AB9D6" transform="rotate(4 42 82)" />}
            {published.length > 4 && <rect x="54" y="72" width="17" height="17" rx="4" fill="#A6C979" transform="rotate(-5 62 80)" />}
          </svg>
          <span style={{ font: "600 20px var(--font-fredoka)", color: "#37796f" }}>{published.length} {published.length === 1 ? "moment" : "moments"}</span>
          <LogoutForm>
            <button type="submit" style={{ minHeight: 56, display: "inline-flex", alignItems: "center", font: "700 18px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "3px solid #C9C2B0", borderRadius: 999, padding: "8px 24px", cursor: "pointer", marginLeft: 14 }}>Bye bye 👋</button>
          </LogoutForm>
        </div>
      </header>

      <div style={{ flex: 1, overflow: "auto", padding: "30px 40px 50px", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        {/* a new sticker just arrived (design 1d) */}
        {arrived && (
          <div style={{ marginBottom: 22 }}>
            <StickerArrival
              itemId={arrived.id}
              childName={student.name}
              avatarColor={student.avatarColor}
              teacherName={teacherName ?? "your teacher"}
              note={arrived.praiseNote}
              stickers={readStickers(arrived.stickersJson).map((s) => s.k)}
              moment={{
                mediaPath: arrived.mediaPath,
                text: arrived.textContent,
                title: arrived.caption || kindOf(arrived.type).fallback,
                dateLabel: formatDate(arrived.createdAt),
                bandBg: kindOf(arrived.type).bg,
                icon: kindOf(arrived.type).icon,
              }}
            />
          </div>
        )}

        {/* add to my jar */}
        <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: "24px 30px", boxShadow: "var(--pop-shadow)" }}>
          <p style={{ margin: "0 0 16px", font: "600 30px var(--font-fredoka)" }}>Add to my jar</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            {ADD_BUTTONS.map((b) => (
              <Link key={b.href} href={b.href} className="sj-addtile" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 88, background: b.bg, border: "3px solid var(--ink)", borderRadius: 16, textDecoration: "none", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
                <Icon name={b.icon} size={40} decorative />
                <span style={{ font: "600 27px var(--font-fredoka)", color: "var(--ink)" }}>{b.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* my activities (kept from the app — assigned tasks) */}
        <Link href="/student/activities" className="sj-addtile" style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 16, padding: "16px 24px", textDecoration: "none", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
          <Icon name="add-file" size={30} decorative />
          <span style={{ flex: 1, font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>My activities</span>
          {todoCount > 0 ? (
            <span style={{ background: "#FBEED3", border: "2px solid var(--ink)", borderRadius: 999, padding: "4px 16px", font: "700 15px var(--font-atkinson)", color: "#8A5F1E" }}>{todoCount} to do</span>
          ) : (
            <span style={{ font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>All done ✓</span>
          )}
        </Link>

        {/* waiting strips */}
        {inProgress.map((item) => {
          const k = kindOf(item.type);
          const waiting = item.status === "PENDING";
          // A sent-back activity is a live link back into it, so the child can
          // reopen and try again. (A sent-back free drawing has no run to reopen.)
          const canRetry = !waiting && !!item.assignmentId;
          const strip = (
            <>
              <div style={{ width: 64, height: 64, borderRadius: 12, background: "repeating-linear-gradient(45deg, #FFFDF7, #FFFDF7 10px, #F6E4BE 10px, #F6E4BE 20px)", border: "3px solid var(--ink)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true"><Icon name={k.icon} size={30} decorative /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>{item.caption || k.fallback}</p>
                <p style={{ margin: "2px 0 0", font: "400 17px var(--font-atkinson)", color: "#8A5F1E" }}>
                  {waiting ? "Waiting for your teacher to see it ⏳" : "Have another go — your teacher sent it back ✏️"}
                </p>
              </div>
              {canRetry && (
                <span style={{ flexShrink: 0, background: "#37796f", color: "#FFFDF7", border: "3px solid var(--ink)", borderRadius: 999, padding: "8px 20px", font: "700 17px var(--font-atkinson)" }}>Try again</span>
              )}
            </>
          );
          const stripStyle = { display: "flex", alignItems: "center", gap: 16, marginTop: 22, background: "#FBEED3", border: "3px dashed #C9A87C", borderRadius: 16, padding: "16px 24px" } as const;
          return canRetry ? (
            <Link key={item.id} href={`/student/activities/${item.assignmentId}`} className="sj-addtile" style={{ ...stripStyle, textDecoration: "none", color: "var(--ink)" }}>
              {strip}
            </Link>
          ) : (
            <div key={item.id} style={stripStyle}>
              {strip}
            </div>
          );
        })}

        {/* timeline */}
        <p style={{ margin: "34px 0 16px", font: "600 26px var(--font-fredoka)" }}>My moments</p>
        {published.length === 0 ? (
          <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, padding: "50px 20px", textAlign: "center", boxShadow: "var(--pop-shadow)" }}>
            <Icon name="jar" size={52} decorative />
            <p style={{ margin: "10px 0 0", font: "600 22px var(--font-fredoka)" }}>Your jar is empty</p>
            <p style={{ margin: "4px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>Add your first moment above!</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 22 }}>
            {published.map((item) => {
              const k = kindOf(item.type);
              const stickers = readStickers(item.stickersJson);
              return (
                <div key={item.id} style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
                  <div style={{ height: 190, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    {item.mediaPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.mediaPath} alt={item.caption || k.fallback} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : item.textContent ? (
                      <p style={{ margin: 0, padding: "18px 22px", font: "400 18px/1.5 var(--font-atkinson)", color: "var(--ink)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>{item.textContent}</p>
                    ) : (
                      <Icon name={k.icon} size={64} decorative />
                    )}
                    <span style={{ position: "absolute", top: 12, right: 12, background: "#FFFDF7", border: "2px solid var(--ink)", borderRadius: 999, padding: "3px 12px", font: "700 13px var(--font-atkinson)" }}>{k.label}</span>
                    {/* the teacher's stickers stay peeled onto the work */}
                    {stickers.map((s, i) => {
                      const spot = [
                        { top: 8, left: 8, tilt: "-9deg" },
                        { top: 56, left: 20, tilt: "7deg" },
                        { top: 12, left: 62, tilt: "-6deg" },
                        { top: 62, left: 74, tilt: "8deg" },
                      ][i] ?? { top: 8, left: 8, tilt: "-9deg" };
                      return (
                        <span key={s.k} title={s.label} style={{ position: "absolute", top: spot.top, left: spot.left, transform: `rotate(${spot.tilt})` }}>
                          <Sticker k={s.k} size={44} />
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ padding: "14px 18px 18px" }}>
                    <p style={{ margin: 0, font: "600 21px var(--font-fredoka)" }}>{item.caption || k.fallback}</p>
                    <p style={{ margin: "4px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>{formatDate(item.createdAt)}</p>
                    {item.praiseNote && (
                      <p style={{ margin: "8px 0 0", font: "400 15px/1.4 var(--font-atkinson)", color: "var(--ink-soft)" }}>💬 “{item.praiseNote}”</p>
                    )}
                    {item.stickerReply === "HEART" && (
                      <p style={{ margin: "6px 0 0", font: "700 14px var(--font-atkinson)", color: "var(--jam)" }}>💛 You sent a heart back</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
