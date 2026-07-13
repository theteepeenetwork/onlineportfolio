// Shared types + helpers for the template's movable-objects layer.
//
// A template can carry "objects" — pictures, shapes and text boxes the teacher
// places on the canvas. Unlike the quiz layer, objects DO get flattened into a
// child's submitted PNG (so their sorted / arranged answer is visible in their
// work), but they are ALSO stored here as structured data so that:
//   • the teacher can re-open and edit every object again, and
//   • a child can pick up and MOVE the ones the teacher left UNLOCKED, while
//     the LOCKED ones stay fixed (they are part of the worksheet).
//
// The teacher sets each object's `locked` flag with the padlock on the canvas.
// `fromTemplate` is a runtime-only marker (never persisted) that tells the
// child's canvas "this came from the template", so its lock rules apply.
//
// No `server-only` here: imported by both the client canvas and the server
// actions. Keep it free of DB / Node-only imports (mirrors quiz.ts).

// Canvas model space (matches DrawingCanvas W×H). Object geometry is stored in
// these units and scaled for display, so it is resolution-independent.
export const OBJ_W = 1000;
export const OBJ_H = 700;

// Guardrails (hand-rolled validation — there is no zod in this repo).
export const MAX_OBJECTS_PER_PAGE = 120;
export const MAX_OBJECT_PAGES = 60;
export const MAX_LABEL_LEN = 500;
export const MAX_COLOR_LEN = 32;

export type ShapeKind = "rect" | "ellipse" | "triangle" | "star" | "speech";
const SHAPE_KINDS: ShapeKind[] = ["rect", "ellipse", "triangle", "star", "speech"];

// Fields shared by every placed object.
type ObjCommon = {
  id: string;
  x: number;
  y: number;
  // The teacher's lock decision. Locked = a child cannot move it. Absent/false
  // = unlocked (a child may drag it). Meaningless for the child's OWN objects.
  locked?: boolean;
  // Runtime-only: set true when hydrated from the template into a child's /
  // preview canvas. NEVER persisted (stripped on save).
  fromTemplate?: boolean;
};

export type ImageObj = ObjCommon & {
  type: "image";
  src: string; // "/uploads/<file>" at rest; a data:image URL only while authoring
  w: number;
  h: number;
  aspect: number;
};

export type ShapeObj = ObjCommon & {
  type: "shape";
  shape: ShapeKind;
  w: number;
  h: number;
  fill: string; // "none" for outline only
  stroke: string;
  strokeWidth: number;
  text?: string;
  textColor?: string;
};

export type TextObj = ObjCommon & {
  type: "text";
  text: string;
  fontPx: number;
  color: string;
};

export type CanvasObj = ImageObj | ShapeObj | TextObj;

// The stored payload: one array of objects per canvas page (index-aligned with
// the template pages), so an object always lands back on its page.
export type TemplateObjects = { pages: CanvasObj[][] };

// Is this a value we're willing to persist as an image source? A data:image URL
// (freshly authored, rewritten to a path by the action) or an already-saved
// /uploads path. Anything else is rejected so path-shaped junk is never stored
// and later fed to the media route (mirrors quiz.isAllowedImagePath).
export function isAllowedImageSrc(v: unknown): v is string {
  return typeof v === "string" && (v.startsWith("data:image") || v.startsWith("/uploads/"));
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

// Normalise one raw object into a safe CanvasObj, or null to drop it. Geometry
// is clamped into model space; unknown / unsafe entries are discarded rather
// than throwing, so a single bad object never blocks a teacher's save.
function normalizeObject(raw: unknown): CanvasObj | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : null;
  if (!id) return null;
  const x = clamp(num(o.x), -OBJ_W, OBJ_W * 2);
  const y = clamp(num(o.y), -OBJ_H, OBJ_H * 2);
  const locked = o.locked === true ? true : undefined;

  if (o.type === "image") {
    if (!isAllowedImageSrc(o.src)) return null;
    const aspect = num(o.aspect, 1) || 1;
    const w = clamp(num(o.w, 100), 8, OBJ_W);
    const h = clamp(num(o.h, 100), 8, OBJ_H * 2);
    return { id, type: "image", src: o.src, x, y, w, h, aspect, locked };
  }

  if (o.type === "shape") {
    const shape = SHAPE_KINDS.includes(o.shape as ShapeKind) ? (o.shape as ShapeKind) : "rect";
    const w = clamp(num(o.w, 100), 8, OBJ_W);
    const h = clamp(num(o.h, 100), 8, OBJ_H);
    const text = typeof o.text === "string" ? str(o.text, MAX_LABEL_LEN) : undefined;
    const textColor = typeof o.textColor === "string" ? str(o.textColor, MAX_COLOR_LEN) : undefined;
    return {
      id,
      type: "shape",
      shape,
      x,
      y,
      w,
      h,
      fill: str(o.fill, MAX_COLOR_LEN) || "none",
      stroke: str(o.stroke, MAX_COLOR_LEN) || "#1f2430",
      strokeWidth: clamp(num(o.strokeWidth, 6), 0, 80),
      ...(text ? { text } : {}),
      ...(textColor ? { textColor } : {}),
      locked,
    };
  }

  if (o.type === "text") {
    return {
      id,
      type: "text",
      text: str(o.text, MAX_LABEL_LEN),
      x,
      y,
      fontPx: clamp(num(o.fontPx, 32), 8, 400),
      color: str(o.color, MAX_COLOR_LEN) || "#1f2430",
      locked,
    };
  }

  return null;
}

// Normalise a raw per-page array-of-arrays into a safe TemplateObjects. Drops
// bad objects / pages and caps counts. Never throws.
export function normalizeTemplateObjects(raw: unknown): TemplateObjects {
  if (!Array.isArray(raw)) return { pages: [] };
  const pages = raw.slice(0, MAX_OBJECT_PAGES).map((page) => {
    if (!Array.isArray(page)) return [];
    const out: CanvasObj[] = [];
    for (const item of page) {
      if (out.length >= MAX_OBJECTS_PER_PAGE) break;
      const obj = normalizeObject(item);
      if (obj) out.push(obj);
    }
    return out;
  });
  return { pages };
}

// Tolerant reader for JSON stored in the DB. Returns an empty payload on any
// problem (used at render / hydrate time, where a bad payload should degrade
// gracefully rather than error).
export function readTemplateObjects(raw: string | null | undefined): TemplateObjects {
  if (!raw) return { pages: [] };
  try {
    return normalizeTemplateObjects(JSON.parse(raw));
  } catch {
    return { pages: [] };
  }
}

// Does this payload actually contain any objects? Used to skip storing "[]".
export function hasObjects(t: TemplateObjects): boolean {
  return t.pages.some((p) => p.length > 0);
}
