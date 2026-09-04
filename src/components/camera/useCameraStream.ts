"use client";

import { useEffect, useRef, useState } from "react";

// The device camera, as one thing the photo capture surfaces share: open a
// stream from the rear camera, show it in a <video>, snap a frame to a JPEG
// data URL, and always put the camera away afterwards.
//
// Lifted out of PhotoCapture when the canvas's photo frame needed the same
// camera behind a different door. The two differ only in where the picture
// goes — a hidden form field there, a canvas object here — and a second copy
// of the getUserMedia dance is how one of them stops stopping the stream.
//
// "live" is set on the video's `playing` event, not on getUserMedia resolving:
// a stream with no frames yet snaps to a black rectangle, and a child will tap
// the button the instant it appears.
export type CameraStatus = "idle" | "starting" | "live" | "failed";

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setStatus("idle");
  }

  // Tidy up the camera stream if the component goes away.
  useEffect(() => () => stop(), []);

  // Each start() supersedes the one before it. React runs an effect twice in
  // development (StrictMode), so the dialog asks for the camera twice; the
  // first stream is then interrupted by the second, which rejects the first
  // `play()`. That is not the camera failing, and it must not be reported as
  // one — only the latest start decides the status, and a superseded one
  // quietly puts its own stream away.
  const generation = useRef(0);

  // Resolves true once the picture is showing, false when the camera could not
  // be opened (no camera, permission refused, insecure page) — or when a later
  // start() took over, in which case nothing is reported.
  async function start(): Promise<boolean> {
    const gen = ++generation.current;
    const superseded = () => gen !== generation.current;
    setStatus("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch {
      if (!superseded()) setStatus("failed");
      return false;
    }
    if (superseded()) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    streamRef.current = stream;
    return new Promise<boolean>((resolve) => {
      // The <video> may mount on the same render that asked for the stream;
      // attach on the next frame, as PhotoCapture always has.
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (superseded()) {
          stream.getTracks().forEach((t) => t.stop());
          resolve(false);
          return;
        }
        if (!video) {
          stop();
          setStatus("failed");
          resolve(false);
          return;
        }
        const onPlaying = () => {
          video.removeEventListener("playing", onPlaying);
          if (superseded()) {
            resolve(false);
            return;
          }
          setStatus("live");
          resolve(true);
        };
        video.addEventListener("playing", onPlaying);
        video.srcObject = stream;
        void video.play().catch(() => {
          video.removeEventListener("playing", onPlaying);
          if (superseded()) {
            resolve(false);
            return;
          }
          stop();
          setStatus("failed");
          resolve(false);
        });
      });
    });
  }

  // The current frame as a JPEG data URL, or null when nothing is showing.
  function snapshot(): string | null {
    const video = videoRef.current;
    if (!video || !streamRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const c = canvas.getContext("2d");
    if (!c) return null;
    c.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  return { videoRef, status, start, stop, snapshot };
}
