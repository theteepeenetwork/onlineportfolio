"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { WorkViewer } from "@/app/teacher/queue/WorkViewer";

// Show the class some of their work on the board (SAFEGUARDING rule 25).
//
// THE TEACHER PICKS, THEN SHOWS. Nothing goes up that the teacher has not
// ticked. Every piece handed in for this activity is drawn here as a thumbnail
// and can be ticked straight away, whether it is in a jar or still waiting in
// the queue (owner decision, 12 September 2026, replacing the look-first gate
// of the 10th): the teacher sees what they are picking in the thumbnail, can
// turn its pages with the arrows inside it, and can open it full size if they
// want a closer look. Work that was sent back is not offered at all: it came
// back because it was not ready.
//
// This page is very often the one already mirrored to the projector, and its
// thumbnails now include work no adult has approved. That was weighed and
// accepted: the teacher controls the projector — they can freeze it or switch
// it off while they choose — and the page says so whenever waiting work is on
// it. DPIA R23 holds the residual.
//
// THE PICKS ARE NEVER STORED. React state, and nowhere else: no row, no URL, no
// localStorage. A reload forgets them, which is the point — a "board" that
// remembered would be a publication list, and a publication list is a thing a
// parent could reasonably ask to see. What StoryJar holds about this moment is
// nothing.
//
// SHOWING CHANGES NOTHING. It does not approve, return or put anything in a
// jar, and the server is not told it happened.
//
// WHAT THIS COMPONENT IS GIVEN is exactly what it shows: an id, the pupil's
// name as stored (first names only, rule 2), the status, and the page pictures.
// No caption, no quiz score or total, no stored quiz answers, no teacher's
// note, no stickers — the server builds this shape and the security battery
// reads the page source for them. A quiz hand-in IS offered (owner decision,
// 10 September 2026): its page picture shows the questions and the options
// the child chose, and never which was right or how many they got. That is
// why the viewer below is handed no quiz lines and no score even though the
// queue's viewer can show them: this page may be the one on the projector.

export type BoardPiece = {
  id: string;
  firstName: string;
  status: "PENDING" | "APPROVED";
  pages: string[];
};

type Slide = { pieceId: string; firstName: string; page: number; of: number; src: string };

// What the full-size viewer's heading says the piece is. Deliberately not the
// queue's "Waiting for you": this page may be on the projector.
const STATUS_WORD: Record<BoardPiece["status"], string> = {
  PENDING: "Handed in",
  APPROVED: "In their jar",
};

// A PICK IS OF A VERSION, NOT OF AN ID. A hand-in keeps its id when it is sent
// back and handed in again: `createJournalItem` rewrites the RETURNED row in
// place, back to PENDING, with new pictures at new paths. And this component
// keeps its state when the run page is refreshed under it — which any action
// on the page does ("Not needed", "Put back"). Keyed by id, a tick on the
// first attempt would have put the second attempt on the board, pictures the
// teacher never chose. So every pick and open is of the piece as it was: its
// id, its status and its exact pictures. Change any of them and it is a piece
// the teacher has not picked.
const versionOf = (p: BoardPiece) => JSON.stringify([p.id, p.status, p.pages]);

export function ClassBoard({ activity, pieces }: { activity: string; pieces: BoardPiece[] }) {
  // Versions (see `versionOf`), never bare ids.
  const [picked, setPicked] = useState<string[]>([]);
  const [viewing, setViewing] = useState<{ version: string; page: number } | null>(null);
  const [showing, setShowing] = useState(false);
  const [namesHidden, setNamesHidden] = useState(false);
  const showButton = useRef<HTMLButtonElement>(null);

  const byVersion = useMemo(() => new Map(pieces.map((p) => [versionOf(p), p])), [pieces]);

  const toggle = (p: BoardPiece, on: boolean) => {
    const v = versionOf(p);
    setPicked((prev) => (on ? (prev.includes(v) ? prev : [...prev, v]) : prev.filter((x) => x !== v)));
  };

  // What goes up is worked out afresh from what the page holds NOW, every
  // render: a pick counts only while the piece it was made on is still here,
  // unchanged. One handed in again, sent back (the server stops offering it)
  // or moved in or out of a jar simply drops off the list, the count and the
  // board, and the teacher picks it again if they want it.
  const chosen = picked.flatMap((v) => {
    const p = byVersion.get(v);
    return p ? [p] : [];
  });
  const slides: Slide[] = chosen.flatMap((p) =>
    p.pages.map((src, i) => ({ pieceId: p.id, firstName: p.firstName, page: i + 1, of: p.pages.length, src })),
  );
  const isPicked = (p: BoardPiece) => chosen.includes(p);

  // The board comes down if everything on it has dropped off, and does not
  // come back up by itself when the next tick goes on.
  if (showing && slides.length === 0) setShowing(false);

  // An open viewer is of a version too: if the piece changes while it is open,
  // the viewer closes rather than show new pictures nobody chose to open.
  const open = viewing ? byVersion.get(viewing.version) ?? null : null;

  if (pieces.length === 0) {
    return (
      <p style={{ margin: 0, font: "400 15px/1.5 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Nothing to show yet. Pictures and drawings your class hands in will appear here.
      </p>
    );
  }

  return (
    <div>
      <p style={{ margin: "0 0 12px", font: "400 15px/1.5 var(--font-atkinson)", color: "var(--ink-soft)", maxWidth: "46em" }}>
        Only you choose what goes up. Showing work doesn&apos;t put it in a jar. We recommend viewing work before you
        show it on the board.
      </p>
      {/* The thumbnails below include work nobody has approved, and this page
          is very often already mirrored to the projector. The teacher is the
          one who controls that screen, so they are told, in one line, to take
          it off while they choose. DPIA R23 names the risk. */}
      {pieces.some((p) => p.status === "PENDING") && (
        <p data-board-projector style={{ margin: "0 0 12px", font: "700 15px/1.5 var(--font-atkinson)", color: "var(--ink-soft)", maxWidth: "46em" }}>
          If this screen is on the projector, freeze it or switch it off while you choose.
        </p>
      )}

      <ul aria-label="Work you could show" style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
        {pieces.map((p) => (
          // Keyed by version, so a piece whose pictures change under the page
          // starts again at its first page rather than at a page it may not have.
          <PieceCard
            key={versionOf(p)}
            piece={p}
            on={isPicked(p)}
            onToggle={(on) => toggle(p, on)}
            onOpen={(page) => setViewing({ version: versionOf(p), page })}
          />
        ))}
      </ul>

      <button
        ref={showButton}
        type="button"
        disabled={slides.length === 0}
        onClick={() => setShowing(true)}
        aria-haspopup="dialog"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 48, boxSizing: "border-box", font: "700 16px var(--font-atkinson)", color: "var(--paper)", background: slides.length ? "var(--ink)" : "var(--sj-muted)", border: "none", borderRadius: 999, padding: "12px 24px", cursor: slides.length ? "pointer" : "not-allowed" }}
      >
        <Icon name="class" size={18} decorative /> Show on the board ({chosen.length})
      </button>

      {open && viewing && (
        <WorkViewer
          // A fresh viewer per piece and page opened, so `startPage` is read
          // even when the teacher opens another piece without closing this one.
          key={`${viewing.version}:${viewing.page}`}
          child={open.firstName}
          activity={activity}
          when={STATUS_WORD[open.status]}
          type="DRAWING"
          mediaPath={null}
          mediaPathsJson={JSON.stringify(open.pages)}
          previewPathsJson={null}
          text={null}
          quizReview={null}
          quizScore={null}
          quizTotal={null}
          startPage={viewing.page}
          onClose={() => setViewing(null)}
          footer={
            <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, font: "700 15px var(--font-atkinson)", color: "var(--ink)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isPicked(open)}
                onChange={(e) => toggle(open, e.target.checked)}
                style={{ width: 24, height: 24, accentColor: "var(--ink)" }}
              />
              Add to the board
            </label>
          }
        />
      )}

      {showing && slides.length > 0 && (
        <Board
          slides={slides}
          namesHidden={namesHidden}
          onNamesHidden={setNamesHidden}
          // Focus goes back to this button from the board's own cleanup, once
          // the page behind is no longer inert (see Board). Named rather than
          // read from document.activeElement, because Safari does not focus a
          // button that is clicked.
          returnFocus={showButton}
          onClose={() => setShowing(false)}
        />
      )}
    </div>
  );
}

// One piece in the list: its thumbnail, with arrows inside the picture's edges
// to turn its pages; the picture itself, which opens it full size at the page
// it is on; the pupil's name; and the tick.
function PieceCard({
  piece: p,
  on,
  onToggle,
  onOpen,
}: {
  piece: BoardPiece;
  on: boolean;
  onToggle: (on: boolean) => void;
  onOpen: (page: number) => void;
}) {
  const [page, setPage] = useState(0);
  const n = p.pages.length;
  const at = Math.min(page, n - 1);
  const many = n > 1;
  // Round and round rather than stopping at the ends, so neither arrow is ever
  // disabled under a keyboard user's focus.
  const turn = (by: number) => setPage((x) => (x + by + n) % n);
  const pageWords = many ? `page ${at + 1} of ${n}` : "";

  return (
    <li data-board-piece={p.firstName} data-status={p.status} style={{ background: "var(--paper)", border: `2px solid ${on ? "var(--ink)" : "var(--calm-border)"}`, boxShadow: on ? "0 0 0 2px var(--ink)" : "none", borderRadius: 14, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ position: "relative", height: 130, borderRadius: 10, overflow: "hidden", background: "var(--cream)" }}>
        <button
          type="button"
          onClick={() => onOpen(at)}
          aria-label={`Open ${p.firstName}'s work${many ? `, ${pageWords}` : ""}`}
          style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "transparent", cursor: "zoom-in" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.pages[at]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </button>
        {many && (
          <>
            <button type="button" onClick={() => turn(-1)} aria-label={`Previous page of ${p.firstName}'s work`} style={thumbArrow("left")}>
              ‹
            </button>
            <button type="button" onClick={() => turn(1)} aria-label={`Next page of ${p.firstName}'s work`} style={thumbArrow("right")}>
              ›
            </button>
            <span aria-live="polite" data-board-page style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", padding: "2px 8px", borderRadius: 999, background: "var(--ink)", color: "var(--paper)", font: "700 12px var(--font-atkinson)", pointerEvents: "none", whiteSpace: "nowrap" }}>
              <span aria-hidden="true">
                {at + 1} / {n}
              </span>
              <span className="sj-sr-only">
                {p.firstName}&apos;s work, {pageWords}
              </span>
            </span>
          </>
        )}
      </div>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <strong style={{ font: "700 15px var(--font-atkinson)" }}>{p.firstName}</strong>
        {p.status === "APPROVED" && <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>In their jar</span>}
      </span>
      <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, cursor: "pointer", font: "700 14px var(--font-atkinson)", color: "var(--ink)" }}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} style={{ width: 24, height: 24, accentColor: "var(--ink)" }} />
        Add to the board
      </label>
    </li>
  );
}

// The arrows sit inside the thumbnail, against its left and right edges, over
// the picture. A solid paper disc with an ink ring, so they read on any
// drawing, dark or light.
function thumbArrow(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: 6,
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    borderRadius: 999,
    border: "2px solid var(--ink)",
    background: "var(--paper)",
    color: "var(--ink)",
    font: "700 22px/1 var(--font-atkinson)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    boxShadow: "0 2px 6px rgba(0,0,0,.2)",
  };
}

// The board itself. Opaque and full screen, like the class code reveal
// (src/components/teacher/ClassCodeReveal.tsx), because this is projected: the
// run page behind it has every pupil's name and who has not handed in, and none
// of that may be readable round the edges of a child's drawing.
function Board({
  slides,
  namesHidden,
  onNamesHidden,
  returnFocus,
  onClose,
}: {
  slides: Slide[];
  namesHidden: boolean;
  onNamesHidden: (v: boolean) => void;
  returnFocus: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [at, setAt] = useState(0);
  const i = Math.min(at, slides.length - 1);
  const s = slides[i];
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The latest onClose, without re-running the effects below every time the
  // parent renders — which it does when "Hide names" is pressed, and a focus
  // effect that re-ran then would snatch focus off the switch just pressed.
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  }, [onClose]);

  // WHILE THE BOARD IS UP, THE PAGE BEHIND IT IS INERT. Opaque stops the eye
  // reading the run page round the edges; it does not stop Tab, or a screen
  // reader on the projecting laptop, walking straight past Done onto the pupil
  // list underneath — every name, and who has not handed in. So everything
  // that is not the board or one of its ancestors is made inert for as long as
  // it is open, and given back exactly as it was when it closes: only what this
  // made inert is released. Then focus returns to the button that opened the
  // board, which can only take it once it is no longer inert.
  //
  // Focus lands on Done when the board opens, once.
  useEffect(() => {
    const opener = returnFocus.current;
    const release = inertEverythingBut(rootRef.current);
    closeRef.current?.focus();
    return () => {
      release();
      opener?.focus();
    };
  }, [returnFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latestClose.current();
      if (e.key === "ArrowRight") setAt((n) => Math.min(slides.length - 1, n + 1));
      if (e.key === "ArrowLeft") setAt((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  // With names hidden the name goes from the alt text too, or a screen reader
  // on the projecting laptop would read out what the screen had been told not
  // to show.
  const pageWords = s.of > 1 ? `page ${s.page} of ${s.of}` : "";
  const label = namesHidden ? pageWords : [s.firstName, pageWords].filter(Boolean).join(" · ");
  const alt = namesHidden
    ? `A pupil's work${s.of > 1 ? `, page ${s.page} of ${s.of}` : ""}`
    : `${s.firstName}'s work${s.of > 1 ? `, page ${s.page} of ${s.of}` : ""}`;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Work on the board"
      data-board
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--ink)", color: "var(--paper)", display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 20px 8px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={s.src} src={s.src} alt={alt} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "#fff", borderRadius: 12 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px 18px", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setAt((n) => Math.max(0, n - 1))} disabled={i === 0} aria-label="Previous" style={boardBtn(i === 0)}>
          ‹
        </button>
        <p aria-live="polite" style={{ margin: 0, flex: 1, minWidth: 160, textAlign: "center", font: "600 26px var(--font-fredoka)" }}>
          <span data-board-label>{label}</span>
          <span style={{ display: "block", font: "400 15px var(--font-atkinson)", opacity: 0.8 }}>
            {i + 1} of {slides.length}
          </span>
        </p>
        <button type="button" onClick={() => setAt((n) => Math.min(slides.length - 1, n + 1))} disabled={i === slides.length - 1} aria-label="Next" style={boardBtn(i === slides.length - 1)}>
          ›
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={namesHidden}
          onClick={() => onNamesHidden(!namesHidden)}
          style={{ ...boardBtn(false), width: "auto", padding: "0 22px", font: "700 16px var(--font-atkinson)" }}
        >
          Hide names
        </button>
        <button ref={closeRef} type="button" onClick={onClose} style={{ ...boardBtn(false), width: "auto", padding: "0 24px", font: "700 16px var(--font-atkinson)", background: "var(--paper)", color: "var(--ink)" }}>
          Done
        </button>
      </div>
    </div>
  );
}

// Make every element outside `keep` inert: at each level from `keep` up to
// <body>, every sibling of the path. The ancestors themselves stay live, or the
// board would be inert too. Returns the undo, which touches only what this made
// inert, so an element that was already inert for its own reasons stays so.
function inertEverythingBut(keep: HTMLElement | null): () => void {
  const made: HTMLElement[] = [];
  for (let node = keep; node && node !== document.body; node = node.parentElement) {
    const parent = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      sibling.inert = true;
      made.push(sibling);
    }
  }
  return () => {
    for (const el of made) el.inert = false;
  };
}

function boardBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 64,
    height: 64,
    borderRadius: 999,
    border: "3px solid var(--paper)",
    background: "transparent",
    color: "var(--paper)",
    font: "700 30px var(--font-atkinson)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
