"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "../icons/Icon";
import { useCameraStream } from "./useCameraStream";

// The camera, as a dialog over the canvas: opened when a child taps a photo
// frame, closed by a capture or a cancel, and never left running.
//
// It is `aria-modal`, which is also what keeps the canvas's own keyboard
// handler off the object behind it — the handler checks for an open modal
// before it treats Backspace as "delete the selected object".
//
// When the camera cannot open — no camera, permission refused, a laptop in a
// cupboard — the child gets the same way out the photo capture surface already
// gives them: choose a picture from the device instead. `capture="environment"`
// makes an iPad's picker open the camera directly, so on the device most
// classrooms use the fallback is still the camera.
//
// Every string here is fixed copy from src/lib/copy/student.ts, passed in by
// the caller; nothing a teacher or child wrote is ever shown in this dialog.
export function CameraDialog({
  title,
  labels,
  onCapture,
  onCancel,
}: {
  title: string;
  labels: { take: string; cancel: string; choose: string; failed: string };
  onCapture: (dataUrl: string, type: string) => void;
  onCancel: () => void;
}) {
  // Destructured rather than held as `cam`: the lint rule that keeps refs out
  // of render cannot see past an object that carries one.
  const { videoRef, status, start, stop, snapshot } = useCameraStream();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const fileId = useId();

  useEffect(() => {
    // Remember what was focused, so closing hands focus back to the frame
    // button the child (or a keyboard user) came from rather than dropping it
    // on the page — see src/app/ops/ConfirmAction.tsx for why that matters.
    opener.current = document.activeElement;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    void start();
    return () => {
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
    // Runs once, on open: the camera is started by the tap that opened this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancel() {
    stop();
    onCancel();
  }

  function take() {
    const dataUrl = snapshot();
    if (!dataUrl) return;
    stop();
    onCapture(dataUrl, "image/jpeg");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (!url.startsWith("data:image")) return;
      stop();
      onCapture(url, file.type);
    };
    reader.readAsDataURL(file);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = ref.current?.querySelectorAll<HTMLElement>("button, input, label[tabindex]");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const failed = status === "failed";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-camera-dialog
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <h2 id={titleId} className="mb-3 text-center text-xl font-bold text-foreground">
          {title}
        </h2>
        {failed ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-base text-rose-700">{labels.failed}</p>
            <label
              htmlFor={fileId}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById(fileId)?.click();
                }
              }}
              className="btn-ghost flex min-h-[64px] w-full cursor-pointer items-center justify-center gap-2 text-lg"
            >
              <Icon name="add-picture" size={28} decorative />
              {labels.choose}
            </label>
            <input
              id={fileId}
              type="file"
              accept="image/*"
              capture="environment"
              data-frame-file
              onChange={onFile}
              className="sr-only"
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full rounded-xl border border-border bg-black"
            style={{ aspectRatio: "4 / 3" }}
          />
        )}
        <div className="mt-3 flex gap-2">
          {!failed && (
            <button
              type="button"
              onClick={take}
              disabled={status !== "live"}
              className="btn-green flex min-h-[64px] flex-1 items-center justify-center gap-2 text-lg disabled:opacity-50"
            >
              <Icon name="camera" size={24} decorative /> {labels.take}
            </button>
          )}
          <button
            type="button"
            onClick={cancel}
            className={`btn-ghost flex min-h-[64px] min-w-[64px] items-center justify-center text-lg ${failed ? "flex-1" : ""}`}
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
