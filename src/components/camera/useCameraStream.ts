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

// Which way the camera looks. "environment" is the rear one and the default,
// because the ordinary job is photographing a thing on the desk rather than
// the person holding the tablet.
export type CameraFacing = "environment" | "user";

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  // Mirrored in a ref because `flip` reads it from inside an async callback,
  // where the state value would be whatever it was when that closure was made.
  const facingRef = useRef<CameraFacing>("environment");
  const [facing, setFacing] = useState<CameraFacing>("environment");
  // Whether this device has a second camera to switch to. Deny by default: the
  // button is offered only once we have counted more than one, so a device with
  // a single camera never shows a control that would do nothing.
  const [canFlip, setCanFlip] = useState(false);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setStatus("idle");
  }

  // Count the cameras. Only meaningful once permission has been given — before
  // that a browser may report a single anonymous device, or none — so this runs
  // after a stream is live rather than on mount.
  async function countCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
    } catch {
      setCanFlip(false); // deny by default
    }
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
  async function start(which: CameraFacing = facingRef.current): Promise<boolean> {
    const gen = ++generation.current;
    const superseded = () => gen !== generation.current;
    facingRef.current = which;
    setFacing(which);
    setStatus("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: which },
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
          void countCameras();
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

  // Swap to the other camera. If the device refuses the one asked for — a
  // browser can list a camera it will not actually open — the previous one is
  // reopened rather than leaving the child looking at an error where a working
  // picture used to be.
  async function flip(): Promise<void> {
    const was = facingRef.current;
    const next: CameraFacing = was === "environment" ? "user" : "environment";
    stop();
    if (await start(next)) return;
    stop();
    await start(was);
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

  return { videoRef, status, facing, canFlip, start, flip, stop, snapshot };
}
