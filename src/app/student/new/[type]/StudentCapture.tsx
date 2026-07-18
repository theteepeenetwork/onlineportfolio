"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { createJournalItem } from "@/app/actions/journal";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { PhotoCapture } from "@/components/PhotoCapture";
import { Icon } from "@/components/icons/Icon";
import { studentCopy } from "@/lib/copy/student";
import type { AgeMode } from "@/lib/ageMode";

export type CaptureType = "PHOTO" | "TEXT" | "DRAWING";

// A child taps "Photo" on their jar and lands *here* — on the camera, not on a
// screen offering them the choice they already made.
//
// The old route dropped them into the shared teacher form: three small tabs
// re-asking the question, a 14px text link as the only way back (half the 44px
// floor the rest of the child UI keeps), a system-font heading in place of the
// Fredoka they'd been reading a second earlier, and the caption instruction
// hidden in placeholder text that vanished the moment they tapped the box.
// Young children navigate by landmark, not by URL: when the world changes
// register mid-task they assume they're lost and back out.
//
// So there are no tabs here, the register never breaks, and the caption keeps a
// visible label. Drawing isn't handled by this shell at all — it was already
// full-screen and child-led, which is what the rest of this is trying to be.
export function StudentCapture({ type, mode }: { type: Exclude<CaptureType, "DRAWING">; mode: AgeMode }) {
  const [state, action, pending] = useActionState(createJournalItem, {});
  const c = studentCopy(mode).add;

  return (
    <form
      action={action}
      className="sj"
      data-ks={mode}
      style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", boxSizing: "border-box", padding: "clamp(16px, 3vw, 32px)" }}
    >
      <input type="hidden" name="type" value={type} />

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        {/* A real button, at the child touch floor — not a 14px text link. */}
        <Link
          href="/student"
          className="sj-btn-outline"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 64, boxSizing: "border-box", font: "700 calc(18px * var(--sj-type-scale, 1)) var(--font-atkinson)" }}
        >
          <span aria-hidden="true">←</span>
          {c.backToJar}
        </Link>

        <h1 style={{ margin: "clamp(14px, 2.4vh, 22px) 0 0", font: "600 calc(clamp(30px, 4.6vw, 44px) * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>
          {type === "PHOTO" ? c.photoHeading : c.wordsHeading}
        </h1>

        <div style={{ marginTop: "clamp(14px, 2.4vh, 22px)" }}>
          {type === "PHOTO" ? (
            <PhotoCapture />
          ) : (
            <>
              <label htmlFor="words" style={{ display: "block", font: "700 calc(20px * var(--sj-type-scale, 1)) var(--font-atkinson)", marginBottom: 8 }}>
                {c.wordsLabel}
              </label>
              <textarea
                id="words"
                name="textContent"
                rows={7}
                placeholder={c.wordsPlaceholder}
                style={{ width: "100%", boxSizing: "border-box", font: "400 calc(22px * var(--sj-type-scale, 1))/1.6 var(--font-atkinson)", padding: "16px 18px", border: "3px solid var(--ink)", borderRadius: 16, background: "var(--cream)", color: "var(--ink)" }}
              />
            </>
          )}
        </div>

        {/* The caption asks about work the child has just made, so it comes
            after it — and keeps its label on screen while they answer. */}
        {type === "PHOTO" && (
          <div style={{ marginTop: "clamp(14px, 2.4vh, 22px)" }}>
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

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: "clamp(18px, 3vh, 30px)" }}>
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
      </div>
    </form>
  );
}

// Drawing keeps its own full-screen, child-led surface: the canvas already owns
// its caption and its ✓, and it is the best child UI in the app. All this adds
// is a way back to the jar that lands on the jar, rather than in a photo tab.
export function StudentDrawCapture() {
  const router = useRouter();
  const [, action] = useActionState(createJournalItem, {});

  return (
    <form action={action}>
      <input type="hidden" name="type" value="DRAWING" />
      <DrawingCanvas
        name="drawingPages"
        fullScreen
        withCaption
        onClose={() => router.push("/student")}
      />
    </form>
  );
}
