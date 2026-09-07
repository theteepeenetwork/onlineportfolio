"use client";

import { useState, type ReactNode } from "react";

// One piece of work in a child's jar, at full width, with its pages.
//
// The jar used to be a grid of 280px cards showing page one and nothing else.
// Two things were wrong with that. A child's work was displayed smaller than a
// postage stamp on the one screen that exists to celebrate it; and a piece of
// work that ran to four pages showed only the first, with no sign the other
// three had ever been handed in.
//
// So: one record per row, the work as large as the page allows, and the pages
// turned in place. Nothing opens and nothing has to be closed — a child who can
// scroll can read everything they have made.
//
// `contain`, never `cover`. The grid cropped to fill its band, which is fine
// for a thumbnail of somebody else's work and wrong for a child looking at
// their own: the corner they drew the dog in is exactly what a crop throws
// away.
export function MomentRecord({
  title,
  dateLabel,
  bandBg,
  kindLabel,
  pages,
  alt,
  audioSrc,
  textContent,
  emptyIcon,
  stickers,
  arrivedBadge,
  praiseNote,
}: {
  title: string;
  dateLabel: string;
  bandBg: string;
  kindLabel: string;
  // Every page of the work, in order. One entry is the ordinary case; none is a
  // voice note or a piece of writing.
  pages: string[];
  alt: string;
  audioSrc: string | null;
  textContent: string | null;
  emptyIcon: ReactNode;
  // Rendered on the server, because the sticker catalog lives there.
  stickers: ReactNode;
  arrivedBadge: ReactNode;
  praiseNote: string | null;
}) {
  const [page, setPage] = useState(0);
  const at = Math.min(page, Math.max(0, pages.length - 1));
  const many = pages.length > 1;

  return (
    <article
      style={{
        background: "var(--cream)",
        border: "3px solid var(--ink)",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 4px 0 rgba(34,48,74,0.12)",
      }}
    >
      {/* What it is, before what it looks like: a child scrolling their jar is
          looking for the thing their teacher called something. */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          flexWrap: "wrap",
          padding: "16px 20px 12px",
        }}
      >
        <p style={{ margin: 0, font: "600 calc(22px * var(--sj-type-scale, 1)) var(--font-fredoka)" }}>
          {title}
        </p>
        <p
          style={{
            margin: 0,
            font: "400 calc(15px * var(--sj-type-scale, 1)) var(--font-atkinson)",
            color: "var(--sj-muted)",
          }}
        >
          {dateLabel}
        </p>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {arrivedBadge}
          <span
            style={{
              background: "#FFFDF7",
              border: "2px solid var(--ink)",
              borderRadius: 999,
              padding: "3px 12px",
              font: "700 calc(13px * var(--sj-type-scale, 1)) var(--font-atkinson)",
            }}
          >
            {kindLabel}
          </span>
        </span>
      </div>

      <div
        style={{
          background: bandBg,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 18,
          minHeight: 220,
        }}
      >
        {audioSrc ? (
          <audio
            src={audioSrc}
            controls
            preload="none"
            aria-label={alt}
            style={{ width: "100%", maxWidth: 420 }}
          />
        ) : pages.length ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pages[at]}
            alt={many ? `${alt}, page ${at + 1} of ${pages.length}` : alt}
            style={{
              maxWidth: "100%",
              maxHeight: "62vh",
              objectFit: "contain",
              display: "block",
              borderRadius: 8,
            }}
          />
        ) : textContent ? (
          <p
            style={{
              margin: 0,
              padding: "18px 22px",
              font: "400 calc(18px * var(--sj-type-scale, 1))/1.5 var(--font-atkinson)",
              color: "var(--ink)",
              maxWidth: "44em",
              whiteSpace: "pre-wrap",
            }}
          >
            {textContent}
          </p>
        ) : (
          emptyIcon
        )}
        {/* the teacher's stickers stay peeled onto the work */}
        {stickers}
      </div>

      {/* The pages, turned in place. Only when there is more than one — a
          single-page piece of work should not be given controls that do
          nothing. */}
      {many && (
        <nav
          aria-label={`Pages of ${title}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "12px 16px",
            borderTop: "3px solid var(--ink)",
            background: "var(--paper)",
          }}
        >
          <button type="button" onClick={() => setPage(Math.max(0, at - 1))} disabled={at === 0} style={turner(at === 0)}>
            ‹ Back
          </button>
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-label={`Page ${i + 1}`}
              aria-current={i === at ? "true" : undefined}
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                cursor: "pointer",
                font: "700 calc(19px * var(--sj-type-scale, 1)) var(--font-fredoka)",
                color: i === at ? "var(--paper)" : "var(--ink)",
                background: i === at ? "var(--glass)" : "var(--cream)",
                border: "3px solid var(--ink)",
              }}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(Math.min(pages.length - 1, at + 1))}
            disabled={at === pages.length - 1}
            style={turner(at === pages.length - 1)}
          >
            Next ›
          </button>
        </nav>
      )}

      {/* The teacher's kind note. The child reads it and sends nothing back —
          the one-tap heart reply that used to sit beneath this was removed on
          2026-08-24 as a product decision (see src/app/actions/journal.ts). */}
      {praiseNote && (
        <div style={{ padding: "12px 20px 16px" }}>
          <p
            style={{
              margin: 0,
              font: "400 calc(15px * var(--sj-type-scale, 1))/1.4 var(--font-atkinson)",
              color: "var(--ink-soft)",
            }}
          >
            💬 “{praiseNote}”
          </p>
        </div>
      )}
    </article>
  );
}

// 64px on both axes, because SAFEGUARDING rule 18 is a floor for anything a
// child taps and the a11y gate sweeps every button on this page.
function turner(disabled: boolean): React.CSSProperties {
  return {
    minWidth: 110,
    height: 64,
    padding: "0 20px",
    borderRadius: 999,
    font: "700 calc(17px * var(--sj-type-scale, 1)) var(--font-fredoka)",
    color: "var(--ink)",
    background: "var(--cream)",
    border: "3px solid var(--ink)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
}
