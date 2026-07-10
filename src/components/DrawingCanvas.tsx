"use client";

import { useEffect, useRef, useState } from "react";

const SWATCHES = [
  "#1f2430", "#ef4444", "#f97316", "#f59e0b", "#10b981",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff",
];
const SIZES = [6, 12, 22];

type Tool = "pencil" | "pen" | "highlighter" | "eraser" | "text";
const TOOLS: { key: Tool; label: string; icon: string }[] = [
  { key: "pencil", label: "Pencil", icon: "✏️" },
  { key: "pen", label: "Pen", icon: "🖊️" },
  { key: "highlighter", label: "Highlighter", icon: "🖍️" },
  { key: "eraser", label: "Eraser", icon: "🧽" },
  { key: "text", label: "Text", icon: "🔤" },
];

const SHELF: { key: Tool; label: string }[] = [
  { key: "pencil", label: "Pencil" },
  { key: "pen", label: "Pen" },
  { key: "highlighter", label: "Marker" },
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
};
type Obj = ImageObj | ShapeObj;
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
}: {
  name: string;
  background?: string[];
  allowImport?: boolean;
  fullScreen?: boolean;
  title?: string;
  subtitle?: string;
  withCaption?: boolean;
  onClose?: () => void;
  onDone?: (pages: string[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Per page: `pagesRef` is the drawing layer (strokes + text + template), and
  // `objectsRef` is the placed-image layer. `compositeRef` is the two flattened
  // together — that's what gets submitted.
  const pagesRef = useRef<string[]>([]);
  const objectsRef = useRef<Obj[][]>([]);
  const compositeRef = useRef<string[]>([]);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const objIdRef = useRef(0);
  const currentRef = useRef(0);
  const anyDrawnRef = useRef(false);
  const loadingRef = useRef(false);

  const drawing = useRef(false);
  const snapshot = useRef<ImageData | null>(null);
  const points = useRef<{ x: number; y: number }[]>([]);

  // Undo / redo: per page, a stack of { drawing layer, objects } snapshots.
  const undoRef = useRef<Record<number, HistoryEntry[]>>({});
  const redoRef = useRef<Record<number, HistoryEntry[]>>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [tool, setTool] = useState<Tool>("pen");
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

  // Placed objects on the current page + which one is selected.
  const [objects, setObjects] = useState<Obj[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (allowImport) import("pdfjs-dist").catch(() => {});
  }, [allowImport]);

  const [fanOpen, setFanOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hueFrac, setHueFrac] = useState(0.62);
  const [box, setBox] = useState({ w: 700, h: 490 });

  type ActiveText = { x: number; y: number; value: string; color: string; fontPx: number };
  const [activeText, setActiveText] = useState<ActiveText | null>(null);
  const activeTextRef = useRef<ActiveText | null>(activeText);
  activeTextRef.current = activeText;
  const [displayW, setDisplayW] = useState(1000);

  function ctx() {
    return canvasRef.current?.getContext("2d") ?? null;
  }
  function textFontPx() {
    return Math.max(20, sizeRef.current * 2.6);
  }
  function paintWhite() {
    const c = ctx();
    if (!c) return;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, W, H);
  }
  function drawContain(c: CanvasRenderingContext2D, img: HTMLImageElement) {
    const scale = Math.min(W / img.width, H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
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

  // Flatten the current drawing layer + its placed objects into one PNG.
  function compositeCurrentPage(): string {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const objs = objectsRef.current[currentRef.current] ?? [];
    if (objs.length === 0) return canvas.toDataURL("image/png");
    const exp = document.createElement("canvas");
    exp.width = W;
    exp.height = H;
    const ec = exp.getContext("2d");
    if (!ec) return canvas.toDataURL("image/png");
    ec.drawImage(canvas, 0, 0, W, H);
    for (const o of objs) {
      if (o.type === "image") {
        const img = imgCacheRef.current.get(o.id);
        if (img && img.complete && img.naturalWidth) ec.drawImage(img, o.x, o.y, o.w, o.h);
      } else {
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
      }
    }
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
      if (background && background.length) {
        const pages: string[] = [];
        for (const url of background) {
          paintWhite();
          try {
            const img = await loadImage(url);
            drawContain(c, img);
          } catch {
            /* leave blank on failure */
          }
          pages.push(canvas.toDataURL("image/png"));
        }
        pagesRef.current = pages;
        anyDrawnRef.current = true;
        currentRef.current = 0;
        setPageCount(pages.length);
        await paintDataUrl(pages[0]);
      } else {
        paintWhite();
        pagesRef.current = [canvas.toDataURL("image/png")];
      }
      objectsRef.current = pagesRef.current.map(() => []);
      compositeRef.current = [...pagesRef.current];
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
    const onSubmit = () => commitText();
    form?.addEventListener("submit", onSubmit, true);

    return () => {
      window.removeEventListener("resize", measure);
      form?.removeEventListener("submit", onSubmit, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function applyStyle(c: CanvasRenderingContext2D) {
    c.globalCompositeOperation = "source-over";
    const s = sizeRef.current;
    switch (toolRef.current) {
      case "eraser":
        c.strokeStyle = "#ffffff";
        c.globalAlpha = 1;
        c.lineWidth = s * 3;
        break;
      case "highlighter":
        c.strokeStyle = colorRef.current;
        c.globalAlpha = 0.3;
        c.lineWidth = s * 3.2;
        break;
      case "pencil":
        c.strokeStyle = colorRef.current;
        c.globalAlpha = 1;
        c.lineWidth = Math.max(1, s * 0.6);
        break;
      default:
        c.strokeStyle = colorRef.current;
        c.globalAlpha = 1;
        c.lineWidth = s;
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
  }

  function commitText() {
    const t = activeTextRef.current;
    if (t && t.value.trim()) {
      pushHistory();
      const c = ctx();
      if (c) {
        c.fillStyle = t.color;
        c.textBaseline = "top";
        c.font = `600 ${t.fontPx}px ${FONT_STACK}`;
        const lineHeight = t.fontPx * 1.2;
        t.value.split("\n").forEach((line, i) => c.fillText(line, t.x, t.y + i * lineHeight));
      }
      anyDrawnRef.current = true;
    }
    activeTextRef.current = null;
    setActiveText(null);
    syncHidden();
    refreshThumbs();
  }

  function start(e: React.PointerEvent) {
    if (loadingRef.current) return;
    setSelectedId(null);
    if (toolRef.current === "text") {
      e.preventDefault();
      commitText();
      const p = pos(e);
      setActiveText({ x: p.x, y: p.y, value: "", color: colorRef.current, fontPx: textFontPx() });
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
    paintWhite();
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
    commitText();
    syncHidden();
    currentRef.current = index;
    setCurrent(index);
    setSelectedId(null);
    setObjects(objectsRef.current[index] ?? []);
    loadPage(index);
    refreshUndoRedo();
  }

  function addPage() {
    commitText();
    syncHidden();
    paintWhite();
    const blank = canvasRef.current!.toDataURL("image/png");
    pagesRef.current.push(blank);
    objectsRef.current.push([]);
    compositeRef.current.push(blank);
    const index = pagesRef.current.length - 1;
    currentRef.current = index;
    setPageCount(pagesRef.current.length);
    setCurrent(index);
    setSelectedId(null);
    setObjects([]);
    loadPage(index);
    refreshThumbs();
    refreshUndoRedo();
  }

  function deletePage() {
    if (pagesRef.current.length <= 1) return;
    commitText();
    pagesRef.current.splice(currentRef.current, 1);
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
    commitText();
    pushHistory();
    paintWhite();
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
    commitText();
    return anyDrawnRef.current ? [...compositeRef.current] : [];
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
      selectedId={selectedId}
      onSelect={setSelectedId}
      onStart={pushHistory}
      onChange={updateObject}
      onEnd={commitObjectChange}
      onDelete={deleteObject}
    />
  );

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
    </>
  );

  const canvasEl = (
    <canvas
      ref={canvasRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      className="h-full w-full touch-none bg-white"
      style={{ cursor: tool === "text" ? "text" : "crosshair" }}
    />
  );

  const activeTextEl = activeText && (
    <TextBox
      data={activeText}
      scale={scale}
      onChange={(value) => setActiveText((t) => (t ? { ...t, value } : t))}
      onMove={(x, y) => setActiveText((t) => (t ? { ...t, x, y } : t))}
      onDone={commitText}
    />
  );

  // ---- Full-screen, child-led layout ---------------------------------------
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-[#e9ebf1]">
        {hiddenInputs}

        <div ref={wrapRef} className="relative flex-1 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden"
              style={{ width: box.w, height: box.h }}
            >
              {canvasEl}
              {objectLayer}
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-muted">
                  Loading…
                </div>
              )}
              {activeTextEl}
            </div>
          </div>

          <div className="absolute left-3 top-3 flex gap-2">
            <RoundBtn label="Clear page" onClick={clearPage}>🗑️</RoundBtn>
            <RoundBtn label="Undo" onClick={undo} disabled={!canUndo}>↶</RoundBtn>
            <RoundBtn label="Redo" onClick={redo} disabled={!canRedo}>↷</RoundBtn>
          </div>

          <div className="pointer-events-none absolute left-1/2 top-3 z-10 w-[60vw] max-w-lg -translate-x-1/2 text-center">
            <span className="rounded-full border-2 border-amber-400 bg-white/90 px-3 py-1 text-sm font-bold text-amber-700">
              ✎ Draft
            </span>
            {title && <p className="mt-1 text-sm font-bold text-foreground/80">{title}</p>}
            {subtitle && <p className="text-xs text-foreground/60">{subtitle}</p>}
          </div>

          <div className="absolute right-3 top-3 flex items-center gap-2">
            {onClose && <RoundBtn label="Close" onClick={onClose}>✕</RoundBtn>}
            <button
              type={onDone ? "button" : "submit"}
              onClick={onDone ? () => onDone(currentPages()) : undefined}
              title="Done"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-emerald-600"
            >
              ✓
            </button>
          </div>

          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            {fanOpen && (
              <div className="mb-2 flex flex-col gap-2">
                <FanBtn label="Photo / PDF" onClick={() => fileRef.current?.click()}>🖼️</FanBtn>
                <FanBtn label="Text" onClick={() => { setFanOpen(false); setTool("text"); }}>🔤</FanBtn>
                <FanBtn label="Shapes" onClick={() => { setShapesOpen((v) => !v); }}>⬟</FanBtn>
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
                  onClick={() => { commitText(); setTool(t.key); }}
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
              className={`pointer-events-auto mb-3 ml-2 flex h-12 w-12 items-center justify-center rounded-2xl border-2 text-xl shadow ${
                tool === "text" ? "border-brand bg-brand/10 text-brand" : "border-border bg-white text-muted"
              }`}
              title="Text"
            >
              🔤
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
              <input name="caption" className="input bg-white/90 shadow" placeholder="💬 Add a caption…" />
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
            onClick={() => { if (t.key !== "text") commitText(); setTool(t.key); }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              tool === t.key ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-muted hover:bg-background"
            }`}
          >
            <span aria-hidden>{t.icon}</span>
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
            📄 {importing ? "Adding…" : "Add PDF / image"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShapesOpen((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
            shapesOpen ? "border-brand bg-brand/10 text-brand" : "border-border bg-surface text-muted hover:bg-background"
          }`}
        >
          ⬟ Shapes
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

      {tool === "text" && !activeText && (
        <p className="mb-1 text-sm text-muted">Tap on the canvas to add text.</p>
      )}
      {selectedId && (
        <p className="mb-1 text-sm text-muted">Drag to move · pull the corner to resize · ✕ to remove.</p>
      )}
      {importError && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{importError}</p>
      )}

      <div ref={wrapRef} className="relative mx-auto" style={{ maxHeight: "70vh", aspectRatio: "10 / 7", width: "100%" }}>
        {canvasEl}
        {objectLayer}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-muted">Loading…</div>
        )}
        {activeTextEl}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => goToPage(current - 1)} disabled={current === 0} className="btn-ghost px-3 py-1.5 text-sm">‹ Prev</button>
        <span className="text-sm font-semibold text-muted">Page {current + 1} of {pageCount}</span>
        <button type="button" onClick={() => goToPage(current + 1)} disabled={current === pageCount - 1} className="btn-ghost px-3 py-1.5 text-sm">Next ›</button>
        <button type="button" onClick={addPage} className="btn-ghost px-3 py-1.5 text-sm">＋ Add page</button>
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-3 py-1.5 text-sm">📄 Add PDF / image</button>
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

function ToolShape({ kind, color }: { kind: Tool; color: string }) {
  const tip = kind === "eraser" ? "#f4a6c0" : color;
  const bodies: Record<string, string> = {
    pencil: "#f2b134",
    pen: "#3b6fd6",
    highlighter: "#8bd450",
    eraser: "#ffffff",
  };
  const body = bodies[kind] ?? "#999";
  return (
    <svg width="52" height="150" viewBox="0 0 52 150" aria-hidden>
      {kind === "eraser" ? (
        <rect x="8" y="2" width="36" height="30" rx="6" fill={tip} />
      ) : (
        <polygon points="26,0 40,34 12,34" fill={tip} />
      )}
      <rect x="12" y="32" width="28" height="8" rx="3" fill="rgba(0,0,0,.15)" />
      <rect x="12" y="38" width="28" height="108" rx="10" fill={body} />
      <rect x="12" y="38" width="9" height="108" rx="6" fill="rgba(255,255,255,.35)" />
      <rect x="12" y="38" width="28" height="108" rx="10" fill="none" stroke="rgba(0,0,0,.12)" />
    </svg>
  );
}

// The layer of movable / resizable image + PDF objects on top of the drawing.
function ObjectLayer({
  objects,
  scale,
  selectedId,
  onSelect,
  onStart,
  onChange,
  onEnd,
  onDelete,
}: {
  objects: Obj[];
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStart: () => void;
  onChange: (id: string, patch: Partial<Obj>) => void;
  onEnd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {objects.map((o) => (
        <ObjectView
          key={o.id}
          o={o}
          scale={scale}
          selected={o.id === selectedId}
          onSelect={onSelect}
          onStart={onStart}
          onChange={onChange}
          onEnd={onEnd}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function ObjectView({
  o,
  scale,
  selected,
  onSelect,
  onStart,
  onChange,
  onEnd,
  onDelete,
}: {
  o: Obj;
  scale: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onStart: () => void;
  onChange: (id: string, patch: Partial<Obj>) => void;
  onEnd: () => void;
  onDelete: (id: string) => void;
}) {
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

  return (
    <div
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`pointer-events-auto absolute cursor-move touch-none ${selected ? "ring-2 ring-brand" : ""}`}
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
      {selected && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(o.id)}
            className="pointer-events-auto absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs text-white shadow"
            title="Remove"
            aria-label="Remove object"
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

function TextBox({
  data,
  scale,
  onChange,
  onMove,
  onDone,
}: {
  data: { x: number; y: number; value: string; color: string; fontPx: number };
  scale: number;
  onChange: (value: string) => void;
  onMove: (x: number, y: number) => void;
  onDone: () => void;
}) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  function onHandleDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - data.x * scale, dy: e.clientY - data.y * scale };
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!drag.current) return;
    onMove((e.clientX - drag.current.dx) / scale, (e.clientY - drag.current.dy) / scale);
  }
  function onHandleUp() {
    drag.current = null;
  }
  return (
    <div className="absolute" style={{ left: data.x * scale, top: data.y * scale, maxWidth: `calc(100% - ${data.x * scale}px)` }}>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          className="cursor-move touch-none rounded bg-brand px-1 text-xs text-white"
          title="Drag to move"
          aria-label="Drag to move text"
        >
          ✥
        </button>
        <textarea
          autoFocus
          value={data.value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onDone}
          rows={1}
          className="resize-none rounded border border-brand bg-white/90 px-1 leading-tight outline-none"
          style={{ color: data.color, fontSize: data.fontPx * scale, fontWeight: 600, minWidth: 80 }}
          placeholder="Type…"
        />
      </div>
    </div>
  );
}
