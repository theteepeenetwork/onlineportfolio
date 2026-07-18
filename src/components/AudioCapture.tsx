"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons/Icon";

// Lets a child (or a teacher, on a child's behalf) record a short voice note
// with the device microphone. The recorded audio is armed onto a hidden file
// field named `audio`, so the SAME authorised Server Action that saves a photo
// (createJournalItem → saveAudio) stores it — no new endpoint, no new public
// exposure. Audio-only: there is deliberately no camera/video track, no
// waveform, no trimming and no scrubbing beyond the browser's own player.
//
// Simple by design (the product pitch): Record → Stop → Play it back → Record
// again, then the form's own "Add" button keeps it. Nothing is uploaded until
// the child submits, and it still lands in the approval queue like any other
// child moment (teacher-created items publish straight away, as elsewhere).

export type AudioLabels = {
  record: string; // start recording
  stop: string; // stop recording
  again: string; // discard and re-record
  ready: string; // heading once a note exists
  recording: string; // live status while recording
  player: string; // aria-label on the playback control
  micError: string; // shown if the mic can't be used
  hint: string; // one-line explainer under the button
};

const DEFAULT_LABELS: AudioLabels = {
  record: "Record",
  stop: "Stop",
  again: "Record again",
  ready: "Your voice note is ready",
  recording: "Recording…",
  player: "Your voice note",
  micError:
    "We couldn't use the microphone. Have another go, or ask your teacher to check it.",
  hint: "Tap record, say your bit, then tap stop.",
};

// A short voice note — not a podcast. Recording stops itself at this length so a
// clip can never grow unbounded (keeps files tiny and well within upload
// limits). Two minutes is generous for an EYFS/KS1 "tell us about your work".
const MAX_SECONDS = 120;

// Pick a container the browser can actually record. The returned mimeType may
// carry a ";codecs=…" suffix — the server strips it (see lib/media saveAudio).
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4", // Safari
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported?.(c)) return c;
    } catch {
      // isTypeSupported can throw on odd inputs — treat as unsupported.
    }
  }
  return undefined; // let the browser choose its own default
}

function extFor(mime: string): string {
  const base = (mime.split(";")[0] || "").trim().toLowerCase();
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioCapture({ labels: override }: { labels?: Partial<AudioLabels> }) {
  const labels = { ...DEFAULT_LABELS, ...override };

  const [mode, setMode] = useState<"idle" | "recording" | "recorded">("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Tidy up the mic, timer and any object URL when the component goes away.
  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
      setPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
    };
  }, []);

  function armFile(blob: Blob, mime: string) {
    if (!fileRef.current) return;
    const file = new File([blob], `voice.${extFor(mime)}`, { type: mime });
    // A DataTransfer is the one supported way to set a file input's FileList, so
    // the recording rides the ordinary form submit as the `audio` field.
    const dt = new DataTransfer();
    dt.items.add(file);
    fileRef.current.files = dt.files;
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopStream();
        stopTimer();
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        armFile(blob, type);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setMode("recorded");
      };

      recorder.start();
      setSeconds(0);
      setMode("recording");
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_SECONDS) stopRecording(); // self-stop at the cap
          return next;
        });
      }, 1000);
    } catch {
      stopStream();
      setError(labels.micError);
      setMode("idle");
    }
  }

  function stopRecording() {
    stopTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop(); // onstop finishes up
  }

  function recordAgain() {
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    clearFile();
    setSeconds(0);
    setMode("idle");
    setError(null);
  }

  const bigBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 72,
    boxSizing: "border-box",
    font: "600 calc(24px * var(--sj-type-scale, 1)) var(--font-fredoka, inherit)",
    border: "3px solid var(--ink, #22304A)",
    borderRadius: 999,
    padding: "16px 34px",
    cursor: "pointer",
  };

  return (
    <div>
      {/* The recording rides the normal form submit through this hidden field —
          the same `audio` name createJournalItem reads server-side. */}
      <input ref={fileRef} type="file" name="audio" accept="audio/*" hidden />

      {mode === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <button
            type="button"
            onClick={startRecording}
            style={{ ...bigBtn, color: "var(--paper, #fff)", background: "var(--jam, #C2476B)", boxShadow: "0 5px 0 var(--jam-deep, #8f2f4d)" }}
          >
            <Icon name="voice" size={26} decorative />
            {labels.record}
          </button>
          <p style={{ margin: 0, font: "400 calc(16px * var(--sj-type-scale, 1)) var(--font-atkinson, inherit)", color: "var(--sj-muted, #6b6b6b)" }}>
            {labels.hint}
          </p>
        </div>
      )}

      {mode === "recording" && (
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={stopRecording}
            style={{ ...bigBtn, color: "var(--ink, #22304A)", background: "var(--honey, #F0B441)", boxShadow: "0 5px 0 #b98216" }}
          >
            <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 3, background: "var(--ink, #22304A)" }} />
            {labels.stop}
          </button>
          <p role="status" aria-live="polite" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 10, font: "700 calc(20px * var(--sj-type-scale, 1)) var(--font-atkinson, inherit)", color: "var(--jam, #C2476B)" }}>
            <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--jam, #C2476B)" }} />
            {labels.recording} {mmss(seconds)}
          </p>
        </div>
      )}

      {mode === "recorded" && previewUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, font: "600 calc(20px * var(--sj-type-scale, 1)) var(--font-fredoka, inherit)", color: "var(--ink, #22304A)" }}>
            {labels.ready}
          </p>
          {/* The browser's own player — keyboard-operable and screen-reader
              labelled. No custom scrubbing UI (kept deliberately tiny). */}
          <audio src={previewUrl} controls aria-label={labels.player} style={{ width: "100%", maxWidth: 420 }} />
          <button
            type="button"
            onClick={recordAgain}
            style={{ ...bigBtn, alignSelf: "flex-start", color: "var(--ink, #22304A)", background: "var(--cream, #FFFDF7)", boxShadow: "0 5px 0 rgba(34,48,74,0.14)" }}
          >
            <Icon name="voice" size={24} decorative />
            {labels.again}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ margin: "14px 0 0", font: "700 calc(17px * var(--sj-type-scale, 1)) var(--font-atkinson, inherit)", color: "var(--honey-ink, #8A5F1E)", background: "var(--honey-tint, #FBEED3)", borderRadius: 12, padding: "12px 18px" }}>
          {error}
        </p>
      )}
    </div>
  );
}
