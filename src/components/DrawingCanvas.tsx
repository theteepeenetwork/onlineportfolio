"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icons/Icon";
import { ShapeThumb } from "./canvas/ShapeThumb";
import { PenArt, PenFan, PlusFan, type PlusItem, type PlusOption } from "./canvas/Fan";
import { PageTray } from "./canvas/PageTray";
import { KitPalette } from "./canvas/KitPalette";
import {
  defaultWindowPos,
  FloatingWindow,
  windowW,
  type WindowPos,
} from "./canvas/FloatingWindow";
import { ChromeDone, ChromePill, ChromeRound, StatusChip, Toast } from "./canvas/Chrome";
import {
  DISC,
  FAN_COLOURS,
  FRAME_H,
  FRAME_W,
  NEAR_X,
  WHITE,
  discCy,
  penCx,
  penDir,
  Z_BASE,
  Z_CHROME,
  plusCx,
  plusDir,
} from "@/lib/canvasFan";
import { readHand, serverHand, subscribeHand, writeHand } from "@/lib/canvasHand";
import { TeacherNote } from "@/app/student/TeacherNote";
import {
  MIN_OPTIONS,
  MAX_OPTIONS,
  type QuizOption,
  type QuizPayload,
  type QuizQuestion,
  type QuizAnswer,
} from "@/lib/quiz";
import {
  loadDraft,
  patchDraft,
  deleteDraft,
  purgeExpired,
  markDraftForClear,
  RETENTION_MS,
  type DraftCanvasV1,
  type DraftSurface,
} from "@/lib/draftStore";
import { serverSaveDraft, serverLoadDraftBounded, serverDiscardDraft } from "@/lib/draftSync";
import {
  MAX_OBJECTS_PER_PAGE,
  MIN_FRAME_W,
  MIN_FRAME_H,
  FRAME_DEFAULT_W,
  FRAME_DEFAULT_H,
  FRAME_PHOTO_MAX_PX,
  LINK_DEFAULT_H,
  LINK_DEFAULT_W,
  LINK_LABEL_REFUSAL_COPY,
  LINK_REFUSAL_COPY,
  MAX_LINK_LABEL_LEN,
  MIN_LINK_H,
  MIN_LINK_W,
  displayHost,
  linkLabelNamesUpload,
  parseTeacherLink,
  tidyLinkLabel,
  rotateStepFor,
  wrapRotation,
  type CanvasObj,
} from "@/lib/canvasObjects";
import { studentCopyNeutral } from "@/lib/copy/student";
import { CameraDialog } from "./camera/CameraDialog";
import { isStorableImageType } from "@/lib/imageTypes";
import { readAloud, readAloudOnDevice } from "@/lib/readAloud";
import { useOnDeviceVoiceReady } from "@/lib/useSpeechReady";
import {
  detailStrokeWidth,
  kitsToShow,
  type Kit,
  isVectorKind,
  minShapeSize,
  DEFAULT_RING_THICKNESS,
  MAX_DIVISIONS,
  MAX_RING_THICKNESS,
  MIN_RING_THICKNESS,
  MAX_PARTS,
  MIN_DIVISIONS,
  MIN_PARTS,
  MIN_SIDES,
  MAX_SIDES,
  MIN_LINE_START,
  MAX_LINE_START,
  MIN_LINE_STEP,
  MAX_LINE_STEP,
  DEFAULT_LINE_STEP,
  OPERATOR_KINDS,
  OPERATOR_LABEL,
  type OperatorKind,
  shapeAspect,
  shapeFillRule,
  shapeInnerBox,
  shapeParts,
  shapeTextMarks,
  BASE_KITS,
  SHAPE_DEFAULTS,
  type KitId,
  type ShapeKind,
  type ShapePreset,
} from "@/lib/canvasShapes";

// Deep-clone the questions we get from props so our editing never mutates the
// caller's object. Quiz questions live in their own layer (quizRef) and are
// NEVER flattened into the page PNG — that invariant is what keeps a child's
// drawing free of the question boxes and the compositing tests untouched.
function cloneQuestions(qs: QuizQuestion[]): QuizQuestion[] {
  return qs.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) }));
}

// Which pages were added, read back from a stored draft. Anything other than
// one flag per page reads as "none were": a cross on a teacher's template page
// is the failure to avoid, and a cross missing from a child's own page is only
// a missing shortcut — the page is still theirs to wipe clean.
function addedFlags(raw: unknown, n: number): boolean[] {
  if (!Array.isArray(raw) || raw.length !== n) return Array.from({ length: n }, () => false);
  return raw.map((v) => v === true);
}

// ONE palette, everywhere a colour is offered: the pen fan, the object bar's
// fill and line menus, the inline editor. They used to be a stock Tailwind row
// here and the brand ten in the design; a child who picked "the green one" on
// the pen and then on a shape got two different greens.
//
// White is the eleventh and is not a brand colour: it is how you draw on a
// photograph, and taking it away is what the hue bar did wrong (pen-width.spec).
const SWATCHES = [...FAN_COLOURS.map((c) => c.hex), WHITE.hex];
const SIZES = [6, 12, 22];
// Bounds of the child canvas line-thickness slider.
const MIN_WIDTH = 2;
const MAX_WIDTH = 30;

type Tool = "cursor" | "pencil" | "pen" | "highlighter" | "eraser" | "text";

// Each drawing tool keeps its OWN thickness for the session — pick a chunky
// highlighter and a fine Pen and each one stays where you left it, exactly like
// the per-tool colours below. These are the on-load defaults.
const DEFAULT_TOOL_SIZES: Record<Tool, number> = {
  cursor: SIZES[1],
  pencil: SIZES[1], // Pen
  pen: SIZES[1], // Felt tip
  highlighter: SIZES[1], // Highlighter
  eraser: SIZES[1],
  text: SIZES[1],
};
// The four drawing tools map onto four distinct nib shapes + stroke weights:
// pencil → Pen (thin), pen → Felt tip (thick), highlighter (wide/translucent),
const TOOLS: { key: Tool; label: string; icon?: IconName }[] = [
  { key: "cursor", label: "Move", icon: "select" },
  { key: "pencil", label: "Pen", icon: "pen" },
  { key: "pen", label: "Felt tip", icon: "felt-tip" },
  { key: "highlighter", label: "Highlighter", icon: "highlighter" },
  { key: "eraser", label: "Eraser", icon: "eraser" },
  { key: "text", label: "Text", icon: "text" },
];

// The shelf: tools stand in a row, sunk to their nibs until picked. Move is a
// shelf tool like the rest — the arrow stands where a pen would.
//
// It is only OFFERED when there is something to move (see `canMove` in the
// component). "Select" was a desktop convention: a child tapping it found every
// pen had silently stopped working, with nothing on screen to say why. Silent
// mode-switches are the classic child-UX trap, and a Year 1 doesn't know what a
// pointer is — they just touch.
//
// Conditional existence, not the glyph, is what protects the child: a tool that
// can't be reached when it can't act can't strand anyone, whatever it looks
// like. (A hand was tried in place of the arrow and reverted on the owner's
// call — it didn't read well on the shelf.)
//
// NOT auto-returning to the last pen after a move, which is what the audit
// proposed: `objectMode="answer"` (a drag-the-objects worksheet) STARTS on this
// tool because moving IS the task, so handing the child a pencil after their
// first move would turn their next tap into a stray dot on their answers. A
// tool that only exists when it can do something never strands anyone, and the
// app never has to guess what a five-year-old meant.
const SHELF: { key: Tool; label: string }[] = [
  { key: "cursor", label: "Move" },
  { key: "pencil", label: "Pen" },
  { key: "pen", label: "Felt tip" },
  { key: "highlighter", label: "Highlighter" },
  { key: "eraser", label: "Eraser" },
];

// Each drawing tool keeps its OWN colour for the session — switching tools
// restores that tool's last colour instead of forcing whatever the picker last
// showed. These are the on-load defaults (black Pen, blue Felt tip, …).
const DEFAULT_TOOL_COLORS: Record<Tool, string> = {
  cursor: "#22304a", // unused (move tool)
  pencil: "#22304a", // Pen — ink
  pen: "#3b82f6", // Felt tip — blue
  highlighter: "#f0b441", // honey highlight
  eraser: "#22304a", // unused (erases)
  text: "#22304a", // ink
};

// The fill a plain shape arrives in until a child recolours one. Bright fan
// blue, not the pen's colour: a page that opens on Move holds ink, and a first
// shape landing in navy read as a mistake. Once a shape's fill is changed the
// next shape takes that colour, and a fresh canvas starts here again.
const DEFAULT_SHAPE_FILL = "#3b82f6";
// A shape lands at three-quarters of its preset size. The presets are drawn
// for the fan thumbnails and for their own proportions; on the page, full
// size was too much of a child's screen for one tap. Owner's call, Sept 2026.
const ADD_SCALE = 0.75;

const W = 1000;
const H = 700;
const FONT_STACK = "ui-rounded, system-ui, -apple-system, 'Segoe UI', sans-serif";
// Twelve steps back, not thirty. Every entry is a full-page PNG of the stroke
// layer plus a copy of the page's objects, and BOTH stacks hold them, so the
// old number could pin sixty page images in memory on a device that has very
// little of it. Twelve is more undos than a child has ever asked for and a
// fifth of the memory. (10 Sep 2026 incident: iPads jettisoning the tab.)
const MAX_HISTORY = 12;
// See loadImage() for why an image load needs a deadline at all, and why this
// number is a backstop against a hang rather than a latency policy.
const IMAGE_LOAD_BUDGET_MS = 30_000;

// A quiz box is born at this size, and its contents are designed at it: the
// type sizes below are "at QUIZ_W × QUIZ_H". A resized box scales its contents
// from these, so they're the maximum rather than a fixed size.
const QUIZ_W = 380;
const QUIZ_H = 300;
// How much a question box grows for each answer added, and shrinks for each
// taken away — the design's 50 a row — so the box always has room for its own
// answers rather than clipping the fourth.
const QUIZ_ROW = 50;
// How small a teacher may drag a box: a quiz can be a small aside on a busy
// worksheet, not just the main event. Well under the old 220×160 floor — which
// was nominal anyway, since at that size the old fixed-size contents didn't fit
// and simply got clipped. Contents scale now, so every size down to here shows
// everything. Note this is child-facing text: at the floor the answers are
// ~6px, so it's the teacher's judgement, not a size to design at.
const QUIZ_MIN_W = 150;
const QUIZ_MIN_H = 120;

// Drag snap for placed shapes, in canvas model units (model space is 1000×700).
const SNAP_UNITS = 10;

// The ＋ fan icon for each toolbox kit. Exhaustive over KitId, so a kit added to
// the registry cannot ship without someone choosing its icon.
const KIT_ICON: Record<KitId, IconName> = {
  shapes: "shapes",
  maths: "maths-kit",
  diagrams: "shapes",
  writing: "text",
};

// How far a duplicate lands from the thing it was copied from. Two snap steps,
// so the clone sits on the grid rather than half a step off it.
const DUPLICATE_OFFSET = SNAP_UNITS * 2;

// The longest side an imported picture is kept at. The canvas model is
// 1000×700, so this is already twice the detail it can show — headroom for a
// hand-in printed at a higher resolution, and nothing beyond that. A phone
// photo arrives at 3840 wide; carried at full size, ONE of them is bigger than
// the 16 MB a server action will accept.
const MAX_IMPORT_PX = 2000;

// The same, for a picture inside a quiz answer. Much smaller because that is
// how it is shown — an answer's image renders at about thumbnail size, and
// several of them ride in one form post.
const MAX_OPTION_PX = 600;

// One press of the toolbar's Turn buttons.
//
// This used to be the step for EVERYTHING that turned, and a flat step was the
// bug: rotation is judged by how far the far end of a thing travels, so 15° is
// comfortable on a counter and unusable on a 420-unit line, whose ends move
// 5.5% of the page every step. Dragging now uses `rotateStepFor(length)`, which
// gives a long object a finer step — see src/lib/canvasObjects.ts and
// docs/rotation-findings.md.
// The toolbar's coarse 15° turn buttons went in September 2026: the handle,
// by drag or arrow key, is the one control for turning.

// One press of Bigger / Smaller, as a proportion. 10% is small enough that a
// child can stop where they meant to and large enough that getting somewhere
// does not take twenty presses. Proportional rather than a fixed number of
// units so it behaves the same on a counter and on a number line.
const SIZE_STEP = 1.1;

// The corner drag handle (F41). Edit and delete moved into the floating toolbar
// at 64px, and the handle that stayed on the corner has to be pressable at the
// same size — so the *press* is a 64px box centred on the corner and the dot a
// child sees inside it stays small enough not to hide the work underneath.
// Positioned by the caller with a matching -8 (32px) inset on the two sides it
// hangs off.
// The child touch floor (SAFEGUARDING rule 18), as a number the offsets can be
// derived from rather than a second place to keep in step.
const HIT_PX = 64;

// The sign each operator draws, for the settings row's seven buttons. Glyphs
// here only; the accessible name is the word (OPERATOR_LABEL), because "×" read
// aloud is not reliably "times".
const OPERATOR_GLYPH: Record<OperatorKind, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  equals: "=",
  less: "<",
  greater: ">",
};
// Above the floating toolbar's `z-30`. The two can only meet where there is room
// for the toolbar neither above nor below the object — the case the placement
// below deliberately accepts — and when they do, the object's own controls are
// the ones that must stay pressable. A toolbar button a child cannot reach is
// recoverable by moving the object first; a delete that eats the tap is not.
const HANDLE_HIT =
  "pointer-events-auto absolute z-40 flex h-16 w-16 items-center justify-center touch-none";

// Half the height of the box a turned object actually occupies on screen — which
// is to say exactly where its topmost and bottommost corners land, because the
// axis-aligned box of a rotated rectangle touches its extreme corners. The
// floating toolbar is placed off THIS rather than off the object's own unturned
// height, so that turning an object cannot swing a corner control into the
// toolbar's band. Shared by the shape and the text box, which used to disagree:
// the text box ignored rotation here altogether. Dimensions in SCREEN px.
function rotatedHalfSpan(w: number, h: number, rot: number) {
  if (!rot) return h / 2;
  const rad = (rot * Math.PI) / 180;
  return (Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) / 2;
}

// How far the four corner controls are pushed OUT from their corners, per axis.
//
// A line laid flat is a box a couple of pixels tall, so its top and bottom
// corners are in nearly the same place — and two 64px presses in nearly the
// same place means two of the four controls cannot be hit at all. Below one
// press the controls are spread until exactly one press separates them, which
// leaves a flat line with a control at each end of both its edges instead of a
// pile at each end. At any ordinary size this is zero and each control sits
// dead on its corner, as it must.
function controlSpread(w: number, h: number) {
  return { x: Math.max(0, HIT_PX - w) / 2, y: Math.max(0, HIT_PX - h) / 2 };
}

// How far from an object's centre the toolbar has to start. The rotated span
// reaches the corner; each corner control is a HIT_PX press CENTRED on that
// corner, so it reaches half a press further. Clearing both is what keeps the
// toolbar off the controls — at every angle, including none at all, where the
// toolbar used to sit over the top 20px of both top presses.
//
// The span is taken of a box no smaller than one press in either direction,
// because that is where `controlSpread` has just put the controls of anything
// flatter.
function toolbarClearance(w: number, h: number, rot: number) {
  return rotatedHalfSpan(Math.max(w, HIT_PX), Math.max(h, HIT_PX), rot) + HIT_PX / 2;
}

// The breathing space between the toolbar and the object it belongs to.
const TOOLBAR_GAP = 12;

// Movable / resizable things placed on top of the drawing: imported pictures
// (images / PDF pages) and shapes.
// Placed-object lock state. `locked` is the teacher's decision (a child cannot
// move a locked object); `fromTemplate` marks objects hydrated from a template
// so the child's canvas knows which lock rules apply. See src/lib/canvasObjects.
type ObjLock = {
  locked?: boolean;
  fromTemplate?: boolean;
};
type ImageObj = ObjLock & {
  id: string;
  type: "image";
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  aspect: number;
  // Mirrors ImageObj in src/lib/canvasObjects.ts — what the picture shows, for a
  // child using a screen reader. Carried through hydration so an image placed by
  // the API keeps its words.
  alt?: string;
};
type ShapeObj = ObjLock & {
  id: string;
  type: "shape";
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string; // "none" for outline only
  stroke: string;
  strokeWidth: number;
  // An optional label locked inside the shape (added by double-tapping it). It
  // wraps and auto-sizes to fit the shape's current bounds.
  text?: string;
  textColor?: string;
  // grid: columns and rows. pie / ring / clock: equal parts. See canvasShapes —
  // these are what let one kind front a ten rod, a ten frame and a fraction bar.
  cols?: number;
  rows?: number;
  parts?: number;
  // ring: the band as a percentage of the radius. clock: whether the numerals
  // 1–12 are drawn.
  thickness?: number;
  // clock: whether the numerals 1–12 are drawn.
  // numberline: whether the numbers are printed under the ticks.
  numerals?: boolean;
  // numberline: the number under the first tick, and what one step is worth.
  // `parts` carries how many segments, so the last number is start + parts*step.
  start?: number;
  step?: number;
  // operator: which of the four signs it draws.
  operator?: OperatorKind;
  // polygon: how many sides.
  sides?: number;
  // Teacher-set: a SOURCE a child drags copies out of. See canvasObjects.
  infinite?: boolean;
  // Locks the proportion on resize, for shapes that only mean what they mean at
  // a fixed ratio (a hundred flat is square or it is not a hundred).
  lockAspect?: boolean;
  fixedGrid?: boolean;
  // Rotation in degrees, 0–359, set by the rotate handle. Applied to the object
  // WRAPPER, so the browser rotates hit-testing and the selection outline with
  // it, and honoured identically by the export renderer.
  rot?: number;
};

// Give a scratch canvas's pixels back to the browser.
//
// Dropping the last reference to a canvas element is not the same as freeing
// it: the backing store lives outside the JavaScript heap and is released when
// the collector gets round to the wrapper, which on a tab that is already short
// of memory is exactly when it will not. A 1000x700 page is 2.8 MB of it, and a
// scaled PDF page several times that. Setting either dimension throws the
// backing store away at once, and every call here is on a canvas this file
// created, drew once, encoded and will never look at again.
function releaseCanvas(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

// The Pages strip used to be shown full-size page images scaled down by the
// browser to 96x84, so a ten-page drawing kept ten more full-page PNGs alive
// just to draw ten postage stamps. These are real thumbnails: 200x140 (the
// page's proportion, at twice the size it is shown, for a retina screen) as
// JPEG, which is a few kilobytes rather than a couple of megabytes.
const THUMB_W = 200;
const THUMB_H = 140;
// One canvas for every thumbnail ever drawn, like `measureCanvas` below. It is
// 200x140, so keeping it costs less than the churn of creating one per page.
let thumbCanvas: HTMLCanvasElement | null = null;
function thumbFrom(src: HTMLCanvasElement): string {
  if (!thumbCanvas) thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = THUMB_H;
  const tc = thumbCanvas.getContext("2d");
  if (!tc) return "";
  // JPEG has no transparency, so the paper has to be painted or the gaps in a
  // drawing come out black.
  tc.fillStyle = "#ffffff";
  tc.fillRect(0, 0, THUMB_W, THUMB_H);
  tc.drawImage(src, 0, 0, THUMB_W, THUMB_H);
  return thumbCanvas.toDataURL("image/jpeg", 0.7);
}

// Wrap + auto-size text to fit centred inside a box. Used both to render a
// shape's label and to draw it into the exported image, so they always match.
let measureCanvas: HTMLCanvasElement | null = null;
function fitTextToBox(
  text: string,
  boxW: number,
  boxH: number,
  // The largest size to try. A shape's label wants the biggest that fits, so
  // this is open by default; a question's prompt has a size of its own and
  // only ever needs wrapping DOWN from it.
  maxFontPx?: number,
): { fontPx: number; lines: string[]; lineHeight: number } {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return { fontPx: 24, lines: [], lineHeight: 29 };
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const mc = measureCanvas.getContext("2d")!;
  const maxW = Math.max(1, boxW - Math.max(10, boxW * 0.14));
  const maxH = Math.max(1, boxH - Math.max(10, boxH * 0.14));

  const wrap = (fontPx: number) => {
    mc.font = `600 ${fontPx}px ${FONT_STACK}`;
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (!cur || mc.measureText(test).width <= maxW) cur = test;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const start = Math.min(maxFontPx ?? 140, 140, Math.max(8, Math.floor(maxH)));
  for (let fontPx = start; fontPx >= 8; fontPx -= 2) {
    const lines = wrap(fontPx);
    const lineHeight = fontPx * 1.2;
    mc.font = `600 ${fontPx}px ${FONT_STACK}`;
    const widest = lines.reduce((m, l) => Math.max(m, mc.measureText(l).width), 0);
    if (widest <= maxW && lines.length * lineHeight <= maxH) {
      return { fontPx, lines, lineHeight };
    }
  }
  return { fontPx: 8, lines: wrap(8), lineHeight: 9.6 };
}
// A text box is also a placed object, so it can be re-selected, moved, resized
// and re-edited after it's created.
type TextObj = ObjLock & {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  fontPx: number;
  color: string;
  // Degrees, 0–359, absent when upright. The same field a shape carries, so the
  // turn handle means one thing on this canvas rather than two.
  rot?: number;
};
// Mirrors FrameObj in src/lib/canvasObjects.ts. The teacher places the box;
// the child fills it from the camera. `src` only ever exists on a child's
// canvas (and in their own draft), and is flattened into the page they hand in.
type FrameObj = ObjLock & {
  id: string;
  type: "frame";
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string;
  alt?: string;
  label?: string;
};
// Mirrors LinkObj in src/lib/canvasObjects.ts (SAFEGUARDING rule 26). A box
// naming a website the teacher chose; on a child's canvas it is pressed through
// LinkTapLayer, which reads the address from the teacher's snapshot and never
// from this object.
type LinkObj = ObjLock & {
  id: string;
  type: "link";
  x: number;
  y: number;
  w: number;
  h: number;
  href: string;
  label?: string;
};
type Obj = ImageObj | ShapeObj | TextObj | FrameObj | LinkObj;
// `seq` orders an entry against the page actions below, which live on a stack
// of their own: undo takes whichever is newest, across every page.
type HistoryEntry = { img: string; objects: Obj[]; seq?: number };

// A page lifted out whole, so that it can be put back exactly. Every per-page
// array holds one entry for it, its questions carry their own page index, and
// it keeps its own undo history: dropping that history would let a later undo
// take away a page that still had a drawing on it nobody had undone.
type PageSnapshot = {
  page: string;
  template: string | null;
  objects: Obj[];
  composite: string;
  preview: string;
  thumb: string;
  added: boolean;
  questions: QuizQuestion[];
  history: HistoryEntry[];
};
// Something done to the pages rather than on one. There is no redo for these:
// redo replays the step just undone, and a page action is the rarer thing to
// regret undoing than the stroke a child is chasing.
//
// Each carries what it takes to go back to the page the person was on:
// `from` for the three that make or move a page.
type PageAction =
  | { kind: "delete"; seq: number; index: number; snap: PageSnapshot }
  | { kind: "add"; seq: number; index: number; from: number }
  | { kind: "copy"; seq: number; index: number; from: number }
  | { kind: "move"; seq: number; from: number; to: number };

// One cap, in one place, for both stacks. The redo stack used to be uncapped,
// which is not a smaller stack — an undo pushes the page onto it, so undoing
// twelve times moves twelve full-page snapshots across rather than freeing
// them. Push then trim from the bottom: the oldest step is the one to lose.
function pushCapped(stack: HistoryEntry[], entry: HistoryEntry) {
  stack.push(entry);
  if (stack.length > MAX_HISTORY) stack.shift();
}

// The smallest an object may be resized to, by drag or by button. A line or a
// rule really is a box a couple of units tall; an area shape keeps 24 so it
// cannot be squashed to nothing and lost; a photo frame keeps room for the
// child's 64px "take it again" button.
function minObjSize(o: Obj): { w: number; h: number } {
  if (o.type === "shape") {
    const m = minShapeSize(o.shape);
    return { w: m, h: m };
  }
  if (o.type === "frame") return { w: MIN_FRAME_W, h: MIN_FRAME_H };
  if (o.type === "link") return { w: MIN_LINK_W, h: MIN_LINK_H };
  return { w: 24, h: 24 };
}

// A web link, drawn into a page picture: the same chip the screen shows, at the
// same model-unit sizes, so a child's hand-in shows the link they worked beside.
// Only fixed shapes and the two strings — the teacher's label and the real host
// — and both are drawn as text, never interpreted.
const LINK_PAD = 16;
const LINK_ICON = 44;
// The chip's words, in model units: what is left of its width once the padding,
// the round badge and the gap beside it are taken out.
function linkTextRoom(o: { w: number }) {
  return Math.max(10, o.w - (LINK_PAD * 3 + LINK_ICON));
}
function linkFont(weight: number, px: number) {
  return `${weight} ${px}px ${FONT_STACK}`;
}

// A host too long for the room it has, shortened from the LEFT with an
// ellipsis, so the end of it — the part that says who owns it — is always what
// shows (rule 26). "bbc.co.uk.evil-site.example.com" cut from the right reads
// "bbc.co.uk.evi…", which is the one reading a host must never have. Measured
// with the font it is drawn in, in model units, so the screen and the hand-in
// picture shorten it by the same rule.
let hostMeasure: CanvasRenderingContext2D | null | undefined;
function fitHostFromLeft(host: string, font: string, room: number): string {
  if (typeof document === "undefined") return host;
  if (hostMeasure === undefined) hostMeasure = document.createElement("canvas").getContext("2d");
  const m = hostMeasure;
  if (!m) return host;
  m.font = font;
  if (m.measureText(host).width <= room) return host;
  for (let keep = host.length - 1; keep > 1; keep--) {
    const s = `…${host.slice(host.length - keep)}`;
    if (m.measureText(s).width <= room) return s;
  }
  return `…${host.slice(-1)}`;
}

function drawLinkChip(ec: CanvasRenderingContext2D, o: LinkObj) {
  const host = displayHost(o.href);
  ec.save();
  ec.beginPath();
  ec.roundRect(o.x, o.y, o.w, o.h, 18);
  ec.fillStyle = "#FFFDF7";
  ec.fill();
  ec.lineWidth = 3;
  ec.strokeStyle = "#22304A";
  ec.stroke();
  // The round badge the chain sits in.
  const cx = o.x + LINK_PAD + LINK_ICON / 2;
  const cy = o.y + o.h / 2;
  ec.beginPath();
  ec.arc(cx, cy, LINK_ICON / 2, 0, Math.PI * 2);
  ec.fillStyle = "#D8ECE8";
  ec.fill();
  ec.lineWidth = 2.5;
  ec.stroke();
  ec.lineCap = "round";
  ec.beginPath();
  ec.moveTo(cx - 6, cy + 6);
  ec.lineTo(cx + 6, cy - 6);
  ec.stroke();
  const tx = o.x + LINK_PAD * 2 + LINK_ICON;
  const room = linkTextRoom(o);
  ec.fillStyle = "#22304A";
  ec.textAlign = "left";
  ec.textBaseline = "middle";
  // `room` is passed to fillText as well, as a last resort: if a font has not
  // finished loading and measures differently, the words are squeezed rather
  // than spilling past the chip.
  if (o.label) {
    ec.font = linkFont(600, 22);
    ec.fillText(o.label, tx, cy - 13, room);
    const font = linkFont(400, 18);
    ec.font = font;
    ec.fillStyle = "#4A5670";
    ec.fillText(fitHostFromLeft(host, font, room), tx, cy + 14, room);
  } else {
    const font = linkFont(600, 22);
    ec.font = font;
    ec.fillText(fitHostFromLeft(host, font, room), tx, cy, room);
  }
  ec.restore();
}

// Crop a captured photo to the frame's proportion, about its centre, capped on
// the long side. On screen the picture is `objectFit: fill` and the export is
// `drawImage(img, x, y, w, h)`; both are only correct because the bitmap
// already has the frame's shape. Same WebP-first, JPEG-fallback rule as
// `normaliseImport`, for the same reason: a PNG of a photograph is enormous.
async function cropToAspect(dataUrl: string, aspect: number, maxLong: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = () => rej(new Error("this device can't open that picture"));
    el.src = dataUrl;
  });
  const sw = img.naturalWidth || 1;
  const sh = img.naturalHeight || 1;
  let cw = sw;
  let ch = Math.round(sw / aspect);
  if (ch > sh) {
    ch = sh;
    cw = Math.round(sh * aspect);
  }
  cw = Math.max(1, cw);
  ch = Math.max(1, ch);
  const sx = Math.round((sw - cw) / 2);
  const sy = Math.round((sh - ch) / 2);
  const k = Math.min(1, maxLong / Math.max(cw, ch));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(cw * k));
  c.height = Math.max(1, Math.round(ch * k));
  const cx = c.getContext("2d");
  if (!cx) throw new Error("this device can't open that picture");
  cx.drawImage(img, sx, sy, cw, ch, 0, 0, c.width, c.height);
  const webp = c.toDataURL("image/webp", 0.9);
  const out = webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.9);
  releaseCanvas(c);
  return out;
}




export function DrawingCanvas({
  name,
  background,
  allowImport = false,
  fullScreen = false,
  title,
  subtitle,
  teacherNote,
  hearItLabel,
  onClose,
  closeLabel,
  onDone,
  quizMode,
  initialQuiz,
  initialAnswers,
  wrongIds,
  quizReview = false,
  objectMode,
  initialObjects,
  draftKey,
  ownerId,
  getExtraDraftFields,
  onRestoreFields,
  confirmSubmit = false,
  pageDelete = "added",
  allowPageStructure = false,
  resumeMode,
  kits = BASE_KITS,
}: {
  name: string;
  background?: string[];
  allowImport?: boolean;
  fullScreen?: boolean;
  title?: string;
  subtitle?: string;
  /**
   * What the teacher asked the child to change, when this is a piece of work
   * that was sent back (F38). Rendered under the title, with its own listen
   * button — see TeacherNote for why that button is conditional.
   */
  teacherNote?: string;
  // There is no caption box on this canvas, for a child or a teacher's
  // preview of one (owner's call, 2026-09-10, on a teacher's feedback). It sat
  // on the page itself, over the drawing, and a child answering a worksheet
  // does not caption it: the activity's title is what names that work (see
  // `momentTitle`). A free drawing is "My drawing" in the jar. Photos and
  // voice notes keep their caption, which lives beside the work, not on it.
  /**
   * Set on a CHILD's response for a register that cannot read yet, and it puts
   * a listen button on the quiz question. The string is the child's own "hear
   * it" wording; the question itself is read from the activity.
   *
   * Left unset there is no button, which is what KS2 and the teacher's own
   * preview get. Speaking is gated a second time inside, on the platform
   * offering an on-device voice — see the button for why.
   */
  hearItLabel?: string;
  onClose?: () => void;
  /**
   * Words on the way out, for a canvas a CHILD is sitting on.
   *
   * Unlabelled, the way out is a ✕ captioned "Close" to a screen reader and
   * nothing at all to a four-year-old, sat next to the green ✓ — so a child who
   * wants to leave either taps hand-in or decides there is no way back. That is
   * the "I have ended up somewhere with no way back to my jar" report, and it
   * lands on the full-screen surfaces because they are `fixed inset-0`: a link
   * on the page or in the layout underneath is covered by the canvas, and a
   * link above it would sit on the drawing. The way out has to be part of the
   * canvas chrome, which is here.
   *
   * Pass the child's own register (`studentCopy(mode).add.backToJar`) and it
   * renders as the same ← pill the rest of the child surface uses. Left unset
   * — the teacher editor and preview — the ✕ is unchanged.
   */
  closeLabel?: string;
  // `previews` are `pages` with the movable pieces drawn on: the picture to
  // show a teacher, where `pages` is the background to hand back to the editor.
  onDone?: (
    pages: string[],
    quiz?: QuizPayload,
    objects?: CanvasObj[][],
    previews?: string[],
  ) => void;
  // When set (and this canvas submits a form rather than calling onDone), the ✓
  // opens a "ready to hand in?" confirmation first — so a child can't submit an
  // activity with a single tap before working through all the pages.
  confirmSubmit?: boolean;
  // Which pages may be thrown away. "added" — the default, and what a child
  // gets — is only the pages added on this canvas: a teacher's template pages
  // are the worksheet, and the shape of what comes back. "any" is the template
  // builder, where the pages are the teacher's own to design. A default that
  // offers less is the safe one to forget (rule 8).
  //
  // The same answer decides which pages may be MOVED (owner decision,
  // 2026-09-10, F76): under "added" a child slides only their own pages, to
  // anywhere, and the teacher's stay in the order the teacher set.
  pageDelete?: "any" | "added";
  // Whether the pages themselves can be RESTRUCTURED — copied and reordered.
  // Separate from deleting one, and off unless asked for: a child's page count
  // is the shape of what they hand in, and copying pages of somebody else's
  // worksheet is not something they need. Only the template builder turns it
  // on (rule 8, deny by default).
  allowPageStructure?: boolean;
  // Which toolbox kits the ＋ fan offers. A LIST rather than a flag per kit, so
  // a new kit needs no new prop and no call-site edit. Defaults to the smallest
  // toolbox, so a call site that forgets it offers less rather than more
  // (SAFEGUARDING rule 8, deny by default).
  //
  // This decides what a canvas OFFERS. It never decides what renders: a
  // template built with apparatus from a kit this canvas doesn't offer still
  // draws, still moves if unlocked, and still flattens into the hand-in. That
  // is the ordinary case, not an edge case — the teacher builds the apparatus
  // and the child works on it.
  kits?: KitId[];
  // Reopening a handed-back activity: "continue" restores the child's saved work
  // straight away (fully editable — strokes rub out, objects move — from the
  // local copy, or a same-fidelity composite across devices); "fresh" wipes it
  // for a clean start. undefined = a normal first attempt.
  resumeMode?: "continue" | "fresh";
  // "author" = teacher building a quiz (place/edit question boxes);
  // "answer" = child answering it (tap options, silent capture).
  // undefined = no quiz (existing callers unaffected).
  quizMode?: "author" | "answer";
  initialQuiz?: QuizPayload;
  // Reopening a sent-back quiz to fix it: EVERY previous answer, plus which of
  // them were wrong, plus a flag to show the right ones green ("review").
  //
  // The wrong ones used to be left out, so a child reopening a nine out of ten
  // met nine green questions and one that looked as though they had never done
  // it. They come back as answered now, marked for another look.
  //
  // `wrongIds` says WHICH to look at again and nothing more. The correct option
  // is never sent to the client for a question they got wrong, so changing an
  // answer stays a decision rather than a copy.
  initialAnswers?: QuizAnswer[];
  wrongIds?: string[];
  quizReview?: boolean;
  // The movable-objects layer (pictures / shapes / text with a `locked` flag).
  //  - "author" = teacher building the template: every object is fully editable
  //    and shows a padlock; objects are NOT flattened into the saved pages.
  //  - "answer" = child (or a preview): locked objects are fixed, unlocked
  //    template objects can be dragged (move only), and everything is flattened
  //    into the child's submitted PNG.
  //  - undefined = a plain drawing canvas: the child's own objects, fully
  //    editable and flattened (existing callers unaffected).
  objectMode?: "author" | "answer";
  // Template objects to hydrate into the canvas (per page), for "answer" mode
  // (child / preview) and for re-editing a template in "author" mode.
  initialObjects?: CanvasObj[][];
  // Local-first autosave. Drafting is entirely gated on `draftKey` + `ownerId`
  // (undefined = no drafting, existing callers unaffected). The wrapper's
  // uncontrolled fields (title/tags/…) ride along via get/onRestore.
  draftKey?: string;
  ownerId?: string;
  getExtraDraftFields?: () => Record<string, string>;
  onRestoreFields?: (fields: Record<string, string>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  // The picture of the work, posted beside it. See `flushPreviewField()`.
  const previewFieldRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Layers, per page, bottom to top:
  //  - `templatesRef[i]` : optional fixed background (e.g. an activity worksheet)
  //  - `objectsRef[i]`   : movable pictures / shapes / text boxes
  //  - `pagesRef[i]`     : the (transparent) pen-stroke layer, drawn on top
  // `compositeRef[i]` is all three flattened — that's what gets submitted.
  const pagesRef = useRef<string[]>([]);
  const templatesRef = useRef<(string | null)[]>([]);
  const templateImgRef = useRef<Map<string, HTMLImageElement>>(new Map()); // keyed by URL
  const objectsRef = useRef<Obj[][]>([]);
  const compositeRef = useRef<string[]>([]);
  // Like compositeRef but ALWAYS object-inclusive — the source for the Pages-
  // panel thumbnails, so a teacher sees their objects even though the saved
  // pages (compositeRef) stay object-free. In answer mode it just mirrors
  // compositeRef (objects are already baked there).
  const previewRef = useRef<string[]>([]);
  // The Pages strip's pictures: one small JPEG per page, drawn from the same
  // render the preview is encoded from. Kept in step with the arrays above by
  // every page operation, because a thumbnail left behind by a move or a delete
  // is a page showing another page's picture.
  const thumbRef = useRef<string[]>([]);
  // Whether each page was ADDED on this canvas, rather than arriving as one of
  // a template's pages. It is what decides which pages a child may throw away
  // (see `pageDelete`), so it travels with its page through every page
  // operation and survives a restore — from the device's own copy as
  // `DraftCanvasV1.added`, and from the server copy as the `addedPages` field.
  // Missing means false: a page nobody can vouch for gets no cross.
  const addedRef = useRef<boolean[]>([]);
  const [added, setAdded] = useState<boolean[]>([]);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const objIdRef = useRef(0);
  const currentRef = useRef(0);
  const anyDrawnRef = useRef(false);
  const loadingRef = useRef(false);

  // Local-first autosave state.
  const draftingEnabled = Boolean(draftKey && ownerId);
  const draftSurface: DraftSurface = draftKey?.startsWith("tmpl-") ? "template-new" : "activity-response";
  // Server (cross-device) mapping. Teacher: TEMPLATE_NEW / "tmpl-new".
  // Child: ACTIVITY_RESPONSE / assignmentId (the middle segment of `resp:<a>:<s>`).
  const serverSurface = draftSurface === "template-new" ? "TEMPLATE_NEW" : "ACTIVITY_RESPONSE";
  const serverContext = draftSurface === "template-new" ? "tmpl-new" : (draftKey?.split(":")[1] ?? "");
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<DraftCanvasV1 | null>(null);
  const [draftSource, setDraftSource] = useState<"local" | "server">("local");
  const draftFieldsRef = useRef<Record<string, string> | null>(null); // fields from a pending restore
  // Whether the restore question has been answered. Exists for the late
  // cross-device arrival in the restore-on-mount effect: once a person has
  // restored or discarded, nothing is allowed to change under them.
  const restoreDecidedRef = useRef(false);

  const drawing = useRef(false);
  // Does the stroke canvas hold something `pagesRef[current]` does not?
  //
  // Only four things write that bitmap, and three of them write it FROM
  // `pagesRef` (or write `pagesRef` from it in the same breath): the seeding and
  // hydrate loops paint each page's own stored strokes, `paintDataUrl` paints a
  // page or a history entry (and `restore` stores that entry as the page), and
  // `addPage` clears then stores the blank it just made. The two that make the
  // canvas differ are `drawStroke` — a child's pen — and `clearPage`, and those
  // are the two that set this.
  //
  // It exists so `syncHidden` can skip re-encoding an unchanged full-page PNG,
  // and so an object-only history entry can SHARE the page's existing string
  // rather than adding a second copy of the same pixels to memory.
  const strokeDirtyRef = useRef(false);
  const snapshot = useRef<ImageData | null>(null);
  const points = useRef<{ x: number; y: number }[]>([]);

  // Undo / redo: per page, a stack of { drawing layer, objects } snapshots.
  const undoRef = useRef<Record<number, HistoryEntry[]>>({});
  const redoRef = useRef<Record<number, HistoryEntry[]>>({});
  // What has been done to the pages themselves, newest last. Undo checks it
  // first, and takes from it when its newest action is newer than every step
  // on every page (`pageActionIsNext`). Deleting a page used to clear all the
  // history instead, which made "Undo brings it back" untrue.
  const pageUndoRef = useRef<PageAction[]>([]);
  // The clock both kinds of undo step are stamped from.
  const seqRef = useRef(0);
  // Whether a page action has happened in this session: a page thrown away and
  // put back again has still been worked on (see `hasUserEdits`).
  const pageEditedRef = useRef(false);
  // The last repaint of the page on screen, settled. A page action waits for
  // it (see `undo`).
  const settleRef = useRef<Promise<unknown>>(Promise.resolve());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // A template (teacher building it, or a child working on it) opens on the
  // Select tool, so objects can be picked up and moved straight away.
  // A plain free-draw still opens ready to draw with the Pen.
  // A blank page opens with the FELT TIP in hand — the blue pen the design's
  // disc holds — not the ink pencil. A worksheet with pieces to move opens on
  // Move, as before.
  const [tool, setTool] = useState<Tool>(objectMode ? "cursor" : "pen");
  // Per-tool colour, kept for the whole session. `color` is the active tool's
  // colour; changing it only affects the tool you're currently holding.
  const [toolColors, setToolColors] = useState<Record<Tool, string>>(DEFAULT_TOOL_COLORS);
  const color = toolColors[tool];
  // What the next plain shape is filled with: see DEFAULT_SHAPE_FILL.
  const [shapeFill, setShapeFill] = useState(DEFAULT_SHAPE_FILL);
  const setColor = (c: string) => setToolColors((prev) => ({ ...prev, [tool]: c }));
  // Per-tool thickness, kept for the whole session (parallels toolColors above).
  // `size` is the active tool's thickness; changing it only affects the tool
  // you're currently holding, so Pen / Felt tip / Highlighter are each adjustable.
  const [toolSizes, setToolSizes] = useState<Record<Tool, number>>(DEFAULT_TOOL_SIZES);
  const size = toolSizes[tool];
  const setSize = (s: number) => setToolSizes((prev) => ({ ...prev, [tool]: s }));
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;

  const [pageCount, setPageCount] = useState(1);
  const [current, setCurrent] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Which photo frame the camera is open for, and on which page — a photo that
  // arrives after the page changed under it is dropped rather than misfiled.
  const [captureFrame, setCaptureFrame] = useState<{ id: string; page: number } | null>(null);
  const [ready, setReady] = useState(false);
  // "Ready to hand in?" confirmation (child submit only — see confirmSubmit).
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  // Placed objects on the current page + which one is selected.
  const [objects, setObjects] = useState<Obj[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Is the Move tool worth offering? Only when this page HAS something to move
  // — or when the canvas is in object mode, where placing and arranging things
  // is the whole job (a teacher building a worksheet, a child answering one).
  //
  // A blank drawing page has nothing to move, so Move isn't on the shelf, so a
  // child can't land on it and find their pens have silently stopped working.
  // That was SJ-09: the trap was the tool existing when it couldn't do
  // anything, and a child has no way to diagnose a mode they didn't know they
  // were in. Add a shape and it appears, because now it means something.
  const canMove = objects.length > 0 || Boolean(objectMode);

  // The pen to fall back to. Tracked rather than assumed, so a child who was
  // using the highlighter gets the highlighter back, not a pencil.
  const lastDrawToolRef = useRef<Tool>("pencil");
  useEffect(() => {
    if (tool !== "cursor" && tool !== "text") lastDrawToolRef.current = tool;
  }, [tool]);

  // If the last movable thing goes (the child deletes their only shape), Move
  // stops being offered — so don't strand them holding an invisible tool. This
  // is the ONLY safe auto-switch: there is provably nothing left to move.
  // Never in objectMode, where the canvas legitimately starts on Move before
  // anything is placed.
  useEffect(() => {
    if (!canMove && tool === "cursor") setTool(lastDrawToolRef.current);
  }, [canMove, tool]);

  // ---- Quiz layer (structured, NEVER composited into the page PNG) ----------
  // `quizRef` is the source of truth (a flat list carrying each question's
  // pageIndex, so a quiz can span non-consecutive pages); `quizQuestions`
  // mirrors it for rendering. Panel visibility + selection are component-level
  // (not per-page) so the quiz toolbox stays put as the teacher changes pages.
  const isQuizAuthor = quizMode === "author";
  const isQuizAnswer = quizMode === "answer";

  // Movable-objects mode. In "author" (teacher building a template) every object
  // is editable and shows a padlock, and objects are kept as a structured layer
  // (NOT flattened into the saved pages) so they stay re-editable and a child
  // can move the unlocked ones. Everywhere else objects are flattened into the
  // page PNG (the child's submitted work must show them).
  const isObjectAuthor = objectMode === "author";
  const bakeObjects = !isObjectAuthor;
  const bakeObjectsRef = useRef(bakeObjects);
  bakeObjectsRef.current = bakeObjects;
  const quizRef = useRef<QuizQuestion[]>(cloneQuestions(initialQuiz?.questions ?? []));
  const quizSeqRef = useRef<number>(initialQuiz?.questions?.length ?? 0);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(quizRef.current);
  const [quizPanelOpen, setQuizPanelOpen] = useState(false);
  // The panel floats over the canvas. Its position and collapsed state live here
  // rather than in the panel so that tucking it away to the launcher and
  // reopening brings it back exactly where the teacher left it.
  // Where the Quiz builder window sits, in design units, for the session.
  // Where the Quiz builder window sits, for the session. It cannot be given a
  // real default here — the paper has not been measured yet — so it is parked
  // properly the first time it is opened.
  const [quizWindow, setQuizWindow] = useState<WindowPos | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  // Answer mode: the child's current selection per question, mirrored into the
  // hidden `quizAnswers` input the response form submits. On a "carry on" reopen
  // of a quiz, the previously-correct answers are pre-filled (see initialAnswers).
  const initialAnswerMap = new Map<string, string>(
    (initialAnswers ?? []).flatMap((a) => (a.selectedOptionId ? [[a.questionId, a.selectedOptionId] as const] : [])),
  );
  const answersRef = useRef<Map<string, string>>(new Map(initialAnswerMap));
  const quizAnswersRef = useRef<HTMLInputElement>(null);
  const pendingOptionRef = useRef<{ qid: string; oid: string } | null>(null);
  const quizFileRef = useRef<HTMLInputElement>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(Object.fromEntries(initialAnswerMap));
  // In review mode the questions they got RIGHT are locked and shown green; the
  // wrong ones stay tappable. `initialAnswerMap` now carries both, so the lock
  // set is the answered ones minus the wrong ones — locking is still exactly
  // "you got this one right".
  const wrongSet = new Set<string>(quizReview ? wrongIds ?? [] : []);
  const lockedQuizRef = useRef<Set<string>>(
    new Set(quizReview ? [...initialAnswerMap.keys()].filter((id) => !wrongSet.has(id)) : []),
  );
  // The ones still to look at again. State rather than a ref, because it has to
  // clear the moment a child picks something: the mark reports THIS attempt, not
  // the last one, and a child who has just changed their answer should not still
  // be told to.
  const [retryIds, setRetryIds] = useState<Set<string>>(() => new Set(wrongSet));

  useEffect(() => {
    if (allowImport) import("pdfjs-dist").catch(() => {});
  }, [allowImport]);

  // Push any pre-filled answers into the hidden input on mount, so a review
  // reopen keeps its already-correct answers even if the child submits without
  // touching the quiz. (No-op for a fresh quiz — the map is empty.)
  useEffect(() => {
    if (isQuizAnswer) syncAnswers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [fanOpen, setFanOpen] = useState(false);
  // Whether the pen's colour / thickness bar is showing. Opened by picking a
  // pen, closed by touching the page — never on by default, so it cannot be
  // sitting over a question box when a child arrives.
  const [toolBarOpen, setToolBarOpen] = useState(false);
  // Said out loud when the ✓ is pressed too early. A disabled button that does
  // not say why is a button a child taps again and again.
  const [holdUp, setHoldUp] = useState<string | null>(null);
  const holdUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function sayHoldUp(msg: string) {
    setHoldUp(msg);
    if (holdUpTimer.current) clearTimeout(holdUpTimer.current);
    holdUpTimer.current = setTimeout(() => setHoldUp(null), 3200);
  }
  // Objects picked out by a marquee drag, moved and deleted as one.
  //
  // Deliberately SEPARATE from `selectedId` rather than replacing it. The
  // properties toolbar and the four corner controls belong to one object — a
  // fill picker for eight shapes at once is a different feature and a different
  // set of questions — so a group carries a ring and nothing else, and the
  // single selection keeps working exactly as it did.
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const multiRef = useRef<string[]>([]);
  multiRef.current = multiIds;
  // The rubber band, in model units, while it is being dragged out.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // The right-click menu: where it is, and what it offers. One piece of state
  // for all three kinds of menu (object, empty canvas, page) so two can never
  // be open at once.
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  // Which kit's palette is open, by id — null when none is. One at a time, so
  // two popovers can never overlap each other on the child canvas.
  const [openKit, setOpenKit] = useState<KitId | null>(null);
  // The active tab within each kit, remembered while the canvas is open so a
  // teacher placing ten counters doesn't re-pick the group every time.
  const [openGroup, setOpenGroup] = useState<Partial<Record<KitId, string>>>({});

  // ---- The fan toolbar's own state ---------------------------------------
  //
  // Which second row of the ＋ fan is fanned out (a kit id, "photo", "quiz"),
  // and where the floating windows are. Positions are remembered for the
  // session because a teacher who has dragged the maths kit out of the way of
  // the thing they are building has said where they want it.
  const [plusRow, setPlusRow] = useState<string | null>(null);
  // Where the next piece off a palette lands, so repeats do not stack exactly.
  const placeCycleRef = useRef(0);
  const [kitWindows, setKitWindows] = useState<Partial<Record<string, WindowPos>>>({});
  // What the last thing did, in the words that would undo it.
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const say = useCallback((text: string) => setToast({ text, at: Date.now() }), []);
  // Which corner the fans sit in — a device setting; see `src/lib/canvasHand.ts`.
  const hand = useSyncExternalStore(subscribeHand, readHand, serverHand);
  function swapHand() {
    writeHand(hand === "right" ? "left" : "right");
  }
  // The line-thickness slider (child canvas). Closed by default; the line button
  // toggles it and a tap anywhere else on the stage puts it away again.
  // The slider only makes sense while a drawing tool is in hand.
  // A pen, a felt tip, a highlighter or the rubber — something that DRAWS.
  //
  // Not just "in the shelf": the shelf's first entry is the Move tool, and
  // treating that as a drawing tool put the pen properties bar over the bottom
  // of the canvas while a child was dragging a shape, where it swallowed the
  // resize handle of anything near it.
  const drawingTool = tool !== "cursor" && tool !== "text" && SHELF.some((t) => t.key === tool);
  // The hue-bar handle just tracks the current tool's colour.
  const [box, setBox] = useState({ w: 700, h: 490 });
  // The measured paper, readable from a handler that runs outside the render.
  const boxRef = useRef(box);
  boxRef.current = box;

  // How much smaller than the 1194×834 design frame this paper is, floored at
  // the touch minimum of whoever is using it: 44px for a teacher, 64px for a
  // child (rule 18, F37). A child's floor IS the design size, so a child's
  // canvas never scales — see the note where `u` is built.
  const CTRL_FLOOR = isObjectAuthor || isQuizAuthor ? 44 : 64;
  const chromeScale = Math.max(
    CTRL_FLOOR / 64,
    Math.min(1, box.w / FRAME_W, box.h / FRAME_H),
  );
  const chromeScaleRef = useRef(chromeScale);
  chromeScaleRef.current = chromeScale;

  // Which text object (if any) is currently open for typing.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRef = useRef<string | null>(editingId);
  editingRef.current = editingId;

  // Deselect when switching to a drawing tool (so its handles don't linger).
  useEffect(() => {
    if (tool !== "cursor" && editingRef.current === null) setSelectedId(null);
  }, [tool]);
  const [displayW, setDisplayW] = useState(1000);

  function ctx() {
    return canvasRef.current?.getContext("2d") ?? null;
  }
  function textFontPx() {
    return Math.max(20, sizeRef.current * 2.6);
  }
  // The stroke canvas is transparent so the layers beneath it show through.
  function clearCanvas() {
    ctx()?.clearRect(0, 0, W, H);
  }
  // Load an image, with a deadline.
  //
  // `onerror` covers a broken or forbidden URL. It does not cover a request that
  // is accepted and then never answered, which fires neither event and leaves
  // this promise pending forever. That matters because the seeding effect awaits
  // it before the canvas reports itself `ready`, and `ready` gates both the
  // "Loading…" overlay and the restore prompt. One stalled template background
  // therefore left a child looking at an editor that never opened, and never
  // being offered the work they had already done. Same defect as F34, reached
  // through a different call.
  //
  // The deadline turns a hang into the error path every caller already handles
  // (that page's background or object simply does not render), which is degraded
  // but usable, and the child's own strokes still come back.
  //
  // The tradeoff is real and worth naming rather than hiding: a genuinely slow
  // load that trips the deadline loses that page's worksheet background, which
  // is a child's context for their own work. So the number is a backstop against
  // infinity, not a latency policy. It is long enough that a multi-megabyte
  // composite on poor school wifi should still make it, and short enough that the
  // editor recovers inside a lesson instead of never. Losing a background is worse
  // than a slow one and better than an editor that never opens at all.
  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(
        () => reject(new Error("image load exceeded its deadline")),
        IMAGE_LOAD_BUDGET_MS,
      );
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = (e) => {
        clearTimeout(timer);
        reject(e);
      };
      img.src = src;
    });
  }
  function cloneObjs(list: Obj[]): Obj[] {
    return list.map((o) => ({ ...o }));
  }
  // Pictures and photo frames both composite from `imgCacheRef`, by object id.
  // A frame's source can CHANGE — a retake, or the undo of one — so a cached
  // element is trusted only while its source still matches, and reloaded
  // otherwise. For a plain picture the source never changes, so this is the
  // preload it always was.
  async function ensureObjectImages(objs: Obj[]) {
    await Promise.all(
      objs.map(async (o) => {
        if (o.type !== "image" && o.type !== "frame") return;
        if (!o.src) return;
        const cached = imgCacheRef.current.get(o.id);
        if (cached && cached.src === o.src) return;
        try {
          imgCacheRef.current.set(o.id, await loadImage(o.src));
        } catch {
          /* image will simply not render */
        }
      }),
    );
  }
  function refreshUndoRedo() {
    setCanUndo((undoRef.current[currentRef.current]?.length ?? 0) > 0 || pageActionIsNext());
    setCanRedo((redoRef.current[currentRef.current]?.length ?? 0) > 0);
  }
  // The newest step anywhere in the per-page history. Each stack is pushed in
  // time order, so its top is its newest.
  function newestStepSeq(): number {
    let newest = 0;
    for (const stack of Object.values(undoRef.current)) {
      const top = stack?.[stack.length - 1];
      if (top?.seq && top.seq > newest) newest = top.seq;
    }
    return newest;
  }
  // Is the next undo a page action? Only when it is newer than every step on
  // every page, so undoing a page can never skip past a drawing made after it.
  function pageActionIsNext(): boolean {
    const action = pageUndoRef.current[pageUndoRef.current.length - 1];
    return !!action && action.seq > newestStepSeq();
  }
  function refreshAdded() {
    setAdded([...addedRef.current]);
  }
  function refreshThumbs() {
    setThumbs([...thumbRef.current]);
  }

  // Flatten all layers (white → template → objects → strokes) into one PNG.
  // Flatten the current page. `includeObjects` overrides the mode default: the
  // object-free composite feeds the saved pages (author), while the Pages-panel
  // thumbnails force objects on for a true-to-life preview.
  //
  // Split in two: this returns the RENDER, so a caller that needs both a stored
  // image and a thumbnail of the same page can take both from one drawing of it.
  // `null` means there was nothing to render onto; `compositeCurrentPage` keeps
  // the old fallback for that case. The canvas belongs to the caller, who must
  // `releaseCanvas` it as soon as they have finished reading pixels off it.
  function renderCurrentPage(
    includeObjects?: boolean,
    forPreview?: boolean,
  ): HTMLCanvasElement | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const exp = document.createElement("canvas");
    exp.width = W;
    exp.height = H;
    const ec = exp.getContext("2d");
    if (!ec) {
      releaseCanvas(exp);
      return null;
    }
    ec.fillStyle = "#ffffff";
    ec.fillRect(0, 0, W, H);
    const tmplUrl = templatesRef.current[currentRef.current];
    const tmpl = tmplUrl ? templateImgRef.current.get(tmplUrl) : undefined;
    if (tmpl && tmpl.complete && tmpl.naturalWidth) ec.drawImage(tmpl, 0, 0, W, H);
    // While a teacher authors a template, objects are a separate structured
    // layer (stored, re-editable, movable by the child) and are NOT flattened
    // into the page PNG. Everywhere else they are baked in.
    const objs = (includeObjects ?? bakeObjectsRef.current)
      ? objectsRef.current[currentRef.current] ?? []
      : [];
    for (const o of objs) {
      if (o.type === "image") {
        const img = imgCacheRef.current.get(o.id);
        if (img && img.complete && img.naturalWidth) ec.drawImage(img, o.x, o.y, o.w, o.h);
      } else if (o.type === "shape") {
        ec.save();
        ec.translate(o.x, o.y);
        // Rotation is reserved — nothing sets it yet — but it is honoured here
        // and in the SVG so the data and the pixels never disagree. About the
        // centre, matching the SVG transform-origin below.
        if (o.rot) {
          ec.translate(o.w / 2, o.h / 2);
          ec.rotate((o.rot * Math.PI) / 180);
          ec.translate(-o.w / 2, -o.h / 2);
        }
        // Mirror of the on-screen SVG below: same parts, same roles, same fill
        // rule. If these two ever diverge, a child's handed-in PNG stops
        // matching what they drew.
        ec.lineJoin = "round";
        for (const part of shapeParts(o)) {
          const p = new Path2D(part.d);
          if (part.role === "outline" && o.fill && o.fill !== "none") {
            ec.fillStyle = o.fill;
            ec.fill(p, shapeFillRule(o.shape));
          }
          if (o.stroke && o.strokeWidth > 0) {
            ec.strokeStyle = o.stroke;
            ec.lineWidth =
              part.role === "detail" ? detailStrokeWidth(o.strokeWidth) : o.strokeWidth;
            ec.stroke(p);
          }
        }
        ec.restore();
        // Geometry text — a clock's numerals. Drawn inside the same rotated
        // frame as the shape, and before the label, so a label sits on top.
        const marks = shapeTextMarks(o);
        if (marks.length) {
          ec.save();
          ec.translate(o.x, o.y);
          if (o.rot) {
            ec.translate(o.w / 2, o.h / 2);
            ec.rotate((o.rot * Math.PI) / 180);
            ec.translate(-o.w / 2, -o.h / 2);
          }
          ec.fillStyle = o.stroke;
          ec.textAlign = "center";
          ec.textBaseline = "middle";
          for (const m of marks) {
            ec.font = `700 ${m.size}px ${FONT_STACK}`;
            ec.fillText(m.text, m.x, m.y);
          }
          ec.textAlign = "left";
          ec.textBaseline = "alphabetic";
          ec.restore();
        }
        // The shape's label, wrapped + centred inside the shape's usable area.
        if (o.text && o.text.trim()) {
          const region = shapeInnerBox(o.shape, o.w, o.h, o.thickness);
          // The label rides with the shape, so it is drawn inside the same
          // rotated frame rather than being left behind axis-aligned.
          ec.save();
          ec.translate(o.x, o.y);
          if (o.rot) {
            ec.translate(o.w / 2, o.h / 2);
            ec.rotate((o.rot * Math.PI) / 180);
            ec.translate(-o.w / 2, -o.h / 2);
          }
          const { fontPx, lines, lineHeight } = fitTextToBox(o.text, region.w, region.h);
          ec.fillStyle = o.textColor ?? "#1f2430";
          ec.font = `600 ${fontPx}px ${FONT_STACK}`;
          ec.textAlign = "center";
          ec.textBaseline = "middle";
          const cx = region.x + region.w / 2;
          const cy = region.y + region.h / 2;
          const startY = cy - ((lines.length - 1) * lineHeight) / 2;
          lines.forEach((line, i) => ec.fillText(line, cx, startY + i * lineHeight));
          ec.textAlign = "left";
          ec.textBaseline = "alphabetic";
          ec.restore();
        }
      } else if (o.type === "frame") {
        const img = o.src ? imgCacheRef.current.get(o.id) : undefined;
        if (img && img.complete && img.naturalWidth) {
          ec.drawImage(img, o.x, o.y, o.w, o.h);
        } else if (forPreview) {
          // The teacher's Pages-panel thumbnail shows where the frame is. A
          // child's hand-in of an empty frame is a blank box, never
          // placeholder chrome — it is their page, not a form.
          ec.save();
          ec.setLineDash([12, 10]);
          ec.strokeStyle = "#94a3b8";
          ec.lineWidth = 4;
          ec.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
          ec.restore();
        }
      } else if (o.type === "link") {
        drawLinkChip(ec, o);
      } else {
        // text
        ec.save();
        ec.fillStyle = o.color;
        ec.textBaseline = "top";
        ec.font = `600 ${o.fontPx}px ${FONT_STACK}`;
        const lineHeight = o.fontPx * 1.2;
        const lines = o.text.split("\n");
        ec.translate(o.x, o.y);
        // A turned text box, turned the same way here as on screen. The centre
        // is measured rather than stored, because a text box has no w/h — its
        // size IS its words at its font size — and it is measured with the same
        // font at the same size the screen renders, which is the only way the
        // two agree. The on-screen box carries 2px of padding that this does
        // not, so the centres differ by a pixel; at any angle that is a pixel,
        // and it is the same pixel the unturned draw has always had.
        if (o.rot) {
          const w = Math.max(...lines.map((line) => ec.measureText(line).width));
          const h = lines.length * lineHeight;
          ec.translate(w / 2, h / 2);
          ec.rotate((o.rot * Math.PI) / 180);
          ec.translate(-w / 2, -h / 2);
        }
        lines.forEach((line, i) => ec.fillText(line, 0, i * lineHeight));
        ec.restore();
      }
    }
    // Pen strokes go on top of everything.
    ec.drawImage(canvas, 0, 0, W, H);
    // The quiz, and ONLY on a preview.
    //
    // Question boxes are never flattened into the page that is saved or handed
    // in — they stay structured so they remain interactive for the child and
    // reviewable for the teacher, and a child's drawing stays free of them.
    // A preview is a different thing: it is a picture OF the page, for looking
    // at, and a picture of a quiz worksheet with no questions on it is what made
    // a library card look like it had not saved.
    if (forPreview) drawQuizForPreview(ec);
    return exp;
  }

  // The same flatten, encoded as a PNG and the scratch canvas handed straight
  // back. Every caller that only wants the string.
  function compositeCurrentPage(includeObjects?: boolean, forPreview?: boolean): string {
    const exp = renderCurrentPage(includeObjects, forPreview);
    if (!exp) return canvasRef.current?.toDataURL("image/png") ?? "";
    const url = exp.toDataURL("image/png");
    releaseCanvas(exp);
    return url;
  }

  // Whether the picture of the page and the page itself are the same image.
  //
  // They are, whenever the movable pieces are already flattened in and there is
  // no quiz — which is the child's plain drawing, the surface the memory
  // incident was reported on. Rendering the page twice there produced two
  // identical multi-megabyte PNGs per stroke; this lets one render answer both.
  function previewIsComposite(): boolean {
    return bakeObjectsRef.current && quizRef.current.length === 0;
  }

  // Everything derived from ONE render of the page on screen: the composite
  // that is saved, the preview that is shown, and the tray thumbnail.
  function syncPageImages(index: number) {
    if (previewIsComposite()) {
      const exp = renderCurrentPage();
      const url = exp ? exp.toDataURL("image/png") : (canvasRef.current?.toDataURL("image/png") ?? "");
      if (exp) {
        thumbRef.current[index] = thumbFrom(exp);
        releaseCanvas(exp);
      }
      compositeRef.current[index] = url;
      previewRef.current[index] = url;
      return;
    }
    compositeRef.current[index] = compositeCurrentPage();
    // ALWAYS object- AND quiz-inclusive, whatever the composite left out. The
    // preview is the picture of the page; the composite is the data, and the
    // two are allowed to differ.
    const exp = renderCurrentPage(true, true);
    if (!exp) {
      previewRef.current[index] = compositeRef.current[index];
      return;
    }
    previewRef.current[index] = exp.toDataURL("image/png");
    thumbRef.current[index] = thumbFrom(exp);
    releaseCanvas(exp);
  }

  // The question boxes, drawn.
  //
  // A second renderer for one thing, which is a drift risk — the same one the
  // shapes met and answered with `shapeParts()`: one model, two renderers, and a
  // test that they agree. This mirrors `QuizBoxView`, and reuses its scaling
  // rule so a box shrunk on screen shrinks here by the same amount.
  function drawQuizForPreview(ec: CanvasRenderingContext2D) {
    const boxes = quizRef.current.filter((q) => q.pageIndex === currentRef.current);
    for (const q of boxes) {
      // Scaled by WIDTH alone, and floored the same way the card is. The height
      // used to be in here too, and once the card started following its content
      // `q.h` became the answer to a different question: a box 104 tall against
      // a nominal 300 drew every word at a third of its size. Same rule as the
      // screen, or the picture stops being a picture of the work.
      const k = Math.min(1, q.w / QUIZ_W);
      const px = (n: number) => n * k;
      const txt = (n: number) => Math.max(15, px(n));
      const pad = px(14);
      ec.save();
      // The box.
      ec.beginPath();
      ec.roundRect(q.x, q.y, q.w, q.h, px(18));
      ec.fillStyle = "#FFFDF7";
      ec.fill();
      ec.lineWidth = Math.max(1, px(3));
      ec.strokeStyle = "#22304A";
      ec.stroke();

      // The question, wrapped by the same helper the shape labels use.
      const promptPx = txt((q.prompt || "").length > 40 ? 16 : 20);
      const fitted = fitTextToBox(q.prompt || "", q.w - pad * 2, q.h * 0.5, promptPx);
      ec.fillStyle = "#22304A";
      ec.textAlign = "center";
      ec.textBaseline = "top";
      ec.font = `600 ${fitted.fontPx}px ${FONT_STACK}`;
      fitted.lines.forEach((line, i) =>
        ec.fillText(line, q.x + q.w / 2, q.y + px(12) + i * fitted.lineHeight),
      );

      // The answers, in the same one- or two-column grid the box uses.
      // One answer a row, as pills — the design's card, and the same shape a
      // child tapped.
      const top = q.y + px(12) + Math.max(fitted.lines.length, 1) * fitted.lineHeight + px(10);
      const gap = px(6);
      const rows = q.options.length;
      const cw = q.w - pad * 2;
      const chB = Math.max(px(64), 44);
      const dot = px(24);
      ec.font = `700 ${Math.min(promptPx - 2, txt(18))}px ${FONT_STACK}`;
      ec.textBaseline = "middle";
      ec.textAlign = "left";
      q.options.forEach((o, i) => {
        const cx = q.x + pad;
        const cy = top + i * (chB + gap);
        const picked = answersRef.current.get(q.id) === o.id;
        ec.beginPath();
        ec.roundRect(cx, cy, cw, chB, chB / 2);
        ec.fillStyle = picked ? "#FBEED3" : "#FFFDF7";
        ec.fill();
        ec.lineWidth = Math.max(1, px(2));
        ec.strokeStyle = picked ? "#22304A" : "#E4DCC8";
        ec.stroke();
        // The circle that says which one was picked.
        ec.beginPath();
        ec.arc(cx + px(8) + dot / 2, cy + chB / 2, dot / 2, 0, Math.PI * 2);
        ec.fillStyle = picked ? "#BD3F63" : "#FFFDF7";
        ec.fill();
        ec.lineWidth = Math.max(1, px(2));
        ec.strokeStyle = "#22304A";
        ec.stroke();
        if (o.text) {
          ec.fillStyle = "#22304A";
          ec.fillText(o.text, cx + px(8) + dot + px(10), cy + chB / 2, cw - dot - px(34));
        }
      });
      ec.textAlign = "center";
      ec.restore();
    }
  }

  // The picture of the work, posted alongside the work itself.
  //
  // Only when there is a quiz. For a pupil the movable pieces are already
  // flattened into the composite, so the preview and the work of record are the
  // same image — posting a second copy of every page would double the storage a
  // hand-in costs for no gain. Question boxes are the one thing that is never
  // flattened (that invariant is what keeps a published drawing a drawing), and
  // leaving them out is what showed a teacher a blank white rectangle where a
  // child's quiz page should be.
  function flushPreviewField() {
    const field = previewFieldRef.current;
    if (!field) return;
    const carriesQuiz = quizRef.current.length > 0;
    field.value =
      carriesQuiz && anyDrawnRef.current ? JSON.stringify(previewRef.current) : "";
  }

  // Save the current page (drawing + composite) and update the hidden field.
  function syncHidden() {
    const canvas = canvasRef.current;
    if (canvas) {
      const i = currentRef.current;
      // Re-encode the stroke layer only when it has actually been drawn on (see
      // strokeDirtyRef). Most calls here come from an object being moved or a
      // page being changed, and re-encoding an untouched page cost a full PNG
      // of it every time — a second copy of pixels we already hold the string
      // for, which is the memory this canvas kept running out of.
      if (strokeDirtyRef.current || pagesRef.current[i] === undefined) {
        pagesRef.current[i] = canvas.toDataURL("image/png");
        strokeDirtyRef.current = false;
      }
      syncPageImages(i);
    }
    publishHidden();
  }

  // Tell the form (and the autosave) what the pages are now, without drawing
  // anything. A page operation has already moved every page's composite into
  // place; re-rendering the one on screen straight after it would read a stroke
  // layer whose repaint is still in flight.
  function publishHidden() {
    if (hiddenRef.current) {
      hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
    }
    flushPreviewField();
    // Autosave a local draft off the same choke point (debounced). Skipped while
    // seeding/hydrating so restore doesn't immediately re-save itself.
    if (draftingEnabled && !loadingRef.current) {
      schedulePersist();
      scheduleServerSync();
    }
  }

  // ---- Local-first autosave -------------------------------------------------
  function schedulePersist() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void doPersist();
    }, 1000);
  }

  // ---- Cross-device server sync (Stage 2) -----------------------------------
  // Much longer debounce than the local save: pushing multi-MB composites to the
  // server every second would be wasteful. Local (IndexedDB) is the fast,
  // offline-resilient copy; the server copy is for resuming on another device.
  function scheduleServerSync() {
    if (serverTimer.current) clearTimeout(serverTimer.current);
    serverTimer.current = setTimeout(() => {
      serverTimer.current = null;
      void doServerSync();
    }, 25000);
  }

  async function doServerSync() {
    if (!draftingEnabled) return;
    const pages = anyDrawnRef.current ? compositeRef.current : [];
    await serverSaveDraft(serverSurface, serverContext, pages, collectFields());
  }

  function flushServerSync() {
    if (serverTimer.current) {
      clearTimeout(serverTimer.current);
      serverTimer.current = null;
      void doServerSync(); // best-effort; may not complete if the tab is closing
    }
  }

  // Build a canvas draft from server composite pages (the owner's /uploads
  // paths): each composite becomes a page background with a blank stroke layer.
  // Composite fidelity — enough to resume on another device via hydrateFromDraft.
  //
  // Every page comes back as a background, so on its own this copy would mark
  // every page a template page and none would have a cross. Which pages were
  // added rides along in the draft's fields for exactly that reason.
  function serverPagesToCanvas(pages: string[], fields?: Record<string, string>): DraftCanvasV1 {
    let added: unknown = undefined;
    try {
      added = fields?.addedPages ? JSON.parse(fields.addedPages) : undefined;
    } catch {
      /* unreadable: no page gets a cross */
    }
    return {
      v: 1,
      pages: pages.map(() => ""),
      templates: [...pages],
      objects: pages.map(() => []),
      current: 0,
      anyDrawn: true,
      nextObjId: 0,
      added: addedFlags(added, pages.length),
    };
  }

  function collectFields(): Record<string, string> {
    return {
      ...(getExtraDraftFields?.() ?? {}),
      addedPages: JSON.stringify(addedRef.current),
    };
  }

  async function doPersist() {
    if (!draftKey || !ownerId) return;
    await patchDraft(draftKey, ownerId, draftSurface, {
      canvas: serializeCanvas(),
      fields: collectFields(),
    });
  }

  function flushPersist() {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    void doPersist();
  }

  // The JSON-serialisable editable state (NOT the composite — recomputed on
  // restore). Read straight off the refs, which syncHidden() has just flushed.
  function serializeCanvas(): DraftCanvasV1 {
    return {
      v: 1,
      pages: [...pagesRef.current],
      templates: [...templatesRef.current],
      objects: objectsRef.current.map((pg) => pg.map((o) => ({ ...o }))),
      current: currentRef.current,
      anyDrawn: anyDrawnRef.current,
      nextObjId: objIdRef.current,
      added: [...addedRef.current],
    };
  }

  // Rebuild the full editable session from a stored draft. Rebuilds the image
  // caches from the stored `src`/urls and restores objIdRef BEFORE recomputing
  // composites (reusing compositeCurrentPage so the flatten path never drifts).
  async function hydrateFromDraft(canvas: DraftCanvasV1) {
    loadingRef.current = true;
    const c = ctx();
    templatesRef.current = [...canvas.templates];
    pagesRef.current = [...canvas.pages];
    // A draft is the child's device's copy, and the child's to change; its web
    // links are put back to the teacher's before anything draws them (rule 26).
    objectsRef.current = withTeacherLinks(
      (canvas.objects as Obj[][]).map((pg) => pg.map((o) => ({ ...o }))),
    );
    addedRef.current = addedFlags(canvas.added, pagesRef.current.length);
    anyDrawnRef.current = canvas.anyDrawn;
    // Before anything is drawn: the pictures of each page carry its questions.
    placeQuestionsOnTeacherPages();

    // Next object id: never collide with a restored `o<n>` id.
    let maxId = canvas.nextObjId - 1;
    for (const pg of objectsRef.current) {
      for (const o of pg) {
        const m = /^o(\d+)$/.exec(o.id);
        if (m) maxId = Math.max(maxId, Number(m[1]));
      }
    }
    objIdRef.current = maxId + 1;

    // Rebuild non-serialisable caches from the stored strings.
    const templateUrls = [...new Set(templatesRef.current.filter((u): u is string => !!u))];
    await Promise.all(
      templateUrls.map(async (url) => {
        if (templateImgRef.current.has(url)) return;
        try {
          templateImgRef.current.set(url, await loadImage(url));
        } catch {
          /* leave that page's background blank */
        }
      }),
    );
    await ensureObjectImages(objectsRef.current.flat());
    const strokeImgs = await Promise.all(
      pagesRef.current.map(async (p) => {
        try {
          return p ? await loadImage(p) : null;
        } catch {
          return null;
        }
      }),
    );

    // Recompute each page's composite by painting its stroke layer onto the live
    // canvas and reusing compositeCurrentPage() verbatim.
    compositeRef.current = [];
    previewRef.current = [];
    thumbRef.current = [];
    for (let i = 0; i < pagesRef.current.length; i++) {
      currentRef.current = i;
      if (c) {
        c.clearRect(0, 0, W, H);
        const si = strokeImgs[i];
        if (si) c.drawImage(si, 0, 0, W, H);
      }
      syncPageImages(i);
    }

    // Land on the FIRST page, not the one they happened to close on.
    //
    // Coming back to work is starting again at the beginning of it: a child who
    // left off on page 3 has no idea what is on pages 1 and 2 until they look,
    // and a teacher who sent it back with something to fix wrote that note about
    // the whole thing. Restoring page 3 also drops them past the Next flow that
    // walks them through the rest.
    currentRef.current = 0;
    if (c) {
      c.clearRect(0, 0, W, H);
      const si = strokeImgs[currentRef.current];
      if (si) c.drawImage(si, 0, 0, W, H);
    }
    undoRef.current = {};
    redoRef.current = {};
    pageUndoRef.current = [];
    strokeDirtyRef.current = false; // the canvas holds exactly what was restored
    setPageCount(pagesRef.current.length);
    refreshAdded();
    setCurrent(currentRef.current);
    setObjects(objectsRef.current[currentRef.current] ?? []);
    setThumbs([...thumbRef.current]);
    setQuizQuestions([...quizRef.current]);
    refreshUndoRedo();
    if (hiddenRef.current) {
      hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
    }
    flushPreviewField();
    loadingRef.current = false;
  }

  // Put each quiz question back on the teacher's page it belongs to, after a
  // restore.
  //
  // A draft keeps the pages in the child's order but not the questions: those
  // come from the teacher's copy, and name their page by the TEACHER'S
  // numbering. A child who put a page of their own in front of a question's
  // page, and came back to it, found the question on their own blank page.
  //
  // On a child's canvas the teacher's pages are never moved among themselves
  // (F76) and never thrown away, so the teacher's page k is the k-th page the
  // child did not add, wherever their own pages were put. A draft that cannot
  // say which pages were added marks none, and every question stays where the
  // teacher put it — what happened before. The builder is left alone: there
  // the questions are the teacher's own, being written.
  function placeQuestionsOnTeacherPages() {
    if (pageDelete !== "added") return;
    const teacherPages: number[] = [];
    addedRef.current.forEach((a, i) => {
      if (!a) teacherPages.push(i);
    });
    const theirs = new Map((initialQuiz?.questions ?? []).map((q) => [q.id, q.pageIndex]));
    quizRef.current = quizRef.current.map((q) => {
      const k = theirs.get(q.id) ?? q.pageIndex;
      return { ...q, pageIndex: teacherPages[k] ?? k };
    });
  }

  // The stroke layer as it is right now, as a string.
  //
  // When nothing has been drawn since the last save, that string already exists
  // in `pagesRef` — so hand back THAT one rather than encoding an identical
  // second copy. Moving a shape, turning it, locking it, typing in a text box:
  // every one of those pushes a history entry, and each used to carry its own
  // megabyte-and-a-bit PNG of a stroke layer nobody had touched. Sharing the
  // reference makes an object-only step cost almost nothing.
  function currentStrokeSnapshot(): string {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    if (strokeDirtyRef.current) return canvas.toDataURL("image/png");
    return pagesRef.current[currentRef.current] ?? canvas.toDataURL("image/png");
  }

  // Snapshot the current page (both layers) so the next change can be undone.
  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushCapped((undoRef.current[currentRef.current] ??= []), {
      img: currentStrokeSnapshot(),
      objects: cloneObjs(objectsRef.current[currentRef.current] ?? []),
      seq: ++seqRef.current,
    });
    redoRef.current[currentRef.current] = [];
    refreshUndoRedo();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.lineCap = "round";
    c.lineJoin = "round";

    (async () => {
      clearCanvas();
      setShapeFill(DEFAULT_SHAPE_FILL); // a new canvas forgets the last shape colour
      const blankStroke = canvas.toDataURL("image/png"); // fully transparent
      if (background && background.length) {
        templatesRef.current = background.map((u) => u);
        pagesRef.current = background.map(() => blankStroke);
        anyDrawnRef.current = true; // a template response always has content
        // Preload the template images so pages can be composited synchronously.
        await Promise.all(
          background.map(async (url) => {
            try {
              templateImgRef.current.set(url, await loadImage(url));
            } catch {
              /* leave that page's background blank */
            }
          }),
        );
      } else {
        templatesRef.current = [null];
        pagesRef.current = [blankStroke];
      }
      // A template's pages are the worksheet; a blank canvas's first page is
      // the child's own, as much as any page they add after it.
      addedRef.current = background && background.length ? background.map(() => false) : [true];
      currentRef.current = 0;

      // Hydrate the template's movable objects (per page). In "answer" mode they
      // are marked fromTemplate so a child's lock rules apply; a plain drawing
      // canvas (no initialObjects) starts empty.
      const seededObjects: Obj[][] = withTeacherLinks(
        pagesRef.current.map((_, i) => {
          const page = initialObjects?.[i];
          if (!Array.isArray(page)) return [];
          return page.map((o) => ({ ...(o as Obj), fromTemplate: !isObjectAuthor }));
        }),
      );
      objectsRef.current = seededObjects;

      // Never collide a freshly-added object id with a hydrated one.
      let maxSeedId = objIdRef.current - 1;
      for (const pg of seededObjects) {
        for (const o of pg) {
          const m = /^o(\d+)$/.exec(o.id);
          if (m) maxSeedId = Math.max(maxSeedId, Number(m[1]));
        }
      }
      objIdRef.current = maxSeedId + 1;
      if (seededObjects.some((p) => p.length)) anyDrawnRef.current = true;

      // Preload image objects so they composite synchronously.
      await ensureObjectImages(seededObjects.flat());

      setPageCount(pagesRef.current.length);
      refreshAdded();

      // Initial composite per page: white + template, plus the objects flattened
      // in (except while authoring — there objects stay a separate layer).
      // Reuse compositeCurrentPage so the flatten path never drifts.
      clearCanvas(); // strokes start blank; the flatten reads the live canvas
      compositeRef.current = [];
      previewRef.current = [];
      thumbRef.current = [];
      for (let i = 0; i < pagesRef.current.length; i++) {
        currentRef.current = i;
        syncPageImages(i);
      }
      currentRef.current = 0;

      clearCanvas(); // page 0's stroke layer starts blank
      strokeDirtyRef.current = false; // every page's strokes are exactly what was stored
      setObjects(objectsRef.current[0] ?? []);
      if (hiddenRef.current) {
        hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
      }
      flushPreviewField();
      setThumbs([...thumbRef.current]);
      setReady(true);
    })();

    const measure = () => {
      const el = wrapRef.current;
      if (el) {
        const r = 10 / 7;
        let w = el.clientWidth;
        let h = w / r;
        if (h > el.clientHeight) {
          h = el.clientHeight;
          w = h * r;
        }
        setBox({ w, h });
        setDisplayW(w);
      } else {
        setDisplayW(canvas.clientWidth || 1000);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    // The window is not the only thing that resizes this. A sidebar opening, a
    // font landing, the browser's own chrome changing height — any of it moves
    // the wrapper without touching the window, and the stage was left drawn at
    // whatever size it happened to be measured at, a third too narrow with the
    // page pushed off to one side. Watch the element itself.
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    if (wrapRef.current && ro) ro.observe(wrapRef.current);

    const form = canvas.closest("form");
    const onSubmit = () => {
      finishEditing();
      // Submitting IS the success path (a failed action re-renders in place, no
      // redirect). Mark the draft so the destination page clears local + server.
      // A child's activity response is the exception: keep its draft so a
      // "carry on" hand-back can reopen the work fully editable. It's cleared
      // instead when the teacher approves it or sends it back to "start again"
      // (see journal.ts / the "fresh" branch below), else the 30-day purge.
      if (draftingEnabled && draftKey && draftSurface !== "activity-response") {
        markDraftForClear(draftKey, serverSurface, serverContext);
      }
    };
    form?.addEventListener("submit", onSubmit, true);

    // Flush the pending autosave when the tab is hidden or navigated away —
    // best-effort (async IDB writes aren't guaranteed to finish on unload; the
    // ~1s local save is the reliable recovery point, and the server copy is at
    // most ~25s behind).
    const onHide = () => {
      if (draftingEnabled && document.visibilityState === "hidden") {
        flushPersist();
        flushServerSync();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      form?.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      if (serverTimer.current) clearTimeout(serverTimer.current);
      // Leaving the canvas gives its memory back now, rather than whenever the
      // collector next reaches a component nobody is looking at. Between the
      // history stacks, four page arrays and two image caches this component
      // can be holding tens of megabytes, and on the device the incident was
      // reported on the next screen is competing for it. The autosave flushes
      // (pagehide / visibilitychange) have already run by the time React
      // unmounts, so nothing here is still needed by anything.
      undoRef.current = {};
      redoRef.current = {};
      pageUndoRef.current = [];
      pagesRef.current = [];
      compositeRef.current = [];
      previewRef.current = [];
      thumbRef.current = [];
      objectsRef.current = [];
      imgCacheRef.current.clear();
      templateImgRef.current.clear();
      snapshot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Has the person changed anything in this session? Every edit ON a page goes
  // through pushHistory(), so a non-empty undo stack is the canvas's own record
  // of "there is work here now"; an edit TO the pages — adding, copying, moving
  // or throwing one away — counts too, and is remembered separately because
  // undoing it empties the stack it was on. hydrateFromDraft clears the stacks,
  // so a restore does not count as an edit. Used to make sure a late
  // cross-device draft never opens a dialog over work in progress.
  function hasUserEdits(): boolean {
    return (
      pageEditedRef.current ||
      Object.values(undoRef.current).some((stack) => (stack?.length ?? 0) > 0)
    );
  }

  // Restore-on-mount: once the canvas is ready, offer any saved draft. Gated so
  // it only fires when the draft likely represents lost work: a child response
  // always (their strokes sit on top of the template background), or a fresh
  // template build (no background). An in-session re-open of the teacher editor
  // (background already set) is not prompted, so "Start fresh" can't nuke work
  // the teacher is actively continuing.
  useEffect(() => {
    if (!ready || !draftingEnabled || !draftKey || !ownerId) return;

    // Sent back to "start again": wipe the saved work (local + cross-device) so
    // the child opens on a clean template.
    if (resumeMode === "fresh") {
      void deleteDraft(draftKey);
      void serverDiscardDraft(serverSurface, serverContext);
      return;
    }

    const canPrompt = draftSurface === "activity-response" || !background || background.length === 0;
    if (!canPrompt) return;
    let cancelled = false;
    (async () => {
      await purgeExpired(RETENTION_MS);

      // Reconcile the local (full-fidelity, offline) copy with the server
      // (cross-device) copy and take whichever is newer.
      //
      // The local read always settles: every path in draftStore resolves, even
      // when storage is unavailable. The server read is the one that can hang,
      // so it gets a deadline, and the two are only awaited together because
      // BOTH are now bounded. Waiting on an unbounded network call here used to
      // withhold the prompt outright, which meant a teacher's or a child's work
      // sat safe on their own disk and was never offered back to them. The local
      // copy is the one guaranteed to exist; it is never held hostage to a remote
      // one. See finding F34.
      const remote = serverLoadDraftBounded(serverSurface, serverContext);
      const [local, first] = await Promise.all([loadDraft(draftKey, ownerId), remote.settled]);
      if (cancelled) return;
      const localAt = local?.canvas ? local.updatedAt : 0;
      const server = first.timedOut ? null : first.draft;
      const serverAt = server && server.pages.length ? server.updatedAt : 0;

      let chosen: DraftCanvasV1 | null = null;
      if (server && serverAt > localAt) {
        // Work happened on another device (a same-fidelity composite).
        draftFieldsRef.current = server.fields ?? {};
        setDraftSource("server");
        chosen = serverPagesToCanvas(server.pages, server.fields);
      } else if (local?.canvas) {
        draftFieldsRef.current = local.fields ?? {};
        setDraftSource("local");
        chosen = local.canvas;
      }

      if (chosen) {
        // Sent back to "carry on": reopen their work immediately rather than
        // asking a young child to choose at a restore prompt. Otherwise (a normal
        // first attempt with lost work) offer the prompt as before.
        if (resumeMode === "continue") {
          await applyRestore(chosen);
        } else {
          setDraftPrompt(chosen);
        }
      }

      // Offering the older local copy in silence is its own small harm, so if the
      // lookup only overran its deadline (rather than answering) we keep
      // listening, and upgrade the offer if the server copy turns out to be the
      // newer one. Deliberately narrow, on two rules:
      //
      //  1. Once the person has restored or discarded, nothing changes under
      //     them. Their choice stands.
      //  2. Once they have edited anything, no prompt appears and none is
      //     swapped. A dialog materialising over work in progress is worse than a
      //     late copy going unoffered, and worse still if they aim "Start fresh"
      //     at the strokes they just made. Nothing is lost by letting it wait:
      //     both copies survive (30 days), so reopening the editor offers it
      //     again.
      //
      // Registered last on purpose. In "carry on" mode the branch above has
      // already applied the local copy and set restoreDecidedRef, so rule 1 holds
      // even if the lookup answers a millisecond after its deadline; attaching
      // this first would leave a window where both could hydrate, older last.
      //
      // The visible cost when it does fire is that an open dialog's wording
      // changes from "your unsaved work" to "work from another device" while it is
      // being read. That is the honest thing to show, and it is rarer than handing
      // someone a stale copy without telling them.
      if (first.timedOut) {
        void remote.eventual.then((late) => {
          if (cancelled || !late || !late.pages.length) return;
          if (late.updatedAt <= localAt) return; // the local copy really was newer
          if (restoreDecidedRef.current || hasUserEdits()) return;
          draftFieldsRef.current = late.fields ?? {};
          setDraftSource("server");
          const upgraded = serverPagesToCanvas(late.pages, late.fields);
          if (resumeMode === "continue") void applyRestore(upgraded);
          else setDraftPrompt(upgraded);
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Load a stored canvas into the live session and apply its restored fields.
  // Shared by the restore prompt and the automatic "carry on" reopen.
  async function applyRestore(canvas: DraftCanvasV1) {
    restoreDecidedRef.current = true;
    await hydrateFromDraft(canvas);
    const f = draftFieldsRef.current;
    if (f) onRestoreFields?.(f);
    draftFieldsRef.current = null;
    // Push the restored session back so the local + server copies converge.
    if (draftingEnabled) flushServerSync();
  }

  async function restoreDraft() {
    const canvas = draftPrompt;
    restoreDecidedRef.current = true;
    setDraftPrompt(null);
    if (!canvas) return;
    await applyRestore(canvas);
  }

  function discardDraft() {
    restoreDecidedRef.current = true;
    setDraftPrompt(null);
    draftFieldsRef.current = null;
    if (draftKey) void deleteDraft(draftKey);
    if (draftingEnabled) void serverDiscardDraft(serverSurface, serverContext);
  }

  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Guard against a not-yet-laid-out canvas (rect 0) to avoid NaN coords.
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    return {
      x: ((e.clientX - rect.left) / rw) * W,
      y: ((e.clientY - rect.top) / rh) * H,
    };
  }

  function applyStyle(c: CanvasRenderingContext2D) {
    c.globalCompositeOperation = "source-over";
    const s = sizeRef.current;
    switch (toolRef.current) {
      case "eraser":
        // Erase strokes back to transparent so the layers below show through.
        c.globalCompositeOperation = "destination-out";
        c.strokeStyle = "rgba(0,0,0,1)";
        c.globalAlpha = 1;
        c.lineWidth = s * 3;
        break;
      case "highlighter":
        // Wide and translucent, like a real highlighter.
        c.strokeStyle = colorRef.current;
        c.globalAlpha = 0.35;
        c.lineWidth = s * 3.4;
        break;
      case "pencil":
        // "Pen": a fine, opaque line.
        c.strokeStyle = colorRef.current;
        c.globalAlpha = 1;
        c.lineWidth = Math.max(1.5, s * 0.6);
        break;
      default:
        // "Felt tip": a bold, opaque line — clearly thicker than the Pen.
        c.strokeStyle = colorRef.current;
        c.globalAlpha = 1;
        c.lineWidth = s * 1.8;
    }
  }

  function drawStroke() {
    const c = ctx();
    if (!c || !snapshot.current) return;
    // Marked here, at the writer, rather than at `end()` which calls it: a
    // stroke that never gets its pointer-up (a cancelled gesture, a tab hidden
    // mid-line) has still changed the bitmap, and the flag has to be true from
    // the moment that is so.
    strokeDirtyRef.current = true;
    c.putImageData(snapshot.current, 0, 0);
    applyStyle(c);
    const pts = points.current;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) c.lineTo(pts[0].x, pts[0].y);
    else for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  // Leave text-editing mode. Discards the box if nothing was typed.
  function finishEditing() {
    const id = editingRef.current;
    if (id) {
      const list = objectsRef.current[currentRef.current] ?? [];
      const t = list.find((o) => o.id === id);
      if (t && t.type === "text" && !t.text.trim()) {
        objectsRef.current[currentRef.current] = list.filter((o) => o.id !== id);
        setObjects(objectsRef.current[currentRef.current]);
        setSelectedId((s) => (s === id ? null : s));
      }
    }
    editingRef.current = null;
    setEditingId(null);
    syncHidden();
    refreshThumbs();
  }

  function start(e: React.PointerEvent) {
    if (loadingRef.current) return;
    if (toolRef.current === "cursor") return; // selecting is handled by objects
    setSelectedId(null);
    if (toolRef.current === "text") {
      e.preventDefault();
      finishEditing();
      const p = pos(e);
      pushHistory();
      const id = `o${objIdRef.current++}`;
      const obj: TextObj = {
        id,
        type: "text",
        text: "",
        x: p.x,
        y: p.y,
        fontPx: textFontPx(),
        color: colorRef.current,
      };
      const list = [...(objectsRef.current[currentRef.current] ?? []), obj];
      objectsRef.current[currentRef.current] = list;
      setObjects(list);
      setSelectedId(id);
      setEditingId(id);
      editingRef.current = id;
      // One tap, one box. Words are almost never placed two at a time — the
      // job is place it, type it, move it — so the tool disarms itself and
      // hands over to Move. The new box stays open for typing; it is the NEXT
      // tap on the paper that would otherwise have made a second box nobody
      // asked for.
      setTool("cursor");
      return;
    }
    e.preventDefault();
    const c = ctx();
    if (!c) return;
    pushHistory();
    drawing.current = true;
    snapshot.current = c.getImageData(0, 0, W, H);
    points.current = [pos(e)];
    drawStroke();
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    points.current.push(pos(e));
    drawStroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    snapshot.current = null;
    anyDrawnRef.current = true;
    syncHidden();
    refreshThumbs();
  }

  function paintDataUrl(dataUrl: string | undefined) {
    clearCanvas();
    if (!dataUrl) return Promise.resolve();
    loadingRef.current = true;
    const painted = loadImage(dataUrl)
      .then((img) => {
        const c = ctx();
        if (c) c.drawImage(img, 0, 0, W, H);
      })
      // A stroke layer is always a locally-generated data URL, so this should
      // not fail; swallow it rather than leave the canvas stuck in `loading`
      // (which would silently stop autosave) or raise an unhandled rejection.
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false;
      });
    settleRef.current = painted;
    return painted;
  }

  function loadPage(index: number) {
    void paintDataUrl(pagesRef.current[index]);
  }

  function restore(entry: HistoryEntry) {
    objectsRef.current[currentRef.current] = entry.objects;
    setObjects([...entry.objects]);
    // The images too: undoing a retake must composite the photo that was
    // there before, not the one the cache was last told about.
    const done = Promise.all([paintDataUrl(entry.img), ensureObjectImages(entry.objects)]).then(() => {
      pagesRef.current[currentRef.current] = entry.img;
      syncHidden();
      refreshThumbs();
      refreshUndoRedo();
    });
    settleRef.current = done;
  }

  function undo() {
    if (pageActionIsNext()) {
      // Once the page on screen has finished repainting from the step before.
      // That repaint writes its strokes back to `pagesRef` when it lands, and
      // a page moved or taken away under it would have them written onto the
      // wrong page. The wait is a few milliseconds; the press is not lost.
      void settleRef.current.then(() => {
        if (pageActionIsNext() && !loadingRef.current) undoPageAction();
      });
      return;
    }
    const stack = undoRef.current[currentRef.current];
    if (!stack || !stack.length) return;
    pushCapped((redoRef.current[currentRef.current] ??= []), {
      img: currentStrokeSnapshot(),
      objects: cloneObjs(objectsRef.current[currentRef.current] ?? []),
    });
    setSelectedId(null);
    restore(stack.pop()!);
  }

  function redo() {
    const stack = redoRef.current[currentRef.current];
    if (!stack || !stack.length) return;
    // A redo is a step taken now, so it is stamped now: newer than any page
    // action before it.
    pushCapped((undoRef.current[currentRef.current] ??= []), {
      img: currentStrokeSnapshot(),
      objects: cloneObjs(objectsRef.current[currentRef.current] ?? []),
      seq: ++seqRef.current,
    });
    setSelectedId(null);
    restore(stack.pop()!);
  }

  function goToPage(index: number) {
    if (index < 0 || index >= pagesRef.current.length || index === currentRef.current) return;
    finishEditing();
    setCaptureFrame(null);
    syncHidden();
    currentRef.current = index;
    setCurrent(index);
    setSelectedId(null);
    setObjects(objectsRef.current[index] ?? []);
    loadPage(index);
    refreshUndoRedo();
  }

  // ---- Pages, and putting them back -----------------------------------------
  //
  // A page is not one thing. It is an entry in seven parallel arrays (strokes,
  // background, objects, composite, preview, thumbnail, and whether it was
  // added), a set of quiz questions that know which page they are on BY INDEX,
  // and its own undo history, keyed by index too. Every page operation moves
  // all of them together through the primitives below, so none of them can
  // move six and hand in wrong.

  // Re-key the per-page undo history after pages have moved. `to` answers
  // "where is the page that was at index i now?", or null for a page that has
  // gone. The redo stacks are dropped: redo replays the step just undone, and
  // a page action is a new step.
  function rekeyHistory(to: (i: number) => number | null) {
    const next: Record<number, HistoryEntry[]> = {};
    for (const [k, stack] of Object.entries(undoRef.current)) {
      const n = to(Number(k));
      if (n !== null && stack) next[n] = stack;
    }
    undoRef.current = next;
    redoRef.current = {};
  }

  // Lift page i out whole. The caller keeps the snapshot to put back, or lets
  // it go.
  function takePage(i: number): PageSnapshot {
    const snap: PageSnapshot = {
      page: pagesRef.current[i],
      template: templatesRef.current[i] ?? null,
      objects: objectsRef.current[i] ?? [],
      composite: compositeRef.current[i],
      preview: previewRef.current[i],
      thumb: thumbRef.current[i],
      added: addedRef.current[i] === true,
      questions: quizRef.current.filter((q) => q.pageIndex === i),
      history: undoRef.current[i] ?? [],
    };
    pagesRef.current.splice(i, 1);
    templatesRef.current.splice(i, 1);
    objectsRef.current.splice(i, 1);
    compositeRef.current.splice(i, 1);
    previewRef.current.splice(i, 1);
    thumbRef.current.splice(i, 1);
    addedRef.current.splice(i, 1);
    // The page's questions go with it, and every question after it moves up a
    // page. Without this, throwing away page 2 of 3 in the builder left page
    // 3's question pointing at a page that no longer existed.
    quizRef.current = quizRef.current
      .filter((q) => q.pageIndex !== i)
      .map((q) => (q.pageIndex > i ? { ...q, pageIndex: q.pageIndex - 1 } : q));
    rekeyHistory((k) => (k < i ? k : k === i ? null : k - 1));
    return snap;
  }

  // Put a page back at index i: takePage, backwards, to the letter.
  function putPage(i: number, snap: PageSnapshot) {
    pagesRef.current.splice(i, 0, snap.page);
    templatesRef.current.splice(i, 0, snap.template);
    objectsRef.current.splice(i, 0, snap.objects);
    compositeRef.current.splice(i, 0, snap.composite);
    previewRef.current.splice(i, 0, snap.preview);
    thumbRef.current.splice(i, 0, snap.thumb);
    addedRef.current.splice(i, 0, snap.added);
    quizRef.current = [
      ...quizRef.current.map((q) => (q.pageIndex >= i ? { ...q, pageIndex: q.pageIndex + 1 } : q)),
      ...snap.questions.map((q) => ({ ...q, pageIndex: i })),
    ];
    rekeyHistory((k) => (k < i ? k : k + 1));
    if (snap.history.length) undoRef.current[i] = snap.history;
    // Its decoded pictures were let go when it went (see deletePageAt), so
    // they are fetched again, by the ordinary cache-miss path. The page's
    // composite and thumbnail came back with it, so nothing waits on these.
    const url = snap.template;
    if (url && !templateImgRef.current.has(url)) {
      void loadImage(url)
        .then((img) => void templateImgRef.current.set(url, img))
        .catch(() => {});
    }
    void ensureObjectImages(snap.objects);
  }

  // Remember a page action so undo can take it back. Capped like every other
  // history: the oldest simply stops being undoable.
  function pushPageAction(action: PageAction) {
    pageUndoRef.current.push(action);
    if (pageUndoRef.current.length > MAX_HISTORY) pageUndoRef.current.shift();
    pageEditedRef.current = true;
  }

  // Land on a page after the pages have changed under it, and tell everything
  // that shows them.
  function showPage(index: number) {
    currentRef.current = index;
    setPageCount(pagesRef.current.length);
    refreshAdded();
    setCurrent(index);
    setSelectedId(null);
    setMultiIds([]);
    setObjects(objectsRef.current[index] ?? []);
    setQuizQuestions([...quizRef.current]);
    refreshThumbs();
    refreshUndoRedo();
    // Published before the repaint starts, for two reasons: the field must say
    // what the pages are NOW, and the autosave is only scheduled while nothing
    // is loading.
    publishHidden();
    loadPage(index);
  }

  // May this page be thrown away? Asked by the tray, the menu, the inline
  // button AND by deletePageAt itself, which is where every route ends up.
  function pageMayGo(i: number): boolean {
    return pageDelete === "any" || addedRef.current[i] === true;
  }

  // May this page be moved? The same pages as may go, for the same reason: the
  // teacher's pages are the worksheet, in the order the teacher set it (owner
  // decision 2026-09-10, F76). A page the child added may be slid anywhere,
  // between two of the teacher's included, and that never reorders the
  // teacher's pages among themselves, because they are never the page that
  // moves. Asked by the tray and the menu, and by movePageTo itself.
  function pageMayMove(i: number): boolean {
    return pageDelete === "any" || addedRef.current[i] === true;
  }

  function addPage() {
    finishEditing();
    setCaptureFrame(null);
    syncHidden();
    const from = currentRef.current;
    clearCanvas();
    const blank = canvasRef.current!.toDataURL("image/png"); // transparent strokes
    pagesRef.current.push(blank);
    templatesRef.current.push(null);
    objectsRef.current.push([]);
    addedRef.current.push(true);
    const index = pagesRef.current.length - 1;
    currentRef.current = index;
    // White paper, and nothing on it yet — so the preview IS the composite, and
    // the thumbnail comes off the same render.
    syncPageImages(index);
    // "New page gone" is what the toast promises, so it has to be undoable.
    pushPageAction({ kind: "add", seq: ++seqRef.current, index, from });
    setPageCount(pagesRef.current.length);
    refreshAdded();
    setCurrent(index);
    setSelectedId(null);
    setObjects([]);
    refreshThumbs();
    refreshUndoRedo();
  }

  // Copy a page, with everything on it, and put the copy straight after it.
  //
  // A teacher building ten questions on one layout was rebuilding that layout
  // ten times. Everything the page carries comes with it — the drawing, the
  // template underneath, the movable objects and the quiz questions — because a
  // duplicate that dropped any one of them would be a page they had to finish
  // by hand, which is the job this is here to remove.
  //
  // Copied objects and questions get NEW ids. Two objects sharing an id would
  // be one object as far as selection, deletion and the answer map are
  // concerned, so a child editing the copy would silently edit the original.
  // The copy is a page added here, so it can be thrown away again.
  function copyPage(target: number): number {
    const at = target + 1;
    pagesRef.current.splice(at, 0, pagesRef.current[target]);
    templatesRef.current.splice(at, 0, templatesRef.current[target]);
    objectsRef.current.splice(
      at,
      0,
      (objectsRef.current[target] ?? []).map((o) => ({ ...o, id: `o${objIdRef.current++}` })),
    );
    compositeRef.current.splice(at, 0, compositeRef.current[target]);
    previewRef.current.splice(at, 0, previewRef.current[target]);
    thumbRef.current.splice(at, 0, thumbRef.current[target]);
    addedRef.current.splice(at, 0, true);

    // A question knows which page it is on by index, so inserting a page moves
    // every question after the insertion up one — and the copied page's own
    // questions are copied with it.
    const copies = quizRef.current
      .filter((q) => q.pageIndex === target)
      .map((q) => ({
        ...q,
        id: `q${quizSeqRef.current++}`,
        pageIndex: at,
        options: q.options.map((o) => ({ ...o })),
      }));
    quizRef.current = [
      ...quizRef.current.map((q) => (q.pageIndex >= at ? { ...q, pageIndex: q.pageIndex + 1 } : q)),
      ...copies,
    ];
    rekeyHistory((k) => (k < at ? k : k + 1));
    return at;
  }

  function duplicatePageAt(target: number) {
    if (target < 0 || target >= pagesRef.current.length) return;
    finishEditing();
    setCaptureFrame(null);
    // Bake the page on screen first, so duplicating a DIFFERENT page never
    // drops the in-progress work on the one being viewed.
    syncHidden();
    const from = currentRef.current;
    const at = copyPage(target);
    pushPageAction({ kind: "copy", seq: ++seqRef.current, index: at, from });
    anyDrawnRef.current = true;
    showPage(at);
  }

  // Move a page to a position, not just past its neighbour. The page tray drags
  // a card several slots at once, and a run of swaps would fire the whole
  // reorder once per slot crossed.
  function liftPage(index: number, target: number) {
    const lift = <T,>(arr: T[]) => {
      const [item] = arr.splice(index, 1);
      arr.splice(target, 0, item);
    };
    lift(pagesRef.current);
    lift(templatesRef.current);
    lift(objectsRef.current);
    lift(compositeRef.current);
    lift(previewRef.current);
    lift(thumbRef.current);
    lift(addedRef.current);

    // The questions travel with their pages. This is the part a naive reorder
    // silently breaks: the pictures move and the questions stay behind. Every
    // page between the old and new position shifts by one, and the page being
    // moved jumps the whole way.
    const step = index < target ? -1 : 1;
    const lo = Math.min(index, target);
    const hi = Math.max(index, target);
    quizRef.current = quizRef.current.map((q) =>
      q.pageIndex === index
        ? { ...q, pageIndex: target }
        : q.pageIndex >= lo && q.pageIndex <= hi
          ? { ...q, pageIndex: q.pageIndex + step }
          : q,
    );

    // And each page's history goes where its page went.
    const order = pagesRef.current.map((_, i) => i);
    lift(order); // order[now] = where that page was before
    rekeyHistory((k) => order.indexOf(k));
  }

  // Move a page one place up or down the strip.
  function movePageBy(index: number, delta: number) {
    movePageTo(index, index + delta);
  }

  // Returns whether it moved, so a caller only says it did when it did.
  function movePageTo(index: number, target: number): boolean {
    if (index === target) return false;
    if (index < 0 || index >= pagesRef.current.length) return false;
    if (target < 0 || target >= pagesRef.current.length) return false;
    // Enforced here as well as at the tray and the menu, the way deletePageAt
    // refuses a teacher's page: the next route to a move cannot forget it.
    if (!pageMayMove(index)) return false;
    finishEditing();
    // Bake the page on screen first, so reordering from a DIFFERENT page never
    // drops the in-progress work on the one being viewed.
    syncHidden();
    liftPage(index, target);
    pushPageAction({ kind: "move", seq: ++seqRef.current, from: index, to: target });
    // Stay with the page that moved rather than with the position it left, so
    // a teacher can press the same button again to keep going.
    showPage(target);
    return true;
  }

  // Throw a page away (by index) — the tray's cross, the page menu and the
  // inline layout's "Delete page" all end here. Undo puts it back: the drawing,
  // the pieces on it, its questions and its own history.
  //
  // Returns whether it went, so a caller only says it did when it did.
  function deletePageAt(target: number): boolean {
    if (pagesRef.current.length <= 1) return false;
    if (target < 0 || target >= pagesRef.current.length) return false;
    // Enforced here as well as at every button: this is the one place that
    // cannot be forgotten when the next route to it is added (rule 8).
    if (!pageMayGo(target)) return false;
    finishEditing();
    setCaptureFrame(null);
    setSelectedQuestionId(null);
    // Bake the page on screen first, so deleting a DIFFERENT page never drops
    // the in-progress work on the page you're currently viewing.
    syncHidden();
    // The decoded pictures that page was holding go with it. Every one is a
    // full-size bitmap kept outside the JavaScript heap, and a lesson spent
    // adding a photo page and throwing it away again kept all of them. If the
    // deletion is undone, `putPage` fetches them again.
    const goneUrl = templatesRef.current[target];
    for (const o of objectsRef.current[target] ?? []) imgCacheRef.current.delete(o.id);
    const snap = takePage(target);
    // A worksheet background is cached by URL and SHARED between pages, so it
    // may only be dropped once no page is still standing on it.
    if (goneUrl && !templatesRef.current.includes(goneUrl)) templateImgRef.current.delete(goneUrl);
    pushPageAction({ kind: "delete", seq: ++seqRef.current, index: target, snap });
    // Keep the viewer on the same page where possible: a page removed at or
    // before the current one shifts the current index back by one; a page
    // removed after it leaves the current index alone.
    let index = target <= currentRef.current ? currentRef.current - 1 : currentRef.current;
    index = Math.max(0, Math.min(index, pagesRef.current.length - 1));
    showPage(index);
    return true;
  }

  // Delete the page currently on screen (the inline layout's "Delete page").
  function deletePage() {
    deletePageAt(currentRef.current);
  }

  // Take back the newest page action. Only called when it is newer than every
  // step on every page (`pageActionIsNext`), so nothing done since is lost.
  function undoPageAction() {
    const action = pageUndoRef.current.pop();
    if (!action) return;
    finishEditing();
    setCaptureFrame(null);
    setSelectedQuestionId(null);
    syncHidden();
    switch (action.kind) {
      case "delete":
        // The page comes back where it was, and the child is taken to it:
        // what they just asked for is on screen.
        putPage(action.index, action.snap);
        showPage(action.index);
        return;
      case "add":
      case "copy": {
        // Nothing done on the new page since is still standing — undo only
        // reaches this once every step on it has been undone — so the page
        // goes exactly as it came, and the person is back where they were.
        for (const o of objectsRef.current[action.index] ?? []) imgCacheRef.current.delete(o.id);
        takePage(action.index);
        showPage(Math.min(action.from, pagesRef.current.length - 1));
        return;
      }
      case "move":
        liftPage(action.to, action.from);
        showPage(action.from);
        return;
    }
  }

  function clearPage() {
    finishEditing();
    pushHistory();
    clearCanvas();
    strokeDirtyRef.current = true; // the bitmap is now blank and the stored page is not
    objectsRef.current[currentRef.current] = [];
    setObjects([]);
    setSelectedId(null);
    anyDrawnRef.current = anyDrawnRef.current || pagesRef.current.length > 1;
    syncHidden();
    refreshThumbs();
  }

  // Place an imported image / PDF page as a movable object.
  async function addObject(src: string, onNewPage: boolean) {
    if (onNewPage) addPage();
    let img: HTMLImageElement;
    try {
      img = await loadImage(src);
    } catch {
      return;
    }
    pushHistory();
    const id = `o${objIdRef.current++}`;
    imgCacheRef.current.set(id, img);
    const aspect = (img.naturalWidth || 4) / (img.naturalHeight || 3);
    let w = Math.min(W * 0.7, H * 0.7 * aspect);
    let h = w / aspect;
    if (h > H * 0.85) {
      h = H * 0.85;
      w = h * aspect;
    }
    const obj: ImageObj = { id, type: "image", src, x: (W - w) / 2, y: (H - h) / 2, w, h, aspect };
    const list = [...(objectsRef.current[currentRef.current] ?? []), obj];
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    anyDrawnRef.current = true;
    setSelectedId(id);
    setTool("cursor"); // so it can be positioned straight away
    syncHidden();
    refreshThumbs();
  }

  // Place a shape as a movable / resizable / recolourable object. Everything
  // One menu at a time.
  //
  // The properties toolbar hovers over the object it belongs to; the add menu
  // and its palette sit down the left. Open together they overlap, and a
  // teacher is left with two sets of controls stacked on each other and no way
  // to tell which one a tap will reach — it happens either way round: pick a
  // shape while something is selected, or tap an object while the palette is
  // open. Opening either now closes the other, which is what tapping a menu
  // means anyway: I am doing this now, not that.
  function selectObject(id: string | null) {
    setSelectedId(id);
    // A quiz question and a canvas object are both "the thing being edited",
    // and two things claiming that at once means two sets of controls on screen
    // with no way to tell which a tap will reach. Picking either drops the
    // other.
    if (id !== null) setSelectedQuestionId(null);
    // Tapping a single object outside the marquee selection ends it. Tapping
    // one INSIDE it keeps the group, so a child can pick the group up by any of
    // its members without it dissolving under the finger.
    if (id === null || !multiRef.current.includes(id)) setMultiIds([]);
    if (id !== null) {
      setFanOpen(false);
      setOpenKit(null);
    }
  }

  // The other half of the rule in `selectObject`: picking a question lets go of
  // whatever object was selected, including a whole marquee group.
  function selectQuestion(id: string | null) {
    setSelectedQuestionId(id);
    if (id !== null) {
      setSelectedId(null);
      setMultiIds([]);
    }
  }

  // The rubber band. Dragging on empty canvas with the pointer tool draws a box
  // and everything it touches is picked up together.
  //
  // Touching, not enclosing: a child drawing a box round six counters should
  // not have to get every edge outside every counter. Locked and unmovable
  // objects are left out, so a selection is always a selection that can move —
  // a group that silently refuses to budge because one member is pinned is
  // worse than not selecting it.
  function marqueeStart(e: React.PointerEvent<HTMLDivElement>) {
    selectObject(null);
    setSelectedQuestionId(null);
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    const box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    marqueeRef.current = box;
    setMarquee(box);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function marqueeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!marqueeRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const box = {
      ...marqueeRef.current,
      x1: (e.clientX - r.left) / scale,
      y1: (e.clientY - r.top) / scale,
    };
    marqueeRef.current = box;
    setMarquee(box);
  }

  function marqueeEnd() {
    const box = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!box) return;
    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);
    // A tap rather than a drag. Leave the selection cleared, which is what
    // tapping the background has always meant.
    if (x1 - x0 < 6 && y1 - y0 < 6) return;
    const hits = (objectsRef.current[currentRef.current] ?? [])
      .filter((o) => objCapabilities(o, isObjectAuthor).movable)
      .filter((o) => {
        const b = objScreenBox(o);
        return b && b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
      })
      .map((o) => o.id);
    setMultiIds(hits.length > 1 ? hits : []);
    // One object caught is not a group; make it the ordinary single selection
    // so its toolbar and corners appear as they would from a tap.
    if (hits.length === 1) selectObject(hits[0]);
  }

  // An object's box in MODEL units, for hit-testing the marquee against. A text
  // box stores no width or height — it is sized by its words — so it is
  // measured off the layout, which is also what makes a turned object test
  // against the box it actually occupies.
  function objScreenBox(o: Obj) {
    if (o.type !== "text") return { x: o.x, y: o.y, w: o.w, h: o.h };
    const el = document.querySelector<HTMLElement>(`div[data-object][data-id="${o.id}"]`);
    if (!el) return null;
    return { x: o.x, y: o.y, w: el.offsetWidth / scale, h: el.offsetHeight / scale };
  }


  function openAddMenu(next: boolean) {
    setFanOpen(next);
    setOpenKit(null);
    if (next) setSelectedId(null);
  }

  function toggleKit(id: KitId) {
    setOpenKit((v) => (v === id ? null : id));
    setSelectedId(null);
  }

  // that varies between palette buttons — size, colours, a preset label — comes
  // off the preset, so a new button is a table entry rather than another branch
  // in here.
  function addShape(preset: ShapePreset, cycle = false) {
    pushHistory();
    const id = `o${objIdRef.current++}`;
    const w = Math.round((preset.w ?? SHAPE_DEFAULTS.w) * ADD_SCALE);
    const h = Math.round((preset.h ?? SHAPE_DEFAULTS.h) * ADD_SCALE);
    // Nine landing places in a cycle, so a teacher tapping "Counter 1" four
    // times out of the kit WINDOW gets four counters they can see rather than
    // one they have to peel apart. Design offsets of ±44 / ±36 px, in model
    // units. Only from a window: the ＋ fan folds after each shape, so one tap
    // is one shape and the middle of the page is where it belongs.
    const slot = cycle ? placeCycleRef.current++ % 9 : 4;
    const dx = ((slot % 3) - 1) * 37;
    const dy = (Math.floor(slot / 3) - 1) * 30;
    const obj: ShapeObj = {
      id,
      type: "shape",
      shape: preset.kind,
      x: Math.max(0, Math.min(W - w, placeX(w) + dx)),
      y: (H - h) / 2 + dy,
      w,
      h,
      // Apparatus arrives cream, so what is written on it reads; a plain shape
      // arrives in the fill the last shape was given (bright blue to begin
      // with), so what a child sees on the fan is what lands on the page. A
      // preset's own colour wins over both.
      fill:
        preset.fill ??
        (preset.kind === "grid" || preset.kind === "pie" || preset.kind === "ring"
          ? "#fffdf7"
          : shapeFill),
      stroke: preset.stroke ?? SHAPE_DEFAULTS.stroke,
      strokeWidth: preset.strokeWidth ?? SHAPE_DEFAULTS.strokeWidth,
      ...(preset.text ? { text: preset.text } : {}),
      ...(preset.cols !== undefined ? { cols: preset.cols } : {}),
      ...(preset.rows !== undefined ? { rows: preset.rows } : {}),
      ...(preset.parts !== undefined ? { parts: preset.parts } : {}),
      ...(preset.thickness !== undefined ? { thickness: preset.thickness } : {}),
      ...(preset.numerals ? { numerals: true } : {}),
      ...(preset.start !== undefined ? { start: preset.start } : {}),
      ...(preset.step !== undefined ? { step: preset.step } : {}),
      ...(preset.operator !== undefined ? { operator: preset.operator } : {}),
      ...(preset.sides !== undefined ? { sides: preset.sides } : {}),
      // A number line arrives numbered unless its preset is the blank one, so
      // "absent" has to mean ON here — the opposite of the clock, whose blank
      // face is the default. Stored either way rather than left to be guessed.
      ...(preset.kind === "numberline" ? { numerals: preset.numerals !== false } : {}),
      ...(preset.lockAspect ? { lockAspect: true } : {}),
      ...(preset.fixedGrid ? { fixedGrid: true } : {}),
    };
    const list = [...(objectsRef.current[currentRef.current] ?? []), obj];
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    anyDrawnRef.current = true;
    setSelectedId(id);
    setTool("cursor"); // so it can be positioned straight away
    // The kit window STAYS. A teacher builds a page out of several pieces, and
    // a palette that shut after every one made them re-open it each time. The
    // fan is the thing that folds — a fan is a choice, a window is a workbench.
    setPlusRow(null);
    setFanOpen(false);
    say(`${preset.label} gone`);
    syncHidden();
    refreshThumbs();
  }

  // --- The clipboard -------------------------------------------------------
  //
  // In-app, not the system one. It carries whole objects — a number line with
  // its start, segments and interval; a shape with its fill and its label —
  // between the pages of this editor, which is what it is for. The system
  // clipboard cannot hold a ShapeObj without inventing a serialisation for it,
  // and reading it back asks the browser for permission the first time, which
  // is a prompt in the middle of a lesson.
  const clipboardRef = useRef<Obj[]>([]);

  // What a cut, a copy or a delete acts on: the marquee group when there is
  // one, otherwise whatever single object is selected. One function so the
  // keyboard and the right-click menu can never disagree about it.
  function selectionIds(): string[] {
    if (multiRef.current.length) return multiRef.current;
    return selectedId ? [selectedId] : [];
  }

  // The subset of the selection this person may actually change.
  //
  // `objCapabilities` is the one place that decides it, and the corner ✕ and
  // the object toolbar have always asked it. The right-click menu and the
  // keyboard shortcuts are new routes to the same actions, and they have to ask
  // the same question — otherwise a child answering a worksheet can right-click
  // the teacher's furniture and delete it, which is precisely what the corner
  // controls refuse to offer them (rule 8, deny by default).
  //
  // A marquee can legitimately hold both: a child may be allowed to MOVE a
  // template piece while not being allowed to remove it. So the group moves as
  // one and only the child's own work is cut, copied or deleted.
  function editableIds(): string[] {
    const list = objectsRef.current[currentRef.current] ?? [];
    const wanted = new Set(selectionIds());
    return list
      .filter((o) => wanted.has(o.id) && objCapabilities(o, isObjectAuthor).editable)
      .map((o) => o.id);
  }

  function copySelection() {
    const ids = new Set(editableIds());
    if (!ids.size) return;
    const list = objectsRef.current[currentRef.current] ?? [];
    // Snapshot, not a reference: the objects on the page go on being edited
    // after the copy, and a clipboard that changed with them would paste
    // whatever they had become rather than what was copied.
    clipboardRef.current = list.filter((o) => ids.has(o.id)).map((o) => ({ ...o }));
  }

  function cutSelection() {
    const ids = editableIds();
    if (!ids.length) return;
    copySelection();
    deleteObject(ids[0]); // deletes the whole group when the id is part of one
  }

  function pasteClipboard() {
    const held = clipboardRef.current;
    if (!held.length) return;
    const list = objectsRef.current[currentRef.current] ?? [];
    const room = MAX_OBJECTS_PER_PAGE - list.length;
    if (room <= 0) return;
    pushHistory();
    // Offset by the same amount duplicate uses, so a paste lands visibly beside
    // what it came from rather than exactly on top of it looking like nothing
    // happened. The whole group shifts together, keeping its arrangement.
    const copies = held.slice(0, room).map((o) => ({
      ...o,
      // Whatever it was copied from, what lands is the pupil's own object —
      // not part of the template, not pinned, and not itself a dispenser. The
      // same three markers `spawnFromSource` strips, for the same reason.
      fromTemplate: undefined,
      locked: undefined,
      infinite: undefined,
      id: `o${objIdRef.current++}`,
      x: Math.min(W - 24, o.x + DUPLICATE_OFFSET),
      y: Math.min(H - 24, o.y + DUPLICATE_OFFSET),
    })) as Obj[];
    const next = [...list, ...copies];
    objectsRef.current[currentRef.current] = next;
    setObjects(next);
    anyDrawnRef.current = true;
    // Select what was pasted, so it can be dragged straight where it is wanted.
    if (copies.length > 1) {
      setMultiIds(copies.map((o) => o.id));
      setSelectedId(null);
    } else {
      setMultiIds([]);
      setSelectedId(copies[0].id);
    }
    syncHidden();
    refreshThumbs();
  }

  function deleteSelection() {
    const ids = editableIds();
    if (ids.length) deleteObject(ids[0]);
  }

  // --- The right-click menu ------------------------------------------------
  //
  // `contextmenu` covers everything asked for: a right click, a two-finger
  // trackpad click and a long press on an iPad all raise it.
  function openObjectMenu(e: React.MouseEvent, id: string) {
    if (!objectsInteractive) return;
    e.preventDefault();
    e.stopPropagation();
    // Right-clicking outside the marquee group selects what was clicked, so the
    // menu always acts on the thing under the pointer. Inside it, the group
    // stands — which is what makes "copy" copy all six.
    if (!multiRef.current.includes(id)) selectObject(id);
    const at = stagePointOf(e);
    if (!at) return;
    const many = multiRef.current.length > 1;
    // Asked of the objects directly rather than through `selectionIds()`:
    // `selectObject` above is a state update that has not landed yet, so the
    // selection this menu is FOR is the one under the pointer.
    const list = objectsRef.current[currentRef.current] ?? [];
    const ids = multiRef.current.includes(id) ? multiRef.current : [id];
    const canEdit = list.some(
      (o) => ids.includes(o.id) && objCapabilities(o, isObjectAuthor).editable,
    );
    setMenu({
      x: at.x,
      y: at.y,
      items: [
        { label: many ? "Cut these" : "Cut", onSelect: cutSelection, disabled: !canEdit },
        { label: many ? "Copy these" : "Copy", onSelect: copySelection, disabled: !canEdit },
        { label: "Paste", onSelect: pasteClipboard, disabled: !clipboardRef.current.length },
        {
          label: "Duplicate",
          onSelect: () => duplicateObject(id),
          disabled: many || !canEdit,
        },
        { label: many ? "Delete these" : "Delete", onSelect: deleteSelection, disabled: !canEdit },
      ],
    });
  }

  function openCanvasMenu(e: React.MouseEvent) {
    if (!objectsInteractive) return;
    e.preventDefault();
    const at = stagePointOf(e);
    if (!at) return;
    setMenu({
      x: at.x,
      y: at.y,
      items: [
        { label: "Paste", onSelect: pasteClipboard, disabled: !clipboardRef.current.length },
      ],
    });
  }

  function openPageMenu(e: React.MouseEvent, i: number) {
    e.preventDefault();
    const at = stagePointOf(e);
    if (!at) return;
    setMenu({
      x: at.x,
      y: at.y,
      items: [
        { label: "Duplicate page", onSelect: () => duplicatePageAt(i) },
        // Only the builder opens this menu today, where every page may move;
        // asked anyway, so the menu never offers what movePageTo would refuse.
        { label: "Move up", onSelect: () => movePageBy(i, -1), disabled: i === 0 || !pageMayMove(i) },
        {
          label: "Move down",
          onSelect: () => movePageBy(i, 1),
          disabled: i >= pagesRef.current.length - 1 || !pageMayMove(i),
        },
      ],
    });
  }

  // Where a pointer event happened, in the stage's own coordinates — the space
  // the menu is positioned in. Returns null when the event did not happen over
  // the stage at all, which is how a page thumbnail outside it is handled.
  function stagePointOf(e: React.MouseEvent) {
    const stage = (e.currentTarget as HTMLElement).closest(".overflow-hidden") as HTMLElement | null;
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Clone the selected object and drop it slightly off the original, so it is
  // visibly a second thing rather than looking like nothing happened. Selecting
  // the clone means a child can drag it straight where they want it, and tap
  // duplicate again to build a row.
  function duplicateObject(id: string) {
    const list = objectsRef.current[currentRef.current] ?? [];
    const src = list.find((o) => o.id === id);
    if (!src) return;
    // The teacher decides how many of their apparatus a child gets, and the way
    // they say "as many as you like" is to mark it endless. Duplicate must not
    // be a way round that answer.
    if (!objCapabilities(src, isObjectAuthor).editable) return;
    // Refuse at the cap rather than letting normalizeTemplateObjects drop it
    // silently at save time — work that vanishes on hand-in is far worse than
    // a button that says no.
    if (list.length >= MAX_OBJECTS_PER_PAGE) return;
    pushHistory();
    const clone: Obj = {
      ...src,
      id: `o${objIdRef.current++}`,
      x: Math.min(W - 24, src.x + DUPLICATE_OFFSET),
      y: Math.min(H - 24, src.y + DUPLICATE_OFFSET),
    };
    const next = [...list, clone];
    objectsRef.current[currentRef.current] = next;
    setObjects(next);
    anyDrawnRef.current = true;
    setSelectedId(clone.id);
    syncHidden();
    refreshThumbs();
  }

  // Pull a new one off an endless source. The copy is the CHILD's own object —
  // not from the template, not itself a source — so they can move, restyle and
  // delete it freely, while the source it came from stays exactly where the
  // teacher put it.
  //
  // Returns the new id so the drag that triggered it can retarget onto the copy
  // mid-gesture; null when the page is full, in which case the drag is
  // abandoned rather than silently moving the source.
  function spawnFromSource(id: string): string | null {
    const list = objectsRef.current[currentRef.current] ?? [];
    const src = list.find((o) => o.id === id);
    if (!src || src.type !== "shape") return null;
    if (list.length >= MAX_OBJECTS_PER_PAGE) return null;
    pushHistory();
    const copy: ShapeObj = { ...src, id: `o${objIdRef.current++}` };
    delete copy.infinite;
    delete copy.fromTemplate;
    delete copy.locked;
    const next = [...list, copy];
    objectsRef.current[currentRef.current] = next;
    setObjects(next);
    anyDrawnRef.current = true;
    syncHidden();
    refreshThumbs();
    return copy.id;
  }

  function updateObject(id: string, patch: Partial<Obj>) {
    const current = objectsRef.current[currentRef.current] ?? [];
    const group = multiRef.current;
    // A drag on any member of a marquee selection carries the whole selection.
    // Caught here, at the one place every object change passes through, rather
    // than in the two object views: they go on reporting where the object they
    // are dragging has got to, and the group follows it by the same amount.
    //
    // Only a MOVE spreads. Resizing or turning one object of a group is that
    // object's business — a group resize is a different gesture with different
    // maths, and silently applying a width to eight shapes would be a surprise.
    const isMove =
      group.length > 1 &&
      group.includes(id) &&
      ("x" in patch || "y" in patch) &&
      !("w" in patch) &&
      !("h" in patch) &&
      !("rot" in patch);
    if (isMove) {
      const src = current.find((o) => o.id === id);
      if (src) {
        const dx = (patch.x ?? src.x) - src.x;
        const dy = (patch.y ?? src.y) - src.y;
        const moved = current.map((o) => {
          if (o.id === id) return { ...o, ...patch } as Obj;
          if (!group.includes(o.id)) return o;
          return { ...o, x: o.x + dx, y: o.y + dy } as Obj;
        });
        objectsRef.current[currentRef.current] = moved;
        setObjects(moved);
        return;
      }
    }
    const list = current.map((o) => (o.id === id ? ({ ...o, ...patch } as Obj) : o));
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    // Recolouring a shape's fill sets the colour the NEXT shape arrives in.
    // Apparatus is left out: a cream grid says nothing about what a child
    // wants their next circle to be. "none" is an outline, not a colour.
    const target = current.find((o) => o.id === id);
    const fill = (patch as Partial<ShapeObj>).fill;
    if (
      target?.type === "shape" &&
      typeof fill === "string" &&
      fill !== "none" &&
      !(target.shape === "grid" || target.shape === "pie" || target.shape === "ring")
    ) {
      setShapeFill(fill);
    }
  }

  function deleteObject(id: string) {
    pushHistory();
    // Delete the whole marquee selection when the object is part of one: they
    // were picked out together and a child who drew a box round six things and
    // pressed ✕ meant all six.
    const group = multiRef.current;
    const wanted = group.includes(id) ? new Set(group) : new Set([id]);
    // Enforced here as well as at the callers: this is where every route to
    // deleting something ends up, so it is the one place that cannot be
    // forgotten when the next route is added.
    const current = objectsRef.current[currentRef.current] ?? [];
    const doomed = new Set(
      current
        .filter((o) => wanted.has(o.id) && objCapabilities(o, isObjectAuthor).editable)
        .map((o) => o.id),
    );
    if (!doomed.size) return;
    const list = current.filter((o) => !doomed.has(o.id));
    // Let go of the decoded picture too. `ensureObjectImages` reloads on a cache
    // miss, which is the path an undo of this already takes, so the photo comes
    // back if the child changes their mind.
    for (const id of doomed) imgCacheRef.current.delete(id);
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    setSelectedId(null);
    setMultiIds([]);
    syncHidden();
    refreshThumbs();
  }

  function commitObjectChange() {
    syncHidden();
    refreshThumbs();
  }

  // Teacher toggles an object's padlock: locked objects can't be moved by a
  // child; unlocked ones can. Only meaningful while authoring a template.
  function toggleLock(id: string) {
    pushHistory();
    const list = (objectsRef.current[currentRef.current] ?? []).map((o) =>
      o.id === id ? ({ ...o, locked: !o.locked } as Obj) : o,
    );
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    syncHidden();
    refreshThumbs();
  }

  // Z-order: objects paint in array order (later = on top), for both the live
  // layer and the flattened composite. Move an object to the end (front) or the
  // start (back) of its page's list.
  function reorderObject(id: string, to: "front" | "back") {
    const list = objectsRef.current[currentRef.current] ?? [];
    const idx = list.findIndex((o) => o.id === id);
    if (idx < 0) return;
    pushHistory();
    const moved = list[idx];
    const rest = [...list.slice(0, idx), ...list.slice(idx + 1)];
    const next = to === "front" ? [...rest, moved] : [moved, ...rest];
    objectsRef.current[currentRef.current] = next;
    setObjects(next);
    syncHidden();
    refreshThumbs();
  }

  // Update the text of a text object while it's being typed. A photo frame's
  // words are its prompt, kept under a different name so nothing that reads a
  // shape's label ever mistakes a teacher's instruction for one.
  function updateText(id: string, text: string) {
    const target = (objectsRef.current[currentRef.current] ?? []).find((o) => o.id === id);
    updateObject(id, target?.type === "frame" ? { label: text } : { text });
    if (text.trim()) anyDrawnRef.current = true;
    syncHidden();
    refreshThumbs();
  }

  // Re-open a text object for editing.
  function editTextObject(id: string) {
    finishEditing();
    pushHistory();
    setSelectedId(id);
    setEditingId(id);
    editingRef.current = id;
  }

  // A photo frame: the teacher's placeholder for a picture the child will take.
  // Author-only — the fan button that calls this is not rendered anywhere else.
  function addFrame() {
    const list = objectsRef.current[currentRef.current] ?? [];
    if (list.length >= MAX_OBJECTS_PER_PAGE) return;
    finishEditing();
    pushHistory();
    const id = `o${objIdRef.current++}`;
    const obj: FrameObj = {
      id,
      type: "frame",
      x: (W - FRAME_DEFAULT_W) / 2,
      y: (H - FRAME_DEFAULT_H) / 2,
      w: FRAME_DEFAULT_W,
      h: FRAME_DEFAULT_H,
    };
    objectsRef.current[currentRef.current] = [...list, obj];
    setObjects(objectsRef.current[currentRef.current]);
    anyDrawnRef.current = true;
    setSelectedId(id);
    setTool("cursor");
    setOpenKit(null);
    setFanOpen(false);
    syncHidden();
    refreshThumbs();
  }

  // A web link (SAFEGUARDING rule 26): the teacher's form, then a chip on the
  // page. Author-only — the fan button that opens the form is not rendered
  // anywhere else, and a link is fixed on any canvas that is not the builder.
  const [linkForm, setLinkForm] = useState<{ id?: string } | null>(null);

  function saveLink(href: string, label: string) {
    const target = linkForm;
    setLinkForm(null);
    // Checked again here, not trusted from the form: the builder and the
    // server share one validator, and this is the builder's copy of it.
    const parsed = parseTeacherLink(href);
    if (!parsed.ok || !isObjectAuthor) return;
    const tidy = tidyLinkLabel(label) ?? "";
    if (target?.id) {
      pushHistory();
      updateObject(target.id, { href: parsed.href, label: tidy || undefined } as Partial<Obj>);
      syncHidden();
      refreshThumbs();
      return;
    }
    const list = objectsRef.current[currentRef.current] ?? [];
    if (list.length >= MAX_OBJECTS_PER_PAGE) return;
    finishEditing();
    pushHistory();
    const id = `o${objIdRef.current++}`;
    const obj: LinkObj = {
      id,
      type: "link",
      x: placeX(LINK_DEFAULT_W),
      y: (H - LINK_DEFAULT_H) / 2,
      w: LINK_DEFAULT_W,
      h: LINK_DEFAULT_H,
      href: parsed.href,
      ...(tidy ? { label: tidy } : {}),
    };
    objectsRef.current[currentRef.current] = [...list, obj];
    setObjects(objectsRef.current[currentRef.current]);
    anyDrawnRef.current = true;
    setSelectedId(id);
    setTool("cursor");
    syncHidden();
    refreshThumbs();
  }

  // The link a child has pressed, waiting on the "leaving StoryJar" card.
  const [leaving, setLeaving] = useState<{ href: string; host: string } | null>(null);

  // The links a child may press: only those that arrived in the teacher's
  // snapshot of the activity, keyed by id, with the address as the teacher
  // saved it. Whatever a child's device holds — a restored draft, an object
  // state that has been meddled with — can place a chip on the page, and can
  // never make one open. Re-checked with the same validator on the way in.
  const teacherLinks = useMemo(() => {
    const byId = new Map<string, { href: string; host: string; label?: string; obj: LinkObj }>();
    for (const page of initialObjects ?? []) {
      if (!Array.isArray(page)) continue;
      for (const raw of page) {
        const o = raw as Partial<LinkObj> | null;
        if (!o || o.type !== "link" || typeof o.id !== "string") continue;
        if (byId.has(o.id)) continue;
        const parsed = parseTeacherLink(o.href);
        if (!parsed.ok) continue;
        const label = tidyLinkLabel(o.label);
        const w = typeof o.w === "number" && Number.isFinite(o.w) ? o.w : LINK_DEFAULT_W;
        const h = typeof o.h === "number" && Number.isFinite(o.h) ? o.h : LINK_DEFAULT_H;
        byId.set(o.id, {
          href: parsed.href,
          host: displayHost(parsed.href),
          label,
          obj: {
            id: o.id,
            type: "link",
            x: typeof o.x === "number" && Number.isFinite(o.x) ? o.x : 0,
            y: typeof o.y === "number" && Number.isFinite(o.y) ? o.y : 0,
            w: Math.max(MIN_LINK_W, w),
            h: Math.max(MIN_LINK_H, h),
            href: parsed.href,
            ...(label ? { label } : {}),
          },
        });
      }
    }
    return byId;
  }, [initialObjects]);

  // A child's pages with every web link put back to the teacher's own copy of
  // it: the address, the name, where it sits and how big it is all come from
  // the snapshot, and a link the snapshot never had — or a second copy of one
  // it did — is taken off the page. Applied wherever a child's canvas takes in
  // objects from outside itself (the template, a restored draft), so the chip
  // on the page, the card it opens and the picture that is handed in all name
  // the same website, and it is the teacher's. The builder is left alone: there
  // the objects ARE the teacher's copy, being written.
  function withTeacherLinks(pages: Obj[][]): Obj[][] {
    if (isObjectAuthor) return pages;
    const seen = new Set<string>();
    return pages.map((pg) =>
      pg.flatMap((o): Obj[] => {
        if (o.type !== "link") return [o];
        const theirs = teacherLinks.get(o.id);
        if (!theirs || seen.has(o.id)) return [];
        seen.add(o.id);
        return [{ ...theirs.obj, fromTemplate: true }];
      }),
    );
  }

  // The child's photo arriving from the camera dialog. Normalised like an
  // import (capped, re-encoded small), then cropped to the frame's own shape so
  // the on-screen picture and the flattened one agree, then cached BEFORE the
  // object changes so the very next composite already has it.
  async function onFramePhoto(dataUrl: string, type: string) {
    const target = captureFrame;
    setCaptureFrame(null);
    if (!target || target.page !== currentRef.current) return;
    const list = objectsRef.current[currentRef.current] ?? [];
    const frame = list.find((o): o is FrameObj => o.id === target.id && o.type === "frame");
    if (!frame) return;
    let src: string;
    let img: HTMLImageElement;
    try {
      const normalised = await normaliseImport(dataUrl, type);
      src = await cropToAspect(normalised, frame.w / frame.h, FRAME_PHOTO_MAX_PX);
      img = await loadImage(src);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "That picture didn't work. Have another go.");
      return;
    }
    // History first, so undo takes the photo out again (or puts the previous
    // one back, on a retake).
    pushHistory();
    imgCacheRef.current.set(frame.id, img);
    updateObject(frame.id, { src });
    anyDrawnRef.current = true;
    syncHidden();
    refreshThumbs();
  }

  // Get an imported picture into a shape this app can actually carry.
  //
  // Two things can be wrong with it. It can be in a format the store does not
  // keep (an AVIF from a phone), and it can simply be enormous — a modern
  // camera hands over 3840×2560, which is four times more detail than a
  // 1000×700 canvas can ever show.
  //
  // Both are fixed the same way: draw it, capped, and export something small.
  // WebP rather than PNG, and this is the whole point — the first version of
  // this re-encoded to PNG and turned a 0.9 MB photo into an 18.3 MB data URL,
  // which on its own exceeded the 16 MB a server action will accept. The save
  // then failed with a stack trace instead of a picture.
  //
  // An ordinary photo that is already storable and already a sensible size is
  // passed through untouched, because re-encoding it would cost quality for
  // nothing.
  async function normaliseImport(
    dataUrl: string,
    type: string,
    maxPx: number = MAX_IMPORT_PX,
  ): Promise<string> {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("this device can't open that kind of picture"));
      el.src = dataUrl;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const oversized = long > maxPx;
    if (!oversized && isStorableImageType(type)) return dataUrl;

    const k = oversized ? maxPx / long : 1;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const cx = c.getContext("2d");
    if (!cx) throw new Error("this device can't open that kind of picture");
    cx.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL("image/webp", 0.9);
    // Every browser this app supports can write WebP; the JPEG is there because
    // silently shipping a PNG-sized payload is the failure this exists to stop.
    const out = webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.9);
    // Both the scratch canvas and the decoded original are finished with, and
    // between them they are the largest pair of bitmaps this file ever holds —
    // a phone photograph is 3840x2560 twice over. This temporary Image is local
    // to this function; the ones `loadImage` returns are cached on purpose and
    // must never be emptied this way.
    releaseCanvas(c);
    img.src = "";
    return out;
  }

  async function onImportFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setFanOpen(false);
    setImporting(true);
    setImportError(null);
    loadingRef.current = true;
    try {
      for (const file of files) {
        if (file.type === "application/pdf") {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
          const data = new Uint8Array(await file.arrayBuffer());
          const pdf = await pdfjs.getDocument({ data }).promise;
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 2 });
            const tmp = document.createElement("canvas");
            tmp.width = viewport.width;
            tmp.height = viewport.height;
            const tctx = tmp.getContext("2d")!;
            await page.render({ canvas: tmp, canvasContext: tctx, viewport }).promise;
            // Each PDF page becomes a movable object; pages after the first get
            // their own canvas page.
            const rendered = tmp.toDataURL("image/png");
            // At scale 2 an A4 page is about 8 MB of pixels, and pdf.js holds
            // its own operator list and fonts per page. A twenty-page PDF used
            // to keep every one of them until the import finished; now each is
            // handed back before the next is opened.
            releaseCanvas(tmp);
            page.cleanup();
            await addObject(rendered, p > 1);
          }
        } else if (file.type.startsWith("image/")) {
          const url = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(file);
          });
          // A format the store keeps goes in untouched — re-encoding a photo
          // would cost quality and size for nothing. Anything else the BROWSER
          // can decode (AVIF, BMP, a modern format that arrives next year) is
          // redrawn as a PNG, the same way an imported PDF page already is.
          //
          // Without this the picker accepted an AVIF and the save rejected it
          // several steps later, after the teacher had placed and arranged it.
          await addObject(await normaliseImport(url, file.type), false);
        }
      }
    } catch (err) {
      setImportError(
        err instanceof Error ? `Couldn't add that file: ${err.message}` : "Couldn't add that file.",
      );
    } finally {
      loadingRef.current = false;
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Handing in is the end of the work, so it waits until the work is done.
  //
  // Two things can be unfinished, and both used to be possible to skip past with
  // one tap of the ✓: pages a child has never looked at, and questions they have
  // not answered. Neither is refused silently — the ✓ takes them TO the thing
  // and says what it is, because a child who cannot hand in and is not told why
  // has been stopped rather than helped.

  // The first page carrying a question nobody has answered, or null.
  function firstUnansweredPage(): number | null {
    if (!isQuizAnswer) return null;
    const missing = quizRef.current
      .filter((q) => !answersRef.current.get(q.id))
      .sort((a, b) => a.pageIndex - b.pageIndex)[0];
    return missing ? missing.pageIndex : null;
  }

  // Whether the ✓ is a hand-in yet, or still a "there's more". Off the STATE,
  // not the refs — this decides what the button says, so it has to change when
  // React re-renders rather than whenever a ref happens to be read.
  const nextPage = confirmSubmit && current < pageCount - 1;

  function handIn() {
    finishEditing();
    // Pages they have not turned to yet.
    if (currentRef.current < pagesRef.current.length - 1) {
      goToPage(currentRef.current + 1);
      return;
    }
    // Questions they have not answered, wherever they are.
    const missing = firstUnansweredPage();
    if (missing !== null) {
      if (missing !== currentRef.current) goToPage(missing);
      sayHoldUp("There's still a question to answer");
      return;
    }
    setConfirmingSubmit(true);
  }

  function currentPages(): string[] {
    finishEditing();
    return anyDrawnRef.current ? [...compositeRef.current] : [];
  }

  // The same pages WITH the movable pieces drawn on. `currentPages()` has to
  // leave them out, because those pages go back into the editor as its
  // background and a baked-in piece would appear twice — once flat, once still
  // movable. But a teacher looking at the thumbnail wants to see what is on the
  // page, and a template whose content is all movable pieces showed them a
  // blank white rectangle. So the picture and the background are two different
  // things now, which is what `previewRef` has always kept.
  function currentPreviews(): string[] {
    finishEditing();
    return anyDrawnRef.current ? [...previewRef.current] : [];
  }

  // The movable-objects layer to hand back to the teacher's builder (per page).
  // `fromTemplate` is a runtime-only marker, never persisted.
  function currentObjectsPayload(): CanvasObj[][] {
    return objectsRef.current.map((pg) =>
      pg.map((o) => {
        const { fromTemplate: _fromTemplate, ...rest } = o;
        void _fromTemplate;
        return rest as CanvasObj;
      }),
    );
  }

  // ---- Quiz operations ------------------------------------------------------
  // All mutate quizRef (the source of truth) then mirror to state. Quiz data is
  // deliberately kept out of syncHidden()/compositeCurrentPage()/pushHistory().
  function commitQuiz() {
    setQuizQuestions([...quizRef.current]);
    // The preview draws the questions, so it goes stale the moment one is typed
    // into. Everything that changes an OBJECT already refreshes the thumbnails
    // for the same reason; a quiz is no different, and without this the picture
    // of a quiz page showed empty boxes with no words in them.
    syncHidden();
    refreshThumbs();
  }

  // Every route to the quiz panel goes through here, so asking for it always
  // GIVES it to you: if it was shrunk to a pill, "Quiz" would otherwise appear
  // to do nothing at all.
  function openQuizPanel() {
    setQuizPanelOpen(true);
    setQuizWindow((w) =>
      w
        ? { ...w, collapsed: false }
        : defaultWindowPos({ w: boxRef.current.w, h: boxRef.current.h }, chromeScaleRef.current),
    );
  }

  // Drop a new question box in the middle of the CURRENT page. Marking a quiz
  // present forces the page composites to be saved (currentPages), so blank
  // pages a question sits on are preserved and line up at answer time.
  function addQuestion() {
    const qid = `q${quizSeqRef.current++}`;
    const options: QuizOption[] = [{ id: "opt0" }, { id: "opt1" }];
    const q: QuizQuestion = {
      id: qid,
      pageIndex: currentRef.current,
      // The middle of the room that is LEFT, not the middle of the page: with
      // the builder parked on the right, a box at page centre put its own
      // resize corner under the window that made it.
      x: placeX(QUIZ_W),
      y: (H - QUIZ_H) / 2,
      w: QUIZ_W,
      h: QUIZ_H,
      prompt: "",
      options,
      correctOptionId: "opt0",
    };
    quizRef.current = [...quizRef.current, q];
    // A question is not on the undo history, so undo must not walk back past
    // one: undoing the page it was added to would take it away unasked.
    pageUndoRef.current = [];
    refreshUndoRedo();
    anyDrawnRef.current = true;
    setSelectedQuestionId(qid);
    openQuizPanel();
    commitQuiz();
    syncHidden();
    refreshThumbs();
  }

  function updateQuestion(id: string, patch: Partial<QuizQuestion>) {
    quizRef.current = quizRef.current.map((q) => (q.id === id ? { ...q, ...patch } : q));
    commitQuiz();
  }

  function deleteQuestion(id: string) {
    quizRef.current = quizRef.current.filter((q) => q.id !== id);
    if (selectedQuestionId === id) setSelectedQuestionId(null);
    commitQuiz();
  }

  function addOption(qid: string) {
    quizRef.current = quizRef.current.map((q) => {
      if (q.id !== qid || q.options.length >= MAX_OPTIONS) return q;
      const used = new Set(q.options.map((o) => o.id));
      let n = q.options.length;
      let oid = `opt${n}`;
      while (used.has(oid)) oid = `opt${++n}`;
      // The box grows with its answers — 50 units a row, as the design has it —
      // so a fourth answer lands in the box rather than being clipped by it.
      return { ...q, options: [...q.options, { id: oid }], h: Math.min(QUIZ_H, q.h + QUIZ_ROW) };
    });
    commitQuiz();
  }

  function removeOption(qid: string, oid: string) {
    quizRef.current = quizRef.current.map((q) => {
      if (q.id !== qid || q.options.length <= MIN_OPTIONS) return q;
      const options = q.options.filter((o) => o.id !== oid);
      // Keep a valid correct answer if we removed the marked one.
      const correctOptionId = options.some((o) => o.id === q.correctOptionId)
        ? q.correctOptionId
        : options[0].id;
      return { ...q, options, correctOptionId, h: Math.max(QUIZ_MIN_H, q.h - QUIZ_ROW) };
    });
    commitQuiz();
  }

  function setOptionField(qid: string, oid: string, patch: Partial<QuizOption>) {
    quizRef.current = quizRef.current.map((q) =>
      q.id !== qid
        ? q
        : { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) },
    );
    commitQuiz();
  }

  function setCorrectOption(qid: string, oid: string) {
    updateQuestion(qid, { correctOptionId: oid });
  }

  // Open the file picker to set a picture on a specific option.
  function pickOptionImage(qid: string, oid: string) {
    pendingOptionRef.current = { qid, oid };
    quizFileRef.current?.click();
  }

  async function onQuizImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const target = pendingOptionRef.current;
    pendingOptionRef.current = null;
    if (quizFileRef.current) quizFileRef.current.value = "";
    if (!file || !target || !file.type.startsWith("image/")) return;
    const url = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
    // The SAME normalising the canvas import does, for the same reason: the
    // picker offers `image/*` and the store keeps only some of that, so an AVIF
    // sailed through here and was refused several steps later with "That image
    // couldn't be read" — after the teacher had already placed it in a question.
    //
    // Capped far tighter than a canvas picture. An answer's image is shown at
    // roughly a thumbnail's size, so carrying a 4000px original costs a slow
    // save and a big payload for detail nobody ever sees.
    let ready: string;
    try {
      ready = await normaliseImport(url, file.type, MAX_OPTION_PX);
    } catch (err) {
      setImportError(
        err instanceof Error ? `Couldn't add that picture: ${err.message}` : "Couldn't add that picture.",
      );
      return;
    }
    // Transient data URL; createTemplate rewrites it to a private /uploads path.
    setOptionField(target.qid, target.oid, { imagePath: ready });
  }

  // ---- Answer mode ----------------------------------------------------------
  function syncAnswers() {
    if (!quizAnswersRef.current) return;
    const arr = quizRef.current.map((q) => ({
      questionId: q.id,
      selectedOptionId: answersRef.current.get(q.id) ?? null,
    }));
    quizAnswersRef.current.value = JSON.stringify(arr);
  }

  // A child taps an answer. Record it silently — no right/wrong is ever shown.
  // A locked (already-correct) question in review mode can't be changed.
  function selectAnswer(qid: string, oid: string) {
    if (lockedQuizRef.current.has(qid)) return;
    answersRef.current.set(qid, oid);
    setAnswers(Object.fromEntries(answersRef.current));
    // They have had another go at it, so stop telling them to.
    setRetryIds((prev) => {
      if (!prev.has(qid)) return prev;
      const next = new Set(prev);
      next.delete(qid);
      return next;
    });
    syncAnswers();
    // The picture of the page draws the chosen answer, so it goes stale the
    // moment one is tapped — the same reason typing a question refreshes it.
    syncHidden();
    refreshThumbs();
  }

  const scale = displayW / W;

  // Objects are only draggable/selectable with the cursor tool (or while a text
  // box is being edited). Otherwise the stroke canvas sits on top so you can
  // draw over everything.
  const objectsInteractive = tool === "cursor" || editingId !== null;

  // Cut / copy / paste / delete from the keyboard.
  //
  // Held in a ref and registered once, rather than re-registering the listener
  // on every render — a drag re-renders this component many times a second.
  //
  // The guards are the whole job. This is the first keyboard shortcut in the
  // app, and the canvas has three live text surfaces on it — the label editor,
  // the quiz field and now the stepper's number box. An unguarded Backspace
  // would delete a shape while a teacher was backspacing over a typo.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    // A label or a quiz question is being typed into.
    if (editingId !== null) return;
    // Anything else that takes text, including the stepper's number field.
    const el = document.activeElement as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
    // A modal is up. Asked of the DOM rather than of a list of state flags, so
    // this cannot fall out of step with a modal added later.
    if (document.querySelector('[aria-modal="true"]')) return;
    // A drawing tool is in hand, so there is nothing selected to act on.
    if (!objectsInteractive) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "c") {
        copySelection();
        e.preventDefault();
        return;
      }
      if (k === "x") {
        cutSelection();
        e.preventDefault();
        return;
      }
      if (k === "v") {
        pasteClipboard();
        e.preventDefault();
        return;
      }
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (!selectionIds().length) return;
      deleteSelection();
      e.preventDefault();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const currentTemplate = templatesRef.current[current] ?? null;

  // One palette per kit, built from the registry so the buttons and the canvas
  // cannot disagree about what a shape looks like — each button's art is drawn
  // by the same shapeParts the canvas renders with.
  //
  // A kit with several groups gets TABS rather than one long scroll. The maths
  // kit is ~28 buttons; at the 64px child floor that is a popover about 500px
  // tall, which does not fit beside the canvas on the 1024×768 iPad these
  // screens are designed for. Tabs keep it to one group at a time and leave the
  // ＋ fan behaving exactly as it did.
  function palette(kit: Kit) {
    const groups = kit.groups;
    const activeId = openGroup[kit.id] ?? groups[0].id;
    const active = groups.find((g) => g.id === activeId) ?? groups[0];
    return (
      <div className="flex max-w-[26rem] flex-col gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg">
        {groups.length > 1 && (
          <div role="tablist" aria-label={`${kit.label} groups`} className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={g.id === active.id}
                onClick={() => setOpenGroup((prev) => ({ ...prev, [kit.id]: g.id }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  g.id === active.id
                    ? "bg-brand text-white"
                    : "text-muted hover:bg-background"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
        <div
          role="group"
          aria-label={active.label}
          className="flex flex-wrap gap-1.5"
        >
          {active.presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => addShape(preset)}
              title={preset.label}
              aria-label={preset.label}
              // 64px, the child touch floor (SAFEGUARDING rule 18). Everything
              // a child taps to place apparatus is at the floor, including the
              // five original shapes, which used to be 40.
              className="flex h-16 w-16 items-center justify-center rounded-lg border border-border hover:bg-background"
            >
              <ShapeThumb preset={preset} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // The kits this canvas offers, in registry order.
  const availableKits = kitsToShow(kits);

  // A kit is either a row on the ＋ fan (Shapes: a child taps one and it lands)
  // or a window (the Maths kit: a teacher places a dozen pieces from it while
  // building a page). One rule, so a third kit needs no decision.
  function kitIsWindow(id: KitId) {
    return id !== "shapes";
  }

  // The floating windows stay open while a page is built, so they are part of
  // the room the page HAS rather than something over it. Whatever band they are
  // parked in is reserved: the object toolbar keeps out of it, and a new piece
  // or question lands in the middle of what is left rather than under a window.
  const openWindows: WindowPos[] = [
    ...availableKits
      .filter((k) => kitIsWindow(k.id))
      .map((k) => kitWindows[k.id])
      .filter((w): w is WindowPos => Boolean(w)),
    ...(isQuizAuthor && quizPanelOpen && quizWindow ? [quizWindow] : []),
  ];
  const windowBand = (w: WindowPos) => ({
    width: windowW(chromeScaleRef.current, w.collapsed),
    right: w.x + windowW(chromeScaleRef.current, w.collapsed) / 2 > box.w / 2,
  });
  const reserveRight = Math.max(
    0,
    ...openWindows.map((w) => (windowBand(w).right ? box.w - w.x : 0)),
  );
  const reserveLeft = Math.max(
    0,
    ...openWindows.map((w) => (windowBand(w).right ? 0 : w.x + windowBand(w).width)),
  );
  // The middle of the free band, in MODEL units — where something new goes.
  function freeCentreX(): number {
    if (!fullScreen || box.w <= 0) return W / 2;
    const mid = (reserveLeft + (box.w - reserveRight)) / 2;
    return (mid / box.w) * W;
  }
  // Where a piece `w` wide lands: centred in the free band, but ON THE PAGE
  // first. A 700-wide number line centred beside an open window started at
  // x = −16, with its take-it-away corner off the edge of the paper. Clear of
  // the window is the preference; inside the page is the rule.
  function placeX(w: number): number {
    return Math.max(0, Math.min(W - w, freeCentreX() - w / 2));
  }

  const objectLayer = (
    <ObjectLayer
      objects={objects}
      scale={scale}
      interactive={objectsInteractive}
      author={isObjectAuthor}
      selectedId={selectedId}
      groupIds={multiIds}
      editingId={editingId}
      onSelect={selectObject}
      onStart={pushHistory}
      onChange={updateObject}
      onEnd={commitObjectChange}
      onDelete={deleteObject}
      onToggleLock={toggleLock}
      onBringToFront={(id) => reorderObject(id, "front")}
      onSendToBack={(id) => reorderObject(id, "back")}
      onDuplicate={duplicateObject}
      canDuplicate={(objects.length || 0) < MAX_OBJECTS_PER_PAGE}
      onSpawn={spawnFromSource}
      onEditText={editTextObject}
      onEditLink={(id) => {
        finishEditing();
        setLinkForm({ id });
      }}
      onTextChange={updateText}
      onFinishEditing={finishEditing}
      onContextMenu={openObjectMenu}
    />
  );

  // The quiz question boxes on the current page. Rendered ABOVE the stroke
  // canvas so a child can always tap an answer; the container is
  // pointer-events-none so the rest of the canvas stays drawable.
  const quizLayer = quizMode ? (
    <QuizLayer
      questions={quizQuestions.filter((q) => q.pageIndex === current)}
      scale={scale}
      mode={quizMode}
      hearItLabel={hearItLabel}
      interactive={isQuizAuthor ? objectsInteractive : true}
      selectedId={selectedQuestionId}
      answers={answers}
      review={quizReview}
      lockedIds={lockedQuizRef.current}
      retryIds={retryIds}
      onSelect={selectQuestion}
      onMove={updateQuestion}
      onDelete={deleteQuestion}
      onAnswer={selectAnswer}
      onPrompt={(id, prompt) => updateQuestion(id, { prompt })}
      onOptionText={(qid, oid, text) => setOptionField(qid, oid, { text })}
    />
  ) : null;

  // The photo frames on the current page, for a child. Rendered ABOVE the
  // stroke canvas like the quiz layer, so a child can tap one under the pen
  // tool — an EYFS child never reaches for the cursor tool — while the
  // container stays pointer-events-none so the rest of the page is drawable.
  // Both labels are register-neutral fixed copy, so the teacher's preview shows
  // exactly what a child sees.
  const framesOnPage = objects.filter((o): o is FrameObj => o.type === "frame");
  const frameCopy = studentCopyNeutral.add;
  const frameTapLayer =
    !isObjectAuthor && framesOnPage.length ? (
      <FrameTapLayer
        frames={framesOnPage}
        scale={scale}
        takeLabel={frameCopy.photoHeading}
        againLabel={frameCopy.photoAgain}
        onTap={(id) => {
          finishEditing();
          setCaptureFrame({ id, page: currentRef.current });
        }}
      />
    ) : null;

  // The web links on the current page that a child may press (rule 26). Where
  // each sits comes from the page — a child cannot move one, so it is where the
  // teacher put it — and what it opens comes only from `teacherLinks`.
  const linksOnPage = isObjectAuthor
    ? []
    : objects.flatMap((o) => {
        if (o.type !== "link") return [];
        const theirs = teacherLinks.get(o.id);
        return theirs ? [{ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, label: theirs.label, host: theirs.host }] : [];
      });
  const linkTapLayer = linksOnPage.length ? (
    <LinkTapLayer
      links={linksOnPage}
      scale={scale}
      onTap={(id) => {
        finishEditing();
        const theirs = teacherLinks.get(id);
        if (theirs) setLeaving({ href: theirs.href, host: theirs.host });
      }}
    />
  ) : null;

  const editingLink =
    linkForm?.id !== undefined
      ? (objectsRef.current[currentRef.current] ?? []).find(
          (o): o is LinkObj => o.id === linkForm.id && o.type === "link",
        )
      : undefined;
  const linkOverlays = (
    <>
      {linkForm && isObjectAuthor && (
        <LinkDialog
          initial={editingLink ? { href: editingLink.href, label: editingLink.label } : undefined}
          onSave={saveLink}
          onCancel={() => setLinkForm(null)}
        />
      )}
      {leaving && (
        <LeavingCard
          href={leaving.href}
          host={leaving.host}
          hearItLabel={hearItLabel}
          onClose={() => setLeaving(null)}
        />
      )}
    </>
  );

  const cameraDialog = captureFrame ? (
    <CameraDialog
      title={frameCopy.photoHeading}
      labels={frameCopy.camera}
      onCapture={(dataUrl, type) => void onFramePhoto(dataUrl, type)}
      onCancel={() => setCaptureFrame(null)}
    />
  ) : null;

  const hiddenInputs = (
    <>
      <input type="hidden" name={name} ref={hiddenRef} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={onImportFiles}
        className="hidden"
      />
      {isQuizAnswer && <input type="hidden" name="quizAnswers" ref={quizAnswersRef} />}
      {!isObjectAuthor && <input type="hidden" name="drawingPreviews" ref={previewFieldRef} />}
      {/* Only mounted while the quiz panel is open (the only place option images
          are picked), so it never collides with the import file input above. */}
      {isQuizAuthor && quizPanelOpen && (
        <input
          ref={quizFileRef}
          type="file"
          accept="image/*"
          onChange={onQuizImageFile}
          className="hidden"
        />
      )}
    </>
  );

  // The stacked layers: white + template background, the object layer, and the
  // transparent pen-stroke canvas on top.
  const stage = (
    <>
      <div
        className="absolute inset-0 bg-white"
        onPointerDown={(e) => {
          if (objectsInteractive) marqueeStart(e);
        }}
        onPointerMove={objectsInteractive ? marqueeMove : undefined}
        onPointerUp={objectsInteractive ? marqueeEnd : undefined}
        onPointerCancel={objectsInteractive ? marqueeEnd : undefined}
        onContextMenu={openCanvasMenu}
      >
        {currentTemplate && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentTemplate}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      {objectLayer}
      {marquee && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-sm border-2 border-dashed border-brand bg-brand/10"
          style={{
            left: Math.min(marquee.x0, marquee.x1) * scale,
            top: Math.min(marquee.y0, marquee.y1) * scale,
            width: Math.abs(marquee.x1 - marquee.x0) * scale,
            height: Math.abs(marquee.y1 - marquee.y0) * scale,
          }}
        />
      )}
      {menu && (
        <CanvasMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className={`absolute inset-0 h-full w-full touch-none ${objectsInteractive ? "pointer-events-none" : ""}`}
        style={{
          cursor: tool === "cursor" ? "default" : tool === "text" ? "text" : "crosshair",
        }}
      />
      {quizLayer}
      {frameTapLayer}
      {linkTapLayer}
    </>
  );

  // ---- Full-screen, child-led layout ---------------------------------------
  if (fullScreen) {
    // ONE number scales the whole 1194 × 834 design frame onto the paper, and
    // every measurement in the chrome goes through it. That is what lets the
    // fan geometry be written as the constants it was designed as, rather than
    // as a pile of percentages nobody can check against the drawing.
    // The chrome is drawn at DESIGN SIZE and anchored to the paper's own edges
    // rather than scaled into it. Scaling it looked right and was wrong: every
    // control a child presses carries a 64px floor (rule 18), so on a 1024px
    // classroom iPad the buttons kept their 64px while the arcs they sit on
    // shrank to 60px apart and the nibs overlapped — which axe calls
    // `target-size`, and which is a press a child cannot aim at.
    //
    // `u` survives as the one place a floor is applied, and so that the few
    // things that SHOULD track the paper (the empty-state words) are visibly
    // the exceptions.
    const teacher = isObjectAuthor || isQuizAuthor;
    const paper = { w: box.w, h: box.h };
    // How much smaller than the design frame this paper actually is. A 1366×768
    // laptop, once the browser has taken its share, leaves a 10:7 page about
    // 880×616 — three-quarters of the frame the chrome was drawn for. At design
    // size on that page the toolbox covered the piece being edited and the fan
    // reached the top of the screen, which is what "diabolical on a laptop"
    // was.
    //
    // So the frame SCALES to the paper, floored at the touch minimum of whoever
    // is using it: 44px for a teacher, 64px for a child (rule 18, F37). For a
    // child that floor is the whole 64px design size, so a child's canvas is
    // unchanged — which is deliberate. Scaling a child's chrome is what once
    // shrank the arcs while the buttons kept their floor and left the nibs
    // overlapping, and `target-size` in the a11y gate is the thing that caught
    // it. Scaling everything by ONE number cannot do that: the buttons and the
    // arcs they sit on move together.
    // A floor is for sizes. A negative is an offset — a card's lift, the tray
    // strip's pull-up — and goes through untouched; flooring it at zero was
    // what pinned every lifted card to the tray and clipped its number.
    //
    // A floor asked for is capped at what this role actually needs, so a
    // teacher's 64px chrome button may come down to 44 and no further, while a
    // child's stays where it is.
    const u = (n: number, floor = 0) => {
      if (n < 0) return n * chromeScale;
      const v = n * chromeScale;
      return floor ? Math.max(v, Math.min(floor, CTRL_FLOOR)) : v;
    };
    // The two discs are anchored to the PAPER's own corners — see `penCx` in
    // canvasFan.ts — and everything they carry is scaled by `u`.
    const penX = penCx(hand, paper.w);
    const plusX = plusCx(hand, paper.w);
    const discY = discCy(paper.h);
    // Stack only when the row actually cannot fit. What makes it too wide is
    // the labelled way out — "← Back to my jar" is a quarter of a 768px tablet
    // on its own — and with it the row is about 740px, so it fits on a 1024px
    // iPad and not on a 768px one. A teacher's row starts with a 64px ✕ and
    // fits at any width this canvas is used at. Stacking when there is no need
    // is not free: it costs the page 74px of height the object bar needs, and
    // on a 720px window that is the difference between a turn button a child
    // can press and one under the status chip.
    const stackTop = Boolean(closeLabel) && paper.w < 900;

    // Something is open that a touch on the paper should CLOSE rather than
    // draw through. The floating windows are deliberately not in this list:
    // they are a workbench, not a choice, and they stay until they are shut.
    const anyFanOpen = toolBarOpen || fanOpen || plusRow !== null;

    function closeFans() {
      setToolBarOpen(false);
      setFanOpen(false);
      setPlusRow(null);
    }

    function toggleKitWindow(id: KitId) {
      setKitWindows((prev) => {
        const open = Object.values(prev).filter(Boolean).length;
        return prev[id]
          ? { ...prev, [id]: undefined }
          : { ...prev, [id]: defaultWindowPos({ w: box.w, h: box.h }, chromeScale, open * 24) };
      });
      setFanOpen(false);
      setPlusRow(null);
      setSelectedId(null);
    }

    const shapesKit = availableKits.find((k) => k.id === "shapes");
    const plusItems: PlusItem[] = [];
    // The live ＋ menu's three, with the live labels, in the live order.
    plusItems.push({
      key: "photo",
      icon: "add-picture",
      // "Photo" to a child; the teacher's canvas, which imports PDFs too, keeps
      // the live label.
      label: teacher ? "Photo / PDF" : "Photo",
      ring: 0,
      onSelect: () => {
        closeFans();
        fileRef.current?.click();
      },
    });
    plusItems.push({
      key: "words",
      icon: "text",
      label: "Words",
      ring: 0,
      pressed: tool === "text",
      onSelect: () => {
        closeFans();
        setTool("text");
      },
    });
    if (shapesKit) {
      const presets = shapesKit.groups.flatMap((g) => g.presets);
      const options: PlusOption[] = presets.map((preset) => ({
        key: preset.id,
        label: preset.label,
        art: <ShapeThumb preset={preset} px={u(40)} fill={preset.fill ?? shapeFill} />,
        onSelect: () => addShape(preset),
      }));
      plusItems.push({ key: "shapes", icon: "shapes", label: shapesKit.label, ring: 0, options });
    }
    // The teacher's outer ring: the kits that open as a window, then the two
    // things only a template carries.
    for (const kit of availableKits.filter((k) => kitIsWindow(k.id))) {
      plusItems.push({
        key: kit.id,
        icon: KIT_ICON[kit.id],
        label: kit.label,
        ring: 1,
        pressed: Boolean(kitWindows[kit.id]),
        onSelect: () => toggleKitWindow(kit.id),
      });
    }
    if (isObjectAuthor) {
      plusItems.push({
        key: "frame",
        icon: "camera",
        label: "Photo frame",
        ring: 1,
        onSelect: () => {
          closeFans();
          addFrame();
        },
      });
      // A web link (rule 26). The teacher's toolbox is the only place one
      // can come from; a child's ＋ fan never carries this item.
      plusItems.push({
        key: "link",
        icon: "link",
        label: "Web link",
        ring: 1,
        onSelect: () => {
          closeFans();
          setOpenKit(null);
          finishEditing();
          setLinkForm({});
        },
      });
    }
    if (isQuizAuthor) {
      plusItems.push({
        key: "quiz",
        icon: "help",
        label: "Quiz",
        ring: 1,
        pressed: quizPanelOpen,
        onSelect: () => {
          closeFans();
          setOpenKit(null);
          setTool("cursor");
          openQuizPanel();
        },
      });
    }

    // Nothing on this page yet, so the paper says what it is for. Gone the
    // moment there is a stroke, a piece or a template underneath.
    const pageIsBare = !canUndo && objects.length === 0 && !currentTemplate;

    return (
      <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "var(--paper)" }}>
        {hiddenInputs}
        {draftPrompt && (
          <RestorePrompt source={draftSource} onRestore={restoreDraft} onDiscard={discardDraft} />
        )}
        {confirmingSubmit && (
          <ConfirmSubmitPrompt pageCount={pageCount} onCancel={() => setConfirmingSubmit(false)} />
        )}
        {cameraDialog}
        {linkOverlays}

        <div
          ref={wrapRef}
          // `select-none` on the stage, not on each thing inside it: a drag that
          // starts on a shape and ends over the page title would otherwise sweep a
          // blue highlight across everything it crossed. A canvas is a surface, and
          // nothing on it is text to be selected.
          className="relative flex-1 select-none overflow-hidden [-webkit-touch-callout:none]"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {/* The paper IS the frame: every piece of chrome below is placed in
                design units inside it, so the fans clip against the edge of the
                page exactly as they do in the drawing. */}
            <div
              className="relative select-none overflow-hidden"
              style={{
                width: box.w,
                height: box.h,
                // The bottom band belongs to the chrome: the page tray across
                // the middle and a disc in each corner. Anything that floats
                // over the page and clamps itself to the stage — the object
                // toolbar — reads this and stops short of it, instead of
                // parking its settings row on top of "new page".
                // The tray is 84 (card) + 16 (padding) + 12 (bottom) + the
                // active card's lift, so 128 covers it. Every extra pixel here
                // is a pixel the object bar cannot use.
                ["--sj-chrome-bottom" as string]: `${u(128)}px`,
                // The top row, for the object bar to PREFER to keep out of: a
                // piece near the top gets its bar below itself, as the design
                // has it. A preference only — see the bar's own note on why
                // clamping to it was worse than sliding under it.
                ["--sj-chrome-top" as string]: `${stackTop ? u(170) : u(96)}px`,
                ["--sj-chrome-left" as string]: `${u(reserveLeft)}px`,
                ["--sj-chrome-right" as string]: `${u(reserveRight)}px`,
              }}
            >
              {stage}
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-muted">
                  Loading…
                </div>
              )}

              {pageIsBare && (
                <p
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 text-center"
                  style={{
                    // The one measurement that tracks the paper rather than
                    // the design frame: it is the middle of the page, not a
                    // piece of furniture on its edge.
                    top: paper.h * (470 / FRAME_H),
                    font: `600 ${u(28)}px var(--font-fredoka)`,
                    color: "#c9a87c",
                  }}
                >
                  Draw here
                </p>
              )}

              {/* Words is armed: the next touch of the paper is where they go. */}
              {tool === "text" && !editingId && (
                <p
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 text-center"
                  style={{
                    top: `${46}%`,
                    font: `600 ${u(30)}px var(--font-fredoka)`,
                    color: "#c9a87c",
                    animation: `sj-pop-in 340ms cubic-bezier(.34,1.4,.64,1) backwards`,
                  }}
                >
                  Tap where your words go
                </p>
              )}

              {/* A fan is open, so the paper is a way OUT of it rather than
                  something to draw on. One layer, above the stage and below the
                  fans themselves. */}
              {anyFanOpen && (
                <div
                  className="absolute inset-0"
                  // Above the object layer (whose toolbars are z-30) so a
                  // touch cannot land on a handle, and BELOW the tray and the
                  // fans, which are the things the touch is meant to reach.
                  style={{ zIndex: Z_BASE + 2 }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeFans();
                  }}
                />
              )}

              {/* Top left: the way out, then undo and redo, then where this
                  work has got to.

                  A child's escape goes HERE rather than beside the ✓ for two
                  reasons. It is not the same kind of thing as handing in, and
                  two 64px controls side by side, one of which ends the work, is
                  a mis-tap that costs a child their turn. And it is the only
                  place the words fit: on a 768px classroom tablet a labelled
                  pill on the right runs under the activity's own title
                  (asserted in tests/e2e/child-escape.spec.ts). */}
              <div
                className="absolute flex"
                style={{
                  left: u(16),
                  top: u(16),
                  gap: u(10),
                  zIndex: Z_CHROME,
                  // On a paper narrower than the design frame the row does not
                  // fit, and an overflowing row puts "Clear page" off the edge
                  // — which is how a child on a 768px tablet lost it. Stack the
                  // way out above the rest, exactly as the old chrome did, and
                  // for the same reason.
                  flexDirection: stackTop ? "column" : "row",
                  alignItems: stackTop ? "flex-start" : "center",
                }}
              >
                {onClose && closeLabel && (
                  <ChromePill u={u} label={closeLabel} onClick={onClose}>
                    <span aria-hidden="true">←</span>
                    <Icon name="jar" size={u(28)} decorative />
                    {closeLabel}
                  </ChromePill>
                )}
                <div className="flex items-center" style={{ gap: u(10) }}>
                {onClose && !closeLabel && (
                  <ChromeRound u={u} label="Close" onClick={onClose}>
                    <Icon name="close" size={u(24)} decorative />
                  </ChromeRound>
                )}
                <ChromeRound u={u} label="Undo" onClick={undo} disabled={!canUndo}>
                  <Icon name="undo" size={u(26)} decorative />
                </ChromeRound>
                <ChromeRound u={u} label="Redo" onClick={redo} disabled={!canRedo}>
                  <Icon name="redo" size={u(26)} decorative />
                </ChromeRound>
                <StatusChip u={u}>
                  <Icon name="waiting" size={u(18)} decorative />
                  {teacher ? "Draft template" : "Not in your jar yet"}
                </StatusChip>
                {title && !stackTop && (
                  <span
                    style={{
                      font: `600 ${u(22)}px var(--font-fredoka)`,
                      color: "var(--ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: u(300),
                    }}
                  >
                    {title}
                  </span>
                )}
                {/* Nothing else up here. Clear page lives in the page card's
                    menu ("Wipe this page clean") beside copy and throw-away,
                    and the left-hand swap is a press-and-hold on the pen disc —
                    the top row is the design's: way out, undo, redo, status. */}
                </div>
              </div>

              {/* Under the top row, on the work itself: the subtitle and the
                  teacher's note on a piece that was sent back. */}
              {(subtitle || teacherNote || (title && stackTop)) && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: u(16),
                    top: stackTop ? u(166) : u(92),
                    width: Math.min(u(520), paper.w - u(32)),
                    zIndex: Z_CHROME,
                  }}
                >
                  {title && stackTop && (
                    <p style={{ font: `600 ${u(20)}px var(--font-fredoka)`, color: "var(--ink)" }}>
                      {title}
                    </p>
                  )}
                  {subtitle && (
                    <p style={{ font: `400 ${u(15)}px var(--font-atkinson)`, color: "var(--ink-soft)" }}>
                      {subtitle}
                    </p>
                  )}
                  {teacherNote && (
                    <div className="pointer-events-auto mt-2 text-left">
                      <TeacherNote note={teacherNote} mode="KS1" compact />
                    </div>
                  )}
                </div>
              )}

              {/* Top right: the way in to the jar. */}
              <div
                className="absolute flex items-center"
                style={{ right: u(16), top: u(16), gap: u(10), zIndex: Z_CHROME }}
              >
                <ChromeDone
                  u={u}
                  type={onDone || confirmSubmit ? "button" : "submit"}
                  title={nextPage ? "Next page" : "Done"}
                  label={nextPage ? "Next page" : teacher ? "Save template" : "Pop in my jar"}
                  onClick={
                    onDone
                      ? () => {
                          const pages = currentPages();
                          onDone(
                            pages,
                            isQuizAuthor ? { questions: quizRef.current } : undefined,
                            isObjectAuthor ? currentObjectsPayload() : undefined,
                            currentPreviews(),
                          );
                        }
                      : confirmSubmit
                        ? handIn
                        : undefined
                  }
                >
                  <Icon name={teacher ? "done" : "pop-in"} size={u(26)} decorative />
                  {nextPage ? "Next ›" : teacher ? "Save template" : "Pop in my jar"}
                </ChromeDone>
              </div>

              {/* The two discs and their fans. */}
              <PenFan
                u={u}
                hand={hand}
                cx={penX}
                cy={discY}
                frame={paper}
                dir={penDir(hand)}
                open={toolBarOpen}
                tool={tool}
                // The fan shows the PEN's colour whatever is in hand: with Move
                // picked the "current colour" is the cursor's, which is ink and
                // means nothing to a child looking at the nibs.
                colour={drawingTool ? color : toolColors.pen}
                size={size}
                canMove={canMove}
                onToggle={() => {
                  setToolBarOpen((v) => !v);
                  setFanOpen(false);
                  setPlusRow(null);
                }}
                // Press and hold the disc to move the fans to the other corner
                // — the one setting the design asks for, kept off the top row.
                onHold={() => {
                  swapHand();
                  say(hand === "right" ? "Buttons are on the left now" : "Buttons are on the right now");
                }}
                onTool={(key) => {
                  finishEditing();
                  setTool(key as Tool);
                  // Picking a nib, a colour or another pen leaves the fan open:
                  // the next choice is already in front of you. Picking MOVE
                  // folds it, because Move means "I am going to handle a piece
                  // now", and the fan sweeps over the very corner where a piece
                  // placed near the foot of the page keeps its handles — which
                  // is the bug the old properties bar had (pen-width.spec.ts).
                  if (key === "cursor") setToolBarOpen(false);
                }}
                onColour={(hex) => setColor(hex)}
                onSize={(n) => setSize(n)}
                art={<PenArt colour={drawingTool ? color : toolColors.pen} />}
              />

              <PlusFan
                u={u}
                cx={plusX}
                cy={discY}
                frame={paper}
                dir={plusDir(hand)}
                open={fanOpen}
                items={plusItems}
                row={plusRow}
                teacher={teacher}
                onToggle={() => {
                  const next = !fanOpen;
                  openAddMenu(next);
                  setPlusRow(null);
                  setToolBarOpen(false);
                }}
                onRow={setPlusRow}
              />

              {/* The pages, always visible, with the one being drawn on lifted
                  out of the tray. */}
              <PageTray
                u={u}
                count={pageCount}
                active={current}
                maxWidth={Math.max(200, paper.w - 2 * (NEAR_X + DISC / 2 + 10))}
                thumbs={thumbs}
                deletable={Array.from({ length: pageCount }, (_, i) =>
                  pageDelete === "any" ? true : added[i] === true,
                )}
                // The same pages (see pageMayMove): a teacher's page stays put
                // for a child, and the tray does not lift it.
                movable={Array.from({ length: pageCount }, (_, i) =>
                  pageDelete === "any" ? true : added[i] === true,
                )}
                canStructure={allowPageStructure}
                onGo={(i) => {
                  closeFans();
                  goToPage(i);
                }}
                onAdd={() => {
                  addPage();
                  say("New page gone");
                }}
                onReorder={(from, to) => {
                  if (movePageTo(from, to)) say("Page moved back");
                }}
                onDuplicate={(i) => {
                  duplicatePageAt(i);
                  say("Page copy gone");
                }}
                onDelete={(i) => {
                  closeFans();
                  // Said only when it went, and in words that are true: undo
                  // really does bring it back now (see undoPageAction).
                  if (deletePageAt(i)) say(`Undo brings page ${i + 1} back`);
                }}
                onClear={(i) => {
                  if (i !== currentRef.current) goToPage(i);
                  clearPage();
                  say("Drawing is back");
                }}
                onContextMenu={allowPageStructure ? openPageMenu : undefined}
              />

              {/* The floating windows: one shell, a kit or the quiz inside it. */}
              {availableKits
                .filter((k) => kitIsWindow(k.id) && kitWindows[k.id])
                .map((kit) => {
                  const pos = kitWindows[kit.id]!;
                  return (
                    <FloatingWindow
                      key={kit.id}
                      u={u}
                      scale={chromeScale}
                      paper={paper}
                      icon={KIT_ICON[kit.id]}
                      title={kit.label}
                      pos={pos}
                      onPos={(p) => setKitWindows((prev) => ({ ...prev, [kit.id]: p }))}
                      onClose={() => setKitWindows((prev) => ({ ...prev, [kit.id]: undefined }))}
                      // "Tuck away", not "Close the maths kit": the window is
                      // already named by its region, and a button whose name
                      // CONTAINS the toolbox item's name is two controls a
                      // screen reader (and a test) cannot tell apart.
                      closeLabel="Tuck away"
                    >
                      <KitPalette
                        u={u}
                        kit={kit}
                        activeGroupId={openGroup[kit.id] ?? null}
                        onGroup={(id) => setOpenGroup((prev) => ({ ...prev, [kit.id]: id }))}
                        onPlace={(preset) => addShape(preset, true)}
                      />
                    </FloatingWindow>
                  );
                })}

              {isQuizAuthor && quizPanelOpen && quizWindow && (
                <FloatingWindow
                  u={u}
                  scale={chromeScale}
                  paper={paper}
                  icon="help"
                  title="Quiz builder"
                  pos={quizWindow}
                  onPos={setQuizWindow}
                  onClose={() => setQuizPanelOpen(false)}
                  closeLabel="Tuck away"
                >
                  <QuizPanelBody
                    u={u}
                    questions={quizQuestions}
                    currentPage={current}
                    pageCount={pageCount}
                    selectedId={selectedQuestionId}
                    onAddQuestion={addQuestion}
                    onSelectQuestion={(id) => {
                      // Opening a question jumps to the page it lives on, so the
                      // box being edited is always the one on screen. Collapsing
                      // it (null) shouldn't move the teacher anywhere.
                      if (id === null) {
                        setSelectedQuestionId(null);
                        return;
                      }
                      const q = quizRef.current.find((x) => x.id === id);
                      if (q && q.pageIndex !== currentRef.current) goToPage(q.pageIndex);
                      setSelectedQuestionId(id);
                    }}
                    onUpdatePrompt={(id, prompt) => updateQuestion(id, { prompt })}
                    onDeleteQuestion={deleteQuestion}
                    onAddOption={addOption}
                    onRemoveOption={removeOption}
                    onOptionText={(qid, oid, text) => setOptionField(qid, oid, { text })}
                    onOptionImage={pickOptionImage}
                    onClearOptionImage={(qid, oid) => setOptionField(qid, oid, { imagePath: undefined })}
                    onSetCorrect={setCorrectOption}
                  />
                </FloatingWindow>
              )}

              {/* Only once there is a quiz to go back to. The way IN is the ＋
                  fan; this is the way back, and a shortcut to a panel with
                  nothing in it is a button that has to be explained. */}
              {isQuizAuthor && !quizPanelOpen && quizQuestions.length > 0 && (
                <QuizLauncher onOpen={openQuizPanel} />
              )}

              <Toast u={u} message={toast} />

              {/* Told in the design system's own colours, not a stock utility.
                  `bg-amber-500` is used nowhere else in the app, so it was never
                  generated into the stylesheet — which left white text on a
                  transparent pill: a message a child could not read, on the one
                  screen where they are stuck and need telling why. */}
              {holdUp && (
                <div
                  role="status"
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: u(96),
                    zIndex: Z_CHROME,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "var(--honey)",
                    color: "var(--ink)",
                    border: "3px solid var(--ink)",
                    borderRadius: 999,
                    padding: "12px 22px",
                    font: "700 19px var(--font-atkinson)",
                    boxShadow: "0 6px 18px rgba(34,48,74,.28)",
                    maxWidth: "min(90%, 520px)",
                    textAlign: "center",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>
                    ✋
                  </span>
                  {holdUp}
                </div>
              )}

              {(importing || importError) && (
                <div
                  role="status"
                  className={`absolute left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 text-sm font-semibold shadow-lg ${
                    importError ? "bg-rose-600 text-white" : "bg-white text-foreground"
                  }`}
                  style={{ top: u(96), zIndex: Z_CHROME }}
                >
                  {importError ?? "Adding your file…"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Inline layout (teacher on-behalf drawing) ---------------------------
  return (
    <div>
      {hiddenInputs}
      {cameraDialog}
      {linkOverlays}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { if (t.key !== "text") finishEditing(); setTool(t.key); }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              tool === t.key ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-muted hover:bg-background"
            }`}
          >
            {t.icon && <Icon name={t.icon} size={18} decorative />}
            {t.label}
          </button>
        ))}
        {allowImport && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-muted hover:bg-background"
          >
            <Icon name="add-file" size={16} decorative /> {importing ? "Adding…" : "Add PDF / image"}
          </button>
        )}
        {availableKits.map((kit) => (
          <button
            key={kit.id}
            type="button"
            onClick={() => toggleKit(kit.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              openKit === kit.id ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-muted hover:bg-background"
            }`}
          >
            <Icon name={KIT_ICON[kit.id]} size={16} decorative /> {kit.label}
          </button>
        ))}
      </div>

      {openKit && (
        <div className="mb-2">
          {palette(availableKits.find((k) => k.id === openKit) ?? availableKits[0])}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{ backgroundColor: c, borderColor: color === c ? "#1f2430" : "#e6e8ef" }}
              aria-label={`Colour ${c}`}
            />
          ))}
          <label
            className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-border"
            title="Pick any colour"
            style={{ background: "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)" }}
          >
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick any colour" />
          </label>
        </div>
        <div className="flex gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border ${size === s ? "border-brand bg-brand/10" : "border-border bg-surface"}`}
              aria-label={`Size ${s}`}
            >
              <span className="rounded-full bg-foreground" style={{ width: s / 2 + 3, height: s / 2 + 3 }} />
            </button>
          ))}
        </div>
        <button type="button" onClick={clearPage} className="btn-ghost ml-auto px-3 py-1.5 text-sm">
          Clear page
        </button>
      </div>

      {tool === "text" && !editingId && (
        <p className="mb-1 text-sm text-muted">Tap on the canvas to add text.</p>
      )}
      {selectedId && !editingId && (
        <p className="mb-1 text-sm text-muted">Drag to move · pull a corner to resize or turn it.</p>
      )}
      {importError && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{importError}</p>
      )}

      <div
        ref={wrapRef}
        className="relative mx-auto select-none overflow-hidden rounded-xl border border-border"
        style={{ maxHeight: "70vh", aspectRatio: "10 / 7", width: "100%" }}
      >
        {stage}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-muted">Loading…</div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => goToPage(current - 1)} disabled={current === 0} className="btn-ghost px-3 py-1.5 text-sm">‹ Prev</button>
        <span className="text-sm font-semibold text-muted">Page {current + 1} of {pageCount}</span>
        <button type="button" onClick={() => goToPage(current + 1)} disabled={current === pageCount - 1} className="btn-ghost px-3 py-1.5 text-sm">Next ›</button>
        <button type="button" onClick={addPage} className="btn-ghost px-3 py-1.5 text-sm">＋ Add page</button>
        {allowPageStructure && (
          <button
            type="button"
            onClick={() => duplicatePageAt(currentRef.current)}
            className="btn-ghost px-3 py-1.5 text-sm"
            aria-label="Duplicate this page"
          >
            Copy page
          </button>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"><Icon name="add-file" size={16} decorative /> Add PDF / image</button>
        {/* The same rule as the tray's cross: the page on screen, when it may go. */}
        {pageCount > 1 && (pageDelete === "any" || added[current] === true) && (
          <button type="button" onClick={deletePage} className="px-3 py-1.5 text-sm text-muted hover:text-rose-600">Delete page</button>
        )}
      </div>
    </div>
  );
}

// A palette button's art. Drawn from the same shapeParts the canvas renders
// with, so a button can never show something the canvas doesn't draw — and so
// apparatus with no Unicode glyph (a base-10 rod) needs no hand-drawn icon.
//
// The preview keeps the preset's PROPORTIONS inside a square box, letting the
// long side fill it. Without that every base-10 button would be the same square
// and a ten rod would be indistinguishable from a hundred flat.
// A clock is deliberately absent: it has twelve hours and that is not a
// setting. What a clock offers instead is whether the numbers are printed.
function shapeHasParts(kind: ShapeKind): boolean {
  return kind === "grid" || kind === "pie" || kind === "ring";
}

// Stepping a locked grid's columns or rows has to move the BOX as well.
//
// A locked grid's proportion is not a stored number, it IS cols : rows — that
// is how one kind gives the ten rod its 1:10 and the ten frame its 5:2 from a
// single line. So changing the divisions on their own leaves the box and the
// proportion disagreeing, and nothing notices until the next resize, which
// snaps the box to the new ratio: apparatus that jumps and re-squares itself
// under a finger that was only trying to make it bigger.
//
// Moving the box now keeps the two in step, and keeping the CELL is what makes
// it read right: stepping a hundred flat from ten columns to eleven should add
// a column of the same squares, not squeeze eleven into the old width. An
// unlocked grid — an array, a fraction bar — is meant to subdivide a fixed box,
// so it is left alone.
function divisionPatch(
  s: ShapeObj,
  next: { cols?: number; rows?: number },
): Partial<ShapeObj> {
  if (!s.lockAspect) return next;
  const cols = next.cols ?? s.cols ?? 1;
  const rows = next.rows ?? s.rows ?? 1;
  const cell = Math.max(1, (s.w / (s.cols ?? 1) + s.h / (s.rows ?? 1)) / 2);
  let w = cell * cols;
  let h = cell * rows;
  // Never past the page. Both sides scale together so the cells stay square.
  const over = Math.max(w / W, h / H, 1);
  w /= over;
  h /= over;
  return { ...next, w, h };
}

// The hairline that fences one control off from the next. Named, because the
// properties row is a run of near-identical −/+ buttons and without something
// between them a teacher cannot see at a glance which pair belongs to which
// number.
function Rule() {
  return <span aria-hidden="true" className="mx-0.5 h-9 w-px shrink-0 bg-border" />;
}

// What a pen is set to: its colour, and how thick it draws.
//
// This replaces a 460px vertical rainbow down the right-hand edge. That bar
// could reach any hue, which sounds generous until you watch someone use it: it
// could not reach black, white or grey at all — every colour on it was fully
// saturated — and picking a particular one meant dragging a 24px-wide target
// and watching the nib preview. A row of the colours a child actually reaches
// for, plus a picker for anything else, says what the choice IS.
//
// The rubber gets a shorter version of the same bar: an eraser has no colour,
// so offering it one would be offering a choice that does nothing.
// The right-click menu: cut, copy, paste and duplicate on an object; duplicate
// and reorder on a page.
//
// Deliberately NOT a dialog. `src/app/ops/ConfirmAction.tsx` carries this
// repo's argument against `aria-modal` and focus traps — "a dialog that fails
// to restore focus strands a keyboard user" — and both modals on this canvas do
// in fact fail to restore it. A menu is a light thing: it closes on Escape, on
// a click outside, and on a choice, and it hands focus back where it found it.
//
// Rows are 64px because this canvas is a child's, and the touch-floor gate
// collects `button` elements. Which is also why the items are buttons rather
// than `div role="menuitem"` — a div would slip past the gate entirely, and a
// control a child cannot hit is not made acceptable by being unmeasured.
type MenuItem = { label: string; onSelect: () => void; disabled?: boolean };

function CanvasMenu({
  x,
  y,
  items,
  onClose,
}: {
  // Where the pointer was, in canvas px.
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Nudged back inside the stage when it would hang off an edge. Measured, the
  // way the object toolbar measures itself, because how big it is depends on
  // how many items this menu happens to carry.
  const [nudge, setNudge] = useState({ dx: 0, dy: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.closest(".overflow-hidden") as HTMLElement | null;
    if (!el || !stage) return;
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const gap = 8;
    let dx = 0;
    let dy = 0;
    if (r.right > s.right - gap) dx = s.right - gap - r.right;
    if (r.left + dx < s.left + gap) dx = s.left + gap - r.left;
    if (r.bottom > s.bottom - gap) dy = s.bottom - gap - r.bottom;
    if (r.top + dy < s.top + gap) dy = s.top + gap - r.top;
    setNudge((prev) =>
      Math.abs(prev.dx - dx) < 0.5 && Math.abs(prev.dy - dy) < 0.5 ? prev : { dx, dy },
    );
  });

  // Dismissal, following the one complete implementation in the app
  // (teacher/activities/[id]/TemplateActions.tsx): outside pointer, Escape,
  // both torn down on close.
  useEffect(() => {
    function onDown(e: MouseEvent | PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  // Open with the first item focused, so the whole thing is usable from the
  // keyboard the moment it appears.
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    const btns = Array.from(ref.current?.querySelectorAll("button") ?? []);
    if (!btns.length) return;
    const at = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      btns[(at + 1) % btns.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      btns[(at - 1 + btns.length) % btns.length]?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Actions"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="pointer-events-auto absolute z-[55] flex w-56 flex-col overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-xl"
      style={{ left: x + nudge.dx, top: y + nudge.dy }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            it.onSelect();
            onClose();
          }}
          className="flex h-16 w-full items-center px-4 text-left text-base font-semibold text-foreground hover:bg-background disabled:opacity-40"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// A minus / value / plus control for one of a shape's numbers — and the value
// can be typed straight in.
//
// It was buttons only, on the argument that one tap per step needs no keyboard,
// which matters when a child is holding a stylus. That holds for the numbers it
// was built for: nobody steps past twenty-four parts. It falls apart on a number
// line, where counting in fifties is a perfectly ordinary Year 2 lesson and
// fifty taps on `+` to get there is not a control, it is an obstacle. So the
// buttons stay exactly as they were for the small numbers, and the value became
// a field for the large ones.
function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  // 64px, matching the buttons either side of it in the same toolbar (F37). A
  // stepper a child has to tap ten times to reach ninths is the last place to
  // put a small target — and the field between them is measured by the same
  // gate, an `input` being one of the elements it collects.
  const btn =
    "pointer-events-auto flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-background text-lg font-bold hover:bg-surface disabled:opacity-40";

  // What is in the box while it is being typed into, which is not yet a number:
  // "5" on the way to "50" would be clamped to the minimum and "-" on the way
  // to "-20" is not a number at all. Committed on blur and on Enter; abandoned
  // on Escape.
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs the field, and blurring is what commits — so without this the
  // abandoned value would be committed on the way out, which is the opposite of
  // what Escape means.
  const abandoned = useRef(false);

  function commit(raw: string) {
    setDraft(null);
    const n = Number.parseInt(raw, 10);
    // Anything unparseable leaves the value alone rather than resetting it to a
    // bound: a teacher who selected the field and tabbed away meant nothing.
    if (!Number.isFinite(n)) return;
    const next = Math.min(max, Math.max(min, n));
    if (next !== value) onChange(next);
  }

  return (
    <span className="pointer-events-auto inline-flex items-center gap-1">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label={`${label}: fewer`}
      >
        −
      </button>
      <input
        type="text"
        // Not `type="number"`: its spinners are a fraction of the child touch
        // floor, and the two buttons either side ARE the spinner. `numeric`
        // still brings up a keypad rather than a full keyboard on a tablet.
        inputMode="numeric"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          if (abandoned.current) {
            abandoned.current = false;
            setDraft(null);
            return;
          }
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            abandoned.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
          // Everything else stays in the field. The canvas listens for Backspace
          // and ⌘X/C/V on the window, and this is one of the places that must
          // go on meaning what it means in a text field.
          e.stopPropagation();
        }}
        aria-label={label}
        className="pointer-events-auto h-16 w-20 rounded-xl border border-border bg-background text-center text-base font-bold tabular-nums"
      />
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label={`${label}: more`}
      >
        +
      </button>
    </span>
  );
}


type ObjHandlers = {
  scale: number;
  interactive: boolean;
  // Teacher authoring a template: every object is fully editable and shows a
  // padlock. When false (a child / preview) the object's own lock rules apply.
  author: boolean;
  onSelect: (id: string) => void;
  onStart: () => void;
  onChange: (id: string, patch: Partial<Obj>) => void;
  onEnd: () => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onDuplicate: (id: string) => void;
  canDuplicate: boolean;
  // Pull a new copy off an endless source. Returns the copy's id, or null when
  // the page is full.
  onSpawn: (id: string) => string | null;
  onEditText: (id: string) => void;
  // Open a web link's own form again (teacher only; rule 26).
  onEditLink: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onFinishEditing: () => void;
  // Right click / two-finger click / long press on an object.
  onContextMenu: (e: React.MouseEvent, id: string) => void;
};

// Per-object interaction rules, derived from the mode + the object's lock state.
//  - author         → fully editable (move/resize/delete/label) + a padlock.
//  - child, template + locked   → fixed: not interactive at all.
//  - child, template + unlocked → move only (can't resize/delete the teacher's
//    pieces — e.g. the numbers being sorted).
//  - child, own object          → fully editable (their import), no padlock.
function objCapabilities(o: Obj, author: boolean) {
  // A photo frame. Author: an ordinary object (move / resize / delete /
  // duplicate / order) but no padlock, because it is always fixed for a child.
  // Child: fixed by what it is, whatever `locked` says; the tap layer above the
  // stroke canvas is what a child interacts with, not this wrapper.
  // A web link, the same way and for a stronger reason (rule 26): only a
  // teacher places, moves or changes one. A child presses it through
  // LinkTapLayer, never through this wrapper.
  if (o.type === "frame" || o.type === "link") {
    return author
      ? { movable: true, editable: true, showLock: false, fixed: false, source: false }
      : { movable: false, editable: false, showLock: false, fixed: true, source: false };
  }
  if (author) {
    // A padlock you can drag straight through is not a padlock. Locking pins
    // the object for the person who locked it too, until they unlock it —
    // otherwise "locked" means two different things on the same screen, and a
    // teacher who has just tapped it watches the thing they locked slide under
    // their own finger.
    //
    // The padlock itself stays reachable (the object still selects, and its
    // toolbar still carries the lock), so the way out is exactly the way in.
    if (o.locked) {
      return { movable: false, editable: false, showLock: true, fixed: true, source: false };
    }
    return { movable: true, editable: true, showLock: true, fixed: false, source: false };
  }
  const fromTemplate = !!o.fromTemplate;
  // An endless source. A child may START a drag on it — that is how they get a
  // new one — but the source itself never moves, whatever the padlock says.
  // Being a dispenser pins it; that is what makes it a dispenser rather than a
  // counter that happens to breed.
  if (fromTemplate && o.type === "shape" && o.infinite) {
    return { movable: true, editable: false, showLock: false, fixed: false, source: true };
  }
  if (fromTemplate && o.locked) {
    return { movable: false, editable: false, showLock: false, fixed: true, source: false };
  }
  if (fromTemplate) return { movable: true, editable: false, showLock: false, fixed: false, source: false };
  return { movable: true, editable: true, showLock: false, fixed: false, source: false };
}

// The floating toolbar that hovers just above (and centred over) a selected
// object. It carries the order controls + padlock (author only) and, for a
// shape, the fill / line controls. Its icons are deliberately large and
// touch-friendly (roughly double the old inline toolbar).
//
// It is a SIBLING of the object wrapper, not a child of it, and that is the
// whole point. As a child it rode the wrapper's `rotate()`: the anchor stayed on
// the unturned top edge while the corner controls were carried around an arc
// that reached above it, so turning a shape parked the toolbar on its own delete
// button — and at 180° the "above" toolbar landed visually below the shape, on
// the turn and resize controls. A counter-rotation kept the glyphs upright but
// never moved the toolbar. Out here there is nothing to counter-rotate, the
// placement is plain screen arithmetic off the turned box (`clear`), and `z-30`
// resolves against the whole object layer again instead of being trapped in the
// stacking context that `rotate()` creates.
/**
 * How much of the stage's bottom edge is its own furniture rather than page.
 * Zero on the inline canvas, which has no tray under it.
 */
function chromeInset(stage: HTMLElement, side: "top" | "bottom" | "left" | "right"): number {
  const raw = getComputedStyle(stage).getPropertyValue(`--sj-chrome-${side}`);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}
const chromeBottom = (stage: HTMLElement) => chromeInset(stage, "bottom");

function ObjectToolbar({
  o,
  showAuthor,
  showStyle,
  below,
  centreX,
  centreY,
  clear,
  wrapRef,
  onToggleLock,
  onBringToFront,
  onSendToBack,
  onStyle,
  onDuplicate,
  canDuplicate,
  onEdit,
  editLabel,
}: {
  o: Obj;
  showAuthor: boolean; // teacher: show order + padlock
  showStyle: boolean; // shape: show fill / line
  below: boolean; // drop under the object (when there's no room above it)
  // The object's centre in canvas px — the same space the object wrapper is
  // positioned in, since the two are now siblings in the object layer.
  centreX: number;
  centreY: number;
  // How far above/below that centre the toolbar must start to clear both the
  // turned box and the corner presses hanging off it (`toolbarClearance`).
  clear: number;
  // The object's own wrapper, for measuring. Its `getBoundingClientRect()` on a
  // turned element is already the turned box, so the room-above / room-below
  // question needs no trigonometry of its own.
  wrapRef: React.RefObject<HTMLDivElement | null>;
  onToggleLock: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onStyle: (patch: Partial<ShapeObj>) => void;
  // Turn and resize are the corner handles: a drag, or arrow keys once the
  // handle is focused (F50). The toolbar carried a coarse-step button for each
  // until September 2026; the owner removed them as a second control for a
  // job the handles already do, on a bar a small screen cannot afford.
  onDuplicate: (id: string) => void;
  // False once the page is full. The button stays visible and explains itself
  // rather than vanishing, so a child isn't left wondering where it went.
  canDuplicate: boolean;
  // Change the words: a shape's label, a frame's prompt, a text box's text.
  // Absent where there are none (a picture). It lives here, not on a corner,
  // because the design's four corners are the four things every piece can do,
  // and a fifth disc at the top-centre landed on the settings row whenever a
  // tall piece pushed the bar down onto it.
  onEdit?: () => void;
  // What the edit button says, where "Edit text" would be wrong — a web link's
  // form is an address, not words on the page.
  editLabel?: string;
}) {
  const shape = o.type === "shape" ? (o as ShapeObj) : null;
  // Locked, seen by the person who locked it. Everything except the padlock is
  // a way of changing the object, so while it is pinned none of it is offered.
  const pinned = showAuthor && !!o.locked;
  // An ink pill of round buttons, as the design draws it. A TEACHER's are 44px
  // — the adult floor — and a child's stay at 64 (rule 18, F37): a child still
  // gets this bar, because its turn and resize buttons are the only way to turn
  // or resize anything from a keyboard (F50), and taking it away from them
  // would take that with it.
  const HIT = showAuthor ? 44 : 64;
  const GLYPH = showAuthor ? 22 : 30;
  const btn =
    "pointer-events-auto flex items-center justify-center rounded-full text-[var(--paper)] hover:bg-white/15";
  // The SECOND row is a cream pill, not the ink one, so a button on it needs
  // ink on cream. Sharing the ink row's class is what drew the clock's "12" in
  // cream on cream: a bubble under the clock with nothing in it, and the same
  // for the number line's "123" and every operator glyph.
  const btn2 =
    "pointer-events-auto flex items-center justify-center rounded-full text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_10%,transparent)]";
  const btnStyle: React.CSSProperties = { width: HIT, height: HIT, flex: "0 0 auto" };
  // Which colour menu is open under the bar: the fill's or the line's. The
  // design offers the palette as a row of swatches rather than the browser's
  // own colour dialog, so the ten a child knows from the pen fan are the ten
  // a teacher is offered here — the same vocabulary in both places.
  const [pick, setPick] = useState<"fill" | "stroke" | null>(null);
  // Whether this shape has any numbers to show, and so whether the second row
  // exists. A rectangle has none and gets one row, as it always did.
  const hasNumbers =
    showStyle &&
    !!shape &&
    ((shapeHasParts(shape.shape) && !shape.fixedGrid) ||
      shape.shape === "polygon" ||
      shape.shape === "clock" ||
      shape.shape === "numberline" ||
      shape.shape === "operator");

  // Keep the toolbar within the canvas horizontally. It's centred over the
  // object (`centreX` + a -50% translate); when that would push it past the
  // left/right edge of the canvas box, nudge it back in. Measured off the
  // object wrapper (its natural centre) and the clipping stage box, so it works
  // for any object width and re-clamps as the object is dragged.
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  // Whether the toolbar hangs below the object instead of above it. The caller
  // offers a first guess from the object's position; this refines it by
  // measuring, because how tall the toolbar actually is depends on how many
  // controls this object has and how many rows they wrapped onto — a number no
  // constant can know.
  const [flip, setFlip] = useState(below);
  // Vertical nudge that keeps the toolbar inside the canvas.
  const [lift, setLift] = useState(0);
  // The widest the toolbar may be before it wraps onto another row. A number
  // line carries three steppers and a toggle on top of the order controls and
  // the style pickers, which is wider than the canvas — and a control that runs
  // off both edges is a control nobody can reach. Measured rather than guessed,
  // because it is the stage that decides.
  const [maxW, setMaxW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const wrap = wrapRef.current;
    const stage = el?.closest(".overflow-hidden") as HTMLElement | null;
    if (!el || !wrap || !stage) return;
    // On a turned object this rect is already the turned box, so the room
    // questions below need no trigonometry — the browser has done it.
    const w = wrap.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const insetL = chromeInset(stage, "left");
    const insetR = chromeInset(stage, "right");
    // A couple of pixels of slack. Capping the bar at EXACTLY the free band
    // makes the clamp's floor and ceiling equal to within a rounding error,
    // which reads as "it does not fit" and drops it back to the middle of the
    // whole stage — under the very window the inset was there to avoid.
    setMaxW((prev) => {
      const next = Math.max(160, s.width - 20 - insetL - insetR);
      return Math.abs(prev - next) < 0.5 ? prev : next;
    });
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    // What the toolbar needs beyond the object's own edge: half a corner press,
    // then the gap, then itself.
    const need = HIT_PX / 2 + TOOLBAR_GAP + th;
    // Above if it fits above, otherwise below if it fits below, otherwise
    // whichever side has more room.
    //
    // The page tray is a FLOOR. A toolbar clamped onto it is a toolbar whose
    // settings row swallows the taps meant for "new page", and a teacher then
    // cannot add a page while a number line is selected.
    //
    // The top row is deliberately NOT reserved in the same way. Reserving it
    // wedged the bar between the object and a band it could not clear, which
    // put a number line's steppers underneath the object's own resize corner —
    // and every way out of that (laying the bar across the piece, out-ranking
    // its corners) cost something worse: a piece that could not be dragged, or
    // a short one that could not be resized. Sliding under the top row costs
    // the bar some of its own visibility on a cramped page, the chrome is drawn
    // above it, and nothing is trapped.
    const insetB = chromeBottom(stage);
    const insetT = chromeInset(stage, "top");
    // Above the object, out from under the top row, if that fits; below it,
    // above the tray, if that fits; else whichever side has more. The top row
    // shapes the CHOICE and nothing else — the clamp further down still runs
    // against the stage edge, because clamping against the row pushed the bar
    // onto the object's own corners.
    const roomAbove = w.top - s.top - insetT;
    const roomBelow = s.bottom - insetB - w.bottom;
    const nextFlip =
      roomAbove >= need ? false : roomBelow >= need ? true : roomBelow > roomAbove;
    setFlip((prev) => (prev === nextFlip ? prev : nextFlip));

    // Computed from where the toolbar WOULD sit untransformed, not from where
    // it currently is, so this converges instead of chasing itself.
    const intendedTop = nextFlip
      ? w.bottom + HIT_PX / 2 + TOOLBAR_GAP
      : w.top - HIT_PX / 2 - TOOLBAR_GAP - th;
    // A tall object can leave room in NEITHER place — a hundred flat is most of
    // the canvas — and a toolbar half off the top edge is a toolbar a child
    // cannot use. So it is clamped into the stage vertically, exactly as it
    // already is horizontally: it may end up overlapping its own object, which
    // is a great deal better than being unreachable.
    //
    // It is clamped to the stage EDGE and never to the object's middle, tempting
    // as that is: the corners are where the controls are, but the middle is
    // where a child puts a finger to drag the thing.
    //
    // The floor is the stage's bottom edge LESS whatever the stage reserves for
    // its own chrome (`--sj-chrome-bottom`): on the full-screen canvas that is
    // the page tray and the two fan discs, and a toolbar clamped onto them is a
    // toolbar that stops a child adding a page.
    const floor = s.bottom - insetB;
    const ceiling = s.top;
    let dy = 0;
    if (intendedTop < ceiling + TOOLBAR_GAP) {
      dy = ceiling + TOOLBAR_GAP - intendedTop;
    } else if (intendedTop + th > floor - TOOLBAR_GAP) {
      dy = floor - TOOLBAR_GAP - (intendedTop + th);
    }
    setLift((prev) => (Math.abs(prev - dy) < 0.5 ? prev : dy));
    const margin = 8;
    const naturalCentre = w.left + w.width / 2 - s.left; // canvas-space px
    const half = tw / 2;
    const lo = margin + half + insetL;
    const hi = s.width - margin - half - insetR;
    // If it cannot fit in the free band at all, centre it IN THAT BAND rather
    // than on the whole stage — otherwise "it doesn't fit" parks it back under
    // the window the band was measured to avoid.
    const clamped =
      lo > hi
        ? (insetL + (s.width - insetR)) / 2
        : Math.min(hi, Math.max(lo, naturalCentre));
    const next = clamped - naturalCentre;
    setShift((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  });

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        left: centreX,
        // `clear` already carries the turned span plus half a corner press, so
        // this edge is past every control the object has.
        top: flip ? centreY + clear + TOOLBAR_GAP : centreY - clear - TOOLBAR_GAP,
        // `max-content` first, then the cap. An absolutely positioned box
        // shrink-to-fits, and a shrink-to-fit box full of wrapping rows settles
        // at whatever narrow width it can rather than at the width it has: the
        // top row folded into three lines with 600px of empty stage either
        // side. Asking for max-content lays the rows out at their natural width
        // and lets `maxWidth` be the only thing that folds them.
        ...(maxW ? { width: "max-content", maxWidth: maxW } : {}),
        // Centre it on the object, then sit the near edge on that `top`: the
        // bottom edge when hanging above, the top edge when hanging below.
        transform: `translate(calc(-50% + ${shift}px), ${
          flip ? `${lift}px` : `calc(-100% + ${lift}px)`
        })`,
      }}
      className="pointer-events-auto absolute z-30 flex flex-col items-center gap-1.5 whitespace-nowrap"
    >
      {/* The top row is what a teacher does TO the object: where it sits in the
          stack, whether it is pinned, whether it is endless, whether there is
          another one — and then how it is filled and lined. The same controls
          in the same order whatever the object is, so the row a hand reaches
          for does not move when the shape does. */}
      <div
        className="flex flex-wrap items-center justify-center gap-1.5 rounded-[28px] px-1.5 py-1.5"
        style={{ background: "var(--ink)", boxShadow: "0 4px 0 rgba(34,48,74,.3)" }}
      >
      {showAuthor && (
        <>
          {/* Locked pins the object for its author too, so while it is locked
              the padlock is the only control offered: order, endless supply,
              duplicate and the style pickers all change the thing that was
              just declared unchangeable. Unlock and they are all back. */}
          {!pinned && (
            <>
          <button type="button" onClick={() => onSendToBack(o.id)} className={btn} style={btnStyle} title="Send behind other objects" aria-label="Send to back">
            <Icon name="send-to-back" size={GLYPH} decorative />
          </button>
          <button type="button" onClick={() => onBringToFront(o.id)} className={btn} style={btnStyle} title="Bring in front of other objects" aria-label="Bring to front">
            <Icon name="bring-to-front" size={GLYPH} decorative />
          </button>
            </>
          )}
          {/* No padlock on a photo frame: a child can never move one, so
              there is nothing for a padlock to decide. */}
          {o.type !== "frame" && o.type !== "link" && (
          <button
            type="button"
            onClick={() => onToggleLock(o.id)}
            className={btn}
            style={o.locked ? { ...btnStyle, background: "var(--paper)", color: "var(--ink)" } : btnStyle}
            aria-pressed={!!o.locked}
            aria-label={o.locked ? "Locked in place" : "Unlocked"}
            title={
              o.locked
                ? "Locked in place — nobody can move this, including you. Tap to unlock."
                : "Unlocked — you and your pupils can move this. Tap to lock it in place."
            }
          >
            <Icon name={o.locked ? "lock-closed" : "lock-open"} size={GLYPH} decorative />
          </button>
          )}
          {/* Make this a source. A child dragging it gets a new one and this
              stays put, so a worksheet hands out as many counters or ten-rods
              as they need and they never open a palette. */}
          {!pinned && shape && (
            <button
              type="button"
              onClick={() => onStyle({ infinite: !shape.infinite })}
              className={btn}
              // On is honey, off is the toolbar's own background. `aria-pressed`
              // said which it was and nothing on screen did, so a teacher had
              // to tap it and watch what happened to find out. The tint carries
              // the honey ink with it so the glyph stays legible on it, and the
              // state is not colour alone — the label under the pointer and the
              // accessible name both still say "on" or "off" (rule 18).
              style={
                shape.infinite
                  ? { ...btnStyle, background: "var(--honey-tint, #FBEED3)", color: "var(--honey-ink, #8A5F1E)" }
                  : btnStyle
              }
              aria-pressed={!!shape.infinite}
              aria-label={shape.infinite ? "Endless supply on" : "Endless supply off"}
              title={
                shape.infinite
                  ? "Endless — pupils drag a new one off this. Tap to stop."
                  : "Tap to make this endless: pupils drag a new one off it."
              }
            >
              <Icon name="infinite" size={GLYPH} decorative />
            </button>
          )}
        </>
      )}

      {/* Duplicate. Showing 24 with base-10 apparatus is two rods and four
          ones; showing 7 with counters is seven counters. Without this, each
          one costs a trip back out to the ＋ fan and the palette. */}
      {!pinned && (
      <button
        type="button"
        onClick={() => onDuplicate(o.id)}
        disabled={!canDuplicate}
        className={`${btn} disabled:opacity-40`}
        style={btnStyle}
        title={canDuplicate ? "Make another one" : "This page is full — no room for another"}
        aria-label="Make another one"
      >
        <Icon name="duplicate" size={GLYPH} decorative />
      </button>
      )}

      {!pinned && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className={btn}
          style={btnStyle}
          title={editLabel ?? "Change the words"}
          aria-label={editLabel ?? "Edit text"}
        >
          <Icon name="edit" size={GLYPH} decorative />
        </button>
      )}

      {showStyle && <span className="mx-0.5 h-7 w-px bg-white/25" />}

      {showStyle && shape && (
        <>
          {/* Fill and line: a swatch of each, opening a row of the ten under
              the bar. The swatch IS the label — a paint-pot glyph beside a
              colour dot was two things saying one thing. */}
          <button
            type="button"
            onClick={() => setPick((p) => (p === "fill" ? null : "fill"))}
            className={btn}
            style={pick === "fill" ? { ...btnStyle, background: "var(--paper)" } : btnStyle}
            aria-label="Fill colour"
            aria-pressed={pick === "fill"}
            title="Fill colour"
          >
            <span
              aria-hidden="true"
              style={{
                display: "block",
                width: 22,
                height: 22,
                borderRadius: 999,
                border: "2px solid var(--paper)",
                boxSizing: "border-box",
                background:
                  shape.fill === "none"
                    ? "repeating-linear-gradient(45deg,#eee,#eee 3px,#fff 3px,#fff 6px)"
                    : shape.fill,
              }}
            />
          </button>
          <button
            type="button"
            onClick={() => setPick((p) => (p === "stroke" ? null : "stroke"))}
            className={btn}
            style={pick === "stroke" ? { ...btnStyle, background: "var(--paper)" } : btnStyle}
            aria-label="Line colour"
            aria-pressed={pick === "stroke"}
            title="Line colour"
          >
            <span
              aria-hidden="true"
              style={{
                display: "block",
                width: 22,
                height: 22,
                borderRadius: 999,
                border: "2px dashed var(--paper)",
                boxSizing: "border-box",
                background: shape.stroke,
              }}
            />
          </button>
          <div className="flex gap-1">
            {[3, 6, 12].map((sw) => (
              <button
                key={sw}
                type="button"
                onClick={() => onStyle({ strokeWidth: sw })}
                className="pointer-events-auto flex items-center justify-center rounded-full hover:bg-white/15"
                style={{
                  width: HIT,
                  height: HIT,
                  flex: "0 0 auto",
                  background: shape.strokeWidth === sw ? "var(--paper)" : undefined,
                }}
                aria-label={`Line width ${sw}`}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: 6 + sw,
                    height: 6 + sw,
                    background: shape.strokeWidth === sw ? "var(--ink)" : "var(--paper)",
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}
      </div>

      {/* The colour row: the ten swatches, "No fill" for the fill, and the
          any-colour disc for anything the ten do not carry. Picking one closes
          the row and commits one undo step. */}
      {pick && shape && (
        <div
          role="group"
          aria-label={pick === "fill" ? "Fill colour" : "Line colour"}
          className="flex items-center rounded-full"
          style={{
            gap: 6,
            padding: "6px 8px",
            background: "var(--cream)",
            border: "3px solid var(--ink)",
            boxShadow: "0 4px 0 rgba(34,48,74,.15)",
          }}
        >
          {SWATCHES.map((c) => {
            const cur = (pick === "fill" ? shape.fill : shape.stroke).toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onStyle(pick === "fill" ? { fill: c } : { stroke: c });
                  setPick(null);
                }}
                aria-label={`Colour ${c}`}
                aria-pressed={cur}
                className="pointer-events-auto rounded-full"
                style={{
                  width: HIT === 64 ? 44 : 36,
                  height: HIT === 64 ? 44 : 36,
                  flex: "0 0 auto",
                  background: c,
                  border: `3px solid ${cur ? "var(--ink)" : "var(--calm-border)"}`,
                  boxSizing: "border-box",
                  transform: cur ? "translateY(-3px)" : undefined,
                  transition: "transform 120ms",
                }}
              />
            );
          })}
          {pick === "fill" && (
            <button
              type="button"
              onClick={() => {
                onStyle({ fill: shape.fill === "none" ? DEFAULT_SHAPE_FILL : "none" });
                setPick(null);
              }}
              aria-pressed={shape.fill === "none"}
              className="pointer-events-auto rounded-full whitespace-nowrap"
              style={{
                height: HIT === 64 ? 44 : 36,
                padding: "0 12px",
                border: "2px solid var(--ink)",
                background: shape.fill === "none" ? "var(--ink)" : "var(--cream)",
                color: shape.fill === "none" ? "var(--paper)" : "var(--ink)",
                font: "700 13px var(--font-atkinson)",
              }}
            >
              {shape.fill === "none" ? "Add fill" : "No fill"}
            </button>
          )}
          <label
            className="pointer-events-auto relative flex cursor-pointer rounded-full"
            title="Pick any colour"
            style={{
              width: HIT === 64 ? 44 : 36,
              height: HIT === 64 ? 44 : 36,
              flex: "0 0 auto",
              border: "3px solid var(--ink)",
              boxSizing: "border-box",
              background: "conic-gradient(#bd3f63,#f0b441,#a6c979,#37796f,#8ab9d6,#8b5cf6,#e08a9b,#bd3f63)",
            }}
          >
            <input
              type="color"
              value={
                pick === "fill" ? (shape.fill === "none" ? "#fffdf7" : shape.fill) : shape.stroke
              }
              onChange={(e) => onStyle(pick === "fill" ? { fill: e.target.value } : { stroke: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label={pick === "fill" ? "Fill colour" : "Line colour"}
            />
          </label>
        </div>
      )}

      {/* The second row is the NUMBERS behind a parameterised shape: a number
          line's segments, start and interval; a grid's columns and rows; a
          ring's band; which sign an operator draws. They say what the shape
          MEANS rather than how it looks, they are the only controls whose set
          changes from one shape to the next, and on a number line there are
          enough of them to run off both edges of the canvas if they shared the
          top row. So they get a row of their own, under a rule. */}
      {hasNumbers && (
        <div
          className="flex flex-wrap items-center justify-center gap-2 rounded-full px-3 py-1"
          style={{ background: "var(--cream)", border: "3px solid var(--ink)" }}
        >
      {/* The numbers behind a parameterised shape. This is what makes twelve
          fraction buttons unnecessary: halves, quarters and eighths are on the
          palette, and a teacher who wants ninths steps to nine here rather than
          waiting on a release. */}
      {showStyle && shape && shapeHasParts(shape.shape) && !shape.fixedGrid && (
        <Stepper
          label={shape.shape === "grid" ? "Columns" : "Parts"}
          value={shape.shape === "grid" ? shape.cols ?? 1 : shape.parts ?? 2}
          min={shape.shape === "grid" ? MIN_DIVISIONS : shape.shape === "ring" ? 1 : MIN_PARTS}
          max={shape.shape === "grid" ? MAX_DIVISIONS : MAX_PARTS}
          onChange={(v) => onStyle(shape.shape === "grid" ? divisionPatch(shape, { cols: v }) : { parts: v })}
        />
      )}
      {showStyle && shape && shape.shape === "grid" && !shape.fixedGrid && <Rule />}
      {showStyle && shape && shape.shape === "grid" && !shape.fixedGrid && (
        <Stepper
          label="Rows"
          value={shape.rows ?? 1}
          min={MIN_DIVISIONS}
          max={MAX_DIVISIONS}
          onChange={(v) => onStyle(divisionPatch(shape, { rows: v }))}
        />
      )}

      {/* A sorting hoop wants a thin band and a fraction ring a fat one, so the
          band is the ring's to set rather than a constant everyone lives with. */}
      {showStyle && shape && shape.shape === "ring" && <Rule />}
      {showStyle && shape && shape.shape === "ring" && (
        <Stepper
          label="Thickness"
          value={shape.thickness ?? DEFAULT_RING_THICKNESS}
          min={MIN_RING_THICKNESS}
          max={MAX_RING_THICKNESS}
          step={5}
          onChange={(v) => onStyle({ thickness: v })}
        />
      )}

      {/* A clock's hours are fixed at twelve — the only thing worth changing is
          whether the numbers are printed or the child writes them on. */}
      {showStyle && shape && shape.shape === "clock" && (
        <button
          type="button"
          onClick={() => onStyle({ numerals: !shape.numerals })}
          className={btn2}
          aria-pressed={!!shape.numerals}
          title={shape.numerals ? "Hide the numbers 1 to 12" : "Show the numbers 1 to 12"}
          aria-label="Clock numbers"
        >
          <span className="text-sm font-bold">12</span>
        </button>
      )}

      {/* A pentagon, a hexagon and an octagon are one shape and one number, so
          the number is a control rather than three more buttons — and a
          heptagon, which no palette would ever carry, is two taps away. */}
      {showStyle && shape && shape.shape === "polygon" && (
        <Stepper
          label="Sides"
          value={shape.sides ?? 5}
          min={MIN_SIDES}
          max={MAX_SIDES}
          onChange={(v) => onStyle({ sides: v })}
        />
      )}

      {/* A number line is three numbers: how many segments, where it starts and
          what each step is worth. Those three make 0–10 in ones, 0–100 in tens
          and −5 to 5 the same drawing, so no preset has to exist for them. */}
      {showStyle && shape && shape.shape === "numberline" && (
        <>
          {/* In the order the line is read: where it STARTS, how many segments
              it is cut into, then what one step is worth. Each fenced off from
              the next, because three steppers in a row are six identical −/+
              buttons and nothing says which pair belongs to which number. */}
          <Stepper
            label="Start"
            value={shape.start ?? 0}
            min={MIN_LINE_START}
            max={MAX_LINE_START}
            // Stepped BY the interval, so a line counting in tens moves 0, 10,
            // 20 rather than asking for ten taps to reach the next number it
            // can actually label.
            step={shape.step ?? DEFAULT_LINE_STEP}
            onChange={(v) => onStyle({ start: v })}
          />
          <Rule />
          <Stepper
            label="Segments"
            value={shape.parts ?? 10}
            min={MIN_PARTS}
            max={MAX_PARTS}
            onChange={(v) => onStyle({ parts: v })}
          />
          <Rule />
          <Stepper
            label="Interval"
            value={shape.step ?? DEFAULT_LINE_STEP}
            min={MIN_LINE_STEP}
            max={MAX_LINE_STEP}
            onChange={(v) => onStyle({ step: v })}
          />
          <Rule />
          {/* The glyph shows what tapping DOES, not what is already true: "123"
              struck through while the numbers are on means "hide these", and
              plain "123" while they are off means "put them back". A bare "123"
              said neither, so a teacher had to tap it and watch. The state
              itself is still carried by `aria-pressed` and the label, so this
              is never colour or an icon alone (rule 18). */}
          <button
            type="button"
            onClick={() => onStyle({ numerals: shape.numerals === false })}
            className={btn2}
            aria-pressed={shape.numerals !== false}
            title={
              shape.numerals === false
                ? "Print the numbers under the line"
                : "Leave the line blank for pupils to number"
            }
            aria-label={
              shape.numerals === false ? "Numbers are hidden" : "Numbers are shown"
            }
          >
            <span className="relative inline-flex h-8 w-10 items-center justify-center">
              <span className="text-sm font-bold">123</span>
              {shape.numerals !== false && (
                <svg
                  viewBox="0 0 40 32"
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full"
                >
                  <line
                    x1="4"
                    y1="28"
                    x2="36"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
          </button>
        </>
      )}

      {/* The four signs are one shape with a switch, so an addition worksheet
          becomes a subtraction one without deleting anything and starting
          again. */}
      {showStyle && shape && shape.shape === "operator" && (
        <span className="pointer-events-auto inline-flex items-center gap-1">
          {OPERATOR_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onStyle({ operator: k })}
              className={btn2}
              aria-pressed={(shape.operator ?? "add") === k}
              style={
                (shape.operator ?? "add") === k
                  ? { background: "var(--honey-tint, #FBEED3)", borderColor: "var(--honey, #F0B441)", color: "var(--honey-ink, #8A5F1E)" }
                  : undefined
              }
              title={OPERATOR_LABEL[k]}
              aria-label={OPERATOR_LABEL[k]}
            >
              <span aria-hidden="true" className="text-2xl font-bold">
                {OPERATOR_GLYPH[k]}
              </span>
            </button>
          ))}
        </span>
      )}
        </div>
      )}
    </div>
  );
}

// The layer of movable / resizable objects (pictures, shapes, text boxes).
function ObjectLayer({
  objects,
  selectedId,
  groupIds,
  editingId,
  ...handlers
}: ObjHandlers & {
  objects: Obj[];
  selectedId: string | null;
  groupIds: string[];
  editingId: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {objects.map((o) => (
        <ObjectView
          key={o.id}
          o={o}
          selected={o.id === selectedId}
          grouped={groupIds.includes(o.id)}
          editing={o.id === editingId}
          {...handlers}
        />
      ))}
    </div>
  );
}

function ObjectView({
  o,
  selected,
  grouped,
  editing,
  ...h
}: ObjHandlers & { o: Obj; selected: boolean; grouped: boolean; editing: boolean }) {
  if (o.type === "text") {
    return <TextObjectView o={o} selected={selected} grouped={grouped} editing={editing} {...h} />;
  }
  return <MediaObjectView o={o} selected={selected} grouped={grouped} editing={editing} {...h} />;
}

// Pictures and shapes: move + (aspect-locked / free) resize + delete. Shapes can
// also carry a label (double-tap) that stays locked inside them.
function MediaObjectView({
  o,
  scale,
  interactive,
  author,
  selected,
  grouped,
  editing,
  onSelect,
  onStart,
  onChange,
  onEnd,
  onDelete,
  onToggleLock,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  canDuplicate,
  onSpawn,
  onEditText,
  onEditLink,
  onTextChange,
  onFinishEditing,
  onContextMenu,
}: ObjHandlers & {
  o: ImageObj | ShapeObj | FrameObj | LinkObj;
  selected: boolean;
  grouped: boolean;
  editing: boolean;
}) {
  const cap = objCapabilities(o, author);
  // `cap.showLock` is the author. A locked object is not movable by anyone, but
  // its author must still be able to TAP it — that is how they reach the
  // padlock again. A pupil's locked object keeps `pointer-events: none`.
  const canGrab = interactive && (cap.movable || cap.showLock);
  // `rot: 0` is never persisted, so absent means upright.
  const rot = o.type === "shape" ? o.rot ?? 0 : 0;
  // How far one step turns THIS object. Measured across its own diagonal, which
  // is the distance from the centre to the corner a child is watching — the far
  // end of a line, the corner of a picture.
  const rotateStep = rotateStepFor(Math.hypot(o.w, o.h));

  // Turning and resizing without a drag: the same operations the corner handles
  // do, as one press.
  //
  // They exist for two reasons and the second is the load-bearing one. A child
  // aiming a long line in 3° steps should not have to sweep for a right angle,
  // so the buttons keep the coarse 15 the canvas has always had. And a drag
  // handle cannot be operated by a keyboard at all — F50 — so without a press
  // path, turning and resizing are things a keyboard or switch user simply
  // cannot do, on a control that announces itself as a button.
  function turnBy(delta: number) {
    if (!cap.editable) return;
    onStart();
    onChange(o.id, { rot: wrapRotation(rot + delta) });
    onEnd();
  }
  // Proportional, so it cannot re-aim a line the way a free resize would (the
  // stroke runs corner to corner, so its box IS its angle) and cannot squash a
  // shape that means something at its proportions. About the CENTRE, because
  // that is the least surprising thing a button can do — a drag anchors the
  // corner you are not holding, but a press has no corner in hand.
  function sizeBy(factor: number) {
    if (!cap.editable) return;
    // The same two floors the drag path uses: a line or a rule really is a box
    // a couple of units tall, everything else keeps 24 so it cannot be squashed
    // to nothing and lost.
    const min = minObjSize(o);
    const w = Math.min(W, Math.max(min.w, o.w * factor));
    const h = Math.min(H, Math.max(min.h, o.h * factor));
    // Nothing to do at the limit — better than a press that silently does
    // nothing to w and something to h, which reads as the shape distorting.
    if (Math.abs(w - o.w) < 0.5 && Math.abs(h - o.h) < 0.5) return;
    onStart();
    onChange(o.id, {
      w,
      h,
      x: Math.min(W - w, Math.max(0, o.x + (o.w - w) / 2)),
      y: Math.min(H - h, Math.max(0, o.y + (o.h - h) / 2)),
    });
    onEnd();
  }
  // The toolbar and the corner controls are children of the rotating wrapper,
  // so without this they hang upside-down off a shape turned 180°. The label is
  // deliberately NOT counter-rotated: it rides with the shape, which is what
  // the export renderer already draws.
  const unrotate = rot ? `rotate(${-rot}deg)` : "";
  // The floating toolbar shows when a shape is restyleable (author OR the
  // child's own shape) or whenever the teacher has an object selected.
  const showStyle = o.type === "shape" && cap.editable;
  // Delete and "add a label" moved off the object's corners and into this
  // toolbar (F41), so it has to appear whenever either is available — including
  // for a child's own imported picture, which has no style controls at all and
  // used to show no toolbar.
  const showToolbar = selected && !editing && (author || showStyle || cap.editable);
  // Where the toolbar hangs. `clear` is measured off the ROTATED box, not the
  // unturned one: a tall shape turned on its side reaches far above its own
  // `y`, and it carries a corner control up there with it.
  const wrapRef = useRef<HTMLDivElement>(null);
  const centreX = (o.x + o.w / 2) * scale;
  const centreY = (o.y + o.h / 2) * scale;
  const boxW = o.w * scale;
  const boxH = o.h * scale;
  const clear = toolbarClearance(boxW, boxH, rot);
  // A first guess only, so the toolbar doesn't flash on the wrong side before
  // `ObjectToolbar` measures itself; 80 is a plausible toolbar height.
  const toolbarBelow = centreY - clear - TOOLBAR_GAP - 80 < 0;
  const drag = useRef<
    // `spawnId` is set when the drag started on an endless source: the source
    // stays where it is and the copy is what actually moves.
    | { mode: "move"; ax: number; ay: number; spawnId?: string }
    // Resize needs the starting x/y as well as w/h: rotating about the centre
    // means a change in w/h moves the box, and x/y has to absorb that.
    | { mode: "resize"; ax: number; ay: number; sw: number; sh: number; sx: number; sy: number }
    // Rotate measures from the wrapper's on-screen centre, captured ONCE at
    // drag start — reading it again mid-drag would read a centre that the
    // rotation has already moved, and the handle would chase the pointer.
    | { mode: "rotate"; cx: number; cy: number; base: number; startRot: number }
    | null
  >(null);

  // Capture on the WRAPPER, not on `e.target`.
  //
  // `e.target` is whatever was physically under the finger — an <svg>, one of
  // its <path>s, sometimes a <span>. Capturing one of those while the WRAPPER
  // handles the drag lets the two come apart: if the capture does not hold (and
  // it is taken inside a try/catch, so failing is silent) every later event
  // goes to whatever is under the pointer instead. On an endless source that is
  // the copy the child has just pulled out, which sits under their finger from
  // the first millimetre of the drag — so the source never sees `pointerup` and
  // its `drag` ref is left set for good.
  //
  // What that looked like: hover back over the source at any point afterwards
  // and the copy leapt onto it, because the stale anchor had been measured
  // against the source and the pointer was over the source again.
  function capture(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore — not all pointers can be captured */
    }
  }
  function startMove(e: React.PointerEvent) {
    if (!cap.movable) {
      // Pinned: selecting is still allowed, because that is how the padlock is
      // reached, but nothing moves. Silently — a locked object that shifts by a
      // pixel is the confusion this exists to remove.
      if (cap.showLock) onSelect(o.id);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    // Dragging a source pulls a NEW one off it. The pointer capture stays on
    // this element — which is fine, it is only a delivery route for the events
    // — while every move is applied to the copy instead.
    const spawned = cap.source ? onSpawn(o.id) : null;
    if (cap.source && !spawned) return; // the page is full; nothing to drag
    // A copy pulled off a source is deliberately NOT selected. Selecting it
    // would raise its floating toolbar, which is wider than the counter itself
    // and would sit straight over the source — so the next counter a child went
    // to drag out would be behind a toolbar. Pull one out, put it down, pull
    // the next: nothing in the way. Tapping it afterwards still selects it.
    if (!spawned) onSelect(o.id);
    onStart();
    drag.current = {
      mode: "move",
      ax: e.clientX - o.x * scale,
      ay: e.clientY - o.y * scale,
      spawnId: spawned ?? undefined,
    };
    capture(e);
  }
  function startResize(e: React.PointerEvent) {
    if (!cap.editable) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    drag.current = { mode: "resize", ax: e.clientX, ay: e.clientY, sw: o.w, sh: o.h, sx: o.x, sy: o.y };
    capture(e);
  }

  function startRotate(e: React.PointerEvent) {
    if (!cap.editable) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    // The handle is a child of the wrapper, so it rotates as the shape does.
    // Measuring the centre once, here, is what stops the handle chasing the
    // pointer: from now on only the pointer moves, not the reference point.
    const box = (e.currentTarget as HTMLElement).closest("[data-object]")?.getBoundingClientRect();
    const cx = box ? box.left + box.width / 2 : e.clientX;
    const cy = box ? box.top + box.height / 2 : e.clientY;
    drag.current = {
      mode: "rotate",
      cx,
      cy,
      base: Math.atan2(e.clientY - cy, e.clientX - cx),
      startRot: rot,
    };
    capture(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    // Nothing is held down, so whatever this is, it is not a drag. Belt and
    // braces behind the capture above: a drag that somehow outlives its
    // `pointerup` ends here, on the first hover, rather than following the
    // pointer around for the rest of the session.
    if (e.buttons === 0) {
      drag.current = null;
      onEnd();
      return;
    }
    if (d.mode === "move") {
      const nx = (e.clientX - d.ax) / scale;
      const ny = (e.clientY - d.ay) / scale;
      // Light snap, shapes only. Two ten-rods dropped at y=200 and y=203 both
      // land on 200, so a row of apparatus lines up without a child having to
      // aim. 10 units is 1% of model space — about 4px on a classroom iPad,
      // small enough never to feel like being pushed around.
      //
      // Pictures and text boxes are left alone: a photo nudged 4px for no
      // visible reason just reads as a glitch.
      const snap = o.type === "shape" ? SNAP_UNITS : 1;
      onChange(d.spawnId ?? o.id, {
        x: Math.round(nx / snap) * snap,
        y: Math.round(ny / snap) * snap,
      });
    } else if (d.mode === "rotate") {
      const angle = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      const deg = d.startRot + ((angle - d.base) * 180) / Math.PI;
      // The step is the object's, not the canvas's: a counter turns in 15s and
      // a long line in 3s, so the far end of each moves about the same distance
      // per step. See `rotateStepFor`, and docs/rotation-findings.md for why a
      // flat step is comfortable on a counter and unusable on a line.
      onChange(o.id, { rot: wrapRotation(Math.round(deg / rotateStep) * rotateStep) });
    } else {
      // Vector kinds (line / arrow) get a much smaller floor: a number line or
      // a table rule IS a box a couple of units tall. Area shapes keep 24 so a
      // rectangle can't be squashed to nothing and lost.
      const floor = minObjSize(o);
      const min = floor.w;

      // Project the screen delta onto the shape's OWN axes. Drag right on a
      // shape rotated 90° and it should get taller, not wider — the handle is
      // at what is now the bottom-right of the shape, wherever that is on
      // screen.
      const th = (rot * Math.PI) / 180;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const dxScreen = (e.clientX - d.ax) / scale;
      const dyScreen = (e.clientY - d.ay) / scale;
      const dLocalX = dxScreen * cos + dyScreen * sin;
      const dLocalY = -dxScreen * sin + dyScreen * cos;

      const rawW = Math.min(W, d.sw + dLocalX);
      // One lock rule for every object. A picture keeps the proportions it was
      // imported at; a shape keeps whatever proportion its geometry says it
      // means something at (a hundred flat squashed is not a hundred). Anything
      // that returns null resizes freely on both axes.
      //
      // A line or an arrow locks to the proportion it HAS, captured when the
      // drag began. Its box is not a frame around the shape, it IS the shape —
      // the stroke runs corner to corner — so a free resize re-aims the line,
      // and a child who reached for the corner to make it longer got a
      // different angle instead. Turning is the turn handle's job; this one
      // only makes it bigger.
      const lock =
        o.type === "frame" || o.type === "link"
          ? null
          : o.type === "image"
            ? o.aspect
            : isVectorKind(o.shape)
              ? d.sh > 0
                ? d.sw / d.sh
                : null
              : shapeAspect(o);
      let w: number;
      let h: number;
      if (lock) {
        // With the proportion held there is only one number to clamp — the
        // width — so every limit is expressed as a limit on that.
        //
        // The FLOOR goes on whichever side is the longer one, because that is
        // the side that means "how big is this". Put it on the short side and a
        // steep ratio multiplies it straight back into the long one: a flat
        // rule is a hundred times wider than it is tall, so a floor of two on
        // its height demands a width of two hundred — and a child could make
        // the line longer but never, ever shorter.
        //
        // The CEILING is whichever side reaches the edge of the page first.
        const loW = lock >= 1 ? min : min * lock;
        const hiW = Math.max(loW, Math.min(W, H * lock));
        w = Math.min(Math.max(rawW, loW), hiW);
        h = w / lock;
      } else {
        w = Math.max(floor.w, Math.min(W, rawW));
        h = Math.max(floor.h, Math.min(H, d.sh + dLocalY));
      }

      // x/y pin the top-left but the rotation turns about the CENTRE, so
      // growing w/h swings the whole box: the corner a child is NOT holding
      // walks across the page. The one they are not holding is the one that
      // should stay still, so x/y are moved to hold it there.
      //
      // The anchor is the corner opposite the handle — local (0,0). Rotated
      // about the centre it sits at
      //   Sx = x + w/2 - (w/2)cos + (h/2)sin
      //   Sy = y + h/2 - (w/2)sin - (h/2)cos
      // and holding S still through a change of (dw, dh) gives the two shifts
      // below. Both vanish at rot 0, which is why an upright shape resized
      // correctly all along and a turned one slid.
      const dw = w - d.sw;
      const dh = h - d.sh;
      const cxShift = -(dw / 2) * (1 - cos) - (dh / 2) * sin;
      const cyShift = -(dh / 2) * (1 - cos) + (dw / 2) * sin;
      onChange(o.id, { w, h, x: d.sx + cxShift, y: d.sy + cyShift });
    }
  }
  function onPointerUp() {
    if (drag.current) {
      drag.current = null;
      onEnd();
    }
  }

  const region = o.type === "shape" ? shapeInnerBox(o.shape, o.w, o.h, o.thickness) : null;
  const label =
    o.type === "shape" && region && o.text && o.text.trim()
      ? fitTextToBox(o.text, region.w, region.h)
      : null;

  return (
    <>
    <div
      data-object
      data-id={o.id}
      ref={wrapRef}
      onContextMenu={(e) => onContextMenu(e, o.id)}
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={
        cap.editable
          ? o.type === "link"
            ? () => onEditLink(o.id)
            : o.type === "shape" || o.type === "frame"
              ? () => onEditText(o.id)
              : undefined
          : undefined
      }
      className={`absolute touch-none ${
        canGrab ? "pointer-events-auto cursor-move" : "pointer-events-none"
      } ${
        selected || grouped ? "ring-2 ring-brand" : ""
      }`}
      style={{
        left: o.x * scale,
        top: o.y * scale,
        width: o.w * scale,
        height: o.h * scale,
        // Rotation lives on the WRAPPER, not on the shape's <svg>. That single
        // choice buys three things for nothing: the browser rotates its own
        // hit-testing to match, the `ring-2` selection outline becomes a
        // correct rotated box, and the label rides along — which it must, since
        // the export renderer already draws the label inside the same rotated
        // frame. About the centre, so a shape spins in place rather than
        // swinging off its own corner.
        ...(rot ? { transform: `rotate(${rot}deg)`, transformOrigin: "50% 50%" } : {}),
      }}
    >
      {/* An endless source draws a stack behind it — the paper-stack idiom, so
          a child can see there is another one under this one without being
          told. Purely decorative: it is offset outside the shape's own box and
          never receives a pointer. */}
      {o.type === "shape" && o.infinite && (
        <>
          {/* Two kraft cards behind, offset down and right — the stack the
              design draws, in the tokens the design draws it in. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              transform: `translate(${10 * scale}px, ${10 * scale}px)`,
              border: "3px solid var(--ink)",
              borderRadius: o.shape === "ellipse" ? 999 : 8,
              background: "var(--kraft-tag)",
              opacity: 0.9,
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              transform: `translate(${5 * scale}px, ${5 * scale}px)`,
              border: "3px solid var(--ink)",
              borderRadius: o.shape === "ellipse" ? 999 : 8,
              background: "var(--honey-tint)",
            }}
          />
        </>
      )}

      {o.type === "link" ? (
        // The chip: the teacher's name for the link, and under it the REAL
        // host, always (rule 26). Sized in model units like everything else on
        // the page, and mirrored by `drawLinkChip` for the hand-in picture.
        <div
          data-link={displayHost(o.href)}
          className="pointer-events-none flex h-full w-full items-center overflow-hidden"
          style={{
            gap: LINK_PAD * scale,
            padding: `0 ${LINK_PAD * scale}px`,
            borderRadius: 18 * scale,
            border: "3px solid var(--ink)",
            background: "var(--cream)",
            boxShadow: "0 4px 0 rgba(34,48,74,.15)",
            color: "var(--ink)",
          }}
        >
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center"
            style={{
              width: LINK_ICON * scale,
              height: LINK_ICON * scale,
              borderRadius: 999,
              background: "#D8ECE8",
              border: "2.5px solid var(--ink)",
            }}
          >
            <Icon name="link" size={26 * scale} decorative />
          </span>
          <span className="flex min-w-0 flex-col" style={{ lineHeight: 1.2 }}>
            {o.label && (
              <span
                className="truncate"
                style={{ font: `600 ${22 * scale}px ${FONT_STACK}` }}
              >
                {o.label}
              </span>
            )}
            {/* The host, shortened from the LEFT (never `truncate`, which cuts
                the owning end off). The string is fitted by measuring; the
                right-to-left box is the belt under it — should a font measure
                wider on screen than it did here, the overflow is off the LEFT
                edge, and the end of the host still shows. The <bdi> keeps
                the host itself reading left to right. */}
            <span
              data-link-host
              dir="rtl"
              className="overflow-hidden whitespace-nowrap"
              style={{
                textAlign: "left",
                font: `${o.label ? 400 : 600} ${(o.label ? 18 : 22) * scale}px ${FONT_STACK}`,
                color: o.label ? "var(--ink-soft)" : "var(--ink)",
              }}
            >
              <bdi dir="ltr">
                {fitHostFromLeft(
                  displayHost(o.href),
                  linkFont(o.label ? 400 : 600, o.label ? 18 : 22),
                  // The chip's 3px border is in screen pixels, not model units.
                  (linkTextRoom(o) - 6 / Math.max(scale, 0.1)) * 0.96,
                )}
              </bdi>
            </span>
          </span>
        </div>
      ) : o.type === "frame" ? (
        <div
          // `data-frame` names the kind and its state on the element that
          // draws it, as `data-shape` does for a shape.
          data-frame={o.src ? "filled" : "empty"}
          className="pointer-events-none flex h-full w-full flex-col items-center justify-center overflow-hidden"
          style={{
            gap: 12 * scale,
            borderRadius: 12,
            border: `3px ${o.src ? "solid" : "dashed"} var(--ink)`,
            background: o.src ? "var(--cream)" : "var(--paper)",
          }}
        >
          {o.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={o.src}
              alt={o.alt || "Your photo"}
              draggable={false}
              className="h-full w-full select-none"
              style={{ objectFit: "fill" }}
            />
          ) : (
            <>
              {/* The teacher's prompt sits at the top, so the child's tap
                  button (centred, in the layer above) never covers it. */}
              {/* The camera glyph, centred, then the teacher's prompt under it.
                  A child's cue is the Take a photo button in FrameTapLayer,
                  which sits over this box in the same place. */}
              <Icon name="camera" size={40} decorative />
              {o.label && !editing && (
                <p
                  className="m-0 text-center"
                  style={{
                    padding: "0 16px",
                    font: "400 16px var(--font-atkinson)",
                    color: "var(--ink-soft)",
                    textWrap: "pretty",
                  }}
                >
                  {o.label}
                </p>
              )}
            </>
          )}
        </div>
      ) : o.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={o.src}
          // The words the teacher (or the connector, on their behalf) gave for
          // what this shows. "Added picture" tells a child using a screen reader
          // nothing, and is the fallback only where nobody supplied better.
          alt={o.alt || "Added picture"}
          draggable={false}
          className="pointer-events-none h-full w-full select-none"
          style={{ objectFit: "fill" }}
        />
      ) : (
        <svg
          // Names the kind on the element that draws it, so the DOM says what
          // it is rather than leaving it to be inferred from path data.
          data-shape={o.shape}
          viewBox={`0 0 ${o.w} ${o.h}`}
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          className="pointer-events-none block h-full w-full overflow-visible"
        >
          {shapeParts(o).map((part, i) => (
            <path
              key={i}
              d={part.d}
              // Only the outline carries the fill; detail parts are the internal
              // division lines of apparatus like a base-10 flat, and filling
              // them would black the shape in.
              fill={part.role === "detail" || o.fill === "none" ? "none" : o.fill}
              fillRule={shapeFillRule(o.shape)}
              stroke={o.stroke}
              strokeWidth={
                part.role === "detail" ? detailStrokeWidth(o.strokeWidth) : o.strokeWidth
              }
              strokeLinejoin="round"
            />
          ))}
          {shapeTextMarks(o).map((m, i) => (
            <text
              key={`m${i}`}
              x={m.x}
              y={m.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={m.size}
              fontWeight="700"
              fontFamily={FONT_STACK}
              fill={o.stroke}
              stroke="none"
            >
              {m.text}
            </text>
          ))}
        </svg>
      )}

      {/* Locked, and not the thing in hand: a 28px ink padlock on the corner,
          so a teacher can see at a glance which pieces a child cannot move. */}
      {author && o.locked && !selected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute flex items-center justify-center"
          style={{
            right: -8,
            bottom: -8,
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "var(--ink)",
            color: "var(--paper)",
            ...(unrotate ? { transform: unrotate } : {}),
          }}
        >
          <Icon name="lock-closed" size={14} decorative />
        </span>
      )}

      {/* A shape's label, locked inside its usable area and auto-fitted. */}
      {label && region && !editing && (
        <div
          className="pointer-events-none absolute flex select-none flex-col items-center justify-center overflow-hidden text-center"
          style={{
            left: region.x * scale,
            top: region.y * scale,
            width: region.w * scale,
            height: region.h * scale,
            color: o.type === "shape" ? o.textColor ?? "#1f2430" : "#1f2430",
            fontFamily: FONT_STACK,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {label.lines.map((line, i) => (
            <div key={i} style={{ fontSize: label.fontPx * scale }}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Editing the label — or, on a photo frame, the teacher's prompt. */}
      {(o.type === "shape" || o.type === "frame") && editing && (
        <textarea
          autoFocus
          value={(o.type === "frame" ? o.label : o.text) ?? ""}
          onChange={(e) => onTextChange(o.id, e.target.value)}
          onBlur={onFinishEditing}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={o.type === "frame" ? "Your prompt, e.g. Take a photo of your model" : "Type…"}
          className="pointer-events-auto absolute inset-1 resize-none rounded border-2 border-brand bg-white/80 text-center outline-none"
          style={{
            color: o.type === "shape" ? o.textColor ?? "#1f2430" : "#1f2430",
            fontFamily: FONT_STACK,
            fontWeight: 600,
            fontSize: Math.min(o.h * 0.26, 44) * scale,
            lineHeight: 1.2,
          }}
        />
      )}

      {selected && !editing && cap.editable && (
        <ObjectCorners
          unrotate={unrotate}
          boxW={boxW}
          boxH={boxH}
          onDelete={() => onDelete(o.id)}
          startRotate={o.type === "shape" ? startRotate : undefined}
          startResize={startResize}
          // The keyboard path. One press is one step of the SAME ladder the
          // drag uses, so nothing a pointer can reach is out of a keyboard's
          // reach (F50).
          nudgeRotate={o.type === "shape" ? (dir) => turnBy(dir * rotateStep) : undefined}
          nudgeSize={(dir) => sizeBy(dir > 0 ? SIZE_STEP : 1 / SIZE_STEP)}
          // No copy of a photo frame: a child fills the one the teacher placed.
          onDuplicate={o.type !== "frame" && canDuplicate ? () => onDuplicate(o.id) : undefined}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          noun={o.type === "frame" ? "photo frame" : o.type === "link" ? "web link" : "shape"}
          deleteLabel="Remove object"
        />
      )}
    </div>

    {/* The floating toolbar: order + padlock (teacher) and fill / line (shape),
        centred over the object and clear of its turned box. A SIBLING of the
        wrapper, not a child — inside it, the wrapper's rotation carried the
        toolbar onto the object's own corner controls. */}
    {showToolbar && (
      <ObjectToolbar
        o={o}
        showAuthor={author}
        showStyle={showStyle}
        below={toolbarBelow}
        centreX={centreX}
        centreY={centreY}
        clear={clear}
        wrapRef={wrapRef}
        onToggleLock={onToggleLock}
        onBringToFront={onBringToFront}
        onSendToBack={onSendToBack}
        onDuplicate={onDuplicate}
        canDuplicate={canDuplicate}
        // A picture has no `rot` — the export renderer draws it flat — so it is
        // A picture has no words to change. A frame's words are the teacher's
        // prompt; a shape's are its label.
        onEdit={
          !cap.editable
            ? undefined
            : o.type === "link"
              ? () => onEditLink(o.id)
              : o.type === "shape" || o.type === "frame"
                ? () => onEditText(o.id)
                : undefined
        }
        editLabel={o.type === "link" ? "Change the link" : undefined}
        onStyle={(patch) => {
          onChange(o.id, patch);
          onEnd();
        }}
      />
    )}
    </>
  );
}

// The four corner controls an object carries once it is selected: edit
// top-left, delete top-right, turn bottom-left, resize bottom-right. One
// component so a shape and a text box cannot drift apart on where a child's
// finger goes — and so the child touch floor is met in one place rather than
// four. Each control is a small visible dot inside a 64px press (rule 18,
// finding F41): the dot is what a 90px counter can carry without being buried,
// the press is what a five-year-old can actually hit.
function ObjectCorners({
  unrotate,
  boxW,
  boxH,
  onDelete,
  startRotate,
  startResize,
  nudgeRotate,
  nudgeSize,
  onDuplicate,
  onPointerMove,
  onPointerUp,
  noun,
  deleteLabel,
}: {
  unrotate: string;
  // The object's box in screen px, so controls on a shape too flat to hold four
  // of them can be spread apart rather than piled up.
  boxW: number;
  boxH: number;
  onDelete: () => void;
  // Undefined where turning is not offered: a picture has no `rot` and the
  // export renderer draws it flat, so a handle there would spin on screen and
  // land straight in the hand-in.
  startRotate?: (e: React.PointerEvent) => void;
  startResize: (e: React.PointerEvent) => void;
  /**
   * One step of turn / resize, without a drag: `-1` and `1` for the two
   * directions.
   *
   * These are what make the two handles operable by a KEYBOARD (F50). Both were
   * `<div role="button">` carrying pointer handlers and nothing else — announced
   * to a screen reader as buttons, reachable by no key, and the only route to
   * turning or resizing anything in the product. So for a keyboard or switch
   * user those operations did not exist, while the accessibility tree said they
   * were right there. WCAG 2.2 2.1.1, on a child-facing control.
   *
   * The step is the object's own (`rotateStepFor`), not the toolbar's coarse
   * one, so a keyboard can reach every position a pointer can rather than a
   * coarser subset of them.
   */
  nudgeRotate?: (dir: -1 | 1) => void;
  nudgeSize?: (dir: -1 | 1) => void;
  // "Another one": a copy at +40, +40. Absent where a copy makes no sense (a
  // photo frame, a full page).
  onDuplicate?: () => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  // What this object is called in the turn / resize labels a screen reader
  // reads out. Delete keeps its own, because "Remove object" is what the
  // canvas has always announced and what the specs listen for.
  noun: string;
  deleteLabel: string;
}) {
  // The offsets are inline rather than Tailwind's `-top-8` / `-left-8`, because
  // a utility class only exists if the CSS build has seen it: `-bottom-8` was
  // already in the app from the text box's old resize handle, `-top-8` was new
  // with these corners, and a stale chunk therefore left the two TOP controls
  // with `top: auto` — dropping them out of the corner and into normal flow
  // below the object, horizontally right and vertically wrong. Half of HIT_PX,
  // so each 64px press is centred on its corner.
  const off = -HIT_PX / 2;
  // Pushed further out on whichever axis is too short to hold two presses. The
  // offsets stay in the object's OWN frame, so a flat line spread apart while
  // upright stays spread apart once it is turned.
  const spread = controlSpread(boxW, boxH);
  const at = (corner: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }) => ({
    ...(corner.top ? { top: off - spread.y } : {}),
    ...(corner.bottom ? { bottom: off - spread.y } : {}),
    ...(corner.left ? { left: off - spread.x } : {}),
    ...(corner.right ? { right: off - spread.x } : {}),
    ...(unrotate ? { transform: unrotate } : {}),
  });
  // The design's handle: a 44px cream disc, 3px ink, a flat shadow — the same
  // face as every other child-touchable control on this canvas. It sits inside
  // the 64px press, which is what a finger actually has to hit (rule 18).
  const disc: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 999,
    background: "var(--cream)",
    border: "3px solid var(--ink)",
    boxShadow: "0 4px 0 rgba(34,48,74,.15)",
    color: "var(--ink)",
  };
  // Arrow keys step, Enter and Space step once in the "more" direction. Arrows
  // rather than Enter alone because turning has two directions and a child
  // driving this from a keyboard should not have to go the long way round.
  const stepKeys =
    (nudge: (dir: -1 | 1) => void) => (e: React.KeyboardEvent) => {
      const back = e.key === "ArrowLeft" || e.key === "ArrowDown";
      const on = e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ";
      if (!back && !on) return;
      // The canvas listens for keys of its own (delete, copy, paste), and the
      // page scrolls on space. Neither should happen because a child pressed
      // an arrow on a handle they had focused.
      e.preventDefault();
      e.stopPropagation();
      nudge(back ? -1 : 1);
    };
  return (
    <>
      {/* Top-left: take it away. */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDelete}
        style={at({ top: true, left: true })}
        className={HANDLE_HIT}
        title="Take it away"
        aria-label={deleteLabel}
      >
        <span style={disc}>
          <Icon name="close" size={20} decorative />
        </span>
      </button>
      {/* Top-right: turn — drag it round, or tap for a step. */}
      {startRotate && (
        <div
          onPointerDown={startRotate}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={nudgeRotate ? stepKeys(nudgeRotate) : undefined}
          // Focusable, because it says it is a button. See `nudgeRotate`.
          tabIndex={nudgeRotate ? 0 : undefined}
          style={at({ top: true, right: true })}
          className={`${HANDLE_HIT} cursor-grab`}
          title="Turn"
          role="button"
          aria-label={`Turn ${noun}`}
        >
          <span style={disc}>
            <Icon name="rotate" size={20} decorative />
          </span>
        </div>
      )}
      {/* Bottom-left: another one. */}
      {onDuplicate && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDuplicate}
          style={at({ bottom: true, left: true })}
          className={HANDLE_HIT}
          title="Another one"
          aria-label="Another one"
        >
          <span style={disc}>
            <Icon name="duplicate" size={20} decorative />
          </span>
        </button>
      )}
      {/* Bottom-right: bigger or smaller, the one jam disc. */}
      <div
        onPointerDown={startResize}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={nudgeSize ? stepKeys(nudgeSize) : undefined}
        tabIndex={nudgeSize ? 0 : undefined}
        style={at({ bottom: true, right: true })}
        className={`${HANDLE_HIT} cursor-nwse-resize`}
        title="Resize"
        role="button"
        aria-label={`Resize ${noun}`}
      >
        <span style={{ ...disc, background: "var(--jam)" }} />
      </div>
    </>
  );
}

// A text box object: select + move + resize (font size) + re-edit + delete.
function TextObjectView({
  o,
  scale,
  interactive,
  author,
  selected,
  grouped,
  editing,
  onSelect,
  onStart,
  onChange,
  onEnd,
  onDelete,
  onToggleLock,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  canDuplicate,
  onSpawn,
  onEditText,
  onTextChange,
  onFinishEditing,
  onContextMenu,
}: ObjHandlers & { o: TextObj; selected: boolean; grouped: boolean; editing: boolean }) {
  const cap = objCapabilities(o, author);
  // `cap.showLock` is the author. A locked object is not movable by anyone, but
  // its author must still be able to TAP it — that is how they reach the
  // padlock again. A pupil's locked object keeps `pointer-events: none`.
  const canGrab = interactive && (cap.movable || cap.showLock);
  // A text box has no fill / line, so the toolbar (order + padlock) is teacher-only.
  // Edit and delete live here now (F41), so the toolbar has to show whenever
  // the child can do either — not only for a teacher.
  const showToolbar = selected && !editing && (author || cap.editable);
  const rot = o.rot ?? 0;
  // Each corner control is a child of the turning wrapper, so each is turned
  // back the other way — otherwise the "top-left" pencil ends up bottom-right
  // on a box turned 180°.
  const unrotate = rot ? `rotate(${-rot}deg)` : "";
  // Where the toolbar hangs. This used to ignore rotation altogether — a turned
  // text box reaches above its own `y` exactly as a turned shape does, and
  // carries a corner control up there with it.
  //
  // A shape can be measured from its stored `w`/`h`; a text box has neither,
  // because it is sized by the words in it. So the box is read off the layout
  // instead. `offsetWidth`/`offsetHeight` are the untransformed box, which is
  // what `toolbarClearance` wants — the rotation is its own argument. Both are
  // already in screen px (the font size carries `scale`), hence a scale of 1.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setBox((prev) =>
      Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h },
    );
  });
  const centreX = o.x * scale + box.w / 2;
  const centreY = o.y * scale + box.h / 2;
  // A text box has no stored w/h — it is sized by its words — so its length
  // comes off the measured box, which is in screen px, hence the divide.
  // Zero until the first layout pass, and `rotateStepFor` treats that as the
  // smallest band, so a step is never finer than the old flat 15 by accident.
  const rotateStep = rotateStepFor(Math.hypot(box.w, box.h) / (scale || 1));

  // Turning and resizing as one press rather than a drag — the keyboard path
  // for the two corner handles (F50), and the coarse path for the toolbar.
  function turnBy(delta: number) {
    if (!cap.editable) return;
    onStart();
    onChange(o.id, { rot: wrapRotation(rot + delta) });
    onEnd();
  }
  // A text box's size IS its font size, so this scales that — between the same
  // 12 and 240 the drag clamps to.
  function sizeBy(factor: number) {
    if (!cap.editable) return;
    const fontPx = Math.max(12, Math.min(240, o.fontPx * factor));
    if (Math.abs(fontPx - o.fontPx) < 0.5) return;
    onStart();
    onChange(o.id, { fontPx });
    onEnd();
  }
  const clear = toolbarClearance(box.w, box.h, rot);
  // A first guess only; `ObjectToolbar` refines it by measuring.
  const toolbarBelow = centreY - clear - TOOLBAR_GAP - 80 < 0;
  const drag = useRef<
    | { mode: "move"; ax: number; ay: number }
    | { mode: "rotate"; cx: number; cy: number; base: number; startRot: number }
    | { mode: "resize"; ax: number; ay: number; sf: number }
    | null
  >(null);

  function capture(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function startMove(e: React.PointerEvent) {
    if (editing) return;
    if (!cap.movable) {
      // Pinned: select so the padlock is reachable, but do not drag.
      if (cap.showLock) onSelect(o.id);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    drag.current = { mode: "move", ax: e.clientX - o.x * scale, ay: e.clientY - o.y * scale };
    capture(e);
  }
  function startResize(e: React.PointerEvent) {
    if (!cap.editable) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    drag.current = { mode: "resize", ax: e.clientX, ay: e.clientY, sf: o.fontPx };
    capture(e);
  }
  function startRotate(e: React.PointerEvent) {
    if (!cap.editable) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    // Measured once, exactly as a shape's is: the handle turns with the box, so
    // a centre re-read on every move would have the handle chasing the pointer.
    const box = (e.currentTarget as HTMLElement).closest("[data-object]")?.getBoundingClientRect();
    const cx = box ? box.left + box.width / 2 : e.clientX;
    const cy = box ? box.top + box.height / 2 : e.clientY;
    drag.current = {
      mode: "rotate",
      cx,
      cy,
      base: Math.atan2(e.clientY - cy, e.clientX - cx),
      startRot: rot,
    };
    capture(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    // Nothing is held down, so whatever this is, it is not a drag. Belt and
    // braces behind the capture above: a drag that somehow outlives its
    // `pointerup` ends here, on the first hover, rather than following the
    // pointer around for the rest of the session.
    if (e.buttons === 0) {
      drag.current = null;
      onEnd();
      return;
    }
    if (d.mode === "move") {
      onChange(o.id, { x: (e.clientX - d.ax) / scale, y: (e.clientY - d.ay) / scale });
    } else if (d.mode === "rotate") {
      const angle = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      const deg = d.startRot + ((angle - d.base) * 180) / Math.PI;
      // 15° stops, the same 24 of them a shape gets.
      // The same object-sized step a shape gets. A wide caption sweeps its ends
      // as far as a line does, and for the same reason (`rotateStepFor`).
      onChange(o.id, { rot: wrapRotation(Math.round(deg / rotateStep) * rotateStep) });
    } else {
      // Project the drag onto the box's OWN axes before reading it as "bigger"
      // or "smaller", so pulling away from a turned box grows it however it is
      // lying. A shape does the same thing with w and h; a text box has neither
      // — its size is its words at their font size — so the two local
      // components are averaged back into one number.
      const th = (rot * Math.PI) / 180;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const dx = (e.clientX - d.ax) / scale;
      const dy = (e.clientY - d.ay) / scale;
      const delta = (dx * cos + dy * sin + (-dx * sin + dy * cos)) / 2;
      onChange(o.id, { fontPx: Math.max(12, Math.min(240, d.sf + delta)) });
    }
  }
  function onPointerUp() {
    if (drag.current) {
      drag.current = null;
      onEnd();
    }
  }

  const lines = o.text.split("\n");
  const fontStyle: React.CSSProperties = {
    color: o.color,
    fontSize: o.fontPx * scale,
    fontWeight: 600,
    lineHeight: 1.2,
    fontFamily: FONT_STACK,
  };

  return (
    <>
    <div
      ref={wrapRef}
      onContextMenu={(e) => onContextMenu(e, o.id)}
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={cap.editable ? () => onEditText(o.id) : undefined}
      data-object
      data-id={o.id}
      className={`absolute touch-none ${
        canGrab ? "pointer-events-auto" : "pointer-events-none"
      } ${editing || !canGrab ? "" : "cursor-move"} ${
        selected || grouped
          ? "ring-2 ring-brand"
          : author && o.locked
            ? "ring-2 ring-amber-400"
            : ""
      }`}
      style={{
        left: o.x * scale,
        top: o.y * scale,
        // About the centre, which is what the export renderer turns about too.
        ...(rot ? { transform: `rotate(${rot}deg)`, transformOrigin: "50% 50%" } : {}),
      }}
    >
      {editing ? (
        <textarea
          autoFocus
          value={o.text}
          onChange={(e) => onTextChange(o.id, e.target.value)}
          onBlur={onFinishEditing}
          onPointerDown={(e) => e.stopPropagation()}
          rows={Math.max(1, lines.length)}
          cols={Math.max(6, ...lines.map((l) => l.length + 1))}
          className="resize-none overflow-hidden rounded border-2 border-brand bg-white/90 px-0.5 outline-none"
          style={fontStyle}
          placeholder="Type…"
        />
      ) : (
        <div className="whitespace-pre px-0.5" style={fontStyle}>
          {o.text || " "}
        </div>
      )}

      {selected && !editing && cap.editable && (
        // The same four corners a shape has, in the same places: edit top-left,
        // delete top-right, turn bottom-left, resize bottom-right. A text box
        // and a shape are both just objects to a child, so they answer to the
        // same hands. Each is a small dot inside a 64px press (rule 18's child
        // floor); each is turned back upright by `unrotate`.
        <ObjectCorners
          unrotate={unrotate}
          boxW={box.w}
          boxH={box.h}
          onDelete={() => onDelete(o.id)}
          startRotate={startRotate}
          startResize={startResize}
          nudgeRotate={(dir) => turnBy(dir * rotateStep)}
          nudgeSize={(dir) => sizeBy(dir > 0 ? SIZE_STEP : 1 / SIZE_STEP)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          noun="text"
          deleteLabel="Remove text"
        />
      )}
    </div>

    {/* The floating toolbar (order + padlock), centred over the box and clear of
        its turned one. A sibling, for the same reason a shape's is — and this
        one was never given the counter-rotation a shape's had, so a turned text
        box wore its toolbar upside down. Out here there is nothing to correct. */}
    {showToolbar && (
      <ObjectToolbar
        o={o}
        showAuthor={author}
        showStyle={false}
        below={toolbarBelow}
        centreX={centreX}
        centreY={centreY}
        clear={clear}
        wrapRef={wrapRef}
        onToggleLock={onToggleLock}
        onBringToFront={onBringToFront}
        onSendToBack={onSendToBack}
        onDuplicate={onDuplicate}
        canDuplicate={canDuplicate}
        onEdit={() => onEditText(o.id)}
        onStyle={() => {}}
      />
    )}
    </>
  );
}

// ===========================================================================
// Photo-frame tap layer — the child's way into a teacher's photo frame.
// Rendered above the stroke canvas, like the quiz layer, so it works under the
// pen; each target is a real button at the child touch floor (SAFEGUARDING
// rule 18). An EMPTY frame is one big button. A FILLED frame keeps only a
// small "take it again" button in its corner, so the rest of the photo is the
// child's to draw over.
// ===========================================================================

function FrameTapLayer({
  frames,
  scale,
  takeLabel,
  againLabel,
  onTap,
}: {
  frames: FrameObj[];
  scale: number;
  takeLabel: string;
  againLabel: string;
  onTap: (id: string) => void;
}) {
  // Real pixels, not model units: the floor is what a finger needs.
  const RETAKE = 64;
  return (
    <div className="pointer-events-none absolute inset-0">
      {frames.map((o) => {
        const left = o.x * scale;
        const top = o.y * scale;
        const w = o.w * scale;
        const h = o.h * scale;
        if (o.src) {
          return (
            <button
              key={o.id}
              type="button"
              data-frame-tap={o.id}
              aria-label={againLabel}
              title={againLabel}
              onClick={() => onTap(o.id)}
              className="pointer-events-auto absolute flex items-center justify-center rounded-full"
              // Bottom-right corner, inside the frame where it fits and
              // overflowing the frame — never the stage — where the frame is
              // drawn smaller than the floor.
              style={{
                left: Math.max(left, left + w - RETAKE - 8),
                top: Math.max(top, top + h - RETAKE - 8),
                width: RETAKE,
                height: RETAKE,
                background: "var(--cream)",
                border: "3px solid var(--ink)",
                color: "var(--ink)",
                boxShadow: "0 4px 0 rgba(34,48,74,.15)",
              }}
            >
              <Icon name="camera" size={26} decorative />
            </button>
          );
        }
        return (
          <button
            key={o.id}
            type="button"
            data-frame-tap={o.id}
            aria-label={takeLabel}
            onClick={() => onTap(o.id)}
            // The whole frame is the press (so a child cannot miss it), and
            // the design's jam pill is what they see, sat in the lower half
            // under the camera and the teacher's words.
            className="pointer-events-auto absolute flex flex-col items-center justify-end rounded-xl"
            style={{ left, top, width: Math.max(RETAKE, w), height: Math.max(RETAKE, h), paddingBottom: Math.max(8, h * 0.12) }}
          >
            <span
              className="flex items-center"
              style={{
                gap: 10,
                height: RETAKE,
                padding: "0 24px",
                borderRadius: 999,
                background: "var(--jam)",
                border: "3px solid var(--ink)",
                color: "var(--paper)",
                font: "600 20px var(--font-fredoka)",
                boxShadow: "0 4px 0 #93304f",
                whiteSpace: "nowrap",
              }}
            >
              <Icon name="camera" size={26} decorative />
              {takeLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Web links (SAFEGUARDING rule 26). Three pieces, and the rule is in how they
// fit together rather than in any one of them:
//
//   - `LinkDialog`: the teacher's form. The address is checked by the same
//     `parseTeacherLink` the server runs, so a teacher is told at once rather
//     than finding the link missing after saving.
//   - `LinkTapLayer`: a CHILD's way into a link, above the stroke canvas like
//     the photo frames. It only presses links that came in with the teacher's
//     snapshot, and the address it opens is read from that copy.
//   - `LeavingCard`: what always stands between that press and a new tab.
// ===========================================================================

// Tab stays inside a modal. Shared by the two dialogs here, which is two more
// than the canvas had a helper for; the older prompts keep their own copies.
function trapTab(e: React.KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>("button, a[href], input, textarea"),
  ).filter((el) => !el.hasAttribute("disabled"));
  if (!focusable.length) return;
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

function LinkDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { href: string; label?: string };
  onSave: (href: string, label: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [href, setHref] = useState(initial?.href ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const addressId = useId();
  const nameId = useId();
  const errorId = useId();
  const labelErrorId = useId();
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  function submit() {
    const parsed = parseTeacherLink(href);
    if (!parsed.ok) {
      setError(LINK_REFUSAL_COPY[parsed.why]);
      ref.current?.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    // Refused in words here rather than dropped quietly on save: the server
    // would take the name off (`tidyLinkLabel`), and a teacher should know.
    if (linkLabelNamesUpload(label)) {
      setLabelError(LINK_LABEL_REFUSAL_COPY);
      document.getElementById(nameId)?.focus();
      return;
    }
    onSave(parsed.href, tidyLinkLabel(label) ?? "");
  }
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${addressId}-title`}
      onKeyDown={(e) => {
        // The canvas listens on the window for Backspace and ⌘C/V; typing an
        // address must never reach it.
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          submit();
        }
        trapTab(e, ref.current);
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      {/* Not a <form>. The builder's canvas sits INSIDE the template's own
          form, so a form here would be nested — and Enter in a plain field
          would submit the template, closing the builder under the teacher.
          Enter is handled on the fields instead. */}
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id={`${addressId}-title`} className="text-xl font-bold text-foreground">
          {initial ? "Change this web link" : "Add a web link"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Pupils see the website&apos;s real address, and a &ldquo;leaving StoryJar&rdquo; card
          before it opens in a new tab. Your school&apos;s web filter still applies.
        </p>
        <label htmlFor={addressId} className="label mt-4 block">
          Web address
        </label>
        <input
          id={addressId}
          className="input"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setError(null);
          }}
          placeholder="https://www.bbc.co.uk/bitesize"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
        <label htmlFor={nameId} className="label mt-3 block">
          Name for it <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={nameId}
          className="input"
          maxLength={MAX_LINK_LABEL_LEN}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setLabelError(null);
          }}
          placeholder="Bitesize: the water cycle"
          aria-invalid={labelError ? true : undefined}
          aria-describedby={labelError ? labelErrorId : undefined}
        />
        {labelError && (
          <p id={labelErrorId} role="alert" className="mt-1 text-sm font-semibold text-rose-700">
            {labelError}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={submit} className="btn-brand min-h-[48px] w-full text-base">
            {initial ? "Save link" : "Add link"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] w-full rounded-xl border-2 border-border text-base font-semibold text-muted hover:bg-background"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// A child's way into a web link. Above the stroke canvas, like the photo
// frames, so a link is pressable under any pen — an EYFS child never reaches
// for the Move tool. Each press is at least the 64px floor (rule 18).
//
// It is handed only links that came in the teacher's snapshot, with the address
// from that snapshot (see where it is built), so nothing a child's device has
// stored can become a link that opens.
function LinkTapLayer({
  links,
  scale,
  onTap,
}: {
  links: { id: string; x: number; y: number; w: number; h: number; label?: string; host: string }[];
  scale: number;
  onTap: (id: string) => void;
}) {
  const FLOOR = 64;
  return (
    <div className="pointer-events-none absolute inset-0">
      {links.map((l) => (
        <button
          key={l.id}
          type="button"
          data-link-tap={l.host}
          onClick={() => onTap(l.id)}
          className="pointer-events-auto absolute rounded-2xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2"
          style={{
            left: l.x * scale,
            top: l.y * scale,
            width: Math.max(FLOOR, l.w * scale),
            height: Math.max(FLOOR, l.h * scale),
            background: "transparent",
            outlineColor: "var(--ink)",
          }}
        >
          {/* The chip underneath says this already; a screen reader gets the
              same words, label first and the real address after it. */}
          <span className="sr-only">
            {l.label ? `${l.label}, ` : ""}
            {l.host}
          </span>
        </button>
      ))}
    </div>
  );
}

// "You are leaving StoryJar." Full screen and opaque, on the ClassCodeReveal
// pattern: nothing of the canvas shows through, so there is one thing on the
// screen and it is this question. Stay here is focused first, so Enter keeps
// the child where they are, and so does Escape. Open it is a real link to a new
// tab that is told nothing about where it came from, and the card closes as it
// opens, so coming back to StoryJar is coming back to the work (rule 26).
function LeavingCard({
  href,
  host,
  hearItLabel,
  onClose,
}: {
  href: string;
  host: string;
  hearItLabel?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const copy = studentCopyNeutral.add.link;
  useEffect(() => {
    stayRef.current?.focus();
  }, []);
  const big: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 72,
    minWidth: 200,
    padding: "0 32px",
    borderRadius: 999,
    font: "600 24px var(--font-fredoka)",
    textDecoration: "none",
    boxSizing: "border-box",
  };
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-leaving-card
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        trapTab(e, ref.current);
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "var(--paper)" }}
    >
      <div style={{ maxWidth: 640, textAlign: "center", color: "var(--ink)" }}>
        <span
          aria-hidden="true"
          className="mx-auto flex items-center justify-center"
          style={{
            width: 96,
            height: 96,
            borderRadius: 999,
            background: "var(--cream)",
            border: "3px solid var(--ink)",
          }}
        >
          <Icon name="link" size={52} decorative />
        </span>
        <h2
          id={titleId}
          style={{ margin: "24px 0 0", font: "600 32px/1.3 var(--font-fredoka)", textWrap: "balance" }}
        >
          {copy.before}
          {/* Allowed to break anywhere, so the WHOLE host is always on the
              screen: on a phone a 40-character host at this size is wider than
              the card, and a host that does not wrap is cut off at both ends.
              `anywhere` rather than `break-word` because only it lets the
              card itself shrink to the screen round the host. */}
          <span data-leaving-host style={{ overflowWrap: "anywhere", color: "var(--jam)" }}>
            {host}
          </span>
          {copy.after}
        </h2>
        <div className="flex flex-wrap items-center justify-center" style={{ gap: 16, marginTop: 32 }}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onClose()}
            style={{ ...big, background: "var(--glass)", color: "var(--paper)", boxShadow: "0 5px 0 #2b5f57" }}
          >
            {copy.open}
          </a>
          <button
            ref={stayRef}
            type="button"
            onClick={onClose}
            style={{ ...big, background: "var(--cream)", color: "var(--ink)", border: "3px solid var(--ink)" }}
          >
            {copy.stay}
          </button>
        </div>
        {hearItLabel && (
          <button
            type="button"
            onClick={() => readAloud(copy.spoken)}
            className="mx-auto mt-6 flex items-center"
            style={{ ...big, minWidth: 0, gap: 8, font: "700 20px var(--font-atkinson)", color: "var(--ink)", background: "transparent" }}
          >
            {/* The speaker every other Hear it in the child surface wears. */}
            <span aria-hidden="true">🔊</span>
            {hearItLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Quiz layer — floating multiple-choice question boxes. Rendered above the
// stroke canvas and kept entirely separate from the flattened page image.
// ===========================================================================

function QuizLayer({
  questions,
  scale,
  mode,
  hearItLabel,
  interactive,
  selectedId,
  answers,
  review,
  lockedIds,
  retryIds,
  onSelect,
  onMove,
  onDelete,
  onAnswer,
  onPrompt,
  onOptionText,
}: {
  questions: QuizQuestion[];
  scale: number;
  mode: "author" | "answer";
  hearItLabel?: string;
  interactive: boolean;
  selectedId: string | null;
  answers: Record<string, string>;
  review: boolean;
  lockedIds: Set<string>;
  // Questions they got wrong last time and have not yet changed.
  retryIds: Set<string>;
  onSelect: (id: string) => void;
  onMove: (id: string, patch: Partial<QuizQuestion>) => void;
  onDelete: (id: string) => void;
  onAnswer: (qid: string, oid: string) => void;
  onPrompt: (id: string, prompt: string) => void;
  onOptionText: (qid: string, oid: string, text: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {questions.map((q) => (
        <QuizBoxView
          key={q.id}
          q={q}
          scale={scale}
          mode={mode}
          hearItLabel={hearItLabel}
          interactive={interactive}
          selected={q.id === selectedId}
          selectedOption={answers[q.id] ?? null}
          review={review}
          locked={lockedIds.has(q.id)}
          retry={retryIds.has(q.id)}
          onSelect={onSelect}
          onMove={onMove}
          onDelete={onDelete}
          onAnswer={onAnswer}
          onPrompt={onPrompt}
          onOptionText={onOptionText}
        />
      ))}
    </div>
  );
}

// A borderless field for typing directly onto the worksheet. It's a textarea,
// not an input, because the child sees this text WRAPPED — a single-line input
// would clip a real question ("How do you know Harry was waiting for the bus?")
// and hide from the teacher what they're actually writing. Grows to fit, so the
// box always previews what the child will get. Enter is swallowed: these are
// one-liners, and a stray newline only shifts the layout.
function BoxField({
  value,
  onChange,
  onPointerDown,
  placeholder,
  label,
  className,
  style,
  register,
}: {
  value: string;
  onChange: (v: string) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  placeholder: string;
  label: string;
  className: string;
  style?: React.CSSProperties;
  register?: (el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    register?.(ref.current);
    return () => register?.(null);
  }, [register]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    // Text re-wraps when the teacher resizes the box, which changes the height
    // needed without changing the value — so re-fit on width changes too, or a
    // narrowed box clips its question. Only on WIDTH: fit() sets the height, so
    // reacting to height would feed the observer its own output.
    let lastWidth = el.clientWidth;
    const obs = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      fit();
    });
    obs.observe(el);
    return () => obs.disconnect();
    // fontSize matters too: scaling the box down re-wraps the text and changes
    // the height needed, and a height-only resize never changes our width, so
    // the observer above wouldn't catch it.
  }, [value, style?.fontSize]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      placeholder={placeholder}
      aria-label={label}
      style={style}
      className={`resize-none overflow-hidden border-none bg-transparent text-center outline-none placeholder:text-muted ${className}`}
    />
  );
}

function QuizBoxView({
  q,
  scale,
  mode,
  hearItLabel,
  interactive,
  selected,
  selectedOption,
  review,
  locked,
  retry,
  onSelect,
  onMove,
  onDelete,
  onAnswer,
  onPrompt,
  onOptionText,
}: {
  q: QuizQuestion;
  scale: number;
  mode: "author" | "answer";
  hearItLabel?: string;
  interactive: boolean;
  selected: boolean;
  selectedOption: string | null;
  review: boolean;
  locked: boolean;
  // Got this one wrong last time and hasn't picked again yet.
  retry: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, patch: Partial<QuizQuestion>) => void;
  onDelete: (id: string) => void;
  onAnswer: (qid: string, oid: string) => void;
  onPrompt: (id: string, prompt: string) => void;
  onOptionText: (qid: string, oid: string, text: string) => void;
}) {
  const author = mode === "author";
  const drag = useRef<{ mode: "move" | "resize"; ax: number; ay: number; sw: number; sh: number } | null>(null);

  function capture(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function startMove(e: React.PointerEvent) {
    if (!author || !interactive) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(q.id);
    drag.current = { mode: "move", ax: e.clientX - q.x * scale, ay: e.clientY - q.y * scale, sw: q.w, sh: q.h };
    capture(e);
  }
  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(q.id);
    drag.current = { mode: "resize", ax: e.clientX, ay: e.clientY, sw: q.w, sh: q.h };
    capture(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    // Nothing is held down, so whatever this is, it is not a drag. Belt and
    // braces behind the capture above: a drag that somehow outlives its
    // `pointerup` ends here, on the first hover, rather than following the
    // pointer around for the rest of the session.
    if (e.buttons === 0) {
      drag.current = null;
      return;
    }
    if (d.mode === "move") {
      // Clamped by the height the card is actually DRAWN at, not by a stored
      // one. The card follows its content now, so `q.h` is the answer to a
      // different question — clamping to it walled the box into the top of the
      // page, and further up with every resize.
      onMove(q.id, {
        x: Math.max(0, Math.min(W - q.w, (e.clientX - d.ax) / scale)),
        y: Math.max(0, Math.min(Math.max(0, H - liveH.current), (e.clientY - d.ay) / scale)),
      });
    } else {
      // Width only. A question box is as tall as its answers — dragging the
      // corner down asked for a height the card would not honour, and every
      // drag left `q.h` further adrift from what was on screen.
      const w = Math.max(QUIZ_MIN_W, Math.min(W, d.sw + (e.clientX - d.ax) / scale));
      onMove(q.id, { w });
    }
  }
  function onPointerUp() {
    drag.current = null;
  }

  // The box is a second, equal editing surface for the same question the panel
  // edits — both write through the same mutators, so they mirror per keystroke.
  // Marking the correct answer is deliberately NOT here: it stays in the panel,
  // and the box only reflects the marked answer (green + ✓ badge, no handler).
  const editable = author && interactive;
  // Typing must not drag the box out from under the teacher; the surrounding
  // chrome is still the drag handle.
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

  // Everything inside is designed at QUIZ_W × QUIZ_H and scales down with the
  // box, so a teacher can shrink a question to an aside and still have it read
  // — smaller text is the point, not a compromise. Capped at 1 so a big box
  // gets more room rather than giant type. Driven by whichever axis is tighter,
  // so a short-and-wide box doesn't overflow vertically.
  const k = Math.min(1, q.w / QUIZ_W, q.h / QUIZ_H);
  const px = (n: number) => Math.round(n * k * 10) / 10;
  // A finger is a physical size, and `px()` is not: it scales model units by the
  // canvas's display scale, so a "64px" answer button rendered at k≈0.9 reaches
  // the child as 57 real pixels. F37 found exactly that on the quiz a
  // four-year-old answers. `touch()` is px() with a floor at the real 64
  // SAFEGUARDING rule 18 asks for — use it for anything a child has to hit.
  //
  // NOT in author mode, and the distinction is the whole point. On the teacher's
  // worksheet a question box is a thing being DRAWN: shrink it and its contents
  // scale down with it, which is what makes the box a usable design surface (and
  // what `quiz.spec.ts` "shrinking a question box scales its contents" locks in).
  // A floor there fights the teacher's own hand and spills the contents out of
  // the box they just sized. The floor exists to protect a child's finger, so it
  // applies where a child is actually tapping: answer mode.
  //
  // The floor has to be stated in REAL pixels, and that is the part F37's fix
  // missed. Everything in this box is laid out at logical size and then drawn
  // through `transform: scale(scale)` on the wrapper below, so a floor of 64
  // here reaches the child as 64·scale: 57 real pixels on the viewport the
  // finding was filed from, and 49 on the 768px classroom tablet a Reception
  // child holds. Dividing by the scale is what makes 64 mean 64 to a finger.
  //
  // Which is only half of it, because the box does not have room for the answer
  // it now owes. See `grows` below: in answer mode the card grows to fit them
  // instead of clipping them, which is the other half of the same fix.
  //
  // Rounded up to a whole logical pixel, so that after the scale transform the
  // result is never a hair UNDER the floor: 64/scale × scale is 64 in
  // arithmetic and 63.98 once the browser has rounded the transformed box, and
  // 63.98 is a failed touch target on the gate that exists to catch exactly
  // this. A logical pixel of slack costs nothing and is always the safe way.
  const touch = (n: number) =>
    author ? px(n) : Math.max(px(n), Math.ceil(n / scale));
  // Whether this card is allowed to outgrow the size it was drawn at. Only a
  // child's, and only ever downwards in size terms — it never shrinks below the
  // teacher's box. The alternative, on a question box a teacher drew short, is
  // that the floor above pushes the last answer out of an `overflow-hidden`
  // card: a target too small traded for one a child cannot see at all, which is
  // the worse of the two. A quiz card is opaque, so what it grows over is the
  // worksheet behind it, and the child still has every answer.
  // Both cards follow their content. A child's may only outgrow the size it
  // was drawn at (the touch floor below needs the room); a teacher's takes its
  // content height either way, so there is never a band of empty card under
  // the last answer — the design's box is exactly as tall as what is in it.
  const grows = true;
  // Type never goes below the design's small size, however the box is scaled:
  // a question a teacher shrank to an aside still has to be readable.
  const MIN_TEXT = 15;
  const txt = (n: number) => Math.max(MIN_TEXT, px(n));
  // A listen button on the question is offered only when the caller asked for
  // one (a child, in a register that cannot read yet) AND the platform has an
  // on-device voice to say it with. Both, or nothing.
  const voiceReady = useOnDeviceVoiceReady();
  const canHear = !author && !!hearItLabel && !!q.prompt && voiceReady;

  // Answer rows stretch to share out the box's height, so their size has little
  // to do with how much text is in them: two short answers in a tall box left
  // small text marooned in a big empty row. So the text is grown to fill the
  // row it's actually in rather than sized from the box.
  //
  // One size for all of them, the largest that fits every answer — sizing each
  // independently would leave "Red" huge next to a small "It was raining".
  // Capped at the question's size so the question still reads as the question.
  // The prompt is the question: 20px, and 16px only once it runs long enough
  // to need the room. The answers fit their 44px row but stop 2px short of
  // the prompt, so nothing on the card is bigger than the question.
  const promptPx = txt(q.prompt.length > 40 ? 16 : 20);
  const answerCap = Math.max(MIN_TEXT, Math.min(promptPx - 2, px(18)));
  const answerFloor = MIN_TEXT;
  const [answerFont, setAnswerFont] = useState(answerCap);
  const answerEls = useRef<Map<string, HTMLElement>>(new Map());
  const registerAnswer = useCallback((id: string, el: HTMLElement | null) => {
    if (el) answerEls.current.set(id, el);
    else answerEls.current.delete(id);
  }, []);

  // Re-fit whenever anything that changes how much room the text has changes.
  const answerKey = q.options.map((o) => `${o.text ?? ""}|${o.imagePath ? 1 : 0}`).join("\x00");
  useLayoutEffect(() => {
    const els = [...answerEls.current.values()];
    if (!els.length) return;
    const fitsAll = (size: number) =>
      els.every((el) => {
        const row = el.parentElement;
        if (!row) return true;
        const cs = getComputedStyle(row);
        const avail = row.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        el.style.fontSize = `${size}px`;
        if (el instanceof HTMLTextAreaElement) {
          el.style.height = "auto";
          return el.scrollHeight <= avail && el.scrollWidth <= el.clientWidth + 1;
        }
        return el.offsetHeight <= avail && el.scrollWidth <= el.clientWidth + 1;
      });

    let lo = answerFloor;
    let hi = answerCap;
    let best = answerFloor;
    // Largest size that fits, to a fraction of a pixel. Eight halvings is well
    // inside the precision anyone can see.
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (fitsAll(mid)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    best = Math.round(best * 10) / 10;
    // Leave the DOM at the chosen size even when state doesn't change — the
    // search above left it at whatever it probed last.
    els.forEach((el) => {
      el.style.fontSize = `${best}px`;
      if (el instanceof HTMLTextAreaElement) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    });
    setAnswerFont((prev) => (Math.abs(prev - best) < 0.15 ? prev : best));
  }, [answerKey, answerCap, answerFloor, q.w, q.h, q.options.length, editable]);

  // How tall the card actually ended up, in logical units. `offsetHeight` is a
  // LAYOUT height, and the `scale()` on this element is a paint-time transform,
  // so this is the same coordinate space q.h is in. Watched rather than measured
  // once, because the answer text refits on a resize and can take a line with it.
  //
  // It buys one thing: a grown card that runs off the bottom of the page is
  // pulled back on. The stage clips at the page edge, so without this a question
  // a teacher placed low would have the very answer this fix is about taken
  // away by the crop.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(q.h);
  // The same number, readable from a pointer handler that runs outside render.
  const liveH = useRef(q.h);
  liveH.current = cardH;
  useLayoutEffect(() => {
    if (!grows) return;
    const el = cardRef.current;
    if (!el) return;
    const read = () =>
      setCardH((prev) => {
        const next = el.offsetHeight;
        return Math.abs(prev - next) < 0.5 ? prev : next;
      });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [grows]);
  // Write that height back to the question, so what is stored is what is on
  // screen: the page-card miniature, the hand-in and the child's own view all
  // read `h`, and a teacher who has never resized anything should not find
  // them disagreeing with the box they laid out. Author only — a child's card
  // has `minHeight: q.h` and syncing there would ratchet it upwards.
  useEffect(() => {
    if (!author || !interactive) return;
    if (Math.abs(cardH - q.h) < 1) return;
    onMove(q.id, { h: Math.round(cardH) });
  }, [author, interactive, cardH, q.h, q.id, onMove]);
  const topUnits = grows ? Math.max(0, Math.min(q.y, H - cardH)) : q.y;

  return (
    <div
      onPointerDown={author ? startMove : undefined}
      onPointerMove={author ? onPointerMove : undefined}
      onPointerUp={author ? onPointerUp : undefined}
      className={`absolute ${
        author ? (interactive ? "pointer-events-auto cursor-move" : "pointer-events-none") : "pointer-events-auto"
      }`}
      style={{
        left: q.x * scale,
        top: topUnits * scale,
        width: q.w * scale,
        height: (grows ? cardH : q.h) * scale,
      }}
    >
      {/* Content is laid out at logical canvas size (q.w × q.h) and shrunk with a
          transform, so text and answer buttons scale with the box on small screens
          instead of overflowing it. */}
      <div
        ref={cardRef}
        role={editable ? "group" : undefined}
        aria-label={editable ? "Question box" : undefined}
        className="flex flex-col overflow-hidden"
        style={{
          // The design's card: cream, 3px ink, radius 18, a flat shadow. The
          // selected box's dashed jam outline is drawn round it, not by it.
          background: "var(--cream)",
          border: `3px ${selected && author ? "dashed" : "solid"} ${selected && author ? "var(--jam)" : "var(--ink)"}`,
          borderRadius: 18,
          boxShadow: "0 4px 0 rgba(34,48,74,.15)",
          width: q.w,
          // A CHILD's card grows to fit answers at the touch floor; a teacher's
          // is exactly the size they drew, because for them the box is a thing
          // being laid out on a worksheet. The transform does not affect layout,
          // so this height is in logical units either way.
          ...(author ? {} : { minHeight: q.h }),
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          padding: `${px(12)}px ${px(14)}px`,
          gap: px(10),
          fontSize: px(16),
        }}
      >
        {editable ? (
          <>
            {/* The prompt: an inline field with the design's dashed calm
                border, in Fredoka, smaller once the question runs long. The
                border and padding are on a WRAPPER, not the field: BoxField
                sizes itself to its own scrollHeight, and a padded, bordered
                textarea under border-box sizing can never catch its own tail. */}
            <div
              style={{
                border: `${Math.max(1, px(2))}px dashed var(--calm-border)`,
                borderRadius: px(12),
                padding: `${px(6)}px ${px(10)}px`,
              }}
            >
              <BoxField
                value={q.prompt}
                onChange={(v) => onPrompt(q.id, v)}
                onPointerDown={stopDrag}
                placeholder="Type your question here"
                label="Question"
                className="w-full leading-tight text-foreground"
                style={{
                  fontSize: promptPx,
                  fontFamily: "var(--font-fredoka)",
                  fontWeight: 600,
                }}
              />
            </div>
          </>
        ) : (
          // Author mode with a drawing tool picked: the box goes non-interactive
          // so the teacher can draw across it, so echo the placeholder rather
          // than leaving a new question looking like an empty box.
          <div className="flex items-center" style={{ gap: px(10) }}>
            {canHear && (
              <button
                type="button"
                aria-label={`${hearItLabel}: ${q.prompt}`}
                onClick={() => readAloudOnDevice(q.prompt)}
                // The real 64px floor — this is the control that exists FOR
                // the children who cannot read the words beside it (rule 18).
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{
                  minHeight: touch(64),
                  minWidth: touch(64),
                  fontSize: px(22),
                  background: "var(--cream)",
                  border: "3px solid var(--ink)",
                }}
              >
                <span aria-hidden="true">🔊</span>
              </button>
            )}
            <p
              className={`flex-1 leading-tight ${q.prompt ? "text-foreground" : "text-muted"}`}
              style={{ fontSize: promptPx, fontFamily: "var(--font-fredoka)", fontWeight: 600, textWrap: "pretty" }}
            >
              {q.prompt || (author ? "Type your question here" : "")}
            </p>
          </div>
        )}
        {/* Which questions to look at again, in WORDS.
            The amber ring on their old answer is not allowed to carry this on
            its own (rule 18) — and "have another go" is the whole reason work
            comes back rather than starting over. It says nothing about which
            answer is right. */}
        {retry && (
          <p
            className="text-center font-bold text-amber-700"
            style={{ fontSize: px(15) }}
          >
            Have another go at this one
          </p>
        )}
        <div
          className={`flex flex-col ${grows ? "" : "min-h-0 flex-1"}`}
          style={{
            gap: px(6),
            // `flex-1` is `flex: 1 1 0%`: the rows' own height counts for
            // nothing, so they share out whatever is left and a 64px floor is
            // simply clipped. Basing on content instead is what lets the card
            // above grow rather than swallow an answer.
            ...(grows ? { flex: "1 0 auto" } : null),
          }}
        >
          {editable
            ? q.options.map((o) => {
                const correct = q.correctOptionId === o.id;
                return (
                  <div
                    key={o.id}
                    // min-w-0: a grid "1fr" is minmax(auto, 1fr), and the auto
                    // floor is the item's min-content — which a textarea inflates
                    // to its intrinsic `cols` width, unlike the span this used to
                    // hold. Without this the two columns refuse to shrink and the
                    // answers overflow the box and get clipped.
                    className="flex min-w-0 items-center rounded-full text-left"
                    style={{
                      minHeight: touch(44),
                      padding: `${px(4)}px ${px(14)}px ${px(4)}px ${px(8)}px`,
                      gap: px(10),
                      border: `${Math.max(1, px(2))}px solid var(--calm-border)`,
                      background: "var(--cream)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 rounded-full"
                      style={{ width: px(24), height: px(24), border: `${Math.max(1, px(2))}px solid var(--ink)`, background: "var(--cream)" }}
                    />
                    {o.imagePath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={o.imagePath}
                        alt={o.imageAlt ?? ""}
                        className="w-auto shrink-0 object-contain"
                        style={{ maxHeight: px(64) }}
                      />
                    )}
                    <BoxField
                      value={o.text ?? ""}
                      onChange={(v) => onOptionText(q.id, o.id, v)}
                      onPointerDown={stopDrag}
                      placeholder="Type an answer"
                      label="Answer text"
                      className="min-w-0 flex-1 break-words text-left font-bold text-foreground"
                      style={{ fontSize: answerFont, textAlign: "left" }}
                      register={(el) => registerAnswer(o.id, el)}
                    />
                    {correct && (
                      <span
                        title="Correct answer — set this in the Quiz builder"
                        className="shrink-0 font-bold"
                        style={{ color: "var(--glass)", fontSize: px(18) }}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                );
              })
            : q.options.map((o) => {
                const chosen = !author && selectedOption === o.id;
                // Show the tick on the correct answer in author mode always, and in a
                // review reopen on the locked (already-correct) question the child got right.
                //
                // `locked` is load-bearing: a question they got WRONG is in review
                // mode too, and must never show which one was right. Reading the
                // answer off the screen would make changing it a copy rather than a
                // decision.
                const showCorrect = (author || (review && locked)) && q.correctOptionId === o.id;
                // A locked-correct question reads as a fixed green result; anything
                // else the child can still tap.
                const disabled = author || locked;
                // What they picked last time, on a question they are being asked to
                // look at again. Marked, not scolded — and still tappable.
                const wasWrong = retry && chosen;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={disabled}
                    aria-label={o.text || "Picture answer"}
                    aria-pressed={chosen}
                    onClick={author || locked ? undefined : () => onAnswer(q.id, o.id)}
                    className={`flex min-w-0 items-center rounded-full text-left transition-colors ${
                      author || locked ? "cursor-default" : "cursor-pointer"
                    }`}
                    style={{
                      minHeight: touch(64),
                      padding: `${px(4)}px ${px(14)}px ${px(4)}px ${px(8)}px`,
                      gap: px(10),
                      // Picked: honey tint with an ink edge. Right (where a
                      // child may be shown it): glass tint. Look-again: honey.
                      border: `${Math.max(1, px(2))}px solid ${
                        showCorrect ? "var(--glass)" : chosen || wasWrong ? "var(--ink)" : "var(--calm-border)"
                      }`,
                      background: showCorrect
                        ? "var(--glass-light)"
                        : chosen || wasWrong
                          ? "var(--honey-tint)"
                          : "var(--cream)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 rounded-full"
                      style={{
                        width: px(24),
                        height: px(24),
                        border: `${Math.max(1, px(2))}px solid var(--ink)`,
                        background: chosen ? "var(--jam)" : "var(--cream)",
                      }}
                    />
                    {o.imagePath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={o.imagePath}
                        alt={o.imageAlt ?? ""}
                        className="w-auto shrink-0 object-contain"
                        style={{ maxHeight: px(64) }}
                      />
                    )}
                    {o.text && (
                      <span
                        ref={(el) => registerAnswer(o.id, el)}
                        className="min-w-0 flex-1 break-words text-left font-bold text-foreground"
                        style={{ fontSize: answerFont, textAlign: "left" }}
                      >
                        {o.text}
                      </span>
                    )}
                    {showCorrect && (
                      <span className="shrink-0 font-bold" style={{ color: "var(--glass)", fontSize: px(18) }} title="Correct answer">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
      </div>

      {author && selected && interactive && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(q.id)}
            className="pointer-events-auto absolute flex items-center justify-center rounded-full"
            style={{
              left: -22,
              top: -22,
              width: 44,
              height: 44,
              background: "var(--cream)",
              border: "3px solid var(--ink)",
              color: "var(--ink)",
              boxShadow: "0 4px 0 rgba(34,48,74,.15)",
            }}
            title="Remove question"
            aria-label="Remove question"
          >
            <Icon name="close" size={20} decorative />
          </button>
          <div
            onPointerDown={startResize}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="pointer-events-auto absolute cursor-nwse-resize touch-none rounded-full"
            style={{
              right: -22,
              bottom: -22,
              width: 44,
              height: 44,
              background: "var(--jam)",
              border: "3px solid var(--ink)",
              boxShadow: "0 4px 0 rgba(34,48,74,.15)",
            }}
            title="Resize"
            role="button"
            aria-label="Bigger or smaller: drag"
          />
        </>
      )}
    </div>
  );
}

// The corner launcher the panel tucks away into. Shown whenever the teacher is
// authoring a quiz but has closed the panel, so the quiz is always one tap away
// (the ＋ fan menu opens it too). Sits bottom-RIGHT: the design put it
// bottom-left, but that corner is the page-thumbnail strip in the real editor.
function QuizLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open the quiz builder"
      // Named distinctly from the ＋ fan menu's "Quiz" button, which opens the
      // same panel — two controls sharing one name is ambiguous by voice or
      // screen reader. Still contains the visible "Quiz" label (WCAG 2.5.3).
      aria-label="Open the quiz builder"
      className="absolute bottom-3 right-3 z-40 flex items-center gap-2 rounded-full bg-brand py-3 pl-4 pr-5 text-base font-bold text-white shadow-lg transition-transform hover:scale-105"
    >
      <Icon name="help" size={20} decorative /> Quiz
    </button>
  );
}

// The quiz authoring panel — a floating "wizard" the teacher can drag out of the
// way, shrink to a pill, or tuck into the corner launcher. Stays mounted
// regardless of the current page, so a quiz can be built across non-consecutive
// pages without losing the toolbox. Every question is listed, grouped by its
// page, and expands inline (one at a time) into its editor.
//
// The expanded question is the SAME `selectedId` the canvas uses, so opening one
// here highlights its box on the worksheet — and the box edits the same question
// through the same mutators. Marking the correct answer lives here ONLY; the
// worksheet box mirrors the marked answer but can't change it.
// The Quiz builder's BODY. Its window — the header, the drag, the shrink-to-a-
// pill, the close — is `FloatingWindow`, which the Maths kit uses too: they are
// the same object to a teacher and used to be two different applications.
function QuizPanelBody({
  u,
  questions,
  currentPage,
  pageCount,
  selectedId,
  onAddQuestion,
  onSelectQuestion,
  onUpdatePrompt,
  onDeleteQuestion,
  onAddOption,
  onRemoveOption,
  onOptionText,
  onOptionImage,
  onClearOptionImage,
  onSetCorrect,
}: {
  // Design px, with a floor in real px for anything a finger has to hit.
  u: (n: number, floor?: number) => number;
  questions: QuizQuestion[];
  currentPage: number;
  pageCount: number;
  selectedId: string | null;
  onAddQuestion: () => void;
  onSelectQuestion: (id: string | null) => void;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onDeleteQuestion: (id: string) => void;
  onAddOption: (qid: string) => void;
  onRemoveOption: (qid: string, oid: string) => void;
  onOptionText: (qid: string, oid: string, text: string) => void;
  onOptionImage: (qid: string, oid: string) => void;
  onClearOptionImage: (qid: string, oid: string) => void;
  onSetCorrect: (qid: string, oid: string) => void;
}) {
  // Questions grouped by the page they sit on, pages in order. A page only
  // appears once it has a question.
  const groups: { pageIndex: number; items: QuizQuestion[] }[] = [];
  for (const q of questions) {
    const g = groups.find((x) => x.pageIndex === q.pageIndex);
    if (g) g.items.push(q);
    else groups.push({ pageIndex: q.pageIndex, items: [q] });
  }
  groups.sort((a, b) => a.pageIndex - b.pageIndex);

  return (
      <div>
        <p style={{ font: `400 ${u(14)}px var(--font-atkinson)`, color: "var(--ink-soft)" }}>
          You&apos;re on <b>page {currentPage + 1} of {pageCount}</b>. Questions can go on any page.
        </p>
        <button
          type="button"
          onClick={onAddQuestion}
          style={{
            marginTop: u(8),
            width: "100%",
            height: u(48),
            borderRadius: 999,
            background: "var(--jam)",
            color: "var(--paper)",
            font: `600 ${u(17)}px var(--font-fredoka)`,
            boxShadow: `0 ${u(4)}px 0 #93304f`,
          }}
        >
          ＋ Add question to page {currentPage + 1}
        </button>

        {questions.length === 0 ? (
          <p className="mt-3 px-1 text-xs text-muted">No questions yet. Add one to get started.</p>
        ) : (
          groups.map((g) => (
            <div key={g.pageIndex} className="flex flex-col" style={{ gap: u(10) }}>
              <p
                className="m-0 uppercase"
                style={{
                  marginTop: u(6),
                  font: `700 ${u(13)}px var(--font-atkinson)`,
                  letterSpacing: ".08em",
                  color: "var(--glass-ink)",
                }}
              >
                Page {g.pageIndex + 1}
                {g.pageIndex === currentPage ? " · you're here" : ""}
              </p>

              {g.items.map((q, qi) => {
                const open = q.id === selectedId;
                const n = questions.indexOf(q) + 1;
                return (
                  // A card per question, always open: the design lists every
                  // answer so a teacher can see the whole quiz at once, and
                  // tapping a card selects its box and jumps to its page.
                  <div
                    key={q.id}
                    id={`quiz-q-${q.id}`}
                    data-question-card={qi}
                    onClick={() => onSelectQuestion(q.id)}
                    className="flex flex-col"
                    style={{
                      gap: u(8),
                      padding: u(10),
                      borderRadius: u(14),
                      border: `2px solid ${open ? "var(--ink)" : "var(--calm-border)"}`,
                      background: open ? "var(--honey-tint)" : "var(--cream)",
                    }}
                  >
                    <div className="flex items-center" style={{ gap: u(8) }}>
                      <span style={{ font: `600 ${u(15)}px var(--font-fredoka)`, color: "var(--ink)" }}>
                        Question {n}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteQuestion(q.id);
                        }}
                        aria-label="Remove question"
                        className="ml-auto flex items-center rounded-full"
                        style={{
                          gap: u(6),
                          height: u(36, 44),
                          padding: `0 ${u(10)}px`,
                          border: "2px solid var(--calm-border)",
                          background: "var(--cream)",
                          color: "var(--ink)",
                          font: `700 ${u(13)}px var(--font-atkinson)`,
                        }}
                      >
                        <Icon name="delete" size={u(16)} decorative /> Remove
                      </button>
                    </div>
                    <label className="sr-only" htmlFor={`quiz-prompt-${q.id}`}>
                      Question
                    </label>
                    <input
                      id={`quiz-prompt-${q.id}`}
                      value={q.prompt}
                      onChange={(e) => onUpdatePrompt(q.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="What do you want to ask?"
                      className="w-full outline-none"
                      style={{
                        padding: `${u(8)}px ${u(12)}px`,
                        border: "2px solid var(--calm-border)",
                        borderRadius: u(12),
                        background: "var(--cream)",
                        font: `600 ${u(16)}px var(--font-fredoka)`,
                        color: "var(--ink)",
                      }}
                    />
                    <p className="m-0" style={{ marginTop: u(4), font: `700 ${u(13)}px var(--font-atkinson)`, color: "var(--ink-soft)" }}>
                      Answers
                    </p>
                    <p className="m-0" style={{ marginTop: u(-4), font: `400 ${u(13)}px var(--font-atkinson)`, color: "var(--ink-soft)" }}>
                      Tap the circle to mark the right answer.
                    </p>
                    {q.options.map((o) => {
                      const correct = q.correctOptionId === o.id;
                      const cantRemove = q.options.length <= MIN_OPTIONS;
                      const small: React.CSSProperties = {
                        flex: "0 0 auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: u(36, 44),
                        height: u(36, 44),
                        borderRadius: 999,
                        border: "2px solid var(--calm-border)",
                        background: "var(--cream)",
                        color: "var(--ink)",
                      };
                      return (
                        <div key={o.id} className="flex items-center" style={{ gap: u(6) }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetCorrect(q.id, o.id);
                            }}
                            title="Mark as the correct answer"
                            aria-label={`Mark "${o.text || "this answer"}" as correct`}
                            aria-pressed={correct}
                            style={{ ...small, border: 0, background: "transparent" }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                display: "block",
                                width: u(24),
                                height: u(24),
                                borderRadius: 999,
                                border: "2px solid var(--ink)",
                                background: correct ? "var(--glass)" : "var(--cream)",
                              }}
                            />
                          </button>
                          {o.imagePath && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={o.imagePath}
                              alt={o.imageAlt ?? ""}
                              style={{ width: u(40), height: u(30), objectFit: "cover", borderRadius: u(6), border: "2px solid var(--ink)", flex: "0 0 auto" }}
                            />
                          )}
                          <input
                            value={o.text ?? ""}
                            onChange={(e) => onOptionText(q.id, o.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Type an answer"
                            aria-label="Answer text"
                            className="min-w-0 flex-1 outline-none"
                            style={{
                              padding: `${u(6)}px ${u(10)}px`,
                              border: "2px solid var(--calm-border)",
                              borderRadius: u(10),
                              background: "var(--cream)",
                              font: `400 ${u(15)}px var(--font-atkinson)`,
                              color: "var(--ink)",
                            }}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (o.imagePath) onClearOptionImage(q.id, o.id);
                              else onOptionImage(q.id, o.id);
                            }}
                            title={o.imagePath ? "Remove picture" : "Add a picture"}
                            aria-label={o.imagePath ? "Remove answer picture" : "Add answer picture"}
                            aria-pressed={!!o.imagePath}
                            style={
                              o.imagePath
                                ? { ...small, background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" }
                                : small
                            }
                          >
                            <Icon name="add-picture" size={u(18)} decorative />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveOption(q.id, o.id);
                            }}
                            aria-label="Remove answer"
                            disabled={cantRemove}
                            style={{ ...small, opacity: cantRemove ? 0.35 : 1 }}
                          >
                            <Icon name="close" size={u(16)} decorative />
                          </button>
                        </div>
                      );
                    })}
                    {q.options.length < MAX_OPTIONS && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddOption(q.id);
                        }}
                        className="self-start flex items-center rounded-full"
                        style={{
                          height: u(36, 44),
                          padding: `0 ${u(14)}px`,
                          border: "2px solid var(--ink)",
                          background: "var(--cream)",
                          color: "var(--ink)",
                          font: `700 ${u(14)}px var(--font-atkinson)`,
                        }}
                      >
                        ＋ Add answer
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
  );
}

// "Restore your unsaved work?" — shown on mount when a draft exists (local, or a
// newer one synced from another device). Keyboard-reachable, focus-trapped,
// ≥64px child touch targets.
function RestorePrompt({
  source,
  onRestore,
  onDiscard,
}: {
  source: "local" | "server";
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onDiscard();
      return;
    }
    if (e.key !== "Tab") return;
    const btns = ref.current?.querySelectorAll<HTMLButtonElement>("button");
    if (!btns || btns.length === 0) return;
    const first = btns[0];
    const last = btns[btns.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-restore-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="draft-restore-title" className="text-xl font-bold text-foreground">
          {source === "server" ? "Restore your work from another device?" : "Restore your unsaved work?"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {source === "server"
            ? "We found more recent work saved to your account. Carry on where you left off?"
            : "We kept what you were doing on this device. Carry on where you left off?"}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={onRestore} className="btn-brand min-h-[64px] w-full text-lg">
            Restore my work
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-[64px] w-full rounded-xl border-2 border-border text-base font-semibold text-muted hover:bg-background"
          >
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}

// "Ready to hand in?" — the child's last check before their work is submitted.
// The confirm button is a real form submit (this dialog lives inside the
// response form), so tapping it hands the work in; "Look again" just closes.
function ConfirmSubmitPrompt({ pageCount, onCancel }: { pageCount: number; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const btns = ref.current?.querySelectorAll<HTMLButtonElement>("button");
    if (!btns || btns.length === 0) return;
    const first = btns[0];
    const last = btns[btns.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-submit-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="text-4xl" aria-hidden>🎉</div>
        <h2 id="confirm-submit-title" className="mt-2 text-xl font-bold text-foreground">
          Ready to hand it in?
        </h2>
        <p className="mt-2 text-sm text-muted">
          {pageCount > 1
            ? `You have ${pageCount} pages. Check every page at the bottom first — tap each one to look again.`
            : "Have you finished? Check your work before you hand it in."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="submit" className="btn-green min-h-[64px] w-full text-lg">
            Yes, hand it in
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[64px] w-full rounded-xl border-2 border-border text-base font-semibold text-muted hover:bg-background"
          >
            Look again
          </button>
        </div>
      </div>
    </div>
  );
}
