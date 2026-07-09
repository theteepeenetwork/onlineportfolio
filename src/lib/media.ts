import "server-only";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Where uploaded photos and drawings live. Files here are served statically
// by Next.js at /uploads/<filename>.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — plenty for a photo or drawing

async function writeBytes(bytes: Buffer, ext: string): Promise<string> {
  if (bytes.length > MAX_BYTES) {
    throw new Error("That file is too big (max 15 MB).");
  }
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), bytes);
  return `/uploads/${name}`;
}

// Save an uploaded photo (a File from a form) and return its public path.
export async function savePhoto(file: File): Promise<string> {
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) {
    throw new Error("That file type isn't supported. Please use a photo (PNG or JPG).");
  }
  return writeBytes(Buffer.from(await file.arrayBuffer()), ext);
}

// Save an image supplied as a data URL (from the drawing canvas or a live
// camera capture) and return its public path. Accepts png / jpeg / webp.
export async function saveImageDataUrl(dataUrl: string): Promise<string> {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("That image couldn't be read.");
  }
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  return writeBytes(Buffer.from(match[2], "base64"), ext);
}

// Save an ordered set of drawing pages (each a PNG data URL) and return their
// public paths in order.
export async function saveImagePages(dataUrls: string[]): Promise<string[]> {
  if (dataUrls.length === 0) {
    throw new Error("Please draw something first.");
  }
  return Promise.all(dataUrls.map((d) => saveImageDataUrl(d)));
}
