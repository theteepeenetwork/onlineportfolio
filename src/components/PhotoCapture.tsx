"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons/Icon";
import { useCameraStream } from "./camera/useCameraStream";

// Lets a child add a photo either by taking one with the device camera (live)
// or by uploading a file. A captured photo is stored as a data URL in a hidden
// `photoData` field; an uploaded photo stays as a normal file in the `photo`
// field. The journal action accepts whichever one is present.
//
// The camera itself lives in useCameraStream, shared with the canvas's photo
// frame. What is here is only the form: which field wins, and what the child
// sees while choosing.
export function PhotoCapture() {
  const [mode, setMode] = useState<"idle" | "camera">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { videoRef, start, stop, snapshot } = useCameraStream();
  const photoDataRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function openCamera() {
    setError(null);
    // The <video> mounts with `mode === "camera"`; the hook attaches on the
    // next frame, so the mode has to flip before the stream is asked for.
    setMode("camera");
    const ok = await start();
    if (!ok) {
      setError(
        "We couldn't open the camera. You can upload a photo instead, or check the browser's camera permission.",
      );
      setMode("idle");
    }
  }

  function capture() {
    const dataUrl = snapshot();
    if (!dataUrl) return;
    setPreview(dataUrl);
    if (photoDataRef.current) photoDataRef.current.value = dataUrl;
    if (fileRef.current) fileRef.current.value = ""; // a capture wins over any file
    stop();
    setMode("idle");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (photoDataRef.current) photoDataRef.current.value = ""; // a file wins over a capture
    if (!file) {
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  function retake() {
    setPreview(null);
    if (photoDataRef.current) photoDataRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      {/* Camera capture is delivered as a data URL in this hidden field. */}
      <input type="hidden" name="photoData" ref={photoDataRef} />
      {/* Uploads use a real file field. */}
      <input
        type="file"
        name="photo"
        accept="image/*"
        ref={fileRef}
        onChange={onFile}
        className="hidden"
        id="photo-file"
      />

      {mode === "camera" ? (
        <div className="space-y-3">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full rounded-xl border border-border bg-black"
            style={{ aspectRatio: "4 / 3" }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={capture} className="btn-green flex flex-1 items-center justify-center gap-2">
              <Icon name="camera" size={20} decorative /> Take photo
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                setMode("idle");
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : preview ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Your photo"
            className="max-h-80 w-full rounded-xl border border-border object-contain"
          />
          <button type="button" onClick={retake} className="btn-ghost w-full">
            Choose a different photo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={openCamera}
            className="btn-ghost flex flex-col items-center gap-1 py-8 text-muted"
          >
            <Icon name="camera" size={32} decorative />
            Use camera
          </button>
          <label
            htmlFor="photo-file"
            className="btn-ghost flex cursor-pointer flex-col items-center gap-1 py-8 text-muted"
          >
            <Icon name="add-picture" size={32} decorative />
            Upload a photo
          </label>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}
