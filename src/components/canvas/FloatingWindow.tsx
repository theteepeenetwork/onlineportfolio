"use client";

// A floating window on the canvas: the Maths kit, and the Quiz builder.
//
// Both are things a teacher uses REPEATEDLY while building one page — place a
// ten frame, place another, place the counters that go in it — so neither can
// behave like the fans, which fold the moment the paper is touched. They stay
// open until they are closed, they can be dragged out of the way, and they
// shrink to a pill when they are in the way but not finished with.
//
// One shell, two bodies, because they are the same object to a teacher and
// looked like two different applications when they were written separately.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import { FRAME_H, FRAME_W, SPRING, SPRING_MS, Z_WINDOW } from "@/lib/canvasFan";
import type { Unit } from "./Fan";

const INK = "#22304a";
const CREAM = "#fffdf7";
const KRAFT_TAG = "#f3e3c3";
const KRAFT_DARK = "#a8854f";

export const WINDOW_W = 380;
export const WINDOW_PILL_W = 214;
const HEADER_H = 52;
// The tray owns the bottom of the frame; a window parked over it would put its
// own body on top of the pages.
const TRAY_ROOM = 140;
const TOP_MIN = 96;

export type WindowPos = { x: number; y: number; collapsed: boolean };

/** Where a window opens: to the right of the page, clear of the top chrome. */
export function defaultWindowPos(offset = 0): WindowPos {
  return { x: FRAME_W - WINDOW_W - 16 - offset, y: TOP_MIN + offset, collapsed: false };
}

/**
 * Park at the nearer horizontal edge and stay inside the frame vertically. A
 * window dropped half off the screen is a window that cannot be grabbed again.
 */
export function parkWindow(pos: WindowPos, height: number): WindowPos {
  const w = pos.collapsed ? WINDOW_PILL_W : WINDOW_W;
  const h = pos.collapsed ? HEADER_H + 6 : height;
  return {
    ...pos,
    x: pos.x + w / 2 < FRAME_W / 2 ? 16 : FRAME_W - w - 16,
    y: Math.max(TOP_MIN, Math.min(FRAME_H - TRAY_ROOM - h, pos.y)),
  };
}

export function FloatingWindow({
  u,
  scale,
  icon,
  title,
  pos,
  onPos,
  onClose,
  closeLabel,
  children,
  bodyMaxH = 560,
}: {
  u: Unit;
  /** Design px per screen px, so a drag in real pixels becomes design units. */
  scale: number;
  icon: IconName;
  title: string;
  pos: WindowPos;
  onPos: (p: WindowPos) => void;
  onClose: () => void;
  /** "Close the maths kit" / "Tuck away" — the words differ, the button does not. */
  closeLabel: string;
  children: ReactNode;
  bodyMaxH?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; y0: number; px: number; py: number; moved: boolean } | null>(null);
  // Whether a finger is on the header. It is state as well as a ref because it
  // decides whether the window EASES to its new place (it parked itself) or
  // follows the finger exactly (it is being dragged).
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  function down(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* a mouse without capture support still drags, just less smoothly */
    }
    drag.current = { x0: e.clientX, y0: e.clientY, px: pos.x, py: pos.y, moved: false };
    setDragging(true);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x0) / scale;
    const dy = (e.clientY - d.y0) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    onPos({ ...pos, x: d.px + dx, y: d.py + dy });
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const height = ref.current ? ref.current.offsetHeight / scale : bodyMaxH;
    // A tap on the pill opens it again; a drag leaves it as it was.
    const next = d.moved ? pos : { ...pos, collapsed: false };
    onPos(parkWindow(next, height));
  }

  const collapsed = pos.collapsed;
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      ref={ref}
      role="region"
      aria-label={title}
      className="absolute"
      style={{
        left: u(pos.x),
        top: u(pos.y),
        width: u(collapsed ? WINDOW_PILL_W : WINDOW_W),
        zIndex: Z_WINDOW,
        background: CREAM,
        border: `${Math.max(2, u(3))}px solid ${INK}`,
        borderRadius: u(20),
        boxShadow: `0 ${u(4)}px 0 rgba(34,48,74,.15)`,
        overflow: "hidden",
        animation: `sj-pop-in ${SPRING_MS}ms ${SPRING} backwards`,
        transition: dragging ? undefined : `left ${SPRING_MS}ms ${SPRING}, top ${SPRING_MS}ms ${SPRING}`,
      }}
    >
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="cursor-grab select-none active:cursor-grabbing"
        style={{
          display: "flex",
          alignItems: "center",
          gap: u(8),
          height: u(HEADER_H),
          padding: `0 ${u(6)}px 0 ${u(12)}px`,
          background: KRAFT_TAG,
          borderBottom: collapsed ? "none" : `${Math.max(2, u(3))}px solid ${INK}`,
          touchAction: "none",
        }}
      >
        <span aria-hidden="true" style={{ display: "grid", gap: u(3) }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ display: "block", width: u(16), height: Math.max(2, u(3)), background: KRAFT_DARK, borderRadius: 999 }} />
          ))}
        </span>
        <Icon name={icon} size={u(22)} decorative />
        <span style={{ flex: 1, font: `600 ${u(18)}px var(--font-fredoka)`, color: INK, whiteSpace: "nowrap" }}>
          {title}
        </span>
        <button
          type="button"
          onPointerDown={stop}
          onClick={() => onPos(parkWindow({ ...pos, collapsed: !collapsed }, bodyMaxH))}
          title={collapsed ? "Expand" : "Shrink to a pill"}
          aria-label={collapsed ? "Expand" : "Shrink to a pill"}
          aria-expanded={!collapsed}
          style={roundBtn(u)}
        >
          <span aria-hidden="true" style={{ font: `600 ${u(18)}px var(--font-fredoka)`, lineHeight: 1 }}>
            {collapsed ? "︿" : "﹀"}
          </span>
        </button>
        <button
          type="button"
          onPointerDown={stop}
          onClick={onClose}
          title="Tuck away"
          aria-label={closeLabel}
          style={roundBtn(u)}
        >
          <Icon name="close" size={u(20)} decorative />
        </button>
      </div>

      {!collapsed && (
        <div
          style={{
            padding: `${u(10)}px ${u(10)}px ${u(8)}px`,
            display: "flex",
            flexDirection: "column",
            gap: u(10),
            maxHeight: u(bodyMaxH),
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function roundBtn(u: Unit): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: u(44, 44),
    height: u(44, 44),
    borderRadius: 999,
    background: "transparent",
    color: INK,
    flex: "0 0 auto",
  };
}
