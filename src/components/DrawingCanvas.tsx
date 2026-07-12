"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons/Icon";
import {
  MIN_OPTIONS,
  MAX_OPTIONS,
  type QuizOption,
  type QuizPayload,
  type QuizQuestion,
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

type Tool = "cursor" | "pencil" | "pen" | "highlighter" | "eraser" | "text";
// The four drawing tools map onto four distinct nib shapes + stroke weights:
// pencil → Pen (thin), pen → Felt tip (thick), highlighter (wide/translucent),
// eraser. See ToolShape for the drawn nibs and true-weight sample strokes.
const TOOLS: { key: Tool; label: string; icon?: IconName }[] = [
  { key: "cursor", label: "Select" },
  { key: "pencil", label: "Pen", icon: "pen" },
  { key: "pen", label: "Felt tip", icon: "felt-tip" },
  { key: "highlighter", label: "Highlighter", icon: "highlighter" },
  { key: "eraser", label: "Eraser", icon: "eraser" },
  { key: "text", label: "Text", icon: "text" },
];

const SHELF: { key: Tool; label: string }[] = [
  { key: "pencil", label: "Pen" },
  { key: "pen", label: "Felt tip" },
  { key: "highlighter", label: "Highlighter" },
  { key: "eraser", label: "Eraser" },
];

const W = 1000;
const H = 700;
const FONT_STACK = "ui-rounded, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MAX_HISTORY = 30;

// Movable / resizable things placed on top of the drawing: imported pictures
// (images / PDF pages) and shapes.
type ImageObj = {
  id: string;
  type: "image";
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  aspect: number;
};
type ShapeKind = "rect" | "ellipse" | "triangle" | "star" | "speech";
type ShapeObj = {
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
};

// The usable area for a label inside each shape (so text stays within the
// visible shape, not just its bounding box). Relative to the shape's origin.
function shapeInnerBox(kind: ShapeKind, w: number, h: number) {
  switch (kind) {
    case "rect":
      return { x: 0.07 * w, y: 0.08 * h, w: 0.86 * w, h: 0.84 * h };
    case "ellipse":
      return { x: 0.16 * w, y: 0.18 * h, w: 0.68 * w, h: 0.64 * h };
    case "triangle":
      return { x: 0.24 * w, y: 0.46 * h, w: 0.52 * w, h: 0.46 * h };
    case "star":
      return { x: 0.31 * w, y: 0.36 * h, w: 0.38 * w, h: 0.34 * h };
    case "speech":
      return { x: 0.12 * w, y: 0.12 * h, w: 0.76 * w, h: 0.5 * h };
  }
}

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
type TextObj = {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  fontPx: number;
  color: string;
};
type Obj = ImageObj | ShapeObj | TextObj;
type HistoryEntry = { img: string; objects: Obj[] };

const SHAPES: { kind: ShapeKind; label: string; icon: string }[] = [
  { kind: "rect", label: "Rectangle", icon: "▭" },
  { kind: "ellipse", label: "Circle", icon: "⬤" },
  { kind: "triangle", label: "Triangle", icon: "▲" },
  { kind: "star", label: "Star", icon: "★" },
  { kind: "speech", label: "Speech bubble", icon: "💬" },
];

function roundRectPath(w: number, h: number, r: number) {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}
function starPath(w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const spikes = 5;
  let d = "";
  for (let i = 0; i < spikes * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / spikes;
    const rx = (i % 2 === 0 ? 1 : 0.44) * (w / 2);
    const ry = (i % 2 === 0 ? 1 : 0.44) * (h / 2);
    d += `${i === 0 ? "M" : "L"} ${cx + Math.cos(ang) * rx} ${cy + Math.sin(ang) * ry} `;
  }
  return d + "Z";
}
function speechPath(w: number, h: number) {
  const bh = h * 0.78;
  const r = Math.min(w, bh) * 0.16;
  const rb = w * 0.4;
  const lb = w * 0.22;
  const tip = w * 0.14;
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `Q ${w} 0 ${w} ${r}`,
    `V ${bh - r}`,
    `Q ${w} ${bh} ${w - r} ${bh}`,
    `H ${rb}`,
    `L ${tip} ${h}`,
    `L ${lb} ${bh}`,
    `H ${r}`,
    `Q 0 ${bh} 0 ${bh - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    `Z`,
  ].join(" ");
}
// The SVG/Canvas path for a shape drawn inside a w×h box at the origin.
function shapePath(shape: ShapeKind, w: number, h: number) {
  switch (shape) {
    case "rect":
      return roundRectPath(w, h, Math.min(w, h) * 0.06);
    case "ellipse":
      return `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
    case "triangle":
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    case "star":
      return starPath(w, h);
    case "speech":
      return speechPath(w, h);
  }
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function DrawingCanvas({
  name,
  background,
  allowImport = false,
  fullScreen = false,
  title,
  subtitle,
  withCaption = false,
  onClose,
  onDone,
  quizMode,
  initialQuiz,
  draftKey,
  ownerId,
  getExtraDraftFields,
  onRestoreFields,
  confirmSubmit = false,
}: {
  name: string;
  background?: string[];
  allowImport?: boolean;
  fullScreen?: boolean;
  title?: string;
  subtitle?: string;
  withCaption?: boolean;
  onClose?: () => void;
  onDone?: (pages: string[], quiz?: QuizPayload) => void;
  // When set (and this canvas submits a form rather than calling onDone), the ✓
  // opens a "ready to hand in?" confirmation first — so a child can't submit an
  // activity with a single tap before working through all the pages.
  confirmSubmit?: boolean;
  // "author" = teacher building a quiz (place/edit question boxes);
  // "answer" = child answering it (tap options, silent capture).
  // undefined = no quiz (existing callers unaffected).
  quizMode?: "author" | "answer";
  initialQuiz?: QuizPayload;
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
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const objIdRef = useRef(0);
  const currentRef = useRef(0);
  const anyDrawnRef = useRef(false);
  const loadingRef = useRef(false);

  // Local-first autosave state.
  const draftingEnabled = Boolean(draftKey && ownerId);
  const draftSurface: DraftSurface = draftKey?.startsWith("tmpl-") ? "template-new" : "activity-response";
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const [draftPrompt, setDraftPrompt] = useState<DraftCanvasV1 | null>(null);
  const draftFieldsRef = useRef<Record<string, string> | null>(null); // fields from a pending restore

  const drawing = useRef(false);
  const snapshot = useRef<ImageData | null>(null);
  const points = useRef<{ x: number; y: number }[]>([]);

  // Undo / redo: per page, a stack of { drawing layer, objects } snapshots.
  const undoRef = useRef<Record<number, HistoryEntry[]>>({});
  const redoRef = useRef<Record<number, HistoryEntry[]>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Default to Pen (the thin nib), per the design.
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState(SWATCHES[0]);
  const [size, setSize] = useState(SIZES[1]);
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

  // ---- Quiz layer (structured, NEVER composited into the page PNG) ----------
  // `quizRef` is the source of truth (a flat list carrying each question's
  // pageIndex, so a quiz can span non-consecutive pages); `quizQuestions`
  // mirrors it for rendering. Panel visibility + selection are component-level
  // (not per-page) so the quiz toolbox stays put as the teacher changes pages.
  const isQuizAuthor = quizMode === "author";
  const isQuizAnswer = quizMode === "answer";
  const quizRef = useRef<QuizQuestion[]>(cloneQuestions(initialQuiz?.questions ?? []));
  const quizSeqRef = useRef<number>(initialQuiz?.questions?.length ?? 0);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(quizRef.current);
  const [quizPanelOpen, setQuizPanelOpen] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  // Answer mode: the child's current selection per question, mirrored into the
  // hidden `quizAnswers` input the response form submits.
  const answersRef = useRef<Map<string, string>>(new Map());
  const quizAnswersRef = useRef<HTMLInputElement>(null);
  const pendingOptionRef = useRef<{ qid: string; oid: string } | null>(null);
  const quizFileRef = useRef<HTMLInputElement>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (allowImport) import("pdfjs-dist").catch(() => {});
  }, [allowImport]);

  const [fanOpen, setFanOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hueFrac, setHueFrac] = useState(0.62);
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
  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
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
    setThumbs([...compositeRef.current]);
  }

  // Flatten all layers (white → template → objects → strokes) into one PNG.
  function compositeCurrentPage(): string {
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
    const objs = objectsRef.current[currentRef.current] ?? [];
    for (const o of objs) {
      if (o.type === "image") {
        const img = imgCacheRef.current.get(o.id);
        if (img && img.complete && img.naturalWidth) ec.drawImage(img, o.x, o.y, o.w, o.h);
      } else if (o.type === "shape") {
        ec.save();
        ec.translate(o.x, o.y);
        const p = new Path2D(shapePath(o.shape, o.w, o.h));
        if (o.fill && o.fill !== "none") {
          ec.fillStyle = o.fill;
          ec.fill(p);
        }
        if (o.stroke && o.strokeWidth > 0) {
          ec.strokeStyle = o.stroke;
          ec.lineWidth = o.strokeWidth;
          ec.lineJoin = "round";
          ec.stroke(p);
        }
        ec.restore();
        // The shape's label, wrapped + centred inside the shape's usable area.
        if (o.text && o.text.trim()) {
          const region = shapeInnerBox(o.shape, o.w, o.h);
          const { fontPx, lines, lineHeight } = fitTextToBox(o.text, region.w, region.h);
          ec.fillStyle = o.textColor ?? "#1f2430";
          ec.font = `600 ${fontPx}px ${FONT_STACK}`;
          ec.textAlign = "center";
          ec.textBaseline = "middle";
          const cx = o.x + region.x + region.w / 2;
          const cy = o.y + region.y + region.h / 2;
          const startY = cy - ((lines.length - 1) * lineHeight) / 2;
          lines.forEach((line, i) => ec.fillText(line, cx, startY + i * lineHeight));
          ec.textAlign = "left";
          ec.textBaseline = "alphabetic";
        }
      } else {
        // text
        ec.fillStyle = o.color;
        ec.textBaseline = "top";
        ec.font = `600 ${o.fontPx}px ${FONT_STACK}`;
        const lineHeight = o.fontPx * 1.2;
        o.text.split("\n").forEach((line, i) => ec.fillText(line, o.x, o.y + i * lineHeight));
      }
    }
    // Pen strokes go on top of everything.
    ec.drawImage(canvas, 0, 0, W, H);
    return exp.toDataURL("image/png");
  }

  // Save the current page (drawing + composite) and update the hidden field.
  function syncHidden() {
    const canvas = canvasRef.current;
    if (canvas) {
      pagesRef.current[currentRef.current] = canvas.toDataURL("image/png");
      compositeRef.current[currentRef.current] = compositeCurrentPage();
    }
    if (hiddenRef.current) {
      hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
    }
    // Autosave a local draft off the same choke point (debounced). Skipped while
    // seeding/hydrating so restore doesn't immediately re-save itself.
    if (draftingEnabled && !loadingRef.current) schedulePersist();
  }

  // ---- Local-first autosave -------------------------------------------------
  function schedulePersist() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void doPersist();
    }, 1000);
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
    for (let i = 0; i < pagesRef.current.length; i++) {
      currentRef.current = i;
      if (c) {
        c.clearRect(0, 0, W, H);
        const si = strokeImgs[i];
        if (si) c.drawImage(si, 0, 0, W, H);
      }
      compositeRef.current[i] = compositeCurrentPage();
    }

    // Land on the saved page.
    currentRef.current = Math.min(Math.max(0, canvas.current), pagesRef.current.length - 1);
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
    setThumbs([...compositeRef.current]);
    refreshUndoRedo();
    if (hiddenRef.current) {
      hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
    }
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
      objectsRef.current = pagesRef.current.map(() => []);
      setPageCount(pagesRef.current.length);

      // Initial composite of each page is just white + its template.
      compositeRef.current = pagesRef.current.map((_, i) => {
        const exp = document.createElement("canvas");
        exp.width = W;
        exp.height = H;
        const ec = exp.getContext("2d")!;
        ec.fillStyle = "#ffffff";
        ec.fillRect(0, 0, W, H);
        const url = templatesRef.current[i];
        const t = url ? templateImgRef.current.get(url) : undefined;
        if (t && t.complete && t.naturalWidth) ec.drawImage(t, 0, 0, W, H);
        return exp.toDataURL("image/png");
      });

      clearCanvas(); // page 0's stroke layer starts blank
      setObjects([]);
      if (hiddenRef.current) {
        hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(compositeRef.current) : "[]";
      }
      setThumbs([...compositeRef.current]);
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

    const form = canvas.closest("form");
    const onSubmit = () => {
      finishEditing();
      // Submitting IS the success path (a failed action re-renders in place, no
      // redirect). Mark the draft so the destination page clears it.
      if (draftingEnabled && draftKey) markDraftForClear(draftKey);
    };
    form?.addEventListener("submit", onSubmit, true);

    // Flush the pending autosave when the tab is hidden or navigated away —
    // best-effort (async IDB writes aren't guaranteed to finish on unload; the
    // ~1s debounced save is the reliable recovery point).
    const onHide = () => {
      if (draftingEnabled && document.visibilityState === "hidden") flushPersist();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    return () => {
      window.removeEventListener("resize", measure);
      form?.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore-on-mount: once the canvas is ready, offer any saved draft. Gated so
  // it only fires when the draft likely represents lost work: a child response
  // always (their strokes sit on top of the template background), or a fresh
  // template build (no background). An in-session re-open of the teacher editor
  // (background already set) is not prompted, so "Start fresh" can't nuke work
  // the teacher is actively continuing.
  useEffect(() => {
    if (!ready || !draftingEnabled || !draftKey || !ownerId) return;
    const canPrompt = draftSurface === "activity-response" || !background || background.length === 0;
    if (!canPrompt) return;
    let cancelled = false;
    (async () => {
      await purgeExpired(RETENTION_MS);
      const rec = await loadDraft(draftKey, ownerId);
      if (!cancelled && rec?.canvas) {
        draftFieldsRef.current = rec.fields ?? {};
        setDraftPrompt(rec.canvas);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function restoreDraft() {
    const canvas = draftPrompt;
    setDraftPrompt(null);
    if (!canvas) return;
    await hydrateFromDraft(canvas);
    const f = draftFieldsRef.current;
    if (f) {
      onRestoreFields?.(f);
      if (withCaption && captionRef.current && typeof f.caption === "string") {
        captionRef.current.value = f.caption;
      }
    }
    draftFieldsRef.current = null;
  }

  function discardDraft() {
    setDraftPrompt(null);
    draftFieldsRef.current = null;
    if (draftKey) void deleteDraft(draftKey);
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
    setPageCount(pagesRef.current.length);
    setCurrent(index);
    setSelectedId(null);
    setObjects([]);
    refreshThumbs();
    refreshUndoRedo();
  }

  function deletePage() {
    if (pagesRef.current.length <= 1) return;
    finishEditing();
    pagesRef.current.splice(currentRef.current, 1);
    templatesRef.current.splice(currentRef.current, 1);
    objectsRef.current.splice(currentRef.current, 1);
    compositeRef.current.splice(currentRef.current, 1);
    // Page indices shift, so drop the (now-misaligned) history.
    undoRef.current = {};
    redoRef.current = {};
    const index = Math.max(0, currentRef.current - 1);
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

  // Place a shape as a movable / resizable / recolourable object.
  function addShape(shape: ShapeKind) {
    pushHistory();
    const id = `o${objIdRef.current++}`;
    const w = 320;
    const h = shape === "ellipse" || shape === "star" || shape === "speech" ? 280 : 220;
    const obj: ShapeObj = {
      id,
      type: "shape",
      shape,
      x: (W - w) / 2,
      y: (H - h) / 2,
      w,
      h,
      fill: "#93c5fd",
      stroke: "#1f2430",
      strokeWidth: 6,
    };
    const list = [...(objectsRef.current[currentRef.current] ?? []), obj];
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    anyDrawnRef.current = true;
    setSelectedId(id);
    setTool("cursor"); // so it can be positioned straight away
    setShapesOpen(false);
    setFanOpen(false);
    syncHidden();
    refreshThumbs();
  }

  // Update the style of the selected shape (fill / line colour / width).
  function styleSelectedShape(patch: Partial<ShapeObj>) {
    if (!selectedId) return;
    updateObject(selectedId, patch);
    commitObjectChange();
  }

  function updateObject(id: string, patch: Partial<Obj>) {
    const list = (objectsRef.current[currentRef.current] ?? []).map((o) =>
      o.id === id ? ({ ...o, ...patch } as Obj) : o,
    );
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
  }

  function deleteObject(id: string) {
    pushHistory();
    const list = (objectsRef.current[currentRef.current] ?? []).filter((o) => o.id !== id);
    objectsRef.current[currentRef.current] = list;
    setObjects(list);
    setSelectedId(null);
    syncHidden();
    refreshThumbs();
  }

  function commitObjectChange() {
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
          await addObject(url, false);
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

  function currentPages(): string[] {
    finishEditing();
    return anyDrawnRef.current ? [...compositeRef.current] : [];
  }

  // ---- Quiz operations ------------------------------------------------------
  // All mutate quizRef (the source of truth) then mirror to state. Quiz data is
  // deliberately kept out of syncHidden()/compositeCurrentPage()/pushHistory().
  function commitQuiz() {
    setQuizQuestions([...quizRef.current]);
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
      x: (W - 380) / 2,
      y: (H - 300) / 2,
      w: 380,
      h: 300,
      prompt: "",
      options,
      correctOptionId: "opt0",
    };
    quizRef.current = [...quizRef.current, q];
    anyDrawnRef.current = true;
    setSelectedQuestionId(qid);
    setQuizPanelOpen(true);
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
    // Transient data URL; createTemplate rewrites it to a private /uploads path.
    setOptionField(target.qid, target.oid, { imagePath: url });
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
  function selectAnswer(qid: string, oid: string) {
    answersRef.current.set(qid, oid);
    setAnswers(Object.fromEntries(answersRef.current));
    syncAnswers();
  }

  function pickHue(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setHueFrac(frac);
    setColor(hslToHex(frac * 360, 85, 52));
  }

  const scale = displayW / W;
  const selectedShape = objects.find(
    (o): o is ShapeObj => o.id === selectedId && o.type === "shape",
  );

  // Objects are only draggable/selectable with the cursor tool (or while a text
  // box is being edited). Otherwise the stroke canvas sits on top so you can
  // draw over everything.
  const objectsInteractive = tool === "cursor" || editingId !== null;
  const currentTemplate = templatesRef.current[current] ?? null;

  // A palette of shapes to drop onto the canvas.
  const shapesPalette = (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-lg">
      {SHAPES.map((s) => (
        <button
          key={s.kind}
          type="button"
          onClick={() => addShape(s.kind)}
          title={s.label}
          aria-label={s.label}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-xl hover:bg-background"
        >
          {s.icon}
        </button>
      ))}
    </div>
  );

  const objectLayer = (
    <ObjectLayer
      objects={objects}
      scale={scale}
      interactive={objectsInteractive}
      selectedId={selectedId}
      editingId={editingId}
      onSelect={setSelectedId}
      onStart={pushHistory}
      onChange={updateObject}
      onEnd={commitObjectChange}
      onDelete={deleteObject}
      onEditText={editTextObject}
      onTextChange={updateText}
      onFinishEditing={finishEditing}
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
      interactive={isQuizAuthor ? objectsInteractive : true}
      selectedId={selectedQuestionId}
      answers={answers}
      onSelect={setSelectedQuestionId}
      onMove={updateQuestion}
      onDelete={deleteQuestion}
      onAnswer={selectAnswer}
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
        onPointerDown={() => {
          if (objectsInteractive) setSelectedId(null);
        }}
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

  // ---- Full-screen, child-led layout ---------------------------------------
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-[#e9ebf1]">
        {hiddenInputs}
        {draftPrompt && (
          <RestorePrompt onRestore={restoreDraft} onDiscard={discardDraft} />
        )}
        {confirmingSubmit && (
          <ConfirmSubmitPrompt pageCount={pageCount} onCancel={() => setConfirmingSubmit(false)} />
        )}

        <div ref={wrapRef} className="relative flex-1 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden"
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

          <div className="absolute left-3 top-3 flex gap-2">
            <RoundBtn label="Clear page" onClick={clearPage}><Icon name="delete" size={20} decorative /></RoundBtn>
            <RoundBtn label="Undo" onClick={undo} disabled={!canUndo}><Icon name="undo" size={20} decorative /></RoundBtn>
            <RoundBtn label="Redo" onClick={redo} disabled={!canRedo}><Icon name="redo" size={20} decorative /></RoundBtn>
          </div>

          <div className="pointer-events-none absolute left-1/2 top-3 z-10 w-[60vw] max-w-lg -translate-x-1/2 text-center">
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-amber-400 bg-white/90 px-3 py-1 text-sm font-bold text-amber-700">
              <Icon name="edit" size={14} decorative /> Draft
            </span>
            {title && <p className="mt-1 text-sm font-bold text-foreground/80">{title}</p>}
            {subtitle && <p className="text-xs text-foreground/60">{subtitle}</p>}
          </div>

          <div className="absolute right-3 top-3 flex items-center gap-2">
            {onClose && <RoundBtn label="Close" onClick={onClose}><Icon name="close" size={20} decorative /></RoundBtn>}
            <button
              type={onDone || confirmSubmit ? "button" : "submit"}
              onClick={
                onDone
                  ? () => onDone(currentPages(), isQuizAuthor ? { questions: quizRef.current } : undefined)
                  : confirmSubmit
                    ? () => { finishEditing(); setConfirmingSubmit(true); }
                    : undefined
              }
              title="Done"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-emerald-600"
            >
              ✓
            </button>
          </div>

          <div className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setTool("cursor")}
              title="Select — move & resize things"
              aria-label="Select"
              className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg transition-transform hover:scale-105 ${
                tool === "cursor" ? "bg-brand text-white" : "bg-white text-foreground ring-1 ring-black/5"
              }`}
            >
              🖱️
            </button>

            {fanOpen && (
              <div className="flex flex-col gap-2">
                <FanBtn label="Photo / PDF" onClick={() => fileRef.current?.click()}>🖼️</FanBtn>
                <FanBtn label="Text" onClick={() => { setFanOpen(false); setTool("text"); }}>🔤</FanBtn>
                <FanBtn label="Shapes" onClick={() => { setShapesOpen((v) => !v); }}>⬟</FanBtn>
                {isQuizAuthor && (
                  <FanBtn label="Quiz" onClick={() => { setFanOpen(false); setShapesOpen(false); setTool("cursor"); setQuizPanelOpen(true); }}>❓</FanBtn>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => { setFanOpen((v) => !v); setShapesOpen(false); }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-3xl font-light text-white shadow-lg transition-transform hover:scale-105"
              title="Add"
              style={{ transform: fanOpen ? "rotate(45deg)" : "none" }}
            >
              ＋
            </button>
          </div>

          {shapesOpen && (
            <div className="absolute left-20 top-1/2 -translate-y-1/2">{shapesPalette}</div>
          )}

          {selectedShape && (
            <ShapeStyleBar
              shape={selectedShape}
              onChange={styleSelectedShape}
              className="absolute left-1/2 top-16 z-20 -translate-x-1/2"
            />
          )}

          {isQuizAuthor && quizPanelOpen && (
            <QuizPanel
              questions={quizQuestions}
              currentPage={current}
              pageCount={pageCount}
              selectedId={selectedQuestionId}
              onClose={() => setQuizPanelOpen(false)}
              onAddQuestion={addQuestion}
              onSelectQuestion={(id) => {
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

          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2">
            <div
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); pickHue(e); }}
              onPointerMove={(e) => { if (e.buttons) pickHue(e); }}
              className="relative w-6 cursor-pointer rounded-full"
              style={{
                height: "min(52vh, 460px)",
                background:
                  "linear-gradient(to bottom, hsl(0 85% 52%), hsl(60 85% 52%), hsl(120 85% 52%), hsl(180 85% 52%), hsl(240 85% 52%), hsl(300 85% 52%), hsl(360 85% 52%))",
              }}
            >
              <span
                className="absolute left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow"
                style={{ top: `${hueFrac * 100}%`, backgroundColor: color }}
              />
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen((v) => !v)}
              className="h-9 w-9 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: color }}
              title="Colours"
            />
            {paletteOpen && (
              <div className="absolute right-11 top-0 w-44 rounded-xl border border-border bg-surface p-2 shadow-lg">
                <div className="grid grid-cols-5 gap-1.5">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setColor(c); setPaletteOpen(false); }}
                      className="h-7 w-7 rounded-full border-2"
                      style={{ backgroundColor: c, borderColor: color === c ? "#1f2430" : "#e6e8ef" }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                  Any colour
                </label>
                <div className="mt-2 flex gap-1.5">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      className={`flex h-8 flex-1 items-center justify-center rounded-lg border ${
                        size === s ? "border-brand bg-brand/10" : "border-border"
                      }`}
                      aria-label={`Size ${s}`}
                    >
                      <span className="rounded-full bg-foreground" style={{ width: s / 2 + 3, height: s / 2 + 3 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-2">
            {SHELF.map((t) => {
              const selected = tool === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { finishEditing(); setTool(t.key); }}
                  className="pointer-events-auto flex flex-col items-center transition-transform duration-150"
                  style={{ transform: `translateY(${selected ? 34 : 68}px)` }}
                  title={t.label}
                >
                  <ToolShape kind={t.key} color={color} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTool("text")}
              className={`pointer-events-auto mb-3 ml-2 flex h-12 w-12 items-center justify-center rounded-2xl border-2 shadow ${
                tool === "text" ? "border-brand bg-brand/10 text-brand" : "border-border bg-white text-muted"
              }`}
              title="Text"
            >
              <Icon name="text" size={22} decorative />
            </button>
          </div>

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
              Drag to move · pull the corner to resize · ✕ to remove
            </div>
          )}

          {withCaption && (
            <div className="absolute bottom-3 left-3 w-64 max-w-[70vw]">
              <input ref={captionRef} name="caption" className="input bg-white/90 shadow" placeholder="💬 Add a caption…" />
            </div>
          )}

          <div className="absolute right-3 top-20 flex flex-col items-end">
            <button
              type="button"
              onClick={() => setStripOpen((v) => !v)}
              className="mb-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-muted shadow"
            >
              {stripOpen ? "Pages ›" : "‹ Pages"}
            </button>
            {stripOpen && (
              <div className="flex max-h-[42vh] w-24 flex-col gap-1.5 overflow-y-auto rounded-xl bg-white/80 p-1.5 shadow">
                {thumbs.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goToPage(i)}
                    className={`overflow-hidden rounded-lg border-2 ${i === current ? "border-brand" : "border-transparent"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Page ${i + 1}`} className="aspect-[10/7] w-full object-cover" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addPage}
                  className="flex aspect-[10/7] w-full items-center justify-center rounded-lg border-2 border-dashed border-border text-lg text-muted"
                  title="Add page"
                >
                  ＋
                </button>
                {pageCount > 1 && (
                  <button type="button" onClick={deletePage} className="text-xs text-muted hover:text-rose-600">
                    Delete page
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
        <button
          type="button"
          onClick={() => setShapesOpen((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            shapesOpen ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-muted hover:bg-background"
          }`}
        >
          <Icon name="shapes" size={16} decorative /> Shapes
        </button>
      </div>

      {shapesOpen && <div className="mb-2">{shapesPalette}</div>}
      {selectedShape && <ShapeStyleBar shape={selectedShape} onChange={styleSelectedShape} className="mb-2" />}

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
        <p className="mb-1 text-sm text-muted">Drag to move · pull the corner to resize · ✕ to remove.</p>
      )}
      {importError && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{importError}</p>
      )}

      <div
        ref={wrapRef}
        className="relative mx-auto overflow-hidden rounded-xl border border-border"
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
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"><Icon name="add-file" size={16} decorative /> Add PDF / image</button>
        {pageCount > 1 && (
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
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-lg text-foreground shadow transition-colors hover:bg-white disabled:opacity-40"
    >
      {children}
    </button>
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
      title={label}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105"
    >
      {children}
    </button>
  );
}

// A drawn tool that reads as its real type — a slim Pen, a fatter Felt tip, a
// chisel Highlighter, or a block Eraser — with a sample stroke at the tip that
// shows the tool's true weight and opacity (thin / thick / wide-translucent /
// rubbing-out). The four must never look near-identical: nib shape AND the
// sample stroke distinguish them.
function ToolShape({ kind, color }: { kind: Tool; color: string }) {
  const ink = "#22304A";
  if (kind === "eraser") {
    return (
      <svg width="52" height="150" viewBox="0 0 52 150" aria-hidden>
        {/* dashed "rubbing out" sample */}
        <line x1="8" y1="9" x2="44" y2="9" stroke="#B9A98C" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 6" />
        {/* pink block eraser with a blue ferrule */}
        <rect x="10" y="18" width="32" height="30" rx="6" fill="#E08A9B" stroke={ink} strokeWidth="3" />
        <rect x="10" y="46" width="32" height="14" rx="4" fill="#8AB9D6" stroke={ink} strokeWidth="3" />
        <rect x="10" y="60" width="32" height="86" rx="8" fill="#FFFDF7" stroke={ink} strokeWidth="3" />
      </svg>
    );
  }
  if (kind === "highlighter") {
    return (
      <svg width="52" height="150" viewBox="0 0 52 150" aria-hidden>
        {/* wide, 75%-opacity sample stroke */}
        <line x1="6" y1="10" x2="46" y2="10" stroke="#F0B441" strokeOpacity="0.75" strokeWidth="16" strokeLinecap="round" />
        {/* honey chisel marker */}
        <polygon points="16,20 36,20 32,34 20,34" fill="#F0B441" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
        <rect x="14" y="34" width="24" height="14" rx="3" fill="#FBEED3" stroke={ink} strokeWidth="3" />
        <rect x="12" y="48" width="28" height="98" rx="9" fill="#F0B441" stroke={ink} strokeWidth="3" />
        <rect x="16" y="48" width="7" height="98" rx="4" fill="rgba(255,255,255,.4)" />
      </svg>
    );
  }
  const felt = kind === "pen"; // "pen" key → Felt tip; "pencil" key → Pen
  const barrel = felt ? "#C2476B" : "#37796f";
  return (
    <svg width="52" height="150" viewBox="0 0 52 150" aria-hidden>
      {/* sample stroke: thin for Pen, thick for Felt tip */}
      <line x1="8" y1="9" x2="44" y2="9" stroke={color} strokeWidth={felt ? 8 : 3} strokeLinecap="round" />
      {felt ? (
        // chisel felt tip
        <polygon points="19,16 33,16 30,30 22,30" fill={ink} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      ) : (
        // fine ink tip
        <polygon points="26,14 30,30 22,30" fill={ink} />
      )}
      <rect x={felt ? 13 : 15} y="30" width={felt ? 26 : 22} height="8" rx="3" fill="rgba(0,0,0,.15)" />
      <rect x={felt ? 13 : 15} y="38" width={felt ? 26 : 22} height="108" rx="10" fill={barrel} stroke={ink} strokeWidth="3" />
      <rect x={felt ? 17 : 18} y="42" width="7" height="100" rx="4" fill="rgba(255,255,255,.35)" />
    </svg>
  );
}

type ObjHandlers = {
  scale: number;
  interactive: boolean;
  onSelect: (id: string) => void;
  onStart: () => void;
  onChange: (id: string, patch: Partial<Obj>) => void;
  onEnd: () => void;
  onDelete: (id: string) => void;
  onEditText: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onFinishEditing: () => void;
};

// The layer of movable / resizable objects (pictures, shapes, text boxes).
function ObjectLayer({
  objects,
  selectedId,
  editingId,
  ...handlers
}: ObjHandlers & {
  objects: Obj[];
  selectedId: string | null;
  editingId: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {objects.map((o) => (
        <ObjectView
          key={o.id}
          o={o}
          selected={o.id === selectedId}
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
  editing,
  ...h
}: ObjHandlers & { o: Obj; selected: boolean; editing: boolean }) {
  if (o.type === "text") {
    return <TextObjectView o={o} selected={selected} editing={editing} {...h} />;
  }
  return <MediaObjectView o={o} selected={selected} editing={editing} {...h} />;
}

// Pictures and shapes: move + (aspect-locked / free) resize + delete. Shapes can
// also carry a label (double-tap) that stays locked inside them.
function MediaObjectView({
  o,
  scale,
  interactive,
  selected,
  editing,
  onSelect,
  onStart,
  onChange,
  onEnd,
  onDelete,
  onEditText,
  onTextChange,
  onFinishEditing,
}: ObjHandlers & { o: ImageObj | ShapeObj; selected: boolean; editing: boolean }) {
  const drag = useRef<
    | { mode: "move"; ax: number; ay: number }
    | { mode: "resize"; ax: number; ay: number; sw: number; sh: number }
    | null
  >(null);

  function capture(e: React.PointerEvent) {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore — not all pointers can be captured */
    }
  }
  function startMove(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    drag.current = { mode: "move", ax: e.clientX - o.x * scale, ay: e.clientY - o.y * scale };
    capture(e);
  }
  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    drag.current = { mode: "resize", ax: e.clientX, ay: e.clientY, sw: o.w, sh: o.h };
    capture(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      onChange(o.id, { x: (e.clientX - d.ax) / scale, y: (e.clientY - d.ay) / scale });
    } else {
      let w = Math.max(24, Math.min(W, d.sw + (e.clientX - d.ax) / scale));
      // Images keep their aspect ratio; shapes resize freely.
      const h =
        o.type === "image"
          ? w / o.aspect
          : Math.max(24, Math.min(H, d.sh + (e.clientY - d.ay) / scale));
      if (o.type === "image") w = Math.min(w, W);
      onChange(o.id, { w, h });
    }
  }
  function onPointerUp() {
    if (drag.current) {
      drag.current = null;
      onEnd();
    }
  }

  const region = o.type === "shape" ? shapeInnerBox(o.shape, o.w, o.h) : null;
  const label =
    o.type === "shape" && region && o.text && o.text.trim()
      ? fitTextToBox(o.text, region.w, region.h)
      : null;

  return (
    <div
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={o.type === "shape" ? () => onEditText(o.id) : undefined}
      className={`absolute cursor-move touch-none ${
        interactive ? "pointer-events-auto" : "pointer-events-none"
      } ${selected ? "ring-2 ring-brand" : ""}`}
      style={{ left: o.x * scale, top: o.y * scale, width: o.w * scale, height: o.h * scale }}
    >
      {o.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={o.src}
          alt="Added picture"
          draggable={false}
          className="pointer-events-none h-full w-full select-none"
          style={{ objectFit: "fill" }}
        />
      ) : (
        <svg
          viewBox={`0 0 ${o.w} ${o.h}`}
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          className="pointer-events-none block h-full w-full overflow-visible"
        >
          <path
            d={shapePath(o.shape, o.w, o.h)}
            fill={o.fill === "none" ? "none" : o.fill}
            stroke={o.stroke}
            strokeWidth={o.strokeWidth}
            strokeLinejoin="round"
          />
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

      {selected && !editing && (
        <>
          {o.type === "shape" && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onEditText(o.id)}
              className="pointer-events-auto absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow"
              title={o.text ? "Edit label" : "Add label"}
              aria-label="Edit text"
            >
              <Icon name="edit" size={13} decorative />
            </button>
          )}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(o.id)}
            className="pointer-events-auto absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow"
            title="Remove"
            aria-label="Remove object"
          >
            <Icon name="close" size={13} decorative />
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

// A text box object: select + move + resize (font size) + re-edit + delete.
function TextObjectView({
  o,
  scale,
  interactive,
  selected,
  editing,
  onSelect,
  onStart,
  onChange,
  onEnd,
  onDelete,
  onEditText,
  onTextChange,
  onFinishEditing,
}: ObjHandlers & { o: TextObj; selected: boolean; editing: boolean }) {
  const drag = useRef<
    | { mode: "move"; ax: number; ay: number }
    | { mode: "resize"; ax: number; ay: number; sf: number }
    | null
  >(null);

  function capture(e: React.PointerEvent) {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function startMove(e: React.PointerEvent) {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    drag.current = { mode: "move", ax: e.clientX - o.x * scale, ay: e.clientY - o.y * scale };
    capture(e);
  }
  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(o.id);
    onStart();
    drag.current = { mode: "resize", ax: e.clientX, ay: e.clientY, sf: o.fontPx };
    capture(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      onChange(o.id, { x: (e.clientX - d.ax) / scale, y: (e.clientY - d.ay) / scale });
    } else {
      const delta = (e.clientX - d.ax + (e.clientY - d.ay)) / 2 / scale;
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
    <div
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onEditText(o.id)}
      className={`absolute touch-none ${
        interactive ? "pointer-events-auto" : "pointer-events-none"
      } ${editing ? "" : "cursor-move"} ${selected ? "ring-2 ring-brand" : ""}`}
      style={{ left: o.x * scale, top: o.y * scale }}
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

      {selected && !editing && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onEditText(o.id)}
            className="pointer-events-auto absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow"
            title="Edit text"
            aria-label="Edit text"
          >
            <Icon name="edit" size={13} decorative />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(o.id)}
            className="pointer-events-auto absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow"
            title="Remove"
            aria-label="Remove object"
          >
            <Icon name="close" size={13} decorative />
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

// A small toolbar for the selected shape's fill and line.
function ShapeStyleBar({
  shape,
  onChange,
  className,
}: {
  shape: ShapeObj;
  onChange: (patch: Partial<ShapeObj>) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-border bg-surface/95 px-3 py-2 text-sm shadow-lg ${className ?? ""}`}
    >
      <span className="font-semibold">Fill</span>
      <label className="relative block h-6 w-6 overflow-hidden rounded-full border-2 border-border">
        <input
          type="color"
          value={shape.fill === "none" ? "#93c5fd" : shape.fill}
          onChange={(e) => onChange({ fill: e.target.value })}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Fill colour"
        />
        <span
          className="block h-full w-full"
          style={{
            background:
              shape.fill === "none"
                ? "repeating-linear-gradient(45deg,#eee,#eee 3px,#fff 3px,#fff 6px)"
                : shape.fill,
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => onChange({ fill: shape.fill === "none" ? "#93c5fd" : "none" })}
        className="rounded border border-border px-1.5 py-0.5 text-xs font-semibold text-muted"
      >
        {shape.fill === "none" ? "Add fill" : "No fill"}
      </button>

      <span className="ml-1 font-semibold">Line</span>
      <label className="relative block h-6 w-6 overflow-hidden rounded-full border-2 border-border">
        <input
          type="color"
          value={shape.stroke}
          onChange={(e) => onChange({ stroke: e.target.value })}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Line colour"
        />
        <span className="block h-full w-full" style={{ background: shape.stroke }} />
      </label>
      <div className="flex gap-1">
        {[3, 6, 12].map((sw) => (
          <button
            key={sw}
            type="button"
            onClick={() => onChange({ strokeWidth: sw })}
            className={`flex h-7 w-7 items-center justify-center rounded border ${
              shape.strokeWidth === sw ? "border-brand bg-brand/10" : "border-border"
            }`}
            aria-label={`Line width ${sw}`}
          >
            <span className="rounded-full bg-foreground" style={{ width: sw + 2, height: sw + 2 }} />
          </button>
        ))}
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
  interactive,
  selectedId,
  answers,
  onSelect,
  onMove,
  onDelete,
  onAnswer,
}: {
  questions: QuizQuestion[];
  scale: number;
  mode: "author" | "answer";
  interactive: boolean;
  selectedId: string | null;
  answers: Record<string, string>;
  onSelect: (id: string) => void;
  onMove: (id: string, patch: Partial<QuizQuestion>) => void;
  onDelete: (id: string) => void;
  onAnswer: (qid: string, oid: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {questions.map((q) => (
        <QuizBoxView
          key={q.id}
          q={q}
          scale={scale}
          mode={mode}
          interactive={interactive}
          selected={q.id === selectedId}
          selectedOption={answers[q.id] ?? null}
          onSelect={onSelect}
          onMove={onMove}
          onDelete={onDelete}
          onAnswer={onAnswer}
        />
      ))}
    </div>
  );
}

function QuizBoxView({
  q,
  scale,
  mode,
  interactive,
  selected,
  selectedOption,
  onSelect,
  onMove,
  onDelete,
  onAnswer,
}: {
  q: QuizQuestion;
  scale: number;
  mode: "author" | "answer";
  interactive: boolean;
  selected: boolean;
  selectedOption: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, patch: Partial<QuizQuestion>) => void;
  onDelete: (id: string) => void;
  onAnswer: (qid: string, oid: string) => void;
}) {
  const author = mode === "author";
  const drag = useRef<{ mode: "move" | "resize"; ax: number; ay: number; sw: number; sh: number } | null>(null);

  function capture(e: React.PointerEvent) {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
    if (d.mode === "move") {
      onMove(q.id, {
        x: Math.max(0, Math.min(W - q.w, (e.clientX - d.ax) / scale)),
        y: Math.max(0, Math.min(H - q.h, (e.clientY - d.ay) / scale)),
      });
    } else {
      const w = Math.max(220, Math.min(W, d.sw + (e.clientX - d.ax) / scale));
      const h = Math.max(160, Math.min(H, d.sh + (e.clientY - d.ay) / scale));
      onMove(q.id, { w, h });
    }
  }
  function onPointerUp() {
    drag.current = null;
  }

  const twoCol = q.options.length > 2;

  return (
    <div
      onPointerDown={author ? startMove : undefined}
      onPointerMove={author ? onPointerMove : undefined}
      onPointerUp={author ? onPointerUp : undefined}
      className={`absolute rounded-2xl ${
        author ? (interactive ? "pointer-events-auto cursor-move" : "pointer-events-none") : "pointer-events-auto"
      } ${selected ? "ring-2 ring-brand" : ""}`}
      style={{ left: q.x * scale, top: q.y * scale, width: q.w * scale, height: q.h * scale }}
    >
      <div className="flex h-full w-full flex-col gap-2 overflow-hidden rounded-2xl border-2 border-brand/60 bg-white/95 p-3 shadow-lg">
        <p className="text-center font-bold leading-tight text-foreground" style={{ fontSize: Math.max(15, 24 * scale) }}>
          {q.prompt || (author ? "Add your question in the Quiz panel →" : "")}
        </p>
        <div
          className="grid min-h-0 flex-1 gap-2"
          style={{ gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr" }}
        >
          {q.options.map((o) => {
            const chosen = !author && selectedOption === o.id;
            const isCorrect = author && q.correctOptionId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={author}
                aria-label={o.text || "Picture answer"}
                aria-pressed={chosen}
                onClick={author ? undefined : () => onAnswer(q.id, o.id)}
                className={`flex min-h-[64px] items-center justify-center gap-2 rounded-xl border-2 p-2 text-center transition-colors ${
                  chosen ? "border-brand bg-brand/15" : "border-border bg-white"
                } ${author ? "cursor-default" : "cursor-pointer hover:bg-brand/5"}`}
              >
                {o.imagePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.imagePath} alt="" className="max-h-16 w-auto shrink-0 object-contain" />
                )}
                {o.text && <span className="font-semibold text-foreground">{o.text}</span>}
                {isCorrect && (
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

// The persistent quiz authoring panel. Stays mounted regardless of the current
// page, so a quiz can be built across non-consecutive pages without losing the
// toolbox. Lists every question (with its page), and edits the selected one.
function QuizPanel({
  questions,
  currentPage,
  pageCount,
  selectedId,
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
  onClose: () => void;
  onAddQuestion: () => void;
  onSelectQuestion: (id: string) => void;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onDeleteQuestion: (id: string) => void;
  onAddOption: (qid: string) => void;
  onRemoveOption: (qid: string, oid: string) => void;
  onOptionText: (qid: string, oid: string, text: string) => void;
  onOptionImage: (qid: string, oid: string) => void;
  onClearOptionImage: (qid: string, oid: string) => void;
  onSetCorrect: (qid: string, oid: string) => void;
}) {
  const selected = questions.find((q) => q.id === selectedId) ?? null;
  return (
    <div className="absolute bottom-3 left-20 top-24 z-20 flex w-72 max-w-[80vw] flex-col rounded-2xl border border-border bg-surface/95 p-3 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">❓ Quiz</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quiz panel"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-background"
        >
          ✕
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Questions can be on any page. You&apos;re on page {currentPage + 1} of {pageCount}.
      </p>
      <button
        type="button"
        onClick={onAddQuestion}
        className="mt-2 rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white shadow hover:brightness-105"
      >
        ＋ Add question on this page
      </button>

      <div className="mt-2 min-h-[3rem] max-h-40 overflow-y-auto">
        {questions.length === 0 ? (
          <p className="px-1 text-xs text-muted">No questions yet. Add one to get started.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {questions.map((q, i) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onSelectQuestion(q.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                    q.id === selectedId ? "bg-brand/10 ring-1 ring-brand" : "hover:bg-background"
                  }`}
                >
                  <span className="rounded bg-background px-1.5 text-xs font-semibold text-muted">
                    P{q.pageIndex + 1}
                  </span>
                  <span className="flex-1 truncate text-foreground">{q.prompt || `Question ${i + 1}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="mt-2 flex-1 overflow-y-auto border-t border-border pt-2">
          <label className="text-xs font-semibold text-muted" htmlFor="quiz-prompt">
            Question
          </label>
          <input
            id="quiz-prompt"
            value={selected.prompt}
            onChange={(e) => onUpdatePrompt(selected.id, e.target.value)}
            placeholder="What do you want to ask?"
            className="input mt-1 w-full text-sm"
          />

          <p className="mt-2 text-xs font-semibold text-muted">Answers — tap the circle to mark the correct one</p>
          <div className="mt-1 flex flex-col gap-1.5">
            {selected.options.map((o) => (
              <div key={o.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSetCorrect(selected.id, o.id)}
                  title="Mark as the correct answer"
                  aria-label={`Mark "${o.text || "this answer"}" as correct`}
                  aria-pressed={selected.correctOptionId === o.id}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
                    selected.correctOptionId === o.id
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border text-transparent"
                  }`}
                >
                  ✓
                </button>
                <input
                  value={o.text ?? ""}
                  onChange={(e) => onOptionText(selected.id, o.id, e.target.value)}
                  placeholder="Answer"
                  aria-label="Answer text"
                  className="input flex-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => (o.imagePath ? onClearOptionImage(selected.id, o.id) : onOptionImage(selected.id, o.id))}
                  title={o.imagePath ? "Remove picture" : "Add a picture"}
                  aria-label={o.imagePath ? "Remove answer picture" : "Add answer picture"}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm ${
                    o.imagePath ? "border-brand bg-brand/10" : "border-border"
                  }`}
                >
                  {o.imagePath ? "🖼️" : "＋🖼️"}
                </button>
                {selected.options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => onRemoveOption(selected.id, o.id)}
                    aria-label="Remove answer"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:text-rose-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {selected.options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => onAddOption(selected.id)}
              className="mt-1.5 text-xs font-semibold text-brand"
            >
              ＋ Add answer
            </button>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onDeleteQuestion(selected.id)}
              className="text-xs font-semibold text-rose-600 hover:underline"
            >
              Delete this question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// "Restore your unsaved work?" — shown on mount when a local draft exists.
// Keyboard-reachable, focus-trapped, ≥64px child touch targets.
function RestorePrompt({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
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
          Restore your unsaved work?
        </h2>
        <p className="mt-2 text-sm text-muted">
          We kept what you were doing on this device. Carry on where you left off?
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
