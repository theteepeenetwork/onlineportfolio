"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { createJournalItem } from "@/app/actions/journal";
import { PhotoCapture } from "@/components/PhotoCapture";
import { AudioCapture } from "@/components/AudioCapture";
import { Icon } from "@/components/icons/Icon";
import { studentCopy } from "@/lib/copy/student";
import type { AgeMode } from "@/lib/ageMode";
import { readAloud } from "@/lib/readAloud";
import { useCaptureDraft } from "@/lib/captureDraft";
import { useSpeechReady } from "@/lib/useSpeechReady";

// The inline capture surface shared by all three age registers (designs
// 6a/5a/3c). It is the exact capture UI from the standalone StudentCapture —
// PhotoCapture / AudioCapture / a words textarea — wrapped in the redesign's
// cream card with a circular ✕ close and (for the younger registers) a 🔊
// read-aloud button on the title.
//
// Safeguarding is unchanged: it is the SAME `<form action={createJournalItem}>`
// every other capture posts, so a child's moment still lands PENDING in the
// approval queue (SAFEGUARDING rule 3). The only difference from the standalone
// pages is the hidden `inline=1` field: on success the action returns `{ok}`
// instead of redirecting to /popped, and this surface shows the "Popped in!"
// celebration in place, then folds itself shut via `onClose`.

export type CaptureType = "PHOTO" | "AUDIO" | "TEXT";
type RegisterSize = "eyfs" | "ks1" | "ks2";

// Concrete sizes per register. EYFS is the biggest and always speakable; KS2 is
// the most compact and drops the read-aloud button (design 3c has no speaker on
// its capture titles — older children read it themselves).
const SIZE: Record<RegisterSize, { close: number; title: number; submit: number; minHit: number; speak: boolean }> = {
  eyfs: { close: 64, title: 28, submit: 26, minHit: 72, speak: true },
  ks1: { close: 56, title: 28, submit: 26, minHit: 72, speak: true },
  ks2: { close: 44, title: 22, submit: 22, minHit: 64, speak: false },
};

export function CaptureSurface({
  type,
  mode,
  studentId,
  size,
  title,
  onClose,
  submitLabel,
}: {
  type: CaptureType;
  mode: AgeMode;
  studentId: string;
  size: RegisterSize;
  title: string;
  onClose: () => void;
  // The register decides the button wording ("Add to my jar" vs "…journal").
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(createJournalItem, {});
  const c = studentCopy(mode).add;
  const cel = studentCopy(mode).celebration;
  const s = SIZE[size];

  const speechReady = useSpeechReady();
  // Only the open fold is mounted, so a child who writes a sentence and then
  // opens Photo loses it on the spot without this. See src/lib/captureDraft.ts.
  const draft = useCaptureDraft(studentId, type);

  // A bounced submit keeps its words — they are still on screen, and still the
  // child's, so they go back rather than being lost to the tidy-up on send.
  useEffect(() => {
    if (state?.error) draft.save(draft.text, draft.caption);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a successful inline submit, hold the celebration briefly, then fold the
  // surface shut and restore the tiles. ~1800ms matches the design. Clearing on
  // unmount means switching/closing the surface cancels a pending auto-close.
  const celebrating = state.ok === true;
  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [celebrating, onClose]);

  const cardStyle: React.CSSProperties = {
    background: "var(--cream)",
    border: "3px solid var(--ink)",
    borderRadius: 20,
    padding: "24px 30px",
    boxShadow: "var(--pop-shadow)",
    position: "relative",
  };

  return (
    <div style={cardStyle}>
      <button
        type="button"
        onClick={onClose}
        aria-label={c.close}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: s.close,
          height: s.close,
          borderRadius: "50%",
          background: "var(--paper)",
          border: "3px solid var(--ink)",
          font: "700 22px var(--font-atkinson)",
          color: "var(--ink)",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>

      {celebrating ? (
        // The "Popped in!" (younger) / "Added ✓" (older) celebration, in place.
        <div className="sj-cap-pop" role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "22px 0" }}>
          <Icon name="jar" size={64} decorative />
          <span style={{ font: `600 ${s.title + 6}px var(--font-fredoka)` }}>{cel.heading}</span>
          <span style={{ font: "400 18px var(--font-atkinson)", color: "var(--sj-muted)" }}>{cel.subtitle}</span>
        </div>
      ) : (
        <form action={action} onSubmit={draft.clear} style={{ paddingBottom: 8 }}>
          <input type="hidden" name="type" value={type} />
          {/* Ask the action to celebrate inline rather than redirect to /popped. */}
          <input type="hidden" name="inline" value="1" />

          {/* Title + optional read-aloud. The 🔊 only ever speaks this fixed
              copy string, never child content (src/lib/readAloud.ts). */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingRight: s.close + 8 }}>
            <span style={{ font: `600 ${s.title}px var(--font-fredoka)` }}>{title}</span>
            {s.speak && speechReady && (
              <button
                type="button"
                aria-label={`${studentCopy(mode).status.hearIt}: ${title}`}
                onClick={() => readAloud(title)}
                style={{ minHeight: 64, minWidth: 64, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "3px solid var(--ink)", borderRadius: 999, fontSize: 22, cursor: "pointer" }}
              >
                <span aria-hidden="true">🔊</span>
              </button>
            )}
          </div>

          {type === "PHOTO" ? (
            <PhotoCapture />
          ) : type === "AUDIO" ? (
            <AudioCapture labels={c.audio} />
          ) : (
            <>
              <label htmlFor="words" style={{ display: "block", font: "700 20px var(--font-atkinson)", marginBottom: 8 }}>
                {c.wordsLabel}
              </label>
              <textarea
                id="words"
                name="textContent"
                rows={5}
                value={draft.text}
                onChange={(e) => draft.setText(e.target.value)}
                placeholder={c.wordsPlaceholder}
                style={{ width: "100%", boxSizing: "border-box", font: "400 22px/1.6 var(--font-atkinson)", padding: "14px 18px", border: "3px solid var(--ink)", borderRadius: 16, background: "var(--cream)", color: "var(--ink)", resize: "vertical" }}
              />
            </>
          )}

          {/* Caption follows the work and keeps its label on screen; a TEXT item
              is already all words, so it's skipped there. */}
          {type !== "TEXT" && (
            <div style={{ marginTop: 20 }}>
              <label htmlFor="caption" style={{ display: "block", font: "700 20px var(--font-atkinson)" }}>
                {c.captionLabel}{" "}
                <span style={{ font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>{c.captionOptional}</span>
              </label>
              <input
                id="caption"
                name="caption"
                value={draft.caption}
                onChange={(e) => draft.setCaption(e.target.value)}
                placeholder={c.captionPlaceholder}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 8, minHeight: 64, font: "400 22px var(--font-atkinson)", padding: "12px 18px", border: "3px solid var(--ink)", borderRadius: 16, background: "var(--cream)", color: "var(--ink)" }}
              />
            </div>
          )}

          {state?.error && (
            <p role="alert" style={{ margin: "18px 0 0", font: "700 18px var(--font-atkinson)", color: "var(--honey-ink)", background: "var(--honey-tint)", borderRadius: 12, padding: "12px 18px" }}>
              {state.error}
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 22 }}>
            <button
              type="submit"
              disabled={pending}
              style={{ display: "inline-flex", alignItems: "center", gap: 10, minHeight: s.minHit, font: `600 ${s.submit}px var(--font-fredoka)`, color: "var(--paper)", background: "var(--glass)", border: "none", padding: "14px 36px", borderRadius: 999, boxShadow: "0 5px 0 #2b5f57", cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}
            >
              <Icon name="done" size={26} decorative />
              {pending ? c.saving : submitLabel}
            </button>
            <p style={{ margin: 0, font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>{c.teacherWillSee}</p>
          </div>
        </form>
      )}
    </div>
  );
}
