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

// The realistic tools that rise from the bottom edge (drawing implements only).
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
}: {
  name: string;
  background?: string[];
  allowImport?: boolean;
  fullScreen?: boolean;
  title?: string;
  subtitle?: string;
  withCaption?: boolean;
  onClose?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pagesRef = useRef<string[]>([]);
  const currentRef = useRef(0);
  const anyDrawnRef = useRef(false);
  const loadingRef = useRef(false);

  const drawing = useRef(false);
  const snapshot = useRef<ImageData | null>(null);
  const points = useRef<{ x: number; y: number }[]>([]);

  // Undo / redo history: a stack of page PNG data URLs per page index.
  const undoRef = useRef<Record<number, string[]>>({});
  const redoRef = useRef<Record<number, string[]>>({});
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
  const [ready, setReady] = useState(false);

  // Full-screen-only UI state.
  const [fanOpen, setFanOpen] = useState(false);
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
  function refreshUndoRedo() {
    setCanUndo((undoRef.current[currentRef.current]?.length ?? 0) > 0);
    setCanRedo((redoRef.current[currentRef.current]?.length ?? 0) > 0);
  }
  function refreshThumbs() {
    setThumbs([...pagesRef.current]);
  }
  // Snapshot the current page before a change, so it can be undone.
  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stack = (undoRef.current[currentRef.current] ??= []);
    stack.push(canvas.toDataURL("image/png"));
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
        setPageCount(pages.length);
        loadPage(0);
      } else {
        paintWhite();
        pagesRef.current = [canvas.toDataURL("image/png")];
      }
      syncHidden();
      refreshThumbs();
      setReady(true);
    })();

    // Keep the canvas box sized to fit the viewport at 10:7 (full-screen).
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

  function syncHidden() {
    const canvas = canvasRef.current;
    if (canvas) pagesRef.current[currentRef.current] = canvas.toDataURL("image/png");
    if (hiddenRef.current) {
      hiddenRef.current.value = anyDrawnRef.current ? JSON.stringify(pagesRef.current) : "[]";
    }
  }

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

  function undo() {
    const stack = undoRef.current[currentRef.current];
    if (!stack || !stack.length) return;
    const canvas = canvasRef.current!;
    (redoRef.current[currentRef.current] ??= []).push(canvas.toDataURL("image/png"));
    const prev = stack.pop()!;
    void paintDataUrl(prev).then(() => {
      pagesRef.current[currentRef.current] = prev;
      syncHidden();
      refreshThumbs();
      refreshUndoRedo();
    });
  }

  function redo() {
    const stack = redoRef.current[currentRef.current];
    if (!stack || !stack.length) return;
    const canvas = canvasRef.current!;
    (undoRef.current[currentRef.current] ??= []).push(canvas.toDataURL("image/png"));
    const next = stack.pop()!;
    void paintDataUrl(next).then(() => {
      pagesRef.current[currentRef.current] = next;
      syncHidden();
      refreshThumbs();
      refreshUndoRedo();
    });
  }

  function goToPage(index: number) {
    if (index < 0 || index >= pagesRef.current.length || index === currentRef.current) return;
    commitText();
    syncHidden();
    currentRef.current = index;
    setCurrent(index);
    loadPage(index);
    refreshUndoRedo();
  }

  function addPage() {
    commitText();
    syncHidden();
    paintWhite();
    pagesRef.current.push(canvasRef.current!.toDataURL("image/png"));
    const index = pagesRef.current.length - 1;
    currentRef.current = index;
    setPageCount(pagesRef.current.length);
    setCurrent(index);
    loadPage(index);
    refreshThumbs();
    refreshUndoRedo();
  }

  function deletePage() {
    if (pagesRef.current.length <= 1) return;
    commitText();
    pagesRef.current.splice(currentRef.current, 1);
    delete undoRef.current[currentRef.current];
    delete redoRef.current[currentRef.current];
    const index = Math.max(0, currentRef.current - 1);
    currentRef.current = index;
    setPageCount(pagesRef.current.length);
    setCurrent(index);
    loadPage(index);
    syncHidden();
    refreshThumbs();
    refreshUndoRedo();
  }

  function clearPage() {
    commitText();
    pushHistory();
    paintWhite();
    anyDrawnRef.current = anyDrawnRef.current || pagesRef.current.length > 1;
    syncHidden();
    refreshThumbs();
  }

  async function addImageAsPage(src: string) {
    const canvas = canvasRef.current;
    const c = ctx();
    if (!canvas || !c) return;
    commitText();
    syncHidden();
    const replaceBlank = pagesRef.current.length === 1 && !anyDrawnRef.current;
    paintWhite();
    try {
      const img = await loadImage(src);
      drawContain(c, img);
    } catch {
      /* ignore */
    }
    const dataUrl = canvas.toDataURL("image/png");
    if (replaceBlank) {
      pagesRef.current[0] = dataUrl;
      currentRef.current = 0;
    } else {
      pagesRef.current.push(dataUrl);
      currentRef.current = pagesRef.current.length - 1;
    }
    anyDrawnRef.current = true;
    setPageCount(pagesRef.current.length);
    setCurrent(currentRef.current);
    syncHidden();
    refreshThumbs();
    refreshUndoRedo();
  }

  async function onImportFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setFanOpen(false);
    setImporting(true);
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
            await addImageAsPage(tmp.toDataURL("image/png"));
          }
        } else if (file.type.startsWith("image/")) {
          const url = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(file);
          });
          await addImageAsPage(url);
        }
      }
    } finally {
      loadingRef.current = false;
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function pickHue(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setHueFrac(frac);
    setColor(hslToHex(frac * 360, 85, 52));
  }

  const scale = displayW / W;

  // Shared bits used by both layouts.
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

  // ---- Full-screen, child-led layout (1a + ＋ fan) --------------------------
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-[#e9ebf1]">
        {hiddenInputs}

        <div ref={wrapRef} className="relative flex-1 overflow-hidden">
          {/* Centred canvas */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden"
              style={{ width: box.w, height: box.h }}
            >
              {canvasEl}
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-muted">
                  Loading…
                </div>
              )}
              {activeText && (
                <TextBox
                  data={activeText}
                  scale={scale}
                  onChange={(value) => setActiveText((t) => (t ? { ...t, value } : t))}
                  onMove={(x, y) => setActiveText((t) => (t ? { ...t, x, y } : t))}
                  onDone={commitText}
                />
              )}
            </div>
          </div>

          {/* Top-left icon buttons */}
          <div className="absolute left-3 top-3 flex gap-2">
            <RoundBtn label="Clear page" onClick={clearPage}>🗑️</RoundBtn>
            <RoundBtn label="Undo" onClick={undo} disabled={!canUndo}>↶</RoundBtn>
            <RoundBtn label="Redo" onClick={redo} disabled={!canRedo}>↷</RoundBtn>
          </div>

          {/* Top-centre status + optional title */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 w-[60vw] max-w-lg -translate-x-1/2 text-center">
            <span className="rounded-full border-2 border-amber-400 bg-white/90 px-3 py-1 text-sm font-bold text-amber-700">
              ✎ Draft
            </span>
            {title && <p className="mt-1 text-sm font-bold text-foreground/80">{title}</p>}
            {subtitle && <p className="text-xs text-foreground/60">{subtitle}</p>}
          </div>

          {/* Top-right: close + Done */}
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {onClose && (
              <RoundBtn label="Close" onClick={onClose}>✕</RoundBtn>
            )}
            <button
              type="submit"
              title="Done"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-emerald-600"
            >
              ✓
            </button>
          </div>

          {/* Left: ＋ fan to add media */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            {fanOpen && (
              <div className="mb-2 flex flex-col gap-2">
                <FanBtn label="Photo / PDF" onClick={() => fileRef.current?.click()}>🖼️</FanBtn>
                <FanBtn label="Text" onClick={() => { setFanOpen(false); setTool("text"); }}>🔤</FanBtn>
              </div>
            )}
            <button
              type="button"
              onClick={() => setFanOpen((v) => !v)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-3xl font-light text-white shadow-lg transition-transform hover:scale-105"
              title="Add"
              style={{ transform: fanOpen ? "rotate(45deg)" : "none" }}
            >
              ＋
            </button>
          </div>

          {/* Right: rainbow hue slider + palette */}
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

          {/* Bottom-centre: realistic tool shelf */}
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
            {/* Text tool as a small pen-in-hand style button */}
            <button
              type="button"
              onClick={() => { setTool("text"); }}
              className={`pointer-events-auto mb-3 ml-2 flex h-12 w-12 items-center justify-center rounded-2xl border-2 text-xl shadow ${
                tool === "text" ? "border-brand bg-brand/10 text-brand" : "border-border bg-white text-muted"
              }`}
              title="Text"
            >
              🔤
            </button>
          </div>

          {/* Bottom-left: caption */}
          {withCaption && (
            <div className="absolute bottom-3 left-3 w-64 max-w-[70vw]">
              <input
                name="caption"
                className="input bg-white/90 shadow"
                placeholder="💬 Add a caption…"
              />
            </div>
          )}

          {/* Right: page filmstrip (below Done) */}
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
                    className={`overflow-hidden rounded-lg border-2 ${
                      i === current ? "border-brand" : "border-transparent"
                    }`}
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
                  <button
                    type="button"
                    onClick={deletePage}
                    className="text-xs text-muted hover:text-rose-600"
                  >
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

  // ---- Inline layout (used by the teacher template builder) ----------------
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
      </div>

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

      <div className="relative mx-auto" style={{ maxHeight: "70vh", aspectRatio: "10 / 7", width: "100%" }}>
        {canvasEl}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-muted">Loading…</div>
        )}
        {activeText && (
          <TextBox
            data={activeText}
            scale={scale}
            onChange={(value) => setActiveText((t) => (t ? { ...t, value } : t))}
            onMove={(x, y) => setActiveText((t) => (t ? { ...t, x, y } : t))}
            onDone={commitText}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => goToPage(current - 1)} disabled={current === 0} className="btn-ghost px-3 py-1.5 text-sm">‹ Prev</button>
        <span className="text-sm font-semibold text-muted">Page {current + 1} of {pageCount}</span>
        <button type="button" onClick={() => goToPage(current + 1)} disabled={current === pageCount - 1} className="btn-ghost px-3 py-1.5 text-sm">Next ›</button>
        <button type="button" onClick={addPage} className="btn-ghost px-3 py-1.5 text-sm">＋ Add page</button>
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

// A simple illustrated drawing tool. The tip shows the current colour.
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
      {/* tip */}
      {kind === "eraser" ? (
        <rect x="8" y="2" width="36" height="30" rx="6" fill={tip} />
      ) : (
        <polygon points="26,0 40,34 12,34" fill={tip} />
      )}
      {/* collar */}
      <rect x="12" y="32" width="28" height="8" rx="3" fill="rgba(0,0,0,.15)" />
      {/* body */}
      <rect x="12" y="38" width="28" height="108" rx="10" fill={body} />
      <rect x="12" y="38" width="9" height="108" rx="6" fill="rgba(255,255,255,.35)" />
      <rect x="12" y="38" width="28" height="108" rx="10" fill="none" stroke="rgba(0,0,0,.12)" />
    </svg>
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
