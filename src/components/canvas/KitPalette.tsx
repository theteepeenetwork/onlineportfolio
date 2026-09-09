"use client";

// The body of the Maths kit window: the live kit from `canvasShapes.ts`, group
// by group, with every preset and every parameter it already had.
//
// It is the same registry the old inline palette read, drawn to the canvas's
// own tokens and in a grid that names each piece — because "which of these
// three grey grids is the ten frame" is a question a 26px thumbnail on its own
// cannot answer, and a teacher building a worksheet asks it every time.

import type { Kit, ShapePreset } from "@/lib/canvasShapes";
import { ShapeThumb } from "./ShapeThumb";
import type { Unit } from "./Fan";

const INK = "#22304a";
const CREAM = "#fffdf7";
const CALM = "#e4dcc8";
const PAPER = "#faf6ee";

export function KitPalette({
  u,
  kit,
  activeGroupId,
  onGroup,
  onPlace,
}: {
  u: Unit;
  kit: Kit;
  activeGroupId: string | null;
  onGroup: (id: string) => void;
  onPlace: (preset: ShapePreset) => void;
}) {
  const groups = kit.groups;
  const active = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  return (
    <>
      {groups.length > 1 && (
        <div
          role="tablist"
          aria-label={`${kit.label} groups`}
          style={{ display: "flex", flexWrap: "wrap", gap: u(6) }}
        >
          {groups.map((g) => {
            const on = g.id === active.id;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onGroup(g.id)}
                style={{
                  flex: "1 1 auto",
                  height: u(36, 44),
                  padding: `0 ${u(10)}px`,
                  borderRadius: 999,
                  font: `700 ${u(13)}px var(--font-atkinson)`,
                  background: on ? INK : CREAM,
                  color: on ? PAPER : INK,
                  border: `${Math.max(1, u(2))}px solid ${on ? INK : CALM}`,
                  boxShadow: on ? `0 ${u(3)}px 0 rgba(34,48,74,.3)` : "none",
                  whiteSpace: "nowrap",
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      <div
        role="group"
        aria-label={active.label}
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: u(8) }}
      >
        {active.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPlace(preset)}
            title={preset.label}
            aria-label={preset.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: u(4),
              height: u(84, 64),
              padding: u(4),
              borderRadius: u(12),
              background: CREAM,
              border: `${Math.max(1, u(2))}px solid ${CALM}`,
              color: INK,
            }}
          >
            <ShapeThumb preset={preset} px={u(38)} />
            <span
              style={{
                font: `600 ${u(12)}px/${u(14)}px var(--font-fredoka)`,
                textAlign: "center",
              }}
            >
              {preset.label}
            </span>
          </button>
        ))}
      </div>

      <span style={{ font: `400 ${u(13)}px var(--font-atkinson)`, color: "#43506b" }}>
        Tap a piece to put it on the page
      </span>
    </>
  );
}
