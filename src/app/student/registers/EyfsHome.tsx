"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/Icon";
import { LogoutForm } from "@/components/LogoutForm";
import { studentCopy } from "@/lib/copy/student";
import { avatarInk } from "@/lib/avatar";
import type { AgeMode } from "@/lib/ageMode";
import { readAloud } from "@/lib/readAloud";
import { useSpeechReady } from "@/lib/useSpeechReady";
import { CaptureSurface, type CaptureType } from "./CaptureSurface";

// EYFS (3–5) — design 6a, "Make first, icon-only".
//
// The youngest, most locked-down register: no reading is required to use it. A
// spoken greeting is the header; four giant icon-only tiles fill the screen;
// tapping one folds the tiles to a strip and unfolds its capture beneath (the
// shared CaptureSurface). The jar bar sits at the bottom and unfolds into a
// scrollable window of the child's approved moments. One motion language — things
// fold and unfold in place, nothing slides sideways, no page navigation to
// capture. Capture still lands PENDING in the approval queue (SAFEGUARDING 3);
// this is only the child-facing shell around the same server action.

// A moment as this client shell needs it — already serialised by the server
// (dates → strings, only the fields shown here). No teacher/other-child data.
export type EyfsMoment = {
  id: string;
  type: string; // PHOTO | DRAWING | TEXT | AUDIO
  title: string;
  dateLabel: string;
  mediaPath: string | null;
  textContent: string | null;
  bandBg: string;
};

type Surface = "photo" | "draw" | "voice" | "words";
type Open = Surface | "jar" | null;

// The four tiles. Icon-only for pre-readers; the aria-label carries the word for
// assistive tech. Fills are the register tints.
const TILES: { surface: Surface; icon: IconName; label: string; bg: string }[] = [
  { surface: "photo", icon: "camera", label: "photo", bg: "var(--glass-light)" },
  { surface: "draw", icon: "draw", label: "draw", bg: "var(--honey-tint)" },
  { surface: "voice", icon: "voice", label: "voice", bg: "var(--glass-jar)" },
  { surface: "words", icon: "write", label: "words", bg: "#F7E0E6" },
];

// The capture form's type, keyed by surface (draw never posts inline).
const CAPTURE_TYPE: Record<"photo" | "voice" | "words", CaptureType> = {
  photo: "PHOTO",
  voice: "AUDIO",
  words: "TEXT",
};

// grid-rows fold — no JS height measuring. The reduced-motion catch-all in
// globals.css collapses the transition to ~0ms (SAFEGUARDING rule 18).
function foldWrap(open: boolean): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateRows: open ? "1fr" : "0fr",
    transition: "grid-template-rows .34s cubic-bezier(.4,0,.2,1)",
  };
}

export function EyfsHome({
  mode,
  student,
  moments,
  jarCount,
  waitingCount,
  activitiesCount,
}: {
  mode: AgeMode;
  student: { name: string; avatarColor: string; className: string };
  moments: EyfsMoment[];
  jarCount: number;
  waitingCount: number;
  activitiesCount: number;
}) {
  const [open, setOpen] = useState<Open>(null);
  const c = studentCopy(mode);
  const speechReady = useSpeechReady();

  const captureOpen = open === "photo" || open === "draw" || open === "voice" || open === "words";
  const toggle = (s: Open) => setOpen((cur) => (cur === s ? null : s));
  const close = () => setOpen(null);

  const surfaceTitle: Record<Surface, string> = {
    photo: c.add.photoHeading,
    draw: c.add.drawInline,
    voice: c.add.audioHeading,
    words: c.add.wordsHeading,
  };

  return (
    <div
      className="sj"
      data-ks={mode}
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* 1 — greeting row (the EYFS header). The 🔊 speaks a fixed, name-free
          "Hello!" — never the child's name (SAFEGUARDING 10/11). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: "28px 40px 6px" }}>
        <span style={{ width: 88, height: 88, borderRadius: "50%", background: student.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", font: "600 42px var(--font-fredoka)", color: avatarInk(student.avatarColor), flexShrink: 0 }}>
          {student.name.charAt(0).toUpperCase()}
        </span>
        <h1 style={{ margin: 0, font: "600 48px var(--font-fredoka)" }}>{c.home.greeting(student.name)}</h1>
        {speechReady && (
          <button
            type="button"
            aria-label={c.status.hearIt}
            onClick={() => readAloud(c.home.greetingSpoken)}
            style={{ minHeight: 64, minWidth: 64, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 999, fontSize: 22, cursor: "pointer" }}
          >
            <span aria-hidden="true">🔊</span>
          </button>
        )}
      </div>

      {/* 2 — activities strip: icon + count + one word, no sentence (pre-readers).
          Only shown when there's something to do. */}
      {activitiesCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "16px 48px 0", background: "var(--honey-tint)", border: "3px dashed var(--kraft)", borderRadius: 16, padding: "12px 22px" }}>
          <Icon name="class" size={36} decorative />
          <span style={{ font: "700 30px var(--font-atkinson)", color: "var(--honey-ink)" }}>{activitiesCount}</span>
          <Link
            href="/student/activities"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, background: "var(--glass)", color: "var(--paper)", border: "3px solid var(--ink)", borderRadius: 999, padding: "10px 24px", font: "700 18px var(--font-atkinson)", textDecoration: "none", minHeight: 56, boxSizing: "border-box" }}
          >
            {c.home.startActivities}
            <Icon name="next" size={18} decorative />
          </Link>
        </div>
      )}

      {/* 3 — the four capture tiles. 2×2 giant tiles; when a capture opens they
          re-lay to a single row of four small tiles (icon-only either way). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: captureOpen ? "repeat(4, 1fr)" : "1fr 1fr",
          gap: captureOpen ? 16 : 22,
          margin: "22px 48px 0",
        }}
      >
        {TILES.map((t) => {
          const isOpen = open === t.surface;
          return (
            <button
              key={t.surface}
              type="button"
              onClick={() => toggle(t.surface)}
              aria-label={t.label}
              aria-expanded={isOpen}
              className="sj-addtile"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: captureOpen ? 110 : 230,
                background: t.bg,
                border: "3px solid var(--ink)",
                borderRadius: 24,
                cursor: "pointer",
                boxShadow: "0 6px 0 rgba(34,48,74,0.12)",
                transition: "height .34s cubic-bezier(.4,0,.2,1)",
                outline: isOpen ? "4px solid var(--glass)" : "none",
                outlineOffset: 3,
              }}
            >
              <Icon name={t.icon} size={captureOpen ? 48 : 84} decorative />
            </button>
          );
        })}
      </div>

      {/* 4 — the capture surfaces, each in its own fold so height can animate.
          Photo/voice/words use the shared CaptureSurface; drawing hands off to
          the full-screen canvas via a one-line card. Mounted only while open so
          the camera/mic tear down on close. */}
      {(["photo", "voice", "words"] as const).map((s) => (
        <div key={s} style={{ ...foldWrap(open === s), margin: open === s ? "22px 48px 0" : "0 48px" }}>
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {open === s && (
              <CaptureSurface
                type={CAPTURE_TYPE[s]}
                mode={mode}
                size="eyfs"
                title={surfaceTitle[s]}
                submitLabel={c.add.submit}
                onClose={close}
              />
            )}
          </div>
        </div>
      ))}
      <div style={{ ...foldWrap(open === "draw"), margin: open === "draw" ? "22px 48px 0" : "0 48px" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: "24px 30px", boxShadow: "var(--pop-shadow)", position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
            <button type="button" onClick={close} aria-label={c.add.close} style={{ position: "absolute", top: 16, right: 16, width: 64, height: 64, borderRadius: "50%", background: "var(--paper)", border: "3px solid var(--ink)", font: "700 22px var(--font-atkinson)", color: "var(--ink)", cursor: "pointer", lineHeight: 1 }}>
              <span aria-hidden="true">✕</span>
            </button>
            <Icon name="draw" size={40} decorative />
            <span style={{ flex: 1, font: "600 24px var(--font-fredoka)", paddingRight: 72 }}>{c.add.drawInline}</span>
            <Link href="/student/new/drawing" style={{ display: "inline-flex", alignItems: "center", minHeight: 64, font: "600 22px var(--font-fredoka)", color: "var(--paper)", background: "var(--jam)", border: "3px solid var(--ink)", borderRadius: 999, padding: "10px 26px", boxShadow: "0 4px 0 var(--jam-deep)", textDecoration: "none" }}>
              {c.add.drawOpen}
            </Link>
          </div>
        </div>
      </div>

      {/* 5 — the jar bar, pinned toward the bottom. Tapping it flips the chevron
          and unfolds a scrollable window of the child's moments (same fold). */}
      <div style={{ margin: "22px 48px 32px", marginTop: "auto" }}>
        <button
          type="button"
          onClick={() => toggle("jar")}
          aria-expanded={open === "jar"}
          aria-label={c.status.inTheJar}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 24, padding: "14px 32px", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, cursor: "pointer", boxShadow: "var(--pop-shadow)", boxSizing: "border-box", textAlign: "left" }}
        >
          <JarMark />
          <span style={{ font: "600 44px var(--font-fredoka)", color: "var(--glass)" }}>{jarCount}</span>
          {waitingCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 8, padding: "3px 12px", font: "600 18px var(--font-fredoka)", color: "var(--honey-ink)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" fill="none" stroke="#8A5F1E" strokeWidth="2.2" />
                <path d="M12 7.5V12l3 2" fill="none" stroke="#8A5F1E" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              {waitingCount}
            </span>
          )}
          <span style={{ marginLeft: "auto", width: 64, height: 64, borderRadius: "50%", background: "var(--glass-light)", border: "3px solid var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "transform .34s cubic-bezier(.4,0,.2,1)", transform: open === "jar" ? "rotate(180deg)" : "none" }}>
            <Icon name="next" size={26} decorative style={{ transform: "rotate(90deg)" }} />
          </span>
        </button>

        <div style={foldWrap(open === "jar")}>
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            <div style={{ marginTop: 16, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: "20px 24px", boxShadow: "var(--pop-shadow)" }}>
              {moments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 10px" }}>
                  <Icon name="jar" size={52} decorative />
                  <p style={{ margin: "10px 0 0", font: "600 22px var(--font-fredoka)" }}>{c.home.emptyHeading}</p>
                </div>
              ) : (
                <div style={{ maxHeight: 430, overflowY: "auto", paddingRight: 6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                    {moments.map((m) => (
                      <MomentCard key={m.id} m={m} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 6 — sign out. Quiet, centred. */}
      <div style={{ display: "flex", justifyContent: "center", padding: "0 0 22px" }}>
        <LogoutForm>
          <button type="submit" style={{ minHeight: 56, display: "inline-flex", alignItems: "center", font: "700 16px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "3px solid #C9C2B0", borderRadius: 999, padding: "6px 22px", cursor: "pointer" }}>
            {c.home.signOut}
          </button>
        </LogoutForm>
      </div>
    </div>
  );
}

// A moment card in the jar window. Photo/drawing show the image; text shows an
// excerpt; audio shows the voice icon. The image alt / audio label is the
// child's own caption — rendered to the DOM (React-escaped), never read aloud.
function MomentCard({ m }: { m: EyfsMoment }) {
  const isImage = m.type === "PHOTO" || m.type === "DRAWING";
  return (
    <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 14, overflow: "hidden", boxShadow: "0 3px 0 rgba(34,48,74,0.12)" }}>
      <div style={{ height: 130, background: m.bandBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {isImage && m.mediaPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.mediaPath} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : m.type === "AUDIO" ? (
          <Icon name="voice" size={44} decorative />
        ) : m.textContent ? (
          <p style={{ margin: 0, padding: "10px 14px", font: "400 14px/1.45 var(--font-atkinson)", color: "var(--ink)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>{m.textContent}</p>
        ) : (
          <Icon name="write" size={40} decorative />
        )}
      </div>
      <div style={{ padding: "8px 12px 10px" }}>
        <p style={{ margin: 0, font: "600 17px var(--font-fredoka)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</p>
        <p style={{ margin: "2px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>{m.dateLabel}</p>
      </div>
    </div>
  );
}

// The jar mark for the bottom bar — the app's jar with a few tumbling squares,
// matching the redesign's 6a art. Decorative.
function JarMark() {
  return (
    <svg width="58" height="72" viewBox="-6 -20 112 146" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="26" y="4" width="48" height="14" rx="7" fill="var(--kraft)" />
      <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="var(--glass-jar)" stroke="var(--ink)" strokeWidth="5" strokeLinejoin="round" />
      <rect x="24" y="92" width="17" height="17" rx="4" fill="#C2476B" transform="rotate(-6 32 100)" />
      <rect x="45" y="96" width="17" height="17" rx="4" fill="var(--honey)" transform="rotate(5 53 104)" />
      <rect x="60" y="90" width="17" height="17" rx="4" fill="var(--glass)" transform="rotate(-4 68 98)" />
      <rect x="34" y="74" width="17" height="17" rx="4" fill="var(--blue)" transform="rotate(4 42 82)" />
      <rect x="54" y="72" width="17" height="17" rx="4" fill="var(--green)" transform="rotate(-5 62 80)" />
    </svg>
  );
}
