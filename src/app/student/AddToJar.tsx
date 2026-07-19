"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { createJournalItem } from "@/app/actions/journal";
import { PhotoCapture } from "@/components/PhotoCapture";
import { AudioCapture } from "@/components/AudioCapture";
import { Icon, type IconName } from "@/components/icons/Icon";
import { studentCopy } from "@/lib/copy/student";
import type { AgeMode } from "@/lib/ageMode";

// The child's jar used to send them to a separate capture page per tile
// (/student/new/<type>). Photo, Voice and My words now open their capture
// surface *inline*, as an accordion inside this card — one open at a time,
// tapping the open tile closes it. Drawing keeps its dedicated full-screen
// canvas (it was already the best child-led surface in the app), so it stays a
// plain link out. Nothing about the safeguarding path changes: each surface is
// the same `<form action={createJournalItem}>` the standalone pages post, so a
// child's moment still lands PENDING in the approval queue (SAFEGUARDING 3).

type Surface = "photo" | "voice" | "words";

// The capture form's `type`, keyed by surface. Photo/voice carry media; words
// is text-only (so it skips the caption — a TEXT item is already all words).
const CAPTURE_TYPE: Record<Surface, "PHOTO" | "AUDIO" | "TEXT"> = {
  photo: "PHOTO",
  voice: "AUDIO",
  words: "TEXT",
};

const TILES: { surface: Surface; icon: IconName; label: string; bg: string }[] = [
  { surface: "photo", icon: "camera", label: "Photo", bg: "#D8ECE8" },
  { surface: "voice", icon: "voice", label: "Voice", bg: "#EAF4F1" },
  { surface: "words", icon: "write", label: "My words", bg: "#F7E0E6" },
];

// The accordion is a grid-rows height animation — no pixel measuring. The
// global reduced-motion guard in globals.css collapses the transition to ~0ms,
// so a child who needs reduced motion gets an instant open/close (SAFEGUARDING
// rule 18) with no extra code here.
function revealWrap(open: boolean): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateRows: open ? "1fr" : "0fr",
    transition: "grid-template-rows .34s cubic-bezier(.4,0,.2,1)",
  };
}

export function AddToJar({ mode }: { mode: AgeMode }) {
  const [open, setOpen] = useState<Surface | null>(null);
  const c = studentCopy(mode).add;

  const toggle = (s: Surface) => setOpen((cur) => (cur === s ? null : s));

  return (
    <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: "24px 30px", boxShadow: "var(--pop-shadow)" }}>
      <p style={{ margin: "0 0 16px", font: "600 calc(30px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>{c.submit}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 18 }}>
        {/* Photo — inline accordion */}
        <Tile tile={TILES[0]} open={open === "photo"} onClick={() => toggle("photo")} />
        {/* Drawing keeps its dedicated full-screen canvas */}
        <Link
          href="/student/new/drawing"
          className="sj-addtile"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 88, background: "#FBEED3", border: "3px solid var(--ink)", borderRadius: 16, textDecoration: "none", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}
        >
          <Icon name="draw" size={40} decorative />
          <span style={{ font: "600 calc(27px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--ink)" }}>Drawing</span>
        </Link>
        {/* Voice + My words — inline accordions */}
        <Tile tile={TILES[1]} open={open === "voice"} onClick={() => toggle("voice")} />
        <Tile tile={TILES[2]} open={open === "words"} onClick={() => toggle("words")} />
      </div>

      {/* Revealed capture surfaces — one grid-rows wrapper each, always present
          so the height can animate; the capture component inside mounts only
          while its surface is open, so switching tiles unmounts the previous
          camera/mic and its cleanup stops the live stream (the more protective
          option — a stream must never keep running behind a collapsed panel). */}
      {(["photo", "voice", "words"] as const).map((s) => (
        <div key={s} style={revealWrap(open === s)}>
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {open === s && <CaptureSurface type={CAPTURE_TYPE[s]} mode={mode} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ tile, open, onClick }: { tile: (typeof TILES)[number]; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="sj-addtile"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 88, background: tile.bg, border: "3px solid var(--ink)", borderRadius: 16, cursor: "pointer", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}
    >
      <Icon name={tile.icon} size={40} decorative />
      <span style={{ font: "600 calc(27px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--ink)" }}>{tile.label}</span>
    </button>
  );
}

// The inline capture surface: the exact capture UI from the standalone
// StudentCapture, minus the full-page chrome (no back link, no heading — the
// tile above is the heading). Same hidden fields, same Server Action, so the
// item posts and lands PENDING exactly as before.
function CaptureSurface({ type, mode }: { type: "PHOTO" | "AUDIO" | "TEXT"; mode: AgeMode }) {
  const [state, action, pending] = useActionState(createJournalItem, {});
  const c = studentCopy(mode).add;

  return (
    // paddingBottom leaves room for the submit button's 5px drop shadow: a
    // box-shadow adds no layout height, so without it the accordion's
    // overflow:hidden wrapper clips the last few pixels of the shadow.
    <form action={action} style={{ paddingTop: 22, paddingBottom: 8, borderTop: "2px dashed #e4dcc8", marginTop: 22 }}>
      <input type="hidden" name="type" value={type} />

      {type === "PHOTO" ? (
        <PhotoCapture />
      ) : type === "AUDIO" ? (
        <AudioCapture labels={c.audio} />
      ) : (
        <>
          <label htmlFor="words" style={{ display: "block", font: "700 calc(20px * var(--sj-type-scale, 1)) var(--font-atkinson)", marginBottom: 8 }}>
            {c.wordsLabel}
          </label>
          <textarea
            id="words"
            name="textContent"
            rows={6}
            placeholder={c.wordsPlaceholder}
            style={{ width: "100%", boxSizing: "border-box", font: "400 calc(22px * var(--sj-type-scale, 1))/1.6 var(--font-atkinson)", padding: "16px 18px", border: "3px solid var(--ink)", borderRadius: 16, background: "var(--cream)", color: "var(--ink)", resize: "vertical" }}
          />
        </>
      )}

      {/* Caption comes after the work it asks about, and keeps its label on
          screen while the child answers. Shown for photo/voice; a TEXT item is
          already all words. */}
      {type !== "TEXT" && (
        <div style={{ marginTop: 20 }}>
          <label htmlFor="caption" style={{ display: "block", font: "700 calc(20px * var(--sj-type-scale, 1)) var(--font-atkinson)" }}>
            {c.captionLabel}{" "}
            <span style={{ font: "400 calc(17px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)" }}>{c.captionOptional}</span>
          </label>
          <input
            id="caption"
            name="caption"
            placeholder={c.captionPlaceholder}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 8, minHeight: 64, font: "400 calc(22px * var(--sj-type-scale, 1)) var(--font-atkinson)", padding: "14px 18px", border: "3px solid var(--ink)", borderRadius: 16, background: "var(--cream)", color: "var(--ink)" }}
          />
        </div>
      )}

      {state?.error && (
        <p role="alert" style={{ margin: "18px 0 0", font: "700 calc(18px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--honey-ink)", background: "var(--honey-tint)", borderRadius: 12, padding: "12px 18px" }}>
          {state.error}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 22 }}>
        <button
          type="submit"
          disabled={pending}
          style={{ display: "inline-flex", alignItems: "center", gap: 10, minHeight: 72, font: "600 calc(26px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--paper)", background: "var(--glass)", border: "none", padding: "16px 40px", borderRadius: 999, boxShadow: "0 5px 0 #2b5f57", cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}
        >
          <Icon name="done" size={26} decorative />
          {pending ? c.saving : c.submit}
        </button>
        <p style={{ margin: 0, font: "400 calc(17px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)" }}>{c.teacherWillSee}</p>
      </div>
    </form>
  );
}
