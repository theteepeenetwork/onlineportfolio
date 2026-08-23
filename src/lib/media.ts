import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { MEDIA_DIR, UPLOADS_PREFIX } from "@/lib/mediaPath";
import { STORABLE_IMAGE_TYPES } from "@/lib/imageTypes";

// Where uploaded photos and drawings live: a PRIVATE directory (not under
// public/). They are served only through the authorising /uploads/[...] route,
// never statically. Returned paths keep the /uploads/<file> URL shape.
const UPLOAD_DIR = MEDIA_DIR;

// Shared with the client so the picker, the import and this writer cannot
// drift apart on what may be stored (see src/lib/imageTypes.ts).
const ALLOWED_IMAGE_TYPES = STORABLE_IMAGE_TYPES;

// Audio voice notes (AUDIO items). MediaRecorder in the browser produces these
// container types; the File.type may carry a codecs parameter (e.g.
// "audio/webm;codecs=opus"), which is stripped before lookup below. Kept to a
// short, unambiguous allow-list — m4a (Safari), webm/ogg (Chrome/Firefox), mp3.
// Video is deliberately NOT accepted here (a voice note is audio-only).
const ALLOWED_AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a", // Safari MediaRecorder; .m4a keeps it unambiguously audio-only
  "audio/mpeg": "mp3",
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — plenty for a photo, drawing or short voice note

// A picture's pixel size, recorded in its own filename as "-<w>x<h>".
//
// WHY IN THE NAME. The canvas draws an image object at the width and height the
// object carries, with objectFit: "fill" — so a picture placed in a box of the
// wrong shape is STRETCHED, not letterboxed. That is invisible for a photograph
// and ruinous for a worksheet: the connector's picture slot is 4:3, and a
// cropped part-whole model dropped into it comes out as ovals where the child
// is being asked about circles.
//
// So whatever places a picture has to know its shape. The path is the only thing
// that survives the round trip — the connector hands an asset id to the model
// and the model hands it back — and re-reading the file to measure it would
// mean reading a stored upload back on a caller's say-so, which is a door this
// code does not otherwise open. Putting the size in the name costs nothing,
// leaks nothing (the bytes are already the caller's own), and is readable
// without touching the disk. The /uploads route's SAFE_NAME already permits it.
function sizeTag(size?: { width: number; height: number }): string {
  return size && size.width > 0 && size.height > 0 ? `-${size.width}x${size.height}` : "";
}

// The pixel size recorded in an /uploads path, or null when there is none —
// which is every picture stored before this existed, and every picture whose
// format we cannot measure. Callers treat null as "place it however you would
// have placed it before".
export function sizeFromPath(urlPath: string): { width: number; height: number } | null {
  const m = /-(\d{1,5})x(\d{1,5})\.[a-z0-9]+$/i.exec(urlPath);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

async function writeBytes(bytes: Buffer, ext: string, size?: { width: number; height: number }): Promise<string> {
  if (bytes.length > MAX_BYTES) {
    throw new Error("That file is too big (max 15 MB).");
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}${sizeTag(size)}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), bytes);
  return `/uploads/${name}`;
}

// Save bytes we have already decoded and measured — a cropped region of a
// worksheet, for instance. The size is recorded in the name; see sizeTag.
export async function saveSizedImage(
  bytes: Buffer,
  ext: "png" | "jpg" | "webp",
  size: { width: number; height: number },
): Promise<string> {
  return writeBytes(bytes, ext, size);
}

// Save an uploaded photo (a File from a form) and return its public path.
export async function savePhoto(file: File): Promise<string> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    throw new Error("That file type isn't supported. Please use a photo (PNG or JPG).");
  }
  return writeBytes(Buffer.from(await file.arrayBuffer()), ext);
}

// Save a recorded voice note (a File/Blob from the browser's MediaRecorder,
// submitted through the same authorised Server Action as a photo) and return its
// /uploads path. The stored file is served ONLY through the authorising /uploads
// route, exactly like a photo — never publicly, never to parents except for
// approved items (SAFEGUARDING rules 4 & 7). Audio-only; video is not accepted.
export async function saveAudio(file: File): Promise<string> {
  const base = file.type.split(";")[0].trim().toLowerCase(); // drop any ";codecs=…"
  const ext = ALLOWED_AUDIO_TYPES[base];
  if (!ext) {
    throw new Error("That recording couldn't be saved. Please try recording again.");
  }
  return writeBytes(Buffer.from(await file.arrayBuffer()), ext);
}

// Save an image supplied as a data URL (from the drawing canvas or a live
// camera capture) and return its public path. Accepts png / jpeg / webp.
export async function saveImageDataUrl(
  dataUrl: string,
  size?: { width: number; height: number },
): Promise<string> {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("That image couldn't be read.");
  }
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  return writeBytes(Buffer.from(match[2], "base64"), ext, size);
}

// Save an ordered set of drawing pages (each a PNG data URL) and return their
// public paths in order.
export async function saveImagePages(dataUrls: string[]): Promise<string[]> {
  if (dataUrls.length === 0) {
    throw new Error("Please draw something first.");
  }
  return Promise.all(dataUrls.map((d) => saveImageDataUrl(d)));
}

// Erase uploaded media files from disk. Used when children's work is deleted so
// erasure is real, not just row removal (SAFEGUARDING.md rule 9). Takes the
// stored `/uploads/<file>` URLs; only the basename is used, so a tampered path
// can never escape MEDIA_DIR. Missing files are ignored (already gone is fine).
export async function deleteMediaFiles(
  urls: Array<string | null | undefined>,
): Promise<void> {
  const names = new Set<string>();
  for (const url of urls) {
    if (!url || !url.startsWith(UPLOADS_PREFIX)) continue;
    const name = path.basename(url);
    if (name && name !== "." && name !== "..") names.add(name);
  }
  await Promise.all(
    [...names].map(async (name) => {
      try {
        await unlink(path.join(UPLOAD_DIR, name));
      } catch {
        // File already absent (or never written) — deletion is still satisfied.
      }
    }),
  );
}
