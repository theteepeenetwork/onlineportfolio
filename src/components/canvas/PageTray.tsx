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
//
// And all of it from the keyboard (F81). The card is a real <button>, so Tab
// always reached it, but it listened only to pointer events, so Enter and
// Space did nothing and the menu had no key at all. Now Enter or Space goes to
// the page; Shift+F10 or the ContextMenu key opens its menu with focus inside
// it; and a menu opened that way offers "Move this page left / right" in place
// of the hold-and-slide it cannot do — for the same pages the slide would move.

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
// How long after a pointer press ends its click may still arrive. The browser
// sends one after every pointerup on the card — a tap, a hold, a slide — and
// the pointer path has already answered each of those. Generous, because the
// cost of being wrong is only that a key pressed within a second of a tap is
// not swallowed (a key press clears it anyway).
const POINTER_CLICK_MS = 1000;

export function PageTray({
  u,
  ready,
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
  /** Whether the canvas has finished starting up. Until it has, nothing in
      the tray takes a press: see `ready` in DrawingCanvas. */
  ready: boolean;
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
  /** Returns whether the page moved: the canvas may still refuse. */
  onReorder: (from: number, to: number) => boolean;
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
  const trayRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Which card's menu is open, whether a key opened it, and which opening this
  // is — the menu takes focus when it opens, and a move re-anchors it to the
  // page's new place without opening it again.
  const [menu, setMenu] = useState<{ i: number; keys: boolean; seq: number } | null>(null);
  const menuSeqRef = useRef(0);
  const openMenu = (i: number, keys: boolean) => setMenu({ i, keys, seq: ++menuSeqRef.current });
  // A card to hand focus to once the pages have changed under the keyboard:
  // "active" for whichever page the canvas landed on, or a card by index. The
  // cross and the menu both unmount when they are used, and focus that went
  // with them would land on <body> and start the next Tab from the top. Only
  // ever set by a handler whose action re-renders the tray.
  const refocusRef = useRef<"active" | number | null>(null);
  // When the last pointer press on a card ended, and when a key last opened a
  // menu, by the events' own clocks (see `click` and `contextMenu`).
  const pointerEndRef = useRef(-Infinity);
  const keyMenuAtRef = useRef(-Infinity);
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
  // After the render that carries the canvas's answer, so "active" is the page
  // it landed on. Without scrolling: the strip's own effect above does that.
  useEffect(() => {
    const want = refocusRef.current;
    if (want === null) return;
    refocusRef.current = null;
    cardRefs.current[want === "active" ? active : want]?.focus({ preventScroll: true });
  });

  // If focus is somewhere in the tray — on a cross, or in a menu — that is
  // about to disappear, send it to a card after the next render. Asked before
  // acting, while it is still there. A finger's tap on the cross leaves focus
  // alone; a key press does not.
  function keepFocus(to: "active" | number) {
    if (trayRef.current?.contains(document.activeElement)) refocusRef.current = to;
  }

  // Enter or Space. A button turns both into a click, and so does a screen
  // reader's "activate", which is why this is onClick and not a key handler.
  // But the pointer path has already answered every click that follows a
  // pointerup — with a page, a menu or a move — so those are let go.
  function click(e: React.MouseEvent, i: number) {
    if (e.timeStamp - pointerEndRef.current < POINTER_CLICK_MS) {
      pointerEndRef.current = -Infinity;
      return;
    }
    setMenu(null);
    onGo(i);
  }

  function keyDown(e: React.KeyboardEvent, i: number) {
    // A key is never the tail of a pointer press.
    pointerEndRef.current = -Infinity;
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      keyMenuAtRef.current = e.timeStamp;
      openMenu(i, true);
    }
  }

  // Some browsers follow Shift+F10 or the ContextMenu key with a contextmenu
  // event on the focused card, after the key has already opened this tray's
  // menu. That one is not a right-click, and is not passed on.
  function contextMenu(e: React.MouseEvent, i: number) {
    if (e.timeStamp - keyMenuAtRef.current < POINTER_CLICK_MS) {
      e.preventDefault();
      return;
    }
    onContextMenu?.(e, i);
  }

  // The keyboard's hold-and-slide: one place at a time, for the same pages the
  // slide would lift, and the canvas still has the last word. The menu stays
  // open on the page at its new place, so the next press keeps going.
  function moveBy(delta: number) {
    if (!menu) return;
    const to = menu.i + delta;
    if (movable[menu.i] !== true || to < 0 || to >= count) return;
    if (onReorder(menu.i, to)) setMenu({ ...menu, i: to });
  }

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

  function up(e: React.PointerEvent) {
    const p = pressRef.current;
    pressRef.current = null;
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    if (!p) return;
    // Whatever this press did, it is done, and the click behind it is not a
    // second press (see `click`).
    pointerEndRef.current = e.timeStamp;
    if (p.lifted) {
      const d = drag;
      setDrag(null);
      if (d && d.to !== d.from) onReorder(d.from, d.to);
      // Held and let go without moving: the menu, which is where copy and
      // throw-away live.
      else openMenu(p.i, false);
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
      ref={trayRef}
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
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                type="button"
                disabled={!ready}
                onPointerDown={(e) => down(e, i)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onClick={(e) => click(e, i)}
                onKeyDown={(e) => keyDown(e, i)}
                onContextMenu={(e) => contextMenu(e, i)}
                aria-current={isActive ? "true" : undefined}
                aria-keyshortcuts="Shift+F10 ContextMenu"
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
                  disabled={!ready}
                  onClick={() => {
                    keepFocus("active");
                    onDelete(i);
                  }}
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
        disabled={!ready}
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
          key={menu.seq}
          u={u}
          index={menu.i}
          count={count}
          keys={menu.keys}
          canDelete={deletable[menu.i] === true}
          canMove={movable[menu.i] === true && count > 1}
          canStructure={canStructure}
          onMove={moveBy}
          onDuplicate={() => {
            keepFocus("active");
            setMenu(null);
            onDuplicate(menu.i);
          }}
          onDelete={() => {
            keepFocus("active");
            setMenu(null);
            onDelete(menu.i);
          }}
          onClear={() => {
            keepFocus("active");
            setMenu(null);
            onClear(menu.i);
          }}
          onClose={(back) => {
            // Escape hands the keyboard back to the card it came from; a tap
            // elsewhere, or Tab out, leaves focus where it went.
            if (back) keepFocus(menu.i);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

function PageMenu({
  u,
  index,
  count,
  keys,
  canDelete,
  canMove,
  canStructure,
  onMove,
  onDuplicate,
  onDelete,
  onClear,
  onClose,
}: {
  u: Unit;
  index: number;
  count: number;
  /** Opened from the keyboard: it takes focus, and offers moves by button. */
  keys: boolean;
  canDelete: boolean;
  /** Whether "hold and slide" would move this page. Not promised otherwise. */
  canMove: boolean;
  canStructure: boolean;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** `back`: hand focus back to the card (Escape), rather than leave it. */
  onClose: (back: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function away(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(true);
    }
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  // Opened by a key, it opens with focus on its first item: it is drawn at
  // the end of the tray, and a keyboard would otherwise have to walk every
  // card after this one to reach it. A finger's menu leaves focus alone.
  useEffect(() => {
    if (!keys) return;
    ref.current
      ?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')
      ?.focus({ preventScroll: true });
  }, [keys]);

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
      // Tab past the last item leaves the menu, and it closes behind the
      // keyboard rather than hanging open over the page. Nothing focusable
      // follows the tray, so that Tab usually leaves the document and focus
      // goes to no element at all — which counts. The group itself takes focus
      // from a press on its words, so that press does not count as leaving.
      tabIndex={-1}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (!to || !ref.current?.contains(to)) onClose(false);
      }}
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
      {canMove && !keys && (
        <span style={{ font: `600 ${u(15)}px var(--font-fredoka)`, color: "rgba(250,246,238,.8)", padding: `${u(4)}px ${u(6)}px` }}>
          Hold and slide to move it
        </span>
      )}
      {/* A keyboard cannot hold and slide, so it gets the same move as two
          buttons. At the end of the tray one of them has nowhere to go, and
          says so with aria-disabled rather than `disabled`: a disabled button
          drops out of the tab order, and the one a key has just pressed to the
          end would take the keyboard's focus with it. */}
      {canMove && keys && (
        <>
          {([-1, 1] as const).map((delta) => {
            const stuck = delta < 0 ? index === 0 : index === count - 1;
            const word = delta < 0 ? "left" : "right";
            return (
              <button
                key={word}
                type="button"
                aria-disabled={stuck ? "true" : undefined}
                onClick={() => {
                  if (!stuck) onMove(delta);
                }}
                style={{ ...row, opacity: stuck ? 0.45 : 1 }}
              >
                <Icon name={delta < 0 ? "back" : "next"} size={u(20)} decorative /> Move this page {word}
              </button>
            );
          })}
        </>
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
