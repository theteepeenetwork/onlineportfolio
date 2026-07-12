"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons/Icon";

// Lets a child add a photo either by taking one with the device camera (live)
// or by uploading a file. A captured photo is stored as a data URL in a hidden
// `photoData` field; an uploaded photo stays as a normal file in the `photo`
// field. The journal action accepts whichever one is present.
export function PhotoCapture() {
  const [mode, setMode] = useState<"idle" | "camera">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoDataRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Tidy up the camera stream if the component goes away.
  useEffect(() => () => stopCamera(), []);

  async function openCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
      // The <video> mounts with `mode === "camera"`; attach on the next tick.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError(
        "We couldn't open the camera. You can upload a photo instead, or check the browser's camera permission.",
      );
      setMode("idle");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPreview(dataUrl);
    if (photoDataRef.current) photoDataRef.current.value = dataUrl;
    if (fileRef.current) fileRef.current.value = ""; // a capture wins over any file
    stopCamera();
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
                stopCamera();
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
