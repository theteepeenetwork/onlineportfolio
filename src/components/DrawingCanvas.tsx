"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons/Icon";
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
  rotateStepFor,
  wrapRotation,
  type CanvasObj,
} from "@/lib/canvasObjects";
import { isStorableImageType } from "@/lib/imageTypes";
import { readAloudOnDevice } from "@/lib/readAloud";
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

const SWATCHES = [
  "#1f2430", "#ef4444", "#f97316", "#f59e0b", "#10b981",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff",
];
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
// eraser. See ToolShape for the drawn nibs and true-weight sample strokes.
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
  cursor: "#1f2430", // unused (move tool)
  pencil: "#1f2430", // Pen — black
  pen: "#3b82f6", // Felt tip — blue
  highlighter: "#f59e0b", // amber highlight
  eraser: "#1f2430", // unused (erases)
  text: "#1f2430", // black
};

const W = 1000;
const H = 700;
const FONT_STACK = "ui-rounded, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MAX_HISTORY = 30;
// See loadImage() for why an image load needs a deadline at all, and why this
// number is a backstop against a hang rather than a latency policy.
const IMAGE_LOAD_BUDGET_MS = 30_000;

// A quiz box is born at this size, and its contents are designed at it: the
// type sizes below are "at QUIZ_W × QUIZ_H". A resized box scales its contents
// from these, so they're the maximum rather than a fixed size.
const QUIZ_W = 380;
const QUIZ_H = 300;
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
//
// 15 stays HERE on purpose. The buttons are the coarse, exact control — the one
// for squaring something up to 90° — and every rung of the ladder divides both
// 45 and 90, so a press and a drag land on the same angles rather than on two
// different grids.
const ROTATE_STEP = 15;

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
  // Rotation in degrees, 0–359, set by the rotate handle. Applied to the object
  // WRAPPER, so the browser rotates hit-testing and the selection outline with
  // it, and honoured identically by the export renderer.
  rot?: number;
};

// Wrap + auto-size text to fit centred inside a box. Used both to render a
// shape's label and to draw it into the exported image, so they always match.
let measureCanvas: HTMLCanvasElement | null = null;
function fitTextToBox(
  text: string,
  boxW: number,
  boxH: number,
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

  for (let fontPx = Math.min(140, Math.floor(maxH)); fontPx >= 8; fontPx -= 2) {
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
type Obj = ImageObj | ShapeObj | TextObj;
type HistoryEntry = { img: string; objects: Obj[] };




export function DrawingCanvas({
  name,
  background,
  allowImport = false,
  fullScreen = false,
  title,
  subtitle,
  teacherNote,
  withCaption = false,
  captionLabel = "Add a caption",
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
  allowPageDelete = true,
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
  withCaption?: boolean;
  /**
   * The words above the caption box. A visible label, not a placeholder:
   * placeholder text vanishes the moment a child taps the box, taking the
   * instruction away exactly when they need it, and a screen reader was given
   * nothing at all. Child surfaces pass their own register's wording
   * (`studentCopy(mode).add.captionLabel`); the default is for the teacher's
   * preview.
   */
  captionLabel?: string;
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
  // Whether the "Delete page" control is offered. Pupils answering an assigned
  // activity get `false` so they can't remove the teacher's template pages.
  allowPageDelete?: boolean;
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
  const captionRef = useRef<HTMLInputElement>(null);
  // The caption's label needs an id to point at. Generated rather than fixed:
  // one full-screen canvas mounts at a time today, so a constant would work —
  // and would break the label association SILENTLY on the day two do.
  const captionId = useId();
  const [draftPrompt, setDraftPrompt] = useState<DraftCanvasV1 | null>(null);
  const [draftSource, setDraftSource] = useState<"local" | "server">("local");
  const draftFieldsRef = useRef<Record<string, string> | null>(null); // fields from a pending restore
  // Whether the restore question has been answered. Exists for the late
  // cross-device arrival in the restore-on-mount effect: once a person has
  // restored or discarded, nothing is allowed to change under them.
  const restoreDecidedRef = useRef(false);

  const drawing = useRef(false);
  const snapshot = useRef<ImageData | null>(null);
  const points = useRef<{ x: number; y: number }[]>([]);

  // Undo / redo: per page, a stack of { drawing layer, objects } snapshots.
  const undoRef = useRef<Record<number, HistoryEntry[]>>({});
  const redoRef = useRef<Record<number, HistoryEntry[]>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // A template (teacher building it, or a child working on it) opens on the
  // Select tool, so objects can be picked up and moved straight away.
  // A plain free-draw still opens ready to draw with the Pen.
  const [tool, setTool] = useState<Tool>(objectMode ? "cursor" : "pencil");
  // Per-tool colour, kept for the whole session. `color` is the active tool's
  // colour; changing it only affects the tool you're currently holding.
  const [toolColors, setToolColors] = useState<Record<Tool, string>>(DEFAULT_TOOL_COLORS);
  const color = toolColors[tool];
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
  const [quizPanelPos, setQuizPanelPos] = useState({ x: 80, y: 96 });
  const [quizPanelCollapsed, setQuizPanelCollapsed] = useState(false);
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
  const [stripOpen, setStripOpen] = useState(true);
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
  function refreshUndoRedo() {
    setCanUndo((undoRef.current[currentRef.current]?.length ?? 0) > 0);
    setCanRedo((redoRef.current[currentRef.current]?.length ?? 0) > 0);
  }
  function refreshThumbs() {
    setThumbs([...previewRef.current]);
  }

  // Flatten all layers (white → template → objects → strokes) into one PNG.
  // Flatten the current page. `includeObjects` overrides the mode default: the
  // object-free composite feeds the saved pages (author), while the Pages-panel
  // thumbnails force objects on for a true-to-life preview.
  function compositeCurrentPage(includeObjects?: boolean, forPreview?: boolean): string {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const exp = document.createElement("canvas");
    exp.width = W;
    exp.height = H;
    const ec = exp.getContext("2d");
    if (!ec) return canvas.toDataURL("image/png");
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
    return exp.toDataURL("image/png");
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
      const k = Math.min(1, q.w / QUIZ_W, q.h / QUIZ_H);
      const px = (n: number) => n * k;
      const pad = px(16);
      ec.save();
      // The box.
      ec.beginPath();
      ec.roundRect(q.x, q.y, q.w, q.h, px(24));
      ec.fillStyle = "#FFFDF7";
      ec.fill();
      ec.lineWidth = Math.max(1, px(3));
      ec.strokeStyle = "#E9C0CE";
      ec.stroke();

      // The question, wrapped by the same helper the shape labels use.
      const promptBox = { w: q.w - pad * 2, h: q.h * 0.3 };
      const fitted = fitTextToBox(q.prompt || "", promptBox.w, promptBox.h);
      ec.fillStyle = "#1f2430";
      ec.textAlign = "center";
      ec.textBaseline = "top";
      ec.font = `700 ${fitted.fontPx}px ${FONT_STACK}`;
      fitted.lines.forEach((line, i) =>
        ec.fillText(line, q.x + q.w / 2, q.y + pad + i * fitted.lineHeight),
      );

      // The answers, in the same one- or two-column grid the box uses.
      const twoCol = q.options.length > 2;
      const top = q.y + pad + Math.max(fitted.lines.length, 1) * fitted.lineHeight + px(10);
      const gap = px(8);
      const cols = twoCol ? 2 : 1;
      const rows = Math.ceil(q.options.length / cols);
      const cw = (q.w - pad * 2 - gap * (cols - 1)) / cols;
      const chB = Math.max(px(28), (q.y + q.h - pad - top - gap * (rows - 1)) / rows);
      ec.font = `600 ${px(20)}px ${FONT_STACK}`;
      ec.textBaseline = "middle";
      q.options.forEach((o, i) => {
        const cx = q.x + pad + (i % cols) * (cw + gap);
        const cy = top + Math.floor(i / cols) * (chB + gap);
        const picked = answersRef.current.get(q.id) === o.id;
        ec.beginPath();
        ec.roundRect(cx, cy, cw, chB, px(12));
        ec.fillStyle = picked ? "#F7E6EC" : "#ffffff";
        ec.fill();
        ec.lineWidth = Math.max(1, px(2));
        ec.strokeStyle = picked ? "#BD3F63" : "#E4DCC8";
        ec.stroke();
        if (o.text) {
          ec.fillStyle = "#1f2430";
          ec.fillText(o.text, cx + cw / 2, cy + chB / 2, cw - px(12));
        }
      });
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
      pagesRef.current[currentRef.current] = canvas.toDataURL("image/png");
      compositeRef.current[currentRef.current] = compositeCurrentPage();
      // ALWAYS object- AND quiz-inclusive, whatever the composite left
      // out. The preview is the picture of the page; the composite is
      // the data, and the two are allowed to differ.
      previewRef.current[currentRef.current] = compositeCurrentPage(true, true);
    }
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
  function serverPagesToCanvas(pages: string[]): DraftCanvasV1 {
    return {
      v: 1,
      pages: pages.map(() => ""),
      templates: [...pages],
      objects: pages.map(() => []),
      current: 0,
      anyDrawn: true,
      nextObjId: 0,
    };
  }

  function collectFields(): Record<string, string> {
    const fields = { ...(getExtraDraftFields?.() ?? {}) };
    if (withCaption && captionRef.current) fields.caption = captionRef.current.value;
    return fields;
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
    objectsRef.current = (canvas.objects as Obj[][]).map((pg) => pg.map((o) => ({ ...o })));
    anyDrawnRef.current = canvas.anyDrawn;

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
    await Promise.all(
      objectsRef.current.flat().map(async (o) => {
        if (o.type !== "image" || imgCacheRef.current.has(o.id)) return;
        try {
          imgCacheRef.current.set(o.id, await loadImage(o.src));
        } catch {
          /* image will simply not render */
        }
      }),
    );
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
    for (let i = 0; i < pagesRef.current.length; i++) {
      currentRef.current = i;
      if (c) {
        c.clearRect(0, 0, W, H);
        const si = strokeImgs[i];
        if (si) c.drawImage(si, 0, 0, W, H);
      }
      compositeRef.current[i] = compositeCurrentPage();
      // ALWAYS object- AND quiz-inclusive, whatever the composite left
      // out. The preview is the picture of the page; the composite is
      // the data, and the two are allowed to differ.
      previewRef.current[i] = compositeCurrentPage(true, true);
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
    setPageCount(pagesRef.current.length);
    setCurrent(currentRef.current);
    setObjects(objectsRef.current[currentRef.current] ?? []);
    setThumbs([...previewRef.current]);
    refreshUndoRedo();
    if (hiddenRef.current) {
      hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
    }
    flushPreviewField();
    loadingRef.current = false;
  }

  // Snapshot the current page (both layers) so the next change can be undone.
  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stack = (undoRef.current[currentRef.current] ??= []);
    stack.push({
      img: canvas.toDataURL("image/png"),
      objects: cloneObjs(objectsRef.current[currentRef.current] ?? []),
    });
    if (stack.length > MAX_HISTORY) stack.shift();
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
      currentRef.current = 0;

      // Hydrate the template's movable objects (per page). In "answer" mode they
      // are marked fromTemplate so a child's lock rules apply; a plain drawing
      // canvas (no initialObjects) starts empty.
      const seededObjects: Obj[][] = pagesRef.current.map((_, i) => {
        const page = initialObjects?.[i];
        if (!Array.isArray(page)) return [];
        return page.map((o) => ({ ...(o as Obj), fromTemplate: !isObjectAuthor }));
      });
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
      await Promise.all(
        seededObjects.flat().map(async (o) => {
          if (o.type !== "image" || imgCacheRef.current.has(o.id)) return;
          try {
            imgCacheRef.current.set(o.id, await loadImage(o.src));
          } catch {
            /* image will simply not render */
          }
        }),
      );

      setPageCount(pagesRef.current.length);

      // Initial composite per page: white + template, plus the objects flattened
      // in (except while authoring — there objects stay a separate layer).
      // Reuse compositeCurrentPage so the flatten path never drifts.
      clearCanvas(); // strokes start blank; compositeCurrentPage reads the live canvas
      compositeRef.current = [];
      previewRef.current = [];
      for (let i = 0; i < pagesRef.current.length; i++) {
        currentRef.current = i;
        compositeRef.current[i] = compositeCurrentPage();
        // ALWAYS object- AND quiz-inclusive, whatever the composite left
        // out. The preview is the picture of the page; the composite is
        // the data, and the two are allowed to differ.
        previewRef.current[i] = compositeCurrentPage(true, true);
      }
      currentRef.current = 0;

      clearCanvas(); // page 0's stroke layer starts blank
      setObjects(objectsRef.current[0] ?? []);
      if (hiddenRef.current) {
        hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
      }
      flushPreviewField();
      setThumbs([...previewRef.current]);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Has the person changed anything in this session? Every user edit goes through
  // pushHistory(), so a non-empty undo stack is the canvas's own record of "there
  // is work here now". hydrateFromDraft clears the stacks, so a restore does not
  // count as an edit. Used to make sure a late cross-device draft never opens a
  // dialog over work in progress.
  function hasUserEdits(): boolean {
    return Object.values(undoRef.current).some((stack) => (stack?.length ?? 0) > 0);
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
        chosen = serverPagesToCanvas(server.pages);
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
          const upgraded = serverPagesToCanvas(late.pages);
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
    if (f) {
      onRestoreFields?.(f);
      if (withCaption && captionRef.current && typeof f.caption === "string") {
        captionRef.current.value = f.caption;
      }
    }
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
    return loadImage(dataUrl)
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
  }

  function loadPage(index: number) {
    void paintDataUrl(pagesRef.current[index]);
  }

  function restore(entry: HistoryEntry) {
    objectsRef.current[currentRef.current] = entry.objects;
    setObjects([...entry.objects]);
    void paintDataUrl(entry.img).then(() => {
      pagesRef.current[currentRef.current] = entry.img;
      syncHidden();
      refreshThumbs();
      refreshUndoRedo();
    });
  }

  function undo() {
    const stack = undoRef.current[currentRef.current];
    if (!stack || !stack.length) return;
    const canvas = canvasRef.current!;
    (redoRef.current[currentRef.current] ??= []).push({
      img: canvas.toDataURL("image/png"),
      objects: cloneObjs(objectsRef.current[currentRef.current] ?? []),
    });
    setSelectedId(null);
    restore(stack.pop()!);
  }

  function redo() {
    const stack = redoRef.current[currentRef.current];
    if (!stack || !stack.length) return;
    const canvas = canvasRef.current!;
    (undoRef.current[currentRef.current] ??= []).push({
      img: canvas.toDataURL("image/png"),
      objects: cloneObjs(objectsRef.current[currentRef.current] ?? []),
    });
    setSelectedId(null);
    restore(stack.pop()!);
  }

  function goToPage(index: number) {
    if (index < 0 || index >= pagesRef.current.length || index === currentRef.current) return;
    finishEditing();
    syncHidden();
    currentRef.current = index;
    setCurrent(index);
    setSelectedId(null);
    setObjects(objectsRef.current[index] ?? []);
    loadPage(index);
    refreshUndoRedo();
  }

  function addPage() {
    finishEditing();
    syncHidden();
    clearCanvas();
    const blank = canvasRef.current!.toDataURL("image/png"); // transparent strokes
    pagesRef.current.push(blank);
    templatesRef.current.push(null);
    objectsRef.current.push([]);
    const index = pagesRef.current.length - 1;
    currentRef.current = index;
    compositeRef.current[index] = compositeCurrentPage(); // white
    previewRef.current[index] = compositeRef.current[index]; // fresh page has no objects
    setPageCount(pagesRef.current.length);
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
  function duplicatePageAt(target: number) {
    if (target < 0 || target >= pagesRef.current.length) return;
    finishEditing();
    // Bake the page on screen first, so duplicating a DIFFERENT page never
    // drops the in-progress work on the one being viewed.
    syncHidden();
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
    setQuizQuestions([...quizRef.current]);

    // Page indices shift, so drop the (now-misaligned) history — the same rule
    // deleting a page follows.
    undoRef.current = {};
    redoRef.current = {};
    currentRef.current = at;
    setPageCount(pagesRef.current.length);
    setCurrent(at);
    setSelectedId(null);
    setObjects(objectsRef.current[at] ?? []);
    loadPage(at);
    anyDrawnRef.current = true;
    syncHidden();
    refreshThumbs();
    refreshUndoRedo();
  }

  // Move a page one place up or down the strip.
  //
  // A page is not one thing. It is an entry in five parallel arrays plus a set
  // of quiz questions that know which page they are on BY INDEX, and a reorder
  // that moved four of the five would look right and hand in wrong. So this
  // follows the same order duplicate and delete do, for the same reasons.
  function movePageBy(index: number, delta: number) {
    const target = index + delta;
    if (index < 0 || index >= pagesRef.current.length) return;
    if (target < 0 || target >= pagesRef.current.length) return;
    finishEditing();
    // Bake the page on screen first, so reordering from a DIFFERENT page never
    // drops the in-progress work on the one being viewed.
    syncHidden();

    const swap = <T,>(arr: T[]) => {
      const t = arr[index];
      arr[index] = arr[target];
      arr[target] = t;
    };
    swap(pagesRef.current);
    swap(templatesRef.current);
    swap(objectsRef.current);
    swap(compositeRef.current);
    swap(previewRef.current);

    // The questions swap with their pages. This is the part a naive reorder
    // silently breaks: the pictures move and the questions stay behind.
    quizRef.current = quizRef.current.map((q) =>
      q.pageIndex === index
        ? { ...q, pageIndex: target }
        : q.pageIndex === target
          ? { ...q, pageIndex: index }
          : q,
    );
    setQuizQuestions([...quizRef.current]);

    // Page indices moved, so drop the (now-misaligned) history — the same rule
    // duplicate and delete follow.
    undoRef.current = {};
    redoRef.current = {};
    // Stay with the page that moved rather than with the position it left, so
    // a teacher can press the same button again to keep going.
    currentRef.current = target;
    setPageCount(pagesRef.current.length);
    setCurrent(target);
    setSelectedId(null);
    setMultiIds([]);
    setObjects(objectsRef.current[target] ?? []);
    loadPage(target);
    syncHidden();
    refreshThumbs();
    refreshUndoRedo();
  }

  // Delete a specific page (by index). Used by the per-thumbnail delete cross,
  // so it can remove any page — not only the one on screen.
  function deletePageAt(target: number) {
    if (pagesRef.current.length <= 1) return;
    if (target < 0 || target >= pagesRef.current.length) return;
    finishEditing();
    // Bake the page on screen first, so deleting a DIFFERENT page never drops
    // the in-progress work on the page you're currently viewing.
    syncHidden();
    pagesRef.current.splice(target, 1);
    templatesRef.current.splice(target, 1);
    objectsRef.current.splice(target, 1);
    compositeRef.current.splice(target, 1);
    previewRef.current.splice(target, 1);
    // Page indices shift, so drop the (now-misaligned) history.
    undoRef.current = {};
    redoRef.current = {};
    // Keep the viewer on the same page where possible: a page removed at or
    // before the current one shifts the current index back by one; a page
    // removed after it leaves the current index alone.
    let index = target <= currentRef.current ? currentRef.current - 1 : currentRef.current;
    index = Math.max(0, Math.min(index, pagesRef.current.length - 1));
    currentRef.current = index;
    setPageCount(pagesRef.current.length);
    setCurrent(index);
    setSelectedId(null);
    setObjects(objectsRef.current[index] ?? []);
    loadPage(index);
    syncHidden();
    refreshThumbs();
    refreshUndoRedo();
  }

  // Delete the page currently on screen (the inline layout's "Delete page").
  function deletePage() {
    deletePageAt(currentRef.current);
  }

  function clearPage() {
    finishEditing();
    pushHistory();
    clearCanvas();
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
  function addShape(preset: ShapePreset) {
    pushHistory();
    const id = `o${objIdRef.current++}`;
    const w = preset.w ?? SHAPE_DEFAULTS.w;
    const h = preset.h ?? SHAPE_DEFAULTS.h;
    const obj: ShapeObj = {
      id,
      type: "shape",
      shape: preset.kind,
      x: (W - w) / 2,
      y: (H - h) / 2,
      w,
      h,
      fill: preset.fill ?? SHAPE_DEFAULTS.fill,
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
    };
    const list = [...(objectsRef.current[currentRef.current] ?? []), obj];
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    anyDrawnRef.current = true;
    setSelectedId(id);
    setTool("cursor"); // so it can be positioned straight away
    setOpenKit(null);
    setFanOpen(false);
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
        { label: "Move up", onSelect: () => movePageBy(i, -1), disabled: i === 0 },
        {
          label: "Move down",
          onSelect: () => movePageBy(i, 1),
          disabled: i >= pagesRef.current.length - 1,
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

  // Update the text of a text object while it's being typed.
  function updateText(id: string, text: string) {
    updateObject(id, { text });
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
    return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", 0.9);
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
            await addObject(tmp.toDataURL("image/png"), p > 1);
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
    setQuizPanelCollapsed(false);
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
      x: (W - QUIZ_W) / 2,
      y: (H - QUIZ_H) / 2,
      w: QUIZ_W,
      h: QUIZ_H,
      prompt: "",
      options,
      correctOptionId: "opt0",
    };
    quizRef.current = [...quizRef.current, q];
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
      return { ...q, options: [...q.options, { id: oid }] };
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
      return { ...q, options, correctOptionId };
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
    </>
  );

  // Declared once because its position in the tool row changes (see below).
  const clearPageBtn = (
    <RoundBtn label="Clear page" onClick={clearPage}><Icon name="delete" size={20} decorative /></RoundBtn>
  );

  // ---- Full-screen, child-led layout ---------------------------------------
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-[#e9ebf1]">
        {hiddenInputs}
        {draftPrompt && (
          <RestorePrompt source={draftSource} onRestore={restoreDraft} onDiscard={discardDraft} />
        )}
        {confirmingSubmit && (
          <ConfirmSubmitPrompt pageCount={pageCount} onCancel={() => setConfirmingSubmit(false)} />
        )}

        <div
          ref={wrapRef}
          // `select-none` on the stage, not on each thing inside it: a drag that
          // starts on a shape and ends over the page title would otherwise sweep a
          // blue highlight across everything it crossed. A canvas is a surface, and
          // nothing on it is text to be selected.
          className="relative flex-1 select-none overflow-hidden [-webkit-touch-callout:none]"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative select-none rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden"
              style={{ width: box.w, height: box.h }}
            >
              {stage}
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-muted">
                  Loading…
                </div>
              )}
            </div>
          </div>

          {/* Top left: the way out, then the tools under it.
              A child's escape goes HERE rather than beside the ✓ for two
              reasons. It is not the same kind of thing as handing in, and two
              64px controls side by side, one of which ends the work, is a
              mis-tap that costs a child their turn. And it is the only place
              the words fit: on a 768px classroom tablet a labelled pill on the
              right runs under the activity's own title, which a long title then
              collides with (asserted in tests/e2e/child-escape.spec.ts).
              Stacking keeps the left group no wider than the tool row it
              already had, so the title keeps its room. */}
          <div className="absolute left-3 top-3 flex flex-col items-start gap-3">
            {onClose && closeLabel && (
              <button
                type="button"
                onClick={onClose}
                // 64px tall, like every other control a child taps
                // (SAFEGUARDING rule 18, F37).
                className="flex h-16 items-center gap-2 whitespace-nowrap rounded-full bg-white/90 px-5 text-base font-bold text-foreground shadow transition-colors hover:bg-white"
              >
                <span aria-hidden="true">←</span>
                {closeLabel}
              </button>
            )}
            <div className="flex gap-2">
              {/* "Clear page" moves to the end of the row when a child's way
                  out sits directly above it: the control nearest the escape
                  must not be the one that wipes their work. Undo is the safe
                  neighbour. The editor's row is unchanged. */}
              {!closeLabel && clearPageBtn}
              <RoundBtn label="Undo" onClick={undo} disabled={!canUndo}><Icon name="undo" size={20} decorative /></RoundBtn>
              <RoundBtn label="Redo" onClick={redo} disabled={!canRedo}><Icon name="redo" size={20} decorative /></RoundBtn>
              {closeLabel && clearPageBtn}
            </div>
          </div>

          {/* The title strip lives BETWEEN the two corners rather than across
              the whole width. `left-56` / `right-56` is 224px, which clears the
              widest either corner gets: the tool row is 12 + 3×64 + 2×8 = 220,
              and a labelled escape pill is narrower than that.

              It used to be 60vw centred, which on a 768px tablet reached from
              154 to 614 and so ran underneath both corners. That was invisible
              while the strip held one line of small title text, and stopped
              being invisible the moment a child's way out took a second row on
              the left: the teacher's note on a sent-back piece renders in this
              strip, is `max-w-md` and `pointer-events-auto`, and sat on top of
              Undo, Redo and Clear page — covering them AND swallowing the taps.
              The child most likely to be looking for the way out is the one who
              has just had work sent back, so that is the worst version of it.

              Reserving the corners fixes it for every width at once, rather
              than for the one someone thought to measure. */}
          <div className="pointer-events-none absolute left-56 right-56 top-3 z-10 text-center">
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-amber-400 bg-white/90 px-3 py-1 text-sm font-bold text-amber-700">
              <Icon name="edit" size={14} decorative /> Draft
            </span>
            {title && <p className="mt-1 text-sm font-bold text-foreground/80">{title}</p>}
            {subtitle && <p className="text-xs text-foreground/60">{subtitle}</p>}
            {/* The teacher's note, on the work itself. `pointer-events-auto`
                because the wrapper above is deliberately click-through and this
                is the one thing in it a child presses. */}
            {teacherNote && (
              <div className="pointer-events-auto mx-auto mt-2 max-w-md text-left">
                <TeacherNote note={teacherNote} mode="KS1" compact />
              </div>
            )}
          </div>

          <div className="absolute right-3 top-3 flex items-center gap-2">
            {/* The ✕ is the EDITOR's way out (a teacher closing a template).
                A child's is a labelled pill, top left — see the left-hand
                group and `closeLabel` for why it is not here, next to the ✓. */}
            {onClose && !closeLabel && (
              <RoundBtn label="Close" onClick={onClose}><Icon name="close" size={20} decorative /></RoundBtn>
            )}
            <button
              type={onDone || confirmSubmit ? "button" : "submit"}
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
              title={nextPage ? "Next page" : "Done"}
              aria-label={nextPage ? "Next page" : "Done"}
              className={`flex h-16 items-center justify-center gap-1.5 rounded-full bg-emerald-500 text-white shadow-lg transition-transform hover:scale-105 hover:bg-emerald-600 ${
                nextPage ? "px-5 text-lg font-bold" : "w-16 text-2xl"
              }`}
            >
              {nextPage ? "Next ›" : "✓"}
            </button>
          </div>

          <div className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col items-start gap-2">
            {fanOpen && (
              <div className="flex w-44 flex-col gap-2">
                <FanBtn label="Photo / PDF" onClick={() => fileRef.current?.click()}><Icon name="add-picture" size={26} decorative /></FanBtn>
                <FanBtn label="Text" onClick={() => { setFanOpen(false); setTool("text"); }}><Icon name="text" size={26} decorative /></FanBtn>
                {availableKits.map((kit) => (
                  <FanBtn
                    key={kit.id}
                    label={kit.label}
                    onClick={() => toggleKit(kit.id)}
                  >
                    <Icon name={KIT_ICON[kit.id]} size={26} decorative />
                  </FanBtn>
                ))}
                {isQuizAuthor && (
                  <FanBtn label="Quiz" onClick={() => { setFanOpen(false); setOpenKit(null); setTool("cursor"); openQuizPanel(); }}><Icon name="help" size={26} decorative /></FanBtn>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => openAddMenu(!fanOpen)}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-3xl font-light text-white shadow-lg transition-transform hover:scale-105"
              title={fanOpen ? "Close" : "Add"}
              aria-label={fanOpen ? "Close add menu" : "Add"}
            >
              {fanOpen ? <Icon name="close" size={26} decorative /> : "＋"}
            </button>
          </div>

          {openKit && (
            // Sits to the right of the (labelled) add menu so the two don't
            // overlap. Capped in height and scrollable, because a kit's tallest
            // group must not run off the top and bottom of a 768px-tall iPad.
            <div className="absolute left-52 top-1/2 max-h-[80%] -translate-y-1/2 overflow-y-auto">
              {palette(availableKits.find((k) => k.id === openKit) ?? availableKits[0])}
            </div>
          )}

          {/* Only once there is a quiz to go back to. The way IN is the ＋ menu;
              this is the way back, and a shortcut to a panel that has nothing
              in it is a button that has to be explained. */}
          {isQuizAuthor && !quizPanelOpen && quizQuestions.length > 0 && (
            <QuizLauncher onOpen={openQuizPanel} />
          )}

          {isQuizAuthor && quizPanelOpen && (
            <QuizPanel
              questions={quizQuestions}
              currentPage={current}
              pageCount={pageCount}
              selectedId={selectedQuestionId}
              pos={quizPanelPos}
              collapsed={quizPanelCollapsed}
              onPosChange={setQuizPanelPos}
              onCollapsedChange={setQuizPanelCollapsed}
              onClose={() => setQuizPanelOpen(false)}
              onAddQuestion={addQuestion}
              onSelectQuestion={(id) => {
                // Opening a question jumps to the page it lives on, so the box
                // being edited is always the one on screen. Collapsing it (null)
                // shouldn't move the teacher anywhere.
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
          )}

          {/* What the pen in hand is set to. Sits above the tray the pens
              stick up from, so the thing being changed and the thing doing the
              changing are next to each other. */}
          {drawingTool && toolBarOpen && (
            <ToolProperties
              color={color}
              size={size}
              isEraser={tool === "eraser"}
              canMove={canMove}
              onClose={() => setToolBarOpen(false)}
              onColor={setColor}
              onSize={setSize}
              onMove={() => { finishEditing(); setTool("cursor"); }}
            />
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-2">
            {SHELF.filter((t) => t.key !== "cursor" || canMove).map((t) => {
              const selected = tool === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  // Picking a pen is what shows what that pen is set to. It
                  // goes again on the next touch of the page, so it is never a
                  // thing sitting over a child's work waiting to be tidied
                  // away — which is what a permanent pill amounted to.
                  onClick={() => {
                    finishEditing();
                    setTool(t.key);
                    setToolBarOpen(t.key !== "cursor");
                  }}
                  // The pen a child sees is unchanged; the button around it is
                  // 64px wide (rule 18, F37) — the tools were 58, which is a
                  // miss for a four-year-old aiming with a whole finger.
                  className="pointer-events-auto flex min-w-16 flex-col items-center transition-transform duration-150"
                  style={{ transform: `translateY(${selected ? 34 : 68}px)` }}
                  title={t.key === "cursor" ? "Move — drag & resize things" : t.label}
                  aria-label={t.label}
                  aria-pressed={selected}
                >
                  <ToolShape kind={t.key} color={toolColors[t.key]} />
                </button>
              );
            })}
          </div>

          {/* Told in the design system's own colours, not a stock utility.
              `bg-amber-500` is used nowhere else in the app, so it was never
              generated into the stylesheet — which left white text on a
              transparent pill: a message a child could not read, on the one
              screen where they are stuck and need telling why. Inline styles
              off the tokens cannot fail that way, and honey-on-ink is the pair
              the palette already reserves for "wait a moment". */}
          {holdUp && (
            <div
              role="status"
              className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2"
              style={{
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
              className={`absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-lg px-3 py-2 text-sm font-semibold shadow-lg ${
                importError ? "bg-rose-600 text-white" : "bg-white text-foreground"
              }`}
            >
              {importError ?? "Adding your file…"}
            </div>
          )}

          {selectedId && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-muted shadow">
              Drag to move · pull a corner to resize or turn it
            </div>
          )}

          {withCaption && (
            <div className="absolute bottom-3 left-3 w-64 max-w-[70vw]">
              <label
                htmlFor={captionId}
                className="mb-1 inline-block rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-foreground shadow"
              >
                {captionLabel}
              </label>
              {/* min-h-16: a child taps into this to say what their picture is,
                  so it carries the same 64px floor as everything else here. */}
              <input
                id={captionId}
                ref={captionRef}
                name="caption"
                className="input min-h-16 bg-white/90 shadow"
                placeholder="💬 Add a caption…"
              />
            </div>
          )}

          {/* Pages sit on the right, but nudged in from the edge so the strip
              clears the hue (colour) bar instead of sitting behind it. */}
          <div className="absolute right-16 top-20 flex flex-col items-end">
            <button
              type="button"
              onClick={() => setStripOpen((v) => !v)}
              className="mb-1.5 flex min-h-16 items-center rounded-full bg-white px-5 text-sm font-bold text-foreground shadow ring-1 ring-black/5"
            >
              {stripOpen ? "Pages ›" : "‹ Pages"}
            </button>
            {stripOpen && (
              // A greyer tray so each (white) page preview reads as its own tile;
              // thumbnails keep a fixed size (shrink-0) so adding pages makes this
              // column SCROLL rather than squashing every preview smaller. Each is
              // numbered in the corner so its place in the order is obvious.
              // w-28, not w-24: at 96px the 10:7 page tiles came out 57px tall,
              // under the child floor (F37). The extra 16px of column is what
              // buys a tile a child can actually hit.
              <div className="flex max-h-[42vh] w-28 flex-col gap-2 overflow-y-auto rounded-xl bg-slate-400/40 p-2 shadow-inner ring-1 ring-black/10">
                {thumbs.map((src, i) => (
                  <div
                    key={i}
                    className="relative shrink-0"
                    onContextMenu={allowPageStructure ? (e) => openPageMenu(e, i) : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => goToPage(i)}
                      aria-current={i === current ? "true" : undefined}
                      className={`block w-full overflow-hidden rounded-lg border-2 bg-white shadow-sm ${i === current ? "border-brand" : "border-white"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Page ${i + 1}`} className="aspect-[10/7] w-full object-cover" />
                      {/* Decorative — the image's alt already names the page. */}
                      <span aria-hidden="true" className="absolute bottom-0.5 right-0.5 min-w-[16px] rounded bg-foreground/75 px-1 text-center text-[10px] font-bold leading-[15px] text-white">
                        {i + 1}
                      </span>
                    </button>
                    {/* Delete this page — same red cross as the shape/object delete. */}
                    {allowPageDelete && pageCount > 1 && (
                      <button
                        type="button"
                        onClick={() => deletePageAt(i)}
                        className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow ring-2 ring-white transition-transform hover:scale-105"
                        title="Delete page"
                        aria-label={`Delete page ${i + 1}`}
                      >
                        <Icon name="close" size={13} decorative />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPage}
                  className="flex aspect-[10/7] min-h-16 w-full shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-500/50 bg-white/40 text-lg text-slate-600"
                  title="Add page"
                >
                  ＋
                </button>
                {/* Copy the page on screen. A full-width control rather than a
                    cross on the thumbnail, because a thumbnail is smaller than
                    the 64px a child's finger is owed (rule 18) and nothing that
                    has to be pressed is allowed to be smaller than that.
                    Behind the same gate as delete, not the same one as ＋ Add:
                    a pupil answering an assigned activity gets no way to make
                    more copies of the teacher's template pages (rule 8, deny by
                    default). */}
                {allowPageStructure && (
                  <button
                    type="button"
                    onClick={() => duplicatePageAt(currentRef.current)}
                    className="flex h-16 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border-2 border-slate-500/50 bg-white/70 px-2 text-xs font-bold text-slate-700"
                    title="Make a copy of this page"
                    aria-label="Duplicate this page"
                  >
                    <Icon name="duplicate" size={18} decorative /> Copy
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Inline layout (teacher on-behalf drawing) ---------------------------
  return (
    <div>
      {hiddenInputs}

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
        {allowPageDelete && pageCount > 1 && (
          <button type="button" onClick={deletePage} className="px-3 py-1.5 text-sm text-muted hover:text-rose-600">Delete page</button>
        )}
      </div>
    </div>
  );
}

function RoundBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      // 64px, not 44 (F37). SAFEGUARDING rule 18 asks for 64 on anything a child
      // taps, and every tool on this canvas was under it — a screen a child is
      // on for most of their time in Storyjar. The ICON is unchanged; the box
      // around it grew, which is the cheapest way to owe a child a target they
      // can hit without spending the drawing space on bigger glyphs.
      className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-lg text-foreground shadow transition-colors hover:bg-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// A palette button's art. Drawn from the same shapeParts the canvas renders
// with, so a button can never show something the canvas doesn't draw — and so
// apparatus with no Unicode glyph (a base-10 rod) needs no hand-drawn icon.
//
// The preview keeps the preset's PROPORTIONS inside a square box, letting the
// long side fill it. Without that every base-10 button would be the same square
// and a ten rod would be indistinguishable from a hundred flat.
function ShapeThumb({ preset }: { preset: ShapePreset }) {
  const PX = 26;
  const pw = preset.w ?? SHAPE_DEFAULTS.w;
  const ph = preset.h ?? SHAPE_DEFAULTS.h;
  const scale = PX / Math.max(pw, ph);
  // A number line is 4 units tall against 700 wide; drawn to scale it would be
  // invisible, so very thin presets get a floor.
  const w = Math.max(pw * scale, isVectorKind(preset.kind) ? 0 : 3);
  const h = Math.max(ph * scale, isVectorKind(preset.kind) ? 2 : 3);
  const geom = {
    shape: preset.kind,
    w,
    h,
    cols: preset.cols,
    rows: preset.rows,
    parts: preset.parts,
    operator: preset.operator,
    sides: preset.sides,
    // A 26px button cannot show a readable number, and unreadable ones read as
    // dirt on the glyph. The ticks are what tell one line from another at this
    // size anyway — and the clock's thumb has always shown a blank face for the
    // same reason.
    numerals: false,
    // Ten ticks across 26px is a dotted line, not a number line. The button is
    // saying "this is a ruled line", so it shows few enough ticks to read as
    // one; the real count is a stepper away.
    ...(preset.kind === "numberline" ? { parts: 4 } : {}),
  };
  return (
    <svg
      viewBox={`${-(PX - w) / 2} ${-(PX - h) / 2} ${PX} ${PX}`}
      width={PX}
      height={PX}
      aria-hidden="true"
      className="overflow-visible"
    >
      {shapeParts(geom).map((part, i) => (
        <path
          key={i}
          d={part.d}
          fill={part.role === "detail" || preset.fill === "none" ? "none" : preset.fill ?? SHAPE_DEFAULTS.fill}
          fillRule={shapeFillRule(preset.kind)}
          stroke={preset.stroke ?? SHAPE_DEFAULTS.stroke}
          strokeWidth={part.role === "detail" ? 0.4 : 1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {preset.text && (
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={preset.text.length > 2 ? 7 : 10}
          fontWeight="700"
          fill="#1f2430"
          stroke="none"
        >
          {preset.text}
        </text>
      )}
    </svg>
  );
}

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
function ToolProperties({
  color,
  size,
  isEraser,
  canMove,
  onClose,
  onColor,
  onSize,
  onMove,
}: {
  color: string;
  size: number;
  isEraser: boolean;
  canMove: boolean;
  onClose: () => void;
  onColor: (c: string) => void;
  onSize: (n: number) => void;
  onMove: () => void;
}) {
  // It shows because a pen was just picked, and goes when the canvas is touched
  // — so it is never a thing sitting on the page waiting to be tidied away. The
  // parent owns that, because picking the pen is what opens it.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    // Capture, because the bar stops propagation on its own pointers so a
    // stroke does not start underneath it.
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const heading = "whitespace-nowrap text-xs font-extrabold uppercase tracking-wide text-muted";

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute left-1/2 z-30 flex max-w-[92%] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border-2 border-border bg-surface px-5 py-3 shadow-lg"
      style={{ bottom: 116 }}
    >
      {!isEraser && (
        <div className="flex items-center gap-3">
          <span className={heading}>Pen colour</span>
          <div className="flex items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColor(c)}
                // 64px of press around a 44px dot: the dot is what a child
                // sees, the press is what they can hit (rule 18).
                className="flex h-16 w-16 items-center justify-center rounded-full"
                aria-label={`Colour ${c}`}
                aria-pressed={color.toLowerCase() === c.toLowerCase()}
              >
                <span
                  // The ring is what makes white a colour rather than a gap in
                  // the row: on a cream bar a white dot with a white border is
                  // nothing at all.
                  className="block h-11 w-11 rounded-full border-4 ring-1 ring-black/15"
                  style={{
                    backgroundColor: c,
                    borderColor: color.toLowerCase() === c.toLowerCase() ? "#1f2430" : "#ffffff",
                  }}
                />
              </button>
            ))}
            {/* Anything the row does not carry. The rainbow ring says "any
                colour" without pretending to be a colour itself. */}
            <label
              className="relative flex h-16 w-16 cursor-pointer items-center justify-center rounded-full"
              title="Pick any colour"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white ring-1 ring-black/15"
                style={{
                  background: "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)",
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-foreground">
                  +
                </span>
              </span>
              {/* The input fills the whole 64px press, not the 44px dot inside
                  it. Left to itself a colour input takes its own intrinsic
                  50×27, which is under the child touch floor however big the
                  thing drawn behind it is. */}
              <input
                type="color"
                value={color}
                onChange={(e) => onColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Pick any colour"
              />
            </label>
          </div>
        </div>
      )}

      {!isEraser && <Rule />}

      <div className="flex items-center gap-3">
        <span className={heading}>How thick</span>
        <div className="flex items-center gap-1.5">
          {SIZES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onSize(n)}
              className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 ${
                size === n ? "border-foreground bg-background" : "border-transparent"
              }`}
              aria-label={`Thickness ${n}`}
              aria-pressed={size === n}
            >
              <span
                className="block rounded-full bg-foreground"
                style={{ width: Math.max(8, n * 1.6), height: Math.max(8, n * 1.6) }}
              />
            </button>
          ))}
        </div>
      </div>

      {canMove && <Rule />}
      {canMove && (
        <div className="flex items-center gap-3">
          <span className={heading}>Move things</span>
          <button
            type="button"
            onClick={onMove}
            className="flex h-16 items-center gap-2 rounded-2xl border-2 border-border px-4 text-base font-bold text-foreground"
            aria-label="Move — drag & resize things"
          >
            <Icon name="point" size={22} decorative /> Hand
          </button>
        </div>
      )}
    </div>
  );
}

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

function FanBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-full bg-white py-2 pl-2 pr-5 text-left text-base font-bold text-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-background text-foreground">{children}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

// The picker-cup tools, drawn tip-up on the design system's 36×88 keyline. Each
// pen shows ITS OWN stored colour on the whole body + nib — always, whether or
// not it's the one in use — so you can see at a glance that (say) the Pen is
// still yellow while you're drawing with the Felt tip. Tools stay distinct by
// nib shape and tray position. The Eraser is colourless (it rubs out).
function ToolShape({ kind, color }: { kind: Tool; color: string }) {
  const svg = {
    width: 58,
    height: 142,
    viewBox: "0 0 36 88",
    fill: "none" as const,
    stroke: "#22304A",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "cursor") {
    // The arrow (icon library's "select"), stood up at pen scale. It's a
    // shorter shape than the pens, so it sits whole on the shelf rather than
    // sinking to a nib — the lift on pick is what marks it as the live tool.
    //
    // A hand was tried here and reverted: it didn't read well on the shelf. The
    // tool is still called Move (aria-label, tooltip) and — the part that
    // actually protects a child — it is only OFFERED when there is something to
    // move, so a wrong tap can no longer leave a child holding a tool that does
    // nothing. See SHELF and `canMove`.
    return (
      <svg {...svg}>
        <g transform="translate(-15 7)">
          <path d="M18 13 L18 55 L28 46 L34 60 L41 57 L35 43 L48 43 Z" fill="#FFFDF7" />
        </g>
      </svg>
    );
  }
  if (kind === "eraser") {
    return (
      <svg {...svg}>
        <path d="M11 32 Q11 24 18 24 Q25 24 25 32 L25 79 Q25 83 18 83 Q11 83 11 79 Z" fill="#8AB9D6" />
        <path d="M11 42 L25 34 L25 32 Q25 24 18 24 Q11 24 11 32 Z" fill="#E08A9B" />
        <rect x="9.5" y="52" width="17" height="12" rx="2" fill="#F3E3C3" />
      </svg>
    );
  }
  if (kind === "highlighter") {
    return (
      <svg {...svg}>
        <path d="M9 38 L27 38 L27 79 Q27 83 18 83 Q9 83 9 79 Z" fill={color} />
        <path d="M11 38 L11 30 Q11 28 13 27.5 L23 27.5 Q25 28 25 30 L25 38 Z" fill={color} />
        <path d="M12 27.5 L24 27.5 L24 23 L12 23 Z" fill="#FFFDF7" />
        <path d="M12 23 L24 23 L21.5 9 L13.5 12 Z" fill={color} />
      </svg>
    );
  }
  if (kind === "pen") {
    // Felt tip — bold marker.
    return (
      <svg {...svg}>
        <path d="M11 36 L25 36 L25 79 Q25 83 18 83 Q11 83 11 79 Z" fill={color} />
        <path d="M11 36 L11 30 Q11 27.5 13 27 L23 27 Q25 27.5 25 30 L25 36 Z" fill="#FFFDF7" />
        <path d="M13.6 27 L14.6 16 Q14.6 12 18 12 Q21.4 12 21.4 16 L22.4 27 Z" fill={color} />
      </svg>
    );
  }
  // Pen — fine liner.
  return (
    <svg {...svg}>
      <path d="M12 33 L24 33 L24 79 Q24 83 18 83 Q12 83 12 79 Z" fill={color} />
      <path d="M13 33 L18 11 L23 33 Z" fill="#FFFDF7" />
      <path d="M16.1 18 L18 9 L19.9 18 Z" fill={color} />
      <path d="M24 37 Q27.5 37 27.5 42 L27.5 55 Q27.5 57.5 25 57" />
      <line x1="12" y1="41" x2="24" y2="41" />
    </svg>
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
  onTurn,
  onSize,
  onDuplicate,
  canDuplicate,
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
  /**
   * Turn and resize as a press, one coarse step at a time.
   *
   * The corner handles are drags, and until F50 a drag was the ONLY way to turn
   * or resize anything — so neither could be done from a keyboard at all, on
   * controls that announced themselves as buttons. These are the discoverable
   * half of the answer: real buttons, in the place a child already looks for
   * what they can do to a thing they have tapped.
   *
   * Deliberately the coarse 15°, not the object's own finer step: this is the
   * control for squaring something up, and asking a child to press it thirty
   * times to reach a right angle on a long line would be its own bad screen.
   * The fine path is the handle, which now takes arrow keys.
   *
   * `onTurn` is absent where turning is not offered — a picture has no `rot`.
   */
  onTurn?: (dir: -1 | 1) => void;
  onSize?: (dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  // False once the page is full. The button stays visible and explains itself
  // rather than vanishing, so a child isn't left wondering where it went.
  canDuplicate: boolean;
}) {
  const shape = o.type === "shape" ? (o as ShapeObj) : null;
  // Locked, seen by the person who locked it. Everything except the padlock is
  // a way of changing the object, so while it is pinned none of it is offered.
  const pinned = showAuthor && !!o.locked;
  const btn =
    "pointer-events-auto flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-background hover:bg-surface";
  // Whether this shape has any numbers to show, and so whether the second row
  // exists. A rectangle has none and gets one row, as it always did.
  const hasNumbers =
    showStyle &&
    !!shape &&
    (shapeHasParts(shape.shape) ||
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
    setMaxW((prev) => {
      const next = Math.max(160, s.width - 16);
      return Math.abs(prev - next) < 0.5 ? prev : next;
    });
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    // What the toolbar needs beyond the object's own edge: half a corner press,
    // then the gap, then itself.
    const need = HIT_PX / 2 + TOOLBAR_GAP + th;
    // Above if it fits above, otherwise below if it fits below.
    const roomAbove = w.top - s.top >= need;
    const roomBelow = s.bottom - w.bottom >= need;
    const nextFlip = !roomAbove && roomBelow;
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
    let dy = 0;
    if (intendedTop < s.top + TOOLBAR_GAP) {
      dy = s.top + TOOLBAR_GAP - intendedTop;
    } else if (intendedTop + th > s.bottom - TOOLBAR_GAP) {
      dy = s.bottom - TOOLBAR_GAP - (intendedTop + th);
    }
    setLift((prev) => (Math.abs(prev - dy) < 0.5 ? prev : dy));
    const margin = 8;
    const naturalCentre = w.left + w.width / 2 - s.left; // canvas-space px
    const half = tw / 2;
    const lo = margin + half;
    const hi = s.width - margin - half;
    const clamped = lo > hi ? s.width / 2 : Math.min(hi, Math.max(lo, naturalCentre));
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
      className="pointer-events-auto absolute z-30 flex flex-col items-center gap-2 whitespace-nowrap rounded-2xl border border-border bg-surface/95 px-3 py-2 shadow-lg"
    >
      {/* The top row is what a teacher does TO the object: where it sits in the
          stack, whether it is pinned, whether it is endless, whether there is
          another one — and then how it is filled and lined. The same controls
          in the same order whatever the object is, so the row a hand reaches
          for does not move when the shape does. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
      {showAuthor && (
        <>
          {/* Locked pins the object for its author too, so while it is locked
              the padlock is the only control offered: order, endless supply,
              duplicate and the style pickers all change the thing that was
              just declared unchangeable. Unlock and they are all back. */}
          {!pinned && (
            <>
          <button type="button" onClick={() => onSendToBack(o.id)} className={btn} title="Send behind other objects" aria-label="Send to back">
            <Icon name="send-to-back" size={30} decorative />
          </button>
          <button type="button" onClick={() => onBringToFront(o.id)} className={btn} title="Bring in front of other objects" aria-label="Bring to front">
            <Icon name="bring-to-front" size={30} decorative />
          </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onToggleLock(o.id)}
            className={btn}
            aria-pressed={!!o.locked}
            aria-label={o.locked ? "Locked in place" : "Unlocked"}
            title={
              o.locked
                ? "Locked in place — nobody can move this, including you. Tap to unlock."
                : "Unlocked — you and your pupils can move this. Tap to lock it in place."
            }
          >
            <Icon name={o.locked ? "lock-closed" : "lock-open"} size={30} decorative />
          </button>
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
                  ? { background: "var(--honey-tint, #FBEED3)", borderColor: "var(--honey, #F0B441)", color: "var(--honey-ink, #8A5F1E)" }
                  : undefined
              }
              aria-pressed={!!shape.infinite}
              aria-label={shape.infinite ? "Endless supply on" : "Endless supply off"}
              title={
                shape.infinite
                  ? "Endless — pupils drag a new one off this. Tap to stop."
                  : "Tap to make this endless: pupils drag a new one off it."
              }
            >
              <Icon name="infinite" size={30} decorative />
            </button>
          )}
        </>
      )}

      {/* Turn and resize, for anyone who is not holding a mouse. See `onTurn`. */}
      {!pinned && onTurn && (
        <>
          <button
            type="button"
            onClick={() => onTurn(-1)}
            className={btn}
            title="Turn it left a little"
            aria-label="Turn left"
          >
            <span className="flex items-center" style={{ transform: "scaleX(-1)" }}>
              <Icon name="rotate" size={30} decorative />
            </span>
          </button>
          <button
            type="button"
            onClick={() => onTurn(1)}
            className={btn}
            title="Turn it right a little"
            aria-label="Turn right"
          >
            <Icon name="rotate" size={30} decorative />
          </button>
        </>
      )}
      {!pinned && onSize && (
        <>
          <button type="button" onClick={() => onSize(-1)} className={`${btn} text-lg font-bold`} title="Make it smaller" aria-label="Make it smaller">
            −
          </button>
          <button type="button" onClick={() => onSize(1)} className={`${btn} text-lg font-bold`} title="Make it bigger" aria-label="Make it bigger">
            +
          </button>
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
        title={canDuplicate ? "Make another one" : "This page is full — no room for another"}
        aria-label="Make another one"
      >
        <Icon name="duplicate" size={30} decorative />
      </button>
      )}

      {showStyle && <span className="mx-0.5 h-9 w-px bg-border" />}

      {showStyle && shape && (
        <>
          <span className="inline-flex items-center font-semibold text-muted"><Icon name="fill" size={28} decorative /></span>
          {/* 68px, not 64: the border eats 2px a side and the <input> inside is
              what receives the press, so the box has to be bigger than the
              floor for the target to reach it. */}
          <label className="relative block h-[68px] w-[68px] overflow-hidden rounded-full border-2 border-border">
            <input
              type="color"
              value={shape.fill === "none" ? "#93c5fd" : shape.fill}
              onChange={(e) => onStyle({ fill: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Fill colour"
            />
            <span
              className="block h-full w-full"
              style={{
                background:
                  shape.fill === "none"
                    ? "repeating-linear-gradient(45deg,#eee,#eee 4px,#fff 4px,#fff 8px)"
                    : shape.fill,
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onStyle({ fill: shape.fill === "none" ? "#93c5fd" : "none" })}
            className="pointer-events-auto flex min-h-16 min-w-16 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-muted"
          >
            {shape.fill === "none" ? "Add fill" : "No fill"}
          </button>

          <span className="ml-1 inline-flex items-center font-semibold text-muted"><Icon name="line" size={28} decorative /></span>
          {/* 68px, not 64: the border eats 2px a side and the <input> inside is
              what receives the press, so the box has to be bigger than the
              floor for the target to reach it. */}
          <label className="relative block h-[68px] w-[68px] overflow-hidden rounded-full border-2 border-border">
            <input
              type="color"
              value={shape.stroke}
              onChange={(e) => onStyle({ stroke: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Line colour"
            />
            <span className="block h-full w-full" style={{ background: shape.stroke }} />
          </label>
          <div className="flex gap-1.5">
            {[3, 6, 12].map((sw) => (
              <button
                key={sw}
                type="button"
                onClick={() => onStyle({ strokeWidth: sw })}
                className={`pointer-events-auto flex h-16 w-16 items-center justify-center rounded-lg border ${
                  shape.strokeWidth === sw ? "border-brand bg-brand/10" : "border-border"
                }`}
                aria-label={`Line width ${sw}`}
              >
                <span className="rounded-full bg-foreground" style={{ width: (sw + 2) * 1.6, height: (sw + 2) * 1.6 }} />
              </button>
            ))}
          </div>
        </>
      )}
      </div>

      {/* The second row is the NUMBERS behind a parameterised shape: a number
          line's segments, start and interval; a grid's columns and rows; a
          ring's band; which sign an operator draws. They say what the shape
          MEANS rather than how it looks, they are the only controls whose set
          changes from one shape to the next, and on a number line there are
          enough of them to run off both edges of the canvas if they shared the
          top row. So they get a row of their own, under a rule. */}
      {hasNumbers && (
        <div className="flex w-full flex-wrap items-center justify-center gap-2 border-t border-border pt-2">
      {/* The numbers behind a parameterised shape. This is what makes twelve
          fraction buttons unnecessary: halves, quarters and eighths are on the
          palette, and a teacher who wants ninths steps to nine here rather than
          waiting on a release. */}
      {showStyle && shape && shapeHasParts(shape.shape) && (
        <Stepper
          label={shape.shape === "grid" ? "Columns" : "Parts"}
          value={shape.shape === "grid" ? shape.cols ?? 1 : shape.parts ?? 2}
          min={shape.shape === "grid" ? MIN_DIVISIONS : shape.shape === "ring" ? 1 : MIN_PARTS}
          max={shape.shape === "grid" ? MAX_DIVISIONS : MAX_PARTS}
          onChange={(v) => onStyle(shape.shape === "grid" ? divisionPatch(shape, { cols: v }) : { parts: v })}
        />
      )}
      {showStyle && shape && shape.shape === "grid" && <Rule />}
      {showStyle && shape && shape.shape === "grid" && (
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
          className={btn}
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
            className={btn}
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
              className={btn}
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
                {k === "add" ? "+" : k === "subtract" ? "−" : k === "multiply" ? "×" : "÷"}
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
  onTextChange,
  onFinishEditing,
  onContextMenu,
}: ObjHandlers & { o: ImageObj | ShapeObj; selected: boolean; grouped: boolean; editing: boolean }) {
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
    const min = o.type === "shape" ? minShapeSize(o.shape) : 24;
    const w = Math.min(W, Math.max(min, o.w * factor));
    const h = Math.min(H, Math.max(min, o.h * factor));
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
      const min = o.type === "shape" ? minShapeSize(o.shape) : 24;

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
        o.type === "image"
          ? o.aspect
          : o.type === "shape" && isVectorKind(o.shape)
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
        w = Math.max(min, Math.min(W, rawW));
        h = Math.max(min, Math.min(H, d.sh + dLocalY));
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
      onDoubleClick={o.type === "shape" && cap.editable ? () => onEditText(o.id) : undefined}
      className={`absolute touch-none ${
        canGrab ? "pointer-events-auto cursor-move" : "pointer-events-none"
      } ${
        selected || grouped
          ? "ring-2 ring-brand"
          : author && o.locked
            ? "ring-2 ring-amber-400"
            : ""
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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ transform: `translate(${6 * scale}px, ${6 * scale}px)`, opacity: 0.45 }}
        >
          <svg viewBox={`0 0 ${o.w} ${o.h}`} width="100%" height="100%" preserveAspectRatio="none" className="block h-full w-full overflow-visible">
            {shapeParts(o).map((part, i) => (
              <path
                key={i}
                d={part.d}
                fill={part.role === "detail" || o.fill === "none" ? "none" : o.fill}
                fillRule={shapeFillRule(o.shape)}
                stroke={o.stroke}
                strokeWidth={part.role === "detail" ? detailStrokeWidth(o.strokeWidth) : o.strokeWidth}
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>
      )}

      {o.type === "image" ? (
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

      {/* Editing the label. */}
      {o.type === "shape" && editing && (
        <textarea
          autoFocus
          value={o.text ?? ""}
          onChange={(e) => onTextChange(o.id, e.target.value)}
          onBlur={onFinishEditing}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Type…"
          className="pointer-events-auto absolute inset-1 resize-none rounded border-2 border-brand bg-white/80 text-center outline-none"
          style={{
            color: o.textColor ?? "#1f2430",
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
          // A picture has no words to change, so it has no pencil.
          onEdit={o.type === "shape" ? () => onEditText(o.id) : undefined}
          onDelete={() => onDelete(o.id)}
          startRotate={o.type === "shape" ? startRotate : undefined}
          startResize={startResize}
          // The keyboard path. One press is one step of the SAME ladder the
          // drag uses, so nothing a pointer can reach is out of a keyboard's
          // reach (F50).
          nudgeRotate={o.type === "shape" ? (dir) => turnBy(dir * rotateStep) : undefined}
          nudgeSize={(dir) => sizeBy(dir > 0 ? SIZE_STEP : 1 / SIZE_STEP)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          noun="shape"
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
        // offered no turn, exactly as it is offered no turn handle.
        onTurn={o.type === "shape" ? (dir) => turnBy(dir * ROTATE_STEP) : undefined}
        onSize={(dir) => sizeBy(dir > 0 ? SIZE_STEP : 1 / SIZE_STEP)}
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
  onEdit,
  onDelete,
  startRotate,
  startResize,
  nudgeRotate,
  nudgeSize,
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
  // Undefined where the object has no words to edit — a picture.
  onEdit?: () => void;
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
  const dot = "block h-5 w-5 rounded-full border-2 border-white shadow";
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
      {onEdit && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onEdit}
          style={at({ top: true, left: true })}
          className={HANDLE_HIT}
          title="Change the words"
          aria-label="Edit text"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow">
            <Icon name="edit" size={14} decorative />
          </span>
        </button>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDelete}
        style={at({ top: true, right: true })}
        className={HANDLE_HIT}
        title="Remove"
        aria-label={deleteLabel}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white shadow">
          <Icon name="close" size={14} decorative />
        </span>
      </button>
      {startRotate && (
        <div
          onPointerDown={startRotate}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={nudgeRotate ? stepKeys(nudgeRotate) : undefined}
          // Focusable, because it says it is a button. See `nudgeRotate`.
          tabIndex={nudgeRotate ? 0 : undefined}
          style={at({ bottom: true, left: true })}
          className={`${HANDLE_HIT} cursor-grab`}
          title="Turn"
          role="button"
          aria-label={`Turn ${noun}`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow">
            <Icon name="rotate" size={11} decorative />
          </span>
        </div>
      )}
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
        <span className={`${dot} bg-brand`} />
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
          onEdit={() => onEditText(o.id)}
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
        onTurn={(dir) => turnBy(dir * ROTATE_STEP)}
        onSize={(dir) => sizeBy(dir > 0 ? SIZE_STEP : 1 / SIZE_STEP)}
        onStyle={() => {}}
      />
    )}
    </>
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
      onMove(q.id, {
        x: Math.max(0, Math.min(W - q.w, (e.clientX - d.ax) / scale)),
        y: Math.max(0, Math.min(H - q.h, (e.clientY - d.ay) / scale)),
      });
    } else {
      const w = Math.max(QUIZ_MIN_W, Math.min(W, d.sw + (e.clientX - d.ax) / scale));
      const h = Math.max(QUIZ_MIN_H, Math.min(H, d.sh + (e.clientY - d.ay) / scale));
      onMove(q.id, { w, h });
    }
  }
  function onPointerUp() {
    drag.current = null;
  }

  const twoCol = q.options.length > 2;
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
  const touch = (n: number) => (author ? px(n) : Math.max(px(n), 64 / scale));
  // Whether this card is allowed to outgrow the size it was drawn at. Only a
  // child's, and only ever downwards in size terms — it never shrinks below the
  // teacher's box. The alternative, on a question box a teacher drew short, is
  // that the floor above pushes the last answer out of an `overflow-hidden`
  // card: a target too small traded for one a child cannot see at all, which is
  // the worse of the two. A quiz card is opaque, so what it grows over is the
  // worksheet behind it, and the child still has every answer.
  const grows = !author;
  // A listen button on the question is offered only when the caller asked for
  // one (a child, in a register that cannot read yet) AND the platform has an
  // on-device voice to say it with. Both, or nothing.
  const voiceReady = useOnDeviceVoiceReady();
  const canHear = !author && !!hearItLabel && !!q.prompt && voiceReady;
  // The sync hint is an authoring affordance, not content: below about half
  // size it's unreadable anyway and the space is better spent on the question.
  const showSyncHint = editable && k > 0.55;

  // Answer rows stretch to share out the box's height, so their size has little
  // to do with how much text is in them: two short answers in a tall box left
  // small text marooned in a big empty row. So the text is grown to fill the
  // row it's actually in rather than sized from the box.
  //
  // One size for all of them, the largest that fits every answer — sizing each
  // independently would leave "Red" huge next to a small "It was raining".
  // Capped at the question's size so the question still reads as the question.
  const answerCap = px(24);
  const answerFloor = Math.min(8, answerCap);
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
  const topUnits = grows ? Math.max(0, Math.min(q.y, H - cardH)) : q.y;

  return (
    <div
      onPointerDown={author ? startMove : undefined}
      onPointerMove={author ? onPointerMove : undefined}
      onPointerUp={author ? onPointerUp : undefined}
      className={`absolute rounded-2xl ${
        author ? (interactive ? "pointer-events-auto cursor-move" : "pointer-events-none") : "pointer-events-auto"
      } ${selected ? "ring-2 ring-brand" : ""}`}
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
        className={`flex flex-col overflow-hidden rounded-2xl border-2 shadow-lg ${
          author ? "border-brand bg-brand/5" : "border-brand/60 bg-white/95"
        }`}
        style={{
          width: q.w,
          // A CHILD's card grows to fit answers at the touch floor; a teacher's
          // is exactly the size they drew, because for them the box is a thing
          // being laid out on a worksheet. The transform does not affect layout,
          // so this height is in logical units either way.
          ...(grows ? { minHeight: q.h } : { height: q.h }),
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          padding: px(12),
          gap: px(8),
          fontSize: px(16),
        }}
      >
        {editable ? (
          <>
            {showSyncHint && (
              <p
                className="text-center font-bold uppercase tracking-wide text-brand"
                style={{ fontSize: px(12) }}
              >
                Edits here also show in the Quiz panel
              </p>
            )}
            <BoxField
              value={q.prompt}
              onChange={(v) => onPrompt(q.id, v)}
              onPointerDown={stopDrag}
              placeholder="Type your question here"
              label="Question"
              className="w-full font-bold leading-tight text-foreground"
              style={{ fontSize: px(24) }}
            />
          </>
        ) : (
          // Author mode with a drawing tool picked: the box goes non-interactive
          // so the teacher can draw across it, so echo the placeholder rather
          // than leaving a new question looking like an empty box.
          <div className="flex items-center justify-center" style={{ gap: px(8) }}>
            <p
              className={`text-center font-bold leading-tight ${
                q.prompt ? "text-foreground" : "text-muted"
              }`}
              style={{ fontSize: px(24) }}
            >
              {q.prompt || (author ? "Type your question here" : "")}
            </p>
            {/* In the register built for children who cannot read yet, the
                question was the one silent thing on the screen — every other
                word a young child meets in Storyjar can be heard, and the one
                they actually have to answer could not. A child who cannot hear
                the question cannot do the activity.

                THE BUTTON IS CONDITIONAL, AND THAT IS THE SAFEGUARDING PART.
                This is a teacher's own free text, not Storyjar's fixed copy, so
                it is spoken only by a voice the platform reports as running on
                the device (`readAloudOnDevice`, and the 2026-08-19 scope note
                in SAFEGUARDING.md). Where there is no local voice the button is
                not rendered at all and the question stays as text beside a
                teacher — the correct failure, not a degraded one. Nothing is
                ever sent to a network voice, and it never speaks by itself: a
                child presses it, every time (WCAG 1.4.2). */}
            {canHear && (
              <button
                type="button"
                aria-label={`${hearItLabel}: ${q.prompt}`}
                onClick={() => readAloudOnDevice(q.prompt)}
                // The real 64px floor, like the answers below it — this is the
                // control that exists FOR the children who cannot read the words
                // beside it (SAFEGUARDING rule 18).
                className="flex shrink-0 items-center justify-center rounded-full border-2 border-brand/40 bg-white"
                style={{ minHeight: touch(64), minWidth: touch(64), fontSize: px(22) }}
              >
                <span aria-hidden="true">🔊</span>
              </button>
            )}
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
          className={`grid ${grows ? "" : "min-h-0 flex-1"}`}
          style={{
            gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr",
            gap: px(8),
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
                    className={`flex min-w-0 items-center justify-center rounded-xl border-2 text-center ${
                      correct ? "border-emerald-500 bg-emerald-50" : "border-brand/25 bg-white"
                    }`}
                    style={{ minHeight: touch(64), padding: px(8), gap: px(8) }}
                  >
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
                      className="min-w-0 flex-1 break-words font-semibold text-foreground"
                      style={{ fontSize: answerFont }}
                      register={(el) => registerAnswer(o.id, el)}
                    />
                    {correct && (
                      <span
                        title="Correct answer — set this in the Quiz panel"
                        className="flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
                        style={{ height: px(20), width: px(20), fontSize: px(11) }}
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
                    className={`flex min-w-0 items-center justify-center rounded-xl border-2 text-center transition-colors ${
                      showCorrect
                        ? "border-emerald-500 bg-emerald-50"
                        : wasWrong
                          ? "border-amber-500 bg-amber-50"
                          : chosen
                            ? "border-brand bg-brand/15"
                            : "border-border bg-white"
                    } ${author || locked ? "cursor-default" : "cursor-pointer hover:bg-brand/5"}`}
                    style={{ minHeight: touch(64), padding: px(8), gap: px(8) }}
                  >
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
                        className="min-w-0 break-words font-semibold text-foreground"
                        style={{ fontSize: answerFont }}
                      >
                        {o.text}
                      </span>
                    )}
                    {showCorrect && (
                      <span className="text-emerald-600" title="Correct answer">
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
            className="pointer-events-auto absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs text-white shadow"
            title="Remove question"
            aria-label="Remove question"
          >
            ✕
          </button>
          <div
            onPointerDown={startResize}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="pointer-events-auto absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-brand shadow"
            title="Resize"
          />
        </>
      )}
    </div>
  );
}

// Quiz panel geometry. The body is capped at the design's height; on a short
// window the panel as a whole is capped to the room below it instead and the
// body scrolls. MIN_PANEL_H keeps the header grabbable however short the stage.
const MAX_PANEL_BODY_H = 456;
const MIN_PANEL_H = 120;

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
function QuizPanel({
  questions,
  currentPage,
  pageCount,
  selectedId,
  pos,
  collapsed,
  onPosChange,
  onCollapsedChange,
  onClose,
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
  questions: QuizQuestion[];
  currentPage: number;
  pageCount: number;
  selectedId: string | null;
  pos: { x: number; y: number };
  collapsed: boolean;
  onPosChange: (pos: { x: number; y: number }) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onClose: () => void;
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
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // The panel floats, so nothing else keeps it inside the editor. Track the
  // stage so its body can be capped to the room actually available and its
  // position pulled back in when the window shrinks — otherwise the question
  // list runs off the bottom and the teacher can't reach it.
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = panelRef.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!stage) return;
    // Ignore zero readings — a stage that hasn't been laid out yet isn't a
    // small stage, and treating it as one crushes the panel to its minimum.
    const read = () => {
      if (stage.clientWidth > 0 && stage.clientHeight > 0) {
        setStageSize({ w: stage.clientWidth, h: stage.clientHeight });
      }
    };
    read();
    const obs = new ResizeObserver(read);
    obs.observe(stage);
    // Belt and braces: the observer covers the stage changing for any reason,
    // the window listener covers the case this is really about.
    window.addEventListener("resize", read);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", read);
    };
  }, [collapsed]);

  // Pull the panel back inside after the stage shrinks. Keeps the header (the
  // only way to move it, and the way to reopen it) on screen.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || !stageSize) return;
    const maxX = Math.max(6, stageSize.w - el.offsetWidth - 6);
    // Leave the header's worth of panel on screen, not the whole panel — the
    // point is only that it stays grabbable.
    const maxY = Math.max(6, stageSize.h - MIN_PANEL_H);
    if (pos.x > maxX || pos.y > maxY) {
      onPosChange({ x: Math.min(pos.x, maxX), y: Math.min(pos.y, maxY) });
    }
  }, [stageSize, pos, onPosChange]);

  // Drag the header to reposition, clamped inside the editor stage so the panel
  // can never be dropped somewhere it can't be grabbed again.
  function onHeaderDown(e: React.PointerEvent) {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function onHeaderMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const el = panelRef.current;
    if (!d || !el) return;
    const stage = el.offsetParent as HTMLElement | null;
    const maxX = Math.max(6, (stage?.clientWidth ?? 0) - el.offsetWidth - 6);
    const maxY = Math.max(6, (stage?.clientHeight ?? 0) - el.offsetHeight - 6);
    onPosChange({
      x: Math.max(6, Math.min(maxX, e.clientX - d.dx)),
      y: Math.max(6, Math.min(maxY, e.clientY - d.dy)),
    });
  }
  function onHeaderUp() {
    dragRef.current = null;
  }
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  // Questions grouped by the page they sit on, pages in order. A page only
  // appears once it has a question.
  const groups: { pageIndex: number; items: QuizQuestion[] }[] = [];
  for (const q of questions) {
    const g = groups.find((x) => x.pageIndex === q.pageIndex);
    if (g) g.items.push(q);
    else groups.push({ pageIndex: q.pageIndex, items: [q] });
  }
  groups.sort((a, b) => a.pageIndex - b.pageIndex);

  const dragBar = "cursor-grab touch-none select-none active:cursor-grabbing";
  // Cap the whole panel to the room below it and let the body flex inside that,
  // rather than guessing the header's height. On a short window the list
  // scrolls inside the panel — as it did when the panel was pinned to the
  // stage — instead of hanging off the bottom out of reach.
  const panelMax = stageSize ? Math.max(MIN_PANEL_H, stageSize.h - pos.y - 6) : undefined;

  if (collapsed) {
    return (
      <div ref={panelRef} className="absolute z-40" style={{ left: pos.x, top: pos.y }}>
        <div
          onPointerDown={onHeaderDown}
          onPointerMove={onHeaderMove}
          onPointerUp={onHeaderUp}
          className={`${dragBar} flex items-center gap-2 rounded-full bg-foreground py-2 pl-3 pr-2 text-surface shadow-xl`}
        >
          <span aria-hidden className="text-sm opacity-60">
            ⠿
          </span>
          <span className="text-sm font-bold">
            ❓ Quiz · {questions.length} {questions.length === 1 ? "question" : "questions"}
          </span>
          <button
            type="button"
            onPointerDown={stop}
            onClick={() => onCollapsedChange(false)}
            title="Expand"
            aria-label="Expand quiz panel"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-[11px] leading-none text-surface hover:bg-white/25"
          >
            ▲
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Quiz builder"
      className="absolute z-40 flex w-[300px] max-w-[80vw] flex-col overflow-hidden rounded-2xl border-2 border-foreground bg-surface shadow-xl"
      style={{ left: pos.x, top: pos.y, maxHeight: panelMax }}
    >
      <div
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        className={`${dragBar} flex shrink-0 items-center gap-2 bg-foreground px-2.5 py-2 text-surface`}
      >
        <span aria-hidden className="text-sm opacity-60">
          ⠿
        </span>
        <h2 className="flex-1 text-sm font-bold">❓ Quiz</h2>
        <button
          type="button"
          onPointerDown={stop}
          onClick={() => onCollapsedChange(true)}
          title="Shrink to a pill"
          aria-label="Shrink quiz panel"
          // ▼/▲ (the full-size triangles), not ▾/▴ — those are the *small*
          // variants, whose ink stays a few pixels tall however large the font,
          // so they read as a speck beside the ✕ however much you inflate them.
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-[11px] leading-none text-surface hover:bg-white/25"
        >
          ▼
        </button>
        <button
          type="button"
          onPointerDown={stop}
          onClick={onClose}
          title="Tuck away"
          aria-label="Close quiz panel"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs text-surface hover:bg-white/25"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3" style={{ maxHeight: MAX_PANEL_BODY_H }}>
        <p className="text-xs text-muted">
          You&apos;re on <b className="text-foreground">page {currentPage + 1} of {pageCount}</b>. Questions can
          live on any page.
        </p>
        <button
          type="button"
          onClick={onAddQuestion}
          className="mt-2 w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-white shadow hover:brightness-105"
        >
          ＋ Add question to page {currentPage + 1}
        </button>

        {questions.length === 0 ? (
          <p className="mt-3 px-1 text-xs text-muted">No questions yet. Add one to get started.</p>
        ) : (
          groups.map((g) => (
            <div key={g.pageIndex}>
              <div className="mb-1.5 mt-3 flex items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                    g.pageIndex === currentPage
                      ? "bg-brand text-white"
                      : "bg-[var(--kraft-tag)] text-foreground"
                  }`}
                >
                  Page {g.pageIndex + 1}
                </span>
                {g.pageIndex === currentPage && (
                  <span className="rounded-md bg-[var(--honey-tint)] px-1.5 py-0.5 text-xs font-semibold text-[var(--honey-ink)]">
                    you&apos;re here
                  </span>
                )}
                <span className="h-px flex-1 bg-border" />
              </div>

              {g.items.map((q) => {
                const open = q.id === selectedId;
                return (
                  <div
                    key={q.id}
                    className={`mb-2 overflow-hidden rounded-xl border-2 ${
                      open ? "border-brand bg-surface" : "border-border bg-background"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectQuestion(open ? null : q.id)}
                      aria-expanded={open}
                      // Only while open: the body is unmounted when closed, and
                      // aria-controls pointing at a missing id is a broken
                      // reference for a screen reader.
                      aria-controls={open ? `quiz-q-${q.id}` : undefined}
                      className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                    >
                      <span className="rounded border border-border bg-surface px-1.5 text-xs font-bold text-muted">
                        P{q.pageIndex + 1}
                      </span>
                      <span className="flex-1 truncate text-sm text-foreground">
                        {q.prompt || "Untitled question"}
                      </span>
                      {/* ▾/▸ sit small inside their em box, so this needs a
                          bigger size than the label to read as a control. */}
                      <span aria-hidden className="shrink-0 text-2xl leading-none text-muted">
                        {open ? "▾" : "▸"}
                      </span>
                    </button>

                    {open && (
                      <div id={`quiz-q-${q.id}`} className="px-2.5 pb-3 pt-0.5">
                        <label className="text-xs font-semibold text-muted" htmlFor={`quiz-prompt-${q.id}`}>
                          Question
                        </label>
                        <input
                          id={`quiz-prompt-${q.id}`}
                          value={q.prompt}
                          onChange={(e) => onUpdatePrompt(q.id, e.target.value)}
                          placeholder="What do you want to ask?"
                          className="input mt-1 w-full text-sm"
                        />

                        <p className="mt-3 text-xs font-semibold text-muted">Answers</p>
                        <p className="mb-1.5 text-xs text-muted">Tap the circle to mark the right answer.</p>

                        {q.options.map((o) => {
                          const correct = q.correctOptionId === o.id;
                          return (
                            <div key={o.id}>
                              <div
                                className={`flex items-center gap-1.5 rounded-lg border p-1.5 ${
                                  correct ? "border-emerald-500 bg-emerald-50" : "border-transparent"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSetCorrect(q.id, o.id)}
                                  title="Mark as the correct answer"
                                  aria-label={`Mark "${o.text || "this answer"}" as correct`}
                                  aria-pressed={correct}
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
                                    correct
                                      ? "border-emerald-500 bg-emerald-500 text-white"
                                      : "border-border text-transparent"
                                  }`}
                                >
                                  ✓
                                </button>
                                <input
                                  value={o.text ?? ""}
                                  onChange={(e) => onOptionText(q.id, o.id, e.target.value)}
                                  placeholder="Type an answer"
                                  aria-label="Answer text"
                                  className="input min-w-0 flex-1 text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    o.imagePath ? onClearOptionImage(q.id, o.id) : onOptionImage(q.id, o.id)
                                  }
                                  title={o.imagePath ? "Remove picture" : "Add a picture"}
                                  aria-label={o.imagePath ? "Remove answer picture" : "Add answer picture"}
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm ${
                                    o.imagePath ? "border-brand bg-brand/10" : "border-border"
                                  }`}
                                >
                                  {o.imagePath ? "🖼️" : "＋🖼️"}
                                </button>
                                {q.options.length > MIN_OPTIONS && (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveOption(q.id, o.id)}
                                    aria-label="Remove answer"
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-rose-600"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              {correct && (
                                <p className="mb-1 ml-9 text-xs font-bold text-[var(--glass-ink)]">
                                  ✓ correct answer
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {q.options.length < MAX_OPTIONS && (
                          <button
                            type="button"
                            onClick={() => onAddOption(q.id)}
                            className="mt-1.5 text-xs font-semibold text-brand"
                          >
                            ＋ Add answer
                          </button>
                        )}
                        <div className="mt-3 border-t border-border pt-2">
                          <button
                            type="button"
                            onClick={() => onDeleteQuestion(q.id)}
                            className="text-xs font-semibold text-rose-600 hover:underline"
                          >
                            Delete this question
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
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
