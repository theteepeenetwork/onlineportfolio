"use client";

// The page tray.
//
// Pages used to be a column of thumbnails behind a "‹ Pages" toggle on the
// right-hand edge: shut by default, so how many pages a child had — and which
// one they were on — was a thing they had to go and look for. Handing in the
// wrong number of pages is the commonest way a piece of work arrives wrong.
//
// Here the pages are always visible, on a kraft tray along the bottom, and the
// one being drawn on GROWS UP OUT OF IT rather than merely being outlined. The
// tray has headroom for exactly that, which is why it is padded and why the
// cards have a bottom transform origin.
//
// Everything else it does, the old strip did too: go to a page, add one, copy
// one, throw one away. Reordering, which used to need a right-click menu a
// child has no way to open, is now hold-and-slide.
//
// Throwing a page away used to live only in the hold menu, which a child finds
// by accident if at all. A page they may throw away now wears a small jam ✕ on
// its corner (a teacher's feedback, September 2026). Which pages those are is
// the canvas's call — see `pageDelete` there — and the tray only draws it.
//
// Which pages may be slid is the canvas's call too, and for a child it is the
// same pages (owner decision 2026-09-10, F76): the teacher's pages stay in the
// order the teacher set, and a child's own may go anywhere among them. Holding
// a teacher's page still lands — it is how the menu opens — but the card does
// not come up to be slid.

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { SPRING, SPRING_MS, Z_MENU, Z_TRAY } from "@/lib/canvasFan";
import type { Unit } from "./Fan";

const INK = "#22304a";
const CREAM = "#fffdf7";
const PAPER = "#faf6ee";
const KRAFT_TAG = "#f3e3c3";
const KRAFT_DARK = "#a8854f";
const JAM = "#bd3f63";

const CARD_W = 96;
const CARD_H = 84;
const GAP = 8;
const SLOT = CARD_W + GAP;
const VISIBLE = 5;
// How long a press has to last before the card lifts. Short enough that a child
// finds it by accident, long enough that a tap is still a tap.
const HOLD_MS = 350;
// The throw-away cross. What a child SEES is a 30px jam dot on the card's top
// right corner; what they PRESS is 64px (rule 18, the F41 pattern: a small dot
// inside a full-size press, so the mark does not bury the picture it sits on).
// The press rises CROSS_UP above the card and comes the rest of the way down
// onto it, which leaves the middle of the card — where a finger goes to open
// the page — the card's own. It overhangs the card's right edge by the gap
// between cards and no further, so it never lands on the next card.
const CROSS_HIT = 64;
const CROSS_DOT = 30;
const CROSS_UP = 36;
const CROSS_OUT = GAP;
// Extra headroom in the strip, so the cross on the LIFTED card is not clipped
// by the strip's own edge: that card rises about 27, and its press 42 more.
const CROSS_HEAD = 30;

export function PageTray({
  u,
  count,
  active,
  thumbs,
  deletable,
  movable,
  canStructure,
  onGo,
  onAdd,
  onReorder,
  onDuplicate,
  onDelete,
  onClear,
  onContextMenu,
  maxWidth,
}: {
  u: Unit;
  count: number;
  active: number;
  /** One preview PNG per page — strokes, objects and all. */
  thumbs: string[];
  /** Which pages may be thrown away, one flag per page. The canvas decides;
      the tray draws a cross on each and offers it in that page's menu. */
  deletable: boolean[];
  /** Which pages may be held and slid to a new place, one flag per page. The
      canvas decides, and refuses a move of any other page itself as well. */
  movable: boolean[];
  canStructure: boolean;
  onGo: (i: number) => void;
  onAdd: () => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
  /** Wipe the drawing off a page, leaving the page. */
  onClear: (i: number) => void;
  /** Right-click / two-finger click on a card. A mouse's way to the same menu
      the hold gives a finger — see CanvasMenu for why it is a menu, not a
      dialog. */
  onContextMenu?: (e: React.MouseEvent, i: number) => void;
  /** How wide the tray may grow before its strip starts to scroll. The two
      discs own the bottom corners, and a tray that reached under one of them
      would put a page card behind the toolbox. */
  maxWidth: number;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dx: number } | null>(null);
  // Where the strip is scrolled to, so the fade and chevron sit only at an end
  // that has more pages beyond it — as the design draws them.
  const [scroll, setScroll] = useState({ left: 0, max: 0 });
  const readScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    setScroll((prev) => {
      const next = { left: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
      return prev.left === next.left && prev.max === next.max ? prev : next;
    });
  };
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressRef = useRef<{ i: number; x: number; lifted: boolean; moved: boolean } | null>(null);

  useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current); }, []);

  // Keep the page being drawn on in view when it changes underneath the strip.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const target = active * u(SLOT);
    if (target < el.scrollLeft || target + u(CARD_W) > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, target - el.clientWidth / 2 + u(CARD_W) / 2), behavior: "smooth" });
    }
  }, [active, u]);
  useEffect(() => {
    readScroll();
  }, [count]);

  // Five pages' worth, or whatever room there is between the discs — whichever
  // is less. Past that the strip scrolls, which it already knows how to do.
  // The scroll box is pulled 8 into the tray's padding on each side and pads
  // the same 8 back, so its CONTENT box is 16 narrower than its width: the
  // width has to carry that, or the last card is jammed against "new page"
  // and a lifted end card is cut off by the box's own edge.
  const stripW = Math.min(
    Math.min(count, VISIBLE) * SLOT - GAP + 24 + 16,
    Math.max(u(SLOT, 64), maxWidth - u(72, 64) - u(GAP) - u(16) - 6),
  );

  function down(e: React.PointerEvent, i: number) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pressRef.current = { i, x: e.clientX, lifted: false, moved: false };
    setMenu(null);
    holdRef.current = setTimeout(() => {
      const p = pressRef.current;
      if (!p) return;
      p.lifted = true;
      // A page that may not move is not lifted: the hold has landed, so
      // letting go opens its menu, but there is nothing to slide.
      if (movable[i] === true) setDrag({ from: i, to: i, dx: 0 });
    }, HOLD_MS);
  }

  function move(e: React.PointerEvent) {
    const p = pressRef.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    if (Math.abs(dx) > 4) p.moved = true;
    if (!p.lifted) {
      // A slide before the hold lands is a scroll, not a drag.
      if (p.moved && holdRef.current) {
        clearTimeout(holdRef.current);
        holdRef.current = null;
      }
      return;
    }
    if (movable[p.i] !== true) return;
    const step = Math.round(dx / u(SLOT));
    const to = Math.max(0, Math.min(count - 1, p.i + step));
    setDrag({ from: p.i, to, dx });
  }

  function up() {
    const p = pressRef.current;
    pressRef.current = null;
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    if (!p) return;
    if (p.lifted) {
      const d = drag;
      setDrag(null);
      if (d && d.to !== d.from) onReorder(d.from, d.to);
      // Held and let go without moving: the menu, which is where copy and
      // throw-away live.
      else setMenu(p.i);
      return;
    }
    if (!p.moved) onGo(p.i);
  }

  // Where a card sits once the dragged one has been pulled out of the order.
  function shift(i: number): number {
    if (!drag || drag.to === drag.from) return 0;
    if (i === drag.from) return drag.dx;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -u(SLOT);
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return u(SLOT);
    return 0;
  }

  return (
    <div
      className="absolute"
      style={{
        left: "50%",
        transform: "translateX(-50%)",
        bottom: u(12),
        zIndex: Z_TRAY,
        display: "flex",
        alignItems: "flex-end",
        gap: u(GAP),
        background: KRAFT_TAG,
        border: `${Math.max(2, u(3))}px solid ${INK}`,
        borderRadius: u(18),
        padding: u(8),
        boxShadow: `0 ${u(4)}px 0 rgba(34,48,74,.15)`,
      }}
    >
      <div style={{ position: "relative" }}>
        <div
          ref={stripRef}
          className="sj-noscrollbar"
          onScroll={readScroll}
          style={{
            position: "relative",
            width: u(stripW),
            // The design's headroom: the scroll box is 124 tall for an 84 card,
            // pulled up 40 so it sits on the tray's floor, and the row inside
            // is pushed down the same 40. An `overflow-x: auto` box clips on
            // the y axis too, so the room for the lifted card has to be INSIDE
            // it — a card that grows up out of the tray and is cut off at the
            // tray's edge undoes the whole point of lifting it.
            height: u(124 + CROSS_HEAD),
            margin: `${u(-40 - CROSS_HEAD)}px ${u(-8)}px 0`,
            padding: `0 ${u(8)}px`,
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x proximity",
            touchAction: "pan-x",
            // The headroom is empty air over the child's page, and must not eat
            // strokes drawn there. So the strip lets touches through, and only
            // its row of cards — and what rises out of it — takes them.
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              gap: u(GAP),
              height: u(CARD_H, 64),
              marginTop: u(40 + CROSS_HEAD),
              padding: `0 ${u(12)}px`,
              width: "max-content",
              pointerEvents: "auto",
            }}
          >
          {Array.from({ length: count }, (_, i) => {
            const isActive = i === active;
            const dragging = drag?.from === i;
            const tilt = dragging ? -3 : isActive ? 0 : i % 2 ? 2 : -2;
            const lift = dragging ? -22 : isActive ? -14 : 0;
            const scaleN = dragging ? 1.12 : isActive ? 1.16 : 1;
            // Never while a card is being slid: a cross passing under a moving
            // finger is a page thrown away by accident.
            const cross = deletable[i] === true && count > 1 && !drag;
            return (
              // The card and its cross are SIBLINGS in one wrapper, never one
              // inside the other: a button in a button is two controls a screen
              // reader cannot tell apart, and a press on the cross would be a
              // press on the card too. The wrapper carries the lift and the
              // tilt, so the cross rides on the card's corner wherever it goes.
              <div
                key={i}
                style={{
                  position: "relative",
                  flex: "0 0 auto",
                  width: u(CARD_W, 64),
                  height: u(CARD_H, 64),
                  scrollSnapAlign: "center",
                  transformOrigin: "50% 100%",
                  transform: `translate(${shift(i)}px, ${u(lift)}px) scale(${scaleN}) rotate(${tilt}deg)`,
                  zIndex: dragging ? 3 : isActive ? 2 : 1,
                  transition: `transform ${SPRING_MS}ms ${SPRING}`,
                }}
              >
              <button
                type="button"
                onPointerDown={(e) => down(e, i)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, i) : undefined}
                aria-current={isActive ? "true" : undefined}
                aria-label={`Page ${i + 1}`}
                title={`Page ${i + 1}`}
                style={{
                  position: "relative",
                  display: "block",
                  width: "100%",
                  height: "100%",
                  background: CREAM,
                  border: `${Math.max(2, u(3))}px solid ${INK}`,
                  borderRadius: u(14),
                  padding: u(5),
                  boxShadow: dragging
                    ? `0 ${u(14)}px 0 rgba(34,48,74,.25)`
                    : isActive
                      ? `0 ${u(8)}px 0 rgba(34,48,74,.2)`
                      : `0 ${u(4)}px 0 rgba(34,48,74,.15)`,
                  transition: drag ? undefined : "box-shadow 220ms",
                  touchAction: "none",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "block",
                    height: u(56),
                    borderRadius: u(6),
                    background: PAPER,
                    border: `${Math.max(1, u(2))}px solid #e4dcc8`,
                    overflow: "hidden",
                  }}
                >
                  {thumbs[i] && (
                    // Never the press's target. An <img> under a mouse starts
                    // the browser's own image drag, which cancels the pointer
                    // mid-slide, so a card held by its picture — most of the
                    // card — opened its menu instead of moving. A long press on
                    // an image is also where a tablet offers "Save image".
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbs[i]}
                      alt=""
                      draggable={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    display: "block",
                    textAlign: "center",
                    font: `600 ${u(13)}px/${u(16)}px var(--font-fredoka)`,
                    color: isActive ? JAM : INK,
                  }}
                >
                  {i + 1}
                </span>
              </button>
              {cross && (
                <button
                  type="button"
                  onClick={() => onDelete(i)}
                  aria-label={`Throw away page ${i + 1}`}
                  title={`Throw away page ${i + 1}`}
                  data-page-cross={i + 1}
                  style={{
                    position: "absolute",
                    top: -u(CROSS_UP),
                    right: -u(CROSS_OUT),
                    width: u(CROSS_HIT, 64),
                    height: u(CROSS_HIT, 64),
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    zIndex: 4,
                    touchAction: "manipulation",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      // Centred just inside the card's own top-right corner.
                      left: u(CROSS_HIT - CROSS_OUT - 6 - CROSS_DOT / 2),
                      top: u(CROSS_UP + 2 - CROSS_DOT / 2),
                      width: u(CROSS_DOT),
                      height: u(CROSS_DOT),
                      boxSizing: "border-box",
                      borderRadius: 999,
                      background: JAM,
                      border: `${Math.max(2, u(3))}px solid ${INK}`,
                      color: CREAM,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 ${u(2)}px 0 rgba(34,48,74,.25)`,
                    }}
                  >
                    <Icon name="close" size={u(16)} decorative />
                  </span>
                </button>
              )}
              </div>
            );
          })}
          </div>
        </div>

        {/* Past five pages the strip scrolls, and says so at whichever end has
            more left in it — a fade into the kraft and a chevron. */}
        {scroll.max > 4 && scroll.left < scroll.max - 4 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute flex items-center justify-end"
            style={{
              right: 0,
              top: 0,
              bottom: 0,
              width: u(40),
              paddingRight: u(2),
              background: `linear-gradient(to left, ${KRAFT_TAG}, transparent)`,
              font: `600 ${u(26)}px var(--font-fredoka)`,
              color: KRAFT_DARK,
            }}
          >
            ›
          </span>
        )}
        {scroll.left > 4 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute flex items-center justify-start"
            style={{
              left: 0,
              top: 0,
              bottom: 0,
              width: u(40),
              paddingLeft: u(2),
              background: `linear-gradient(to right, ${KRAFT_TAG}, transparent)`,
              font: `600 ${u(26)}px var(--font-fredoka)`,
              color: KRAFT_DARK,
            }}
          >
            ‹
          </span>
        )}
      </div>

      {/* A folded-corner card, not a plus: a new page is a thing, not an
          operation. */}
      <button
        type="button"
        onClick={onAdd}
        title="Add page"
        aria-label="new page"
        style={{
          position: "relative",
          flex: "0 0 auto",
          width: u(72, 64),
          height: u(CARD_H, 64),
          background: PAPER,
          border: `${Math.max(2, u(3))}px dashed ${KRAFT_DARK}`,
          borderRadius: u(14),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: u(4),
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 0,
            height: 0,
            borderTop: `${u(14)}px solid ${KRAFT_TAG}`,
            borderLeft: `${u(14)}px solid transparent`,
            borderTopRightRadius: u(11),
          }}
        />
        <span
          aria-hidden="true"
          style={{
            width: u(24),
            height: u(30),
            borderRadius: u(3),
            background: CREAM,
            border: `${Math.max(1, u(2))}px solid ${KRAFT_DARK}`,
          }}
        />
        <span style={{ font: `600 ${u(13)}px var(--font-fredoka)`, color: "#8a5f1e" }}>new page</span>
      </button>

      {menu !== null && (
        <PageMenu
          u={u}
          index={menu}
          count={count}
          canDelete={deletable[menu] === true}
          canMove={movable[menu] === true && count > 1}
          canStructure={canStructure}
          onDuplicate={() => { setMenu(null); onDuplicate(menu); }}
          onDelete={() => { setMenu(null); onDelete(menu); }}
          onClear={() => { setMenu(null); onClear(menu); }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function PageMenu({
  u,
  index,
  count,
  canDelete,
  canMove,
  canStructure,
  onDuplicate,
  onDelete,
  onClear,
  onClose,
}: {
  u: Unit;
  index: number;
  count: number;
  canDelete: boolean;
  /** Whether "hold and slide" would move this page. Not promised otherwise. */
  canMove: boolean;
  canStructure: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function away(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: u(8),
    height: u(64, 64),
    width: "100%",
    padding: `0 ${u(14)}px`,
    background: "rgba(250,246,238,.12)",
    borderRadius: u(12),
    color: "#faf6ee",
    font: `700 ${u(17)}px var(--font-atkinson)`,
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Page ${index + 1}`}
      className="absolute"
      style={{
        left: `calc(50% + ${u(index * SLOT)}px)`,
        transform: "translateX(-50%)",
        bottom: u(118),
        zIndex: Z_MENU,
        width: u(280),
        background: INK,
        borderRadius: u(18),
        padding: u(8),
        display: "flex",
        flexDirection: "column",
        gap: u(6),
        animation: `sj-pop-in ${SPRING_MS}ms ${SPRING} backwards`,
      }}
    >
      {/* Only where it is true: on a teacher's page a child would hold and
          slide and nothing would happen. */}
      {canMove && (
        <span style={{ font: `600 ${u(15)}px var(--font-fredoka)`, color: "rgba(250,246,238,.8)", padding: `${u(4)}px ${u(6)}px` }}>
          Hold and slide to move it
        </span>
      )}
      {canStructure && (
        <button type="button" onClick={onDuplicate} style={row} aria-label="Duplicate this page" title="Make a copy of this page">
          <Icon name="duplicate" size={u(20)} decorative /> Make a copy of this page
        </button>
      )}
      <button type="button" onClick={onClear} style={row} aria-label="Clear page" title="Wipe this page clean">
        <Icon name="eraser" size={u(20)} decorative /> Wipe this page clean
      </button>
      {canDelete && count > 1 && (
        <button type="button" onClick={onDelete} style={row} aria-label={`Delete page ${index + 1}`} title="Delete page">
          <Icon name="delete" size={u(20)} decorative /> Throw this page away
        </button>
      )}
      <span style={{ font: `400 ${u(14)}px var(--font-atkinson)`, color: "rgba(250,246,238,.7)", padding: `0 ${u(6)}px ${u(4)}px` }}>
        Undo brings it back
      </span>
    </div>
  );
}
