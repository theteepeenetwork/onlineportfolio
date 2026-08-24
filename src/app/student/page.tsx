import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LogoutForm } from "@/components/LogoutForm";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Sticker } from "@/components/stickers/Sticker";
import { readStickers } from "@/lib/stickers";
import { workCover, workPages } from "@/lib/journalMedia";
import { momentTitle } from "@/lib/momentTitle";
import { jsonArray } from "@/lib/activities";
import { MomentRecord } from "./MomentRecord";
import { studentCopy } from "@/lib/copy/student";
import { avatarInk } from "@/lib/avatar";
import { StickerArrival } from "./StickerArrival";
import { JarStatus, JarSummary } from "./JarStatus";
import { StatusStrip } from "./StatusStrip";
import { MarkSeenOnView } from "./MarkSeenOnView";
import { AddToJar } from "./AddToJar";
import { MyActivities } from "./MyActivities";
import { EyfsHome } from "./registers/EyfsHome";
import { TeacherNote } from "./TeacherNote";

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
    // The activity a moment came from is what it is CALLED (see momentTitle).
    include: { assignment: { select: { title: true } } },
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

  // A newly arrived sticker: the most recent stickered moment approved since the
  // child last looked at their jar. Shown as the big arrival panel.
  //
  // What dismisses it changed on 2026-08-24. It used to be the child's heart
  // reply — the panel stayed until they tapped it — and when that reply was
  // removed, nothing was left to retire the panel, so a card headed "A new
  // sticker just arrived" would have sat there for ever. `jarSeenAt` is the
  // right marker and was already in this file two lines up: it is exactly "has
  // this child looked since". Historic rows still carry `stickerReply` and are
  // excluded, so a child who hearted something before the removal does not have
  // it resurface as new.
  const arrived = published
    .filter(
      (i) =>
        readStickers(i.stickersJson).length > 0 &&
        !i.stickerReply &&
        i.approvedAt &&
        (!seen?.jarSeenAt || i.approvedAt > seen.jarSeenAt),
    )
    .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0))[0];
  const teacherName = arrived
    ? (
        await db.class.findUnique({
          where: { id: student.classId },
          select: { teacher: { select: { displayName: true } } },
        })
      )?.teacher.displayName ?? "your teacher"
    : null;

  // Assigned activities, newest first — carrying enough to render each as a
  // preview card (title + instructions), not just a count.
  const assigned = await db.assignment.findMany({
    where: {
      status: "LIVE",
      OR: [
        { wholeClass: true, classId: student.classId },
        { wholeClass: false, students: { some: { studentId: student.id } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, instructions: true, previewSnapshotJson: true },
  });
  const respondedIds = new Set(
    (
      await db.journalItem.findMany({
        // A RETURNED response counts as still "to do" — the teacher sent it back.
        where: { studentId: student.id, assignmentId: { not: null }, status: { not: "RETURNED" } },
        select: { assignmentId: true },
      })
    ).map((r) => r.assignmentId),
  );
  // The still-to-do list (assigned and not handed in), newest first. The home
  // shows the 3 most recent as cards and hides the rest behind a toggle.
  const todoActivities = assigned.filter((a) => !respondedIds.has(a.id));

  // EYFS (3–5) gets its own icon-only register (design 6a). It renders the same
  // server data — approved moments, waiting count, to-do count — through the
  // pre-reader shell (EyfsHome). Only serialisable, this-child-only fields cross
  // to the client; no teacher or other-child data (SAFEGUARDING rule 4). KS1/KS2
  // keep the layout below.
  if (mode === "EYFS") {
    return (
      <EyfsHome
        mode={mode}
        student={{ id: student.id, name: student.name, avatarColor: student.avatarColor, className: student.className }}
        moments={published.map((i) => ({
          id: i.id,
          type: i.type,
          title: momentTitle(i, kindOf(i.type).fallback),
          dateLabel: formatDate(i.createdAt),
          mediaPath: isImageType(i.type) ? workCover(i) : null,
          textContent: i.textContent,
          bandBg: kindOf(i.type).bg,
          // The teacher's feedback the child gets to see (owner decision: EYFS
          // keeps the sticker/praise payoff). Same scoping as every field here —
          // this child's own approved moment only.
          stickers: readStickers(i.stickersJson).map((s) => s.k),
          praiseNote: i.praiseNote,
        }))}
        jarCount={published.length}
        waitingCount={waitingCount}
        activitiesCount={todoActivities.length}
        // Work the teacher has sent back, with what they asked for (F38). The
        // youngest register used to show none of this: a three-year-old got no
        // strip, no note and no way back into the activity. Same scoping as
        // every other field here — this child's own moments only.
        returned={inProgress
          .filter((i) => i.status === "RETURNED")
          .map((i) => ({
            id: i.id,
            title: momentTitle(i, kindOf(i.type).fallback),
            note: i.teacherNote,
            assignmentId: i.assignmentId,
          }))}
      />
    );
  }

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
                mediaPath: isImageType(arrived.type) ? workCover(arrived) : null,
                text: arrived.textContent,
                title: momentTitle(arrived, kindOf(arrived.type).fallback),
                dateLabel: formatDate(arrived.createdAt),
                bandBg: kindOf(arrived.type).bg,
                icon: kindOf(arrived.type).icon,
              }}
            />
          </div>
        )}

        {/* add to my jar — tiles open their capture surface inline (accordion);
            Drawing keeps its dedicated full-screen canvas. */}
        <AddToJar mode={mode} studentId={student.id} />

        {/* my activities — the 3 most recent to-do as preview cards, with a
            "Show more" toggle for the rest. */}
        <MyActivities
          activities={todoActivities.map((a) => ({
            id: a.id,
            title: a.title,
            instructions: a.instructions,
            previewPath: jsonArray(a.previewSnapshotJson)[0] ?? null,
          }))}
        />

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
                <p style={{ margin: 0, font: "600 calc(22px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>{momentTitle(item, k.fallback)}</p>
                <StatusStrip returned={!waiting} mode={mode} />
                {/* What the teacher actually asked for (F38). The tag above says
                    something came back; this says WHICH part to change, which is
                    the half the child was never shown. */}
                {!waiting && item.teacherNote && <TeacherNote note={item.teacherNote} mode={mode} />}
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
          // One record per row, not a grid of thumbnails: this is the screen
          // that shows a child what they have made, and 280px of cropped page
          // one was not showing it. See MomentRecord.
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {published.map((item) => {
              const k = kindOf(item.type);
              const stickers = readStickers(item.stickersJson);
              // Older children have no jar for a moment to drop into, so an item
              // approved while they were away wears a quiet "Added ✓" tag instead
              // (M2). MarkSeenOnView clears it once they've looked.
              const justArrived =
                mode === "KS2" && !!item.approvedAt && (!seen?.jarSeenAt || item.approvedAt > seen.jarSeenAt);
              const title = momentTitle(item, k.fallback);
              return (
                <MomentRecord
                  key={item.id}
                  title={title}
                  dateLabel={formatDate(item.createdAt)}
                  bandBg={k.bg}
                  kindLabel={k.label}
                  pages={isImageType(item.type) ? workPages(item) : []}
                  alt={title}
                  audioSrc={item.type === "AUDIO" ? item.mediaPath : null}
                  textContent={item.textContent}
                  emptyIcon={<Icon name={k.icon} size={64} decorative />}
                  praiseNote={item.praiseNote}
                  arrivedBadge={
                    justArrived ? (
                      <span style={{ background: "#37796f", color: "#FFFDF7", border: "2px solid var(--ink)", borderRadius: 999, padding: "3px 12px", font: "700 calc(13px * var(--sj-type-scale, 1)) var(--font-atkinson)" }}>{c.home.arrivedBadge}</span>
                    ) : null
                  }
                  stickers={stickers.map((sk, i) => {
                    const spot = [
                      { top: 8, left: 8, tilt: "-9deg" },
                      { top: 56, left: 20, tilt: "7deg" },
                      { top: 12, left: 62, tilt: "-6deg" },
                      { top: 62, left: 74, tilt: "8deg" },
                    ][i] ?? { top: 8, left: 8, tilt: "-9deg" };
                    return (
                      <span key={sk.k} title={sk.label} style={{ position: "absolute", top: spot.top, left: spot.left, transform: `rotate(${spot.tilt})` }}>
                        <Sticker k={sk.k} size={44} />
                      </span>
                    );
                  })}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
