import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LogoutForm } from "@/components/LogoutForm";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Sticker } from "@/components/stickers/Sticker";
import { readStickers } from "@/lib/stickers";
import { studentCopy } from "@/lib/copy/student";
import { avatarInk } from "@/lib/avatar";
import { StickerArrival } from "./StickerArrival";
import { JarStatus, JarSummary } from "./JarStatus";
import { StatusStrip } from "./StatusStrip";
import { MarkSeenOnView } from "./MarkSeenOnView";

// Look of a moment by its kind.
const KIND = {
  PHOTO: { label: "photo", bg: "#D8ECE8", fallback: "My photo", icon: "camera" },
  DRAWING: { label: "drawing", bg: "#FBEED3", fallback: "My drawing", icon: "draw" },
  TEXT: { label: "my words", bg: "#F7E0E6", fallback: "My words", icon: "write" },
  AUDIO: { label: "voice", bg: "#EAF4F1", fallback: "My voice", icon: "voice" },
} as const satisfies Record<string, { label: string; bg: string; fallback: string; icon: IconName }>;

// Which item types carry an on-screen IMAGE (vs an audio player or plain text).
const isImageType = (type: string) => type === "PHOTO" || type === "DRAWING";

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
  { href: "/student/new/audio", icon: "voice", label: "Voice", bg: "#EAF4F1" },
  { href: "/student/new/words", icon: "write", label: "My words", bg: "#F7E0E6" },
];

export default async function StudentHome() {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { student } = user;
  // This class's register (SJ-06) — resolved once, on the session.
  const mode = student.ageMode;
  const c = studentCopy(mode);

  const items = await db.journalItem.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
  });
  const published = items.filter((i) => i.status === "APPROVED");
  const inProgress = items.filter((i) => i.status !== "APPROVED");
  const waitingCount = inProgress.filter((i) => i.status === "PENDING").length;

  // When did this child last look at their jar? The session carries only their
  // identity, so read it here. Approval happens while they're away, so anything
  // approved since then is news to them and falls in when they look (M2).
  const seen = await db.student.findUnique({
    where: { id: student.id },
    select: { jarSeenAt: true },
  });
  const justArrivedCount = published.filter(
    (i) => i.approvedAt && (!seen?.jarSeenAt || i.approvedAt > seen.jarSeenAt),
  ).length;

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
    <div className="sj" data-ks={mode} style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
      {/* header */}
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "22px 40px", background: "var(--cream)", borderBottom: "3px solid var(--ink)", flexWrap: "wrap" }}>
        <span style={{ width: 64, height: 64, borderRadius: "50%", background: student.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", font: "600 calc(30px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: avatarInk(student.avatarColor), flexShrink: 0 }}>{student.name.charAt(0).toUpperCase()}</span>
        <div>
          <p style={{ margin: 0, font: "600 calc(28px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>{c.home.title(student.name)}</p>
          <p style={{ margin: 0, font: "400 calc(17px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)" }}>{student.className}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {/* Younger children get the jar: the jar IS the status — what's in,
              what's balanced on the rim waiting, and what just dropped in while
              they were away (SJ-04 / M2). Older children get a journal: no jar
              picture, just a plain count; the status of each moment still reads
              from its strip below (SJ-04's tag + sentence + read-aloud), and the
              "dropped in" moment becomes a quiet "Added ✓" tag on the grid. */}
          {mode === "KS2" ? (
            <>
              <MarkSeenOnView when={justArrivedCount > 0} />
              <span style={{ font: "600 calc(18px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "#37796f" }}>{c.home.count(published.length)}</span>
            </>
          ) : (
            <>
              <JarStatus inJar={published.length} waiting={waitingCount} arrived={justArrivedCount} />
              <JarSummary inJar={published.length} waiting={waitingCount} />
            </>
          )}
          <LogoutForm>
            <button type="submit" style={{ minHeight: 64, display: "inline-flex", alignItems: "center", font: "700 calc(18px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "3px solid #C9C2B0", borderRadius: 999, padding: "8px 24px", cursor: "pointer", marginLeft: 14 }}>{c.home.signOut}</button>
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
                // The arrival mini-card shows an image thumbnail; a voice note
                // has none, so it falls back to the voice icon (its player lives
                // on the timeline card below).
                mediaPath: isImageType(arrived.type) ? arrived.mediaPath : null,
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
          <p style={{ margin: "0 0 16px", font: "600 calc(30px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>{c.add.submit}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 18 }}>
            {ADD_BUTTONS.map((b) => (
              <Link key={b.href} href={b.href} className="sj-addtile" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 88, background: b.bg, border: "3px solid var(--ink)", borderRadius: 16, textDecoration: "none", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
                <Icon name={b.icon} size={40} decorative />
                <span style={{ font: "600 calc(27px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--ink)" }}>{b.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* my activities (kept from the app — assigned tasks) */}
        <Link href="/student/activities" className="sj-addtile" style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 16, padding: "16px 24px", textDecoration: "none", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
          <Icon name="add-file" size={30} decorative />
          <span style={{ flex: 1, font: "600 calc(22px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--ink)" }}>My activities</span>
          {todoCount > 0 ? (
            <span style={{ background: "#FBEED3", border: "2px solid var(--ink)", borderRadius: 999, padding: "4px 16px", font: "700 calc(15px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "#8A5F1E" }}>{todoCount} to do</span>
          ) : (
            <span style={{ font: "400 calc(16px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)" }}>All done ✓</span>
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
                <p style={{ margin: 0, font: "600 calc(22px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>{item.caption || k.fallback}</p>
                <StatusStrip returned={!waiting} mode={mode} />
              </div>
              {canRetry && (
                <span style={{ flexShrink: 0, background: "#37796f", color: "#FFFDF7", border: "3px solid var(--ink)", borderRadius: 999, padding: "8px 20px", font: "700 calc(17px * var(--sj-type-scale, 1)) var(--font-atkinson)" }}>{c.status.tryAgain}</span>
              )}
            </>
          );
          // M4: a sent-back moment pulses once on first sight — it's the one
          // thing here that needs the child. A waiting one rests: it needs
          // nothing from them, and a jar that keeps twitching is a jar you
          // stop reading.
          const stripStyle = { display: "flex", alignItems: "center", gap: 16, marginTop: 22, background: "#FBEED3", border: "3px dashed #C9A87C", borderRadius: 16, padding: "16px 24px" } as const;
          return canRetry ? (
            <Link key={item.id} href={`/student/activities/${item.assignmentId}`} className="sj-addtile" data-returned-beacon="true" style={{ ...stripStyle, textDecoration: "none", color: "var(--ink)" }}>
              {strip}
            </Link>
          ) : (
            <div key={item.id} data-returned-beacon={!waiting ? "true" : undefined} style={stripStyle}>
              {strip}
            </div>
          );
        })}

        {/* timeline */}
        <p style={{ margin: "34px 0 16px", font: "600 calc(26px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>My moments</p>
        {published.length === 0 ? (
          <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, padding: "50px 20px", textAlign: "center", boxShadow: "var(--pop-shadow)" }}>
            <Icon name={mode === "KS2" ? "add-file" : "jar"} size={52} decorative />
            <p style={{ margin: "10px 0 0", font: "600 calc(22px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>{c.home.emptyHeading}</p>
            <p style={{ margin: "4px 0 0", font: "400 calc(16px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)" }}>{c.home.emptyHelp}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 22 }}>
            {published.map((item) => {
              const k = kindOf(item.type);
              const stickers = readStickers(item.stickersJson);
              // Older children have no jar for a moment to drop into, so an item
              // approved while they were away wears a quiet "Added ✓" tag instead
              // (M2). MarkSeenOnView clears it once they've looked.
              const justArrived =
                mode === "KS2" && !!item.approvedAt && (!seen?.jarSeenAt || item.approvedAt > seen.jarSeenAt);
              return (
                <div key={item.id} style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}>
                  <div style={{ height: 190, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    {item.type === "AUDIO" && item.mediaPath ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 16px" }}>
                        <Icon name="voice" size={44} decorative />
                        <audio src={item.mediaPath} controls preload="none" aria-label={item.caption || k.fallback} style={{ width: "100%", maxWidth: 240 }} />
                      </div>
                    ) : isImageType(item.type) && item.mediaPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.mediaPath} alt={item.caption || k.fallback} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : item.textContent ? (
                      <p style={{ margin: 0, padding: "18px 22px", font: "400 calc(18px * var(--sj-type-scale, 1))/1.5 var(--font-atkinson)", color: "var(--ink)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>{item.textContent}</p>
                    ) : (
                      <Icon name={k.icon} size={64} decorative />
                    )}
                    <span style={{ position: "absolute", top: 12, right: 12, background: "#FFFDF7", border: "2px solid var(--ink)", borderRadius: 999, padding: "3px 12px", font: "700 calc(13px * var(--sj-type-scale, 1)) var(--font-atkinson)" }}>{k.label}</span>
                    {justArrived && (
                      <span style={{ position: "absolute", top: 12, left: 12, background: "#37796f", color: "#FFFDF7", border: "2px solid var(--ink)", borderRadius: 999, padding: "3px 12px", font: "700 calc(13px * var(--sj-type-scale, 1)) var(--font-atkinson)" }}>{c.home.arrivedBadge}</span>
                    )}
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
                    <p style={{ margin: 0, font: "600 calc(21px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>{item.caption || k.fallback}</p>
                    <p style={{ margin: "4px 0 0", font: "400 calc(15px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)" }}>{formatDate(item.createdAt)}</p>
                    {item.praiseNote && (
                      <p style={{ margin: "8px 0 0", font: "400 calc(15px * var(--sj-type-scale, 1))/1.4 var(--font-atkinson)", color: "var(--ink-soft)" }}>💬 “{item.praiseNote}”</p>
                    )}
                    {item.stickerReply === "HEART" && (
                      <p style={{ margin: "6px 0 0", font: "700 calc(14px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--jam)" }}>💛 You sent a heart back</p>
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
