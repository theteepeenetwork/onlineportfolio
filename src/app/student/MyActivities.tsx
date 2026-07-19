"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

// The child's assigned activities, as a thumbnail preview rather than a link out
// to a separate list. The 3 most recent to-do always show as cards (styled like
// a "My moments" card); when there are more than 3, the rest hide behind a
// "Show N more" accordion. There is no separate "see all" — the toggle reveals
// everything. Cards deep-link into the activity, exactly as before.

export type TodoActivity = { id: string; title: string; instructions: string | null };

// The card thumbnail tint cycles through the jar palette, so a wall of to-dos
// doesn't read as one flat block. Purely decorative — the "to do" pill and the
// title carry the meaning, never colour alone (WCAG 1.4.1).
const TINTS = ["#FBEED3", "#D8ECE8", "#F7E0E6", "#EAF4F1"];

function revealWrap(open: boolean): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateRows: open ? "1fr" : "0fr",
    transition: "grid-template-rows .34s cubic-bezier(.4,0,.2,1)",
  };
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: 22,
};

export function MyActivities({ activities }: { activities: TodoActivity[] }) {
  const [open, setOpen] = useState(false);
  if (activities.length === 0) return null;

  const top = activities.slice(0, 3);
  const rest = activities.slice(3);

  return (
    <div style={{ marginTop: 18 }}>
      {/* header row (not a card) */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Icon name="add-file" size={30} decorative />
        <span style={{ flex: 1, font: "600 calc(26px * var(--sj-type-scale, 1)) var(--font-fredoka)", color: "var(--ink)" }}>My activities</span>
        <span style={{ background: "#FBEED3", border: "2px solid var(--ink)", borderRadius: 999, padding: "4px 16px", font: "700 calc(15px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "#8A5F1E" }}>{activities.length} to do</span>
      </div>

      {/* always-visible: the 3 most recent to do */}
      <div style={gridStyle}>
        {top.map((a, i) => (
          <ActivityCard key={a.id} activity={a} tint={TINTS[i % TINTS.length]} />
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div style={revealWrap(open)}>
            <div style={{ overflow: "hidden", minHeight: 0 }}>
              {/* Rendered only while open, so the hidden cards are never
                  focusable behind a collapsed panel — a keyboard or
                  screen-reader user can't tab into invisible activities. */}
              {open && (
                <div style={{ ...gridStyle, paddingTop: 22 }}>
                  {rest.map((a, i) => (
                    <ActivityCard key={a.id} activity={a} tint={TINTS[(i + top.length) % TINTS.length]} />
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 18, minHeight: 64, boxSizing: "border-box", font: "700 calc(17px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--glass)", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 999, padding: "10px 22px", cursor: "pointer", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}
          >
            {open ? "Show less" : `Show ${rest.length} more`}
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style={{ stroke: "var(--ink)", strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round", flex: "0 0 auto", transition: "transform .3s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
              <path d="M6 9 L12 15 L18 9" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

function ActivityCard({ activity, tint }: { activity: TodoActivity; tint: string }) {
  return (
    <Link
      href={`/student/activities/${activity.id}`}
      className="sj-addtile"
      style={{ display: "block", textDecoration: "none", color: "var(--ink)", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 0 rgba(34,48,74,0.12)" }}
    >
      <div style={{ height: 190, background: tint, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg, rgba(34,48,74,0.05) 0, rgba(34,48,74,0.05) 10px, transparent 10px, transparent 20px)" }} aria-hidden="true" />
        <span style={{ position: "relative" }}>
          <Icon name="add-file" size={64} decorative />
        </span>
        <span style={{ position: "absolute", top: 12, right: 12, background: "#FBEED3", border: "2px solid var(--ink)", borderRadius: 999, padding: "3px 12px", font: "700 calc(13px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "#8A5F1E" }}>to do</span>
      </div>
      <div style={{ padding: "14px 18px 18px" }}>
        <p style={{ margin: 0, font: "600 calc(21px * var(--sj-type-scale, 1)) var(--font-fredoka)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activity.title}</p>
        {activity.instructions && (
          <p style={{ margin: "4px 0 0", font: "400 calc(15px * var(--sj-type-scale, 1)) var(--font-atkinson)", color: "var(--sj-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activity.instructions}</p>
        )}
      </div>
    </Link>
  );
}
