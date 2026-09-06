"use client";

// The two thumb fans.
//
// The full-screen canvas used to carry a linear toolbox: a row of pens along
// the bottom, a properties bar above it, an ＋ menu of labelled pills down the
// left. Everything worked and nothing grouped — a colour, a nib and a tool all
// looked like the same kind of button, and the ＋ list grew a scrollbar.
//
// Here each decision is its own RING about the disc a thumb already rests on,
// drawn on a coloured BAND so the group reads before the buttons do. Nearest
// the thumb is what changes most often (the nib), furthest is what changes
// least (a colour). The ＋ mirrors it in the other corner, so the pair reads as
// one system, and both are recomputed rather than mirrored for a left-handed
// child so every icon and word stays upright.
//
// Geometry lives in `src/lib/canvasFan.ts`, with no React in it, so the layout
// can be asserted without mounting a canvas.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import {
  A_COLOUR_NAME,
  A_EXTRA,
  arcLength,
  arcPath,
  BAND_MS,
  COLOUR_ANGLES,
  COLOUR_BAND,
  CY,
  DISC,
  FAN_COLOURS,
  FADE_MS,
  NIB_ANGLES,
  NIB_BAND,
  NIBS,
  PLUS_INNER_ANGLES,
  PLUS_OUTER_ANGLES,
  polar,
  R_COLOUR_BAND,
  R_COLOUR_IN,
  R_COLOUR_NAME,
  R_COLOUR_OUT,
  R_NIBS,
  R_PLUS_INNER,
  R_PLUS_OUTER,
  R_TOOLS,
  secondRow,
  secondRowRadii,
  SPRING,
  SPRING_MS,
  STAGGER_MS,
  TOOL_ANGLES,
  TOOL_BAND,
  TOOL_RING,
  WHITE,
  type Hand,
} from "@/lib/canvasFan";

/**
 * Design px → screen px.
 *
 * The second argument is a FLOOR in real CSS pixels, and it is the reason this
 * is a function rather than a multiplication. The frame scales to the viewport,
 * so on a 1024px classroom iPad every design unit is 0.86 of a pixel — which
 * would quietly take a 64px child control down to 55 and put the whole toolbar
 * under SAFEGUARDING rule 18. Positions and radii scale; the things a finger
 * has to hit do not go below their floor.
 */
export type Unit = (n: number, floor?: number) => number;

const INK = "#22304a";
const CREAM = "#fffdf7";
const KRAFT_TAG = "#f3e3c3";
const HONEY_TINT = "#fbeed3";
const JAM = "#bd3f63";

// --- The pieces every ring is built from -----------------------------------

/**
 * A ring's band: the arc it sits on, in the ring's own colour, with an ink edge
 * either side. It sweeps open from the disc end over 420ms, so the group is
 * drawn before the buttons land on it.
 */
function Band({
  u,
  cx,
  dir,
  r,
  half,
  from,
  to,
  fill,
  delay,
}: {
  u: Unit;
  cx: number;
  dir: 1 | -1;
  r: number;
  half: number;
  from: number;
  to: number;
  fill: string;
  delay: number;
}) {
  const sweep = (rr: number, width: number, stroke: string, key: string) => {
    const len = arcLength(rr, from, to);
    return (
      <path
        key={key}
        d={arcPath(cx * 1, dir, rr, from, to)}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={len}
        style={{
          // The keyframe reads --len, so one animation covers every band.
          ["--len" as string]: `${len}`,
          animation: `sj-fan-sweep ${BAND_MS}ms cubic-bezier(.4,0,.2,1) ${delay}ms backwards`,
        }}
      />
    );
  };
  // Drawn in design units and scaled as a whole, so one number (`u`) puts the
  // band and the buttons on it in the same place at every screen size.
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0"
      width={u(1194)}
      height={u(834)}
      viewBox="0 0 1194 834"
      style={{ zIndex: 6, overflow: "visible" }}
    >
      {sweep(r, half * 2, fill, "fill")}
      {sweep(r + half, 3, INK, "outer")}
      {sweep(r - half, 3, INK, "inner")}
    </svg>
  );
}

/**
 * One button on a ring. It is drawn AT its final place and animated back from
 * the disc it sprang out of (`--dx` / `--dy`), which is what lets the reduced-
 * motion guard land it on the final frame for free.
 */
function FanItem({
  u,
  cx,
  dir,
  r,
  deg,
  size,
  width,
  delay,
  children,
  ...rest
}: {
  u: Unit;
  cx: number;
  dir: 1 | -1;
  r: number;
  deg: number;
  size: number;
  /** A wide pill keeps the ring's height and grows about the same centre. */
  width?: number;
  delay: number;
  children: ReactNode;
  // `dir` is an HTML attribute too, and ours is a sweep direction.
} & Omit<React.ComponentPropsWithoutRef<"button">, "style" | "children" | "dir">) {
  const w = width ?? size;
  const { left, top } = polar(cx, r, deg, dir, size);
  const dx = cx - size / 2 - left;
  const dy = CY - size / 2 - top;
  return (
    <button
      type="button"
      {...rest}
      style={{
        position: "absolute",
        left: u(left - (w - size) / 2),
        top: u(top),
        width: u(w, w >= 64 ? 64 : 44),
        height: u(size, size >= 64 ? 64 : 44),
        zIndex: 7,
        ["--dx" as string]: `${u(dx)}px`,
        ["--dy" as string]: `${u(dy)}px`,
        animation: `sj-fan-in ${SPRING_MS}ms ${SPRING} ${delay}ms backwards`,
      }}
    >
      {children}
    </button>
  );
}

/** The round face a fan button wears: cream, 3px ink, a flat shadow. */
function face(u: Unit, opts: { selected?: boolean; radius?: number } = {}): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: u(2),
    width: "100%",
    height: "100%",
    borderRadius: opts.radius ? u(opts.radius) : 999,
    background: opts.selected ? INK : CREAM,
    color: opts.selected ? "#faf6ee" : INK,
    border: `${Math.max(2, u(3))}px solid ${INK}`,
    boxShadow: `0 ${u(4)}px 0 rgba(34,48,74,.15)`,
    transform: opts.selected ? `translateY(${u(-4)}px)` : undefined,
  };
}

// --- The pen fan -----------------------------------------------------------

export type PenFanProps = {
  u: Unit;
  hand: Hand;
  cx: number;
  dir: 1 | -1;
  open: boolean;
  /** The canvas's own tool key. */
  tool: string;
  colour: string;
  size: number;
  /** Whether the Move tool is offered (it is not on a canvas with no objects). */
  canMove: boolean;
  onToggle: () => void;
  onTool: (key: string) => void;
  onColour: (hex: string) => void;
  onSize: (n: number) => void;
  /** The pen art the disc holds, in the current colour. */
  art: ReactNode;
};

export function PenFan({
  u,
  cx,
  dir,
  open,
  tool,
  colour,
  size,
  canMove,
  onToggle,
  onTool,
  onColour,
  onSize,
  art,
}: PenFanProps) {
  // Press and hold a swatch and it says what it is. A child who is choosing
  // "the green one" has no other way to be told which green.
  const [held, setHeld] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  const tools = TOOL_RING.filter((t) => t.key !== "cursor" || canMove);
  const toolAngles = TOOL_ANGLES.slice(TOOL_RING.length - tools.length);

  const heldColour = held ? [...FAN_COLOURS, WHITE].find((c) => c.hex === held) : null;
  // A rubber has no colour, so offering one would be offering a choice that
  // does nothing. Its ring — and the band under it — are simply not there.
  const showColours = tool !== "eraser";

  return (
    <>
      {open && (
        <>
          <Band u={u} cx={cx} dir={dir} r={R_NIBS} half={35} from={NIB_BAND[0]} to={NIB_BAND[1]} fill={KRAFT_TAG} delay={0} />
          <Band u={u} cx={cx} dir={dir} r={R_TOOLS} half={35} from={TOOL_BAND[0]} to={TOOL_BAND[1]} fill={HONEY_TINT} delay={60} />
          {showColours && (
            <Band u={u} cx={cx} dir={dir} r={R_COLOUR_BAND} half={72} from={COLOUR_BAND[0]} to={COLOUR_BAND[1]} fill={KRAFT_TAG} delay={120} />
          )}

          {/* 1 · Nibs, nearest the thumb: the thing changed most often. Each
              shows the pen's own colour, so the ring answers "how thick" and
              "what colour" in the same glance. */}
          {NIBS.map((nib, i) => {
            const selected = size === nib.size;
            return (
              <FanItem
                key={nib.size}
                u={u}
                cx={cx}
                dir={dir}
                r={R_NIBS}
                deg={NIB_ANGLES[i]}
                size={64}
                delay={i * STAGGER_MS}
                onClick={() => onSize(nib.size)}
                aria-label={`Thickness ${nib.size}`}
                aria-pressed={selected}
                title={nib.label}
              >
                <span
                  style={{
                    ...face(u),
                    background: selected ? HONEY_TINT : CREAM,
                    borderColor: selected ? INK : "#e4dcc8",
                    boxShadow: selected ? `0 ${u(4)}px 0 rgba(34,48,74,.15)` : "none",
                    transform: selected ? `translateY(${u(-4)}px)` : undefined,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "block",
                      flex: "0 0 auto",
                      width: u(nib.dot),
                      height: u(nib.dot),
                      borderRadius: 999,
                      background: colour,
                      border: `${Math.max(1, u(2))}px solid ${INK}`,
                    }}
                  />
                </span>
              </FanItem>
            );
          })}

          {/* 2 · Tools. Text is not here: it inserts something, so it is Words
              on the ＋ fan. */}
          {tools.map((t, i) => {
            const selected = tool === t.key;
            return (
              <FanItem
                key={t.key}
                u={u}
                cx={cx}
                dir={dir}
                r={R_TOOLS}
                deg={toolAngles[i]}
                size={64}
                delay={60 + i * STAGGER_MS}
                onClick={() => onTool(t.key)}
                aria-label={t.key === "cursor" ? "Move — drag & resize things" : t.label}
                aria-pressed={selected}
                title={t.label}
              >
                <span style={face(u, { selected })}>
                  <Icon name={t.icon as IconName} size={u(30)} decorative />
                </span>
              </FanItem>
            );
          })}

          {/* 3 · Colours, two arcs over one band, furthest out because a colour
              is chosen least often and picking one folds the fan. White rides
              the outer arc's spare slot: the brand ten do not carry it, and it
              is how a child draws on a photograph. */}
          {showColours &&
            [...FAN_COLOURS, WHITE].map((c, i) => {
            const outer = i >= 5;
            const extra = i === FAN_COLOURS.length;
            const current = colour.toLowerCase() === c.hex.toLowerCase();
            const isHeld = held === c.hex;
            const dot = isHeld ? 60 : current ? 54 : 46;
            return (
              <FanItem
                key={c.hex}
                u={u}
                cx={cx}
                dir={dir}
                r={outer ? R_COLOUR_OUT : R_COLOUR_IN}
                deg={extra ? A_EXTRA : COLOUR_ANGLES[i % 5]}
                size={64}
                delay={120 + i * STAGGER_MS}
                onPointerDown={() => {
                  holdTimer.current = setTimeout(() => setHeld(c.hex), 320);
                }}
                onPointerUp={() => {
                  if (holdTimer.current) clearTimeout(holdTimer.current);
                  setHeld(null);
                }}
                onPointerLeave={() => {
                  if (holdTimer.current) clearTimeout(holdTimer.current);
                  setHeld(null);
                }}
                onClick={() => onColour(c.hex)}
                // The hex is the accessible name the whole canvas uses for a
                // colour (the object bar's swatches too), so one vocabulary
                // covers both. The WORD is what a held swatch says out loud.
                aria-label={`Colour ${c.hex}`}
                aria-pressed={current}
                title={c.label}
              >
                <span
                  aria-hidden="true"
                  style={{
                    // `display: block` matters: a bare span is inline, and an
                    // inline box ignores width and height — the swatches came
                    // out as slivers.
                    display: "block",
                    margin: "0 auto",
                    width: u(dot),
                    height: u(dot),
                    borderRadius: 999,
                    background: c.hex,
                    border: `${Math.max(2, u(3))}px solid ${INK}`,
                    boxShadow: `0 ${u(3)}px 0 rgba(34,48,74,.2)`,
                    transform: isHeld ? `translateY(${u(-6)}px)` : undefined,
                  }}
                />
              </FanItem>
            );
          })}

          {/* Anything the ten do not carry. The rainbow ring says "any colour"
              without pretending to be one. */}
          {showColours && <AnyColour u={u} cx={cx} dir={dir} colour={colour} onColour={onColour} />}

          {heldColour && (
            <span
              role="status"
              className="pointer-events-none absolute"
              style={{
                ...polarBox(u, cx, R_COLOUR_NAME, A_COLOUR_NAME, dir),
                zIndex: 8,
                background: INK,
                color: "#faf6ee",
                borderRadius: 999,
                padding: `${u(8)}px ${u(16)}px`,
                font: `600 ${u(18)}px var(--font-fredoka)`,
                whiteSpace: "nowrap",
                transform: "translate(-50%, -50%)",
              }}
            >
              {heldColour.label}
            </span>
          )}
        </>
      )}

      {/* The disc itself. It holds the pen in the current colour, so what is in
          hand is visible without opening anything. */}
      <button
        type="button"
        onClick={onToggle}
        // NOT "Pen": the tool ring inside carries a Pen, and two buttons with
        // the same accessible name on one screen is a screen reader with no way
        // to tell them apart. This one is the lid on all of it.
        aria-label={open ? "Close the pens and colours" : "Pens and colours"}
        aria-expanded={open}
        // "Pens", not "Pen": the tool ring inside has a Pen, and one title on
        // two buttons is a selector that matches the wrong one.
        title="Pens"
        style={{
          position: "absolute",
          left: u(cx - DISC / 2),
          top: u(CY - DISC / 2),
          width: u(DISC, 64),
          height: u(DISC, 64),
          borderRadius: 999,
          background: open ? HONEY_TINT : CREAM,
          border: `${Math.max(2, u(3))}px solid ${INK}`,
          boxShadow: `0 ${u(5)}px 0 rgba(34,48,74,.2)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 7,
        }}
      >
        {art}
      </button>
    </>
  );
}

function polarBox(u: Unit, cx: number, r: number, deg: number, dir: 1 | -1) {
  const { left, top } = polar(cx, r, deg, dir, 0);
  return { left: u(left), top: u(top) };
}

function AnyColour({
  u,
  cx,
  dir,
  colour,
  onColour,
}: {
  u: Unit;
  cx: number;
  dir: 1 | -1;
  colour: string;
  onColour: (hex: string) => void;
}) {
  const size = 64;
  const { left, top } = polar(cx, R_COLOUR_IN, A_EXTRA, dir, size);
  const dx = cx - size / 2 - left;
  const dy = CY - size / 2 - top;
  return (
    <label
      className="absolute"
      title="Pick any colour"
      style={{
        left: u(left),
        top: u(top),
        width: u(size, 64),
        height: u(size, 64),
        zIndex: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        ["--dx" as string]: `${u(dx)}px`,
        ["--dy" as string]: `${u(dy)}px`,
        animation: `sj-fan-in ${SPRING_MS}ms ${SPRING} ${120 + 10 * STAGGER_MS}ms backwards`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "block",
          width: u(46),
          height: u(46),
          borderRadius: 999,
          border: `${Math.max(2, u(3))}px solid ${INK}`,
          boxShadow: `0 ${u(3)}px 0 rgba(34,48,74,.2)`,
          background: "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)",
        }}
      />
      {/* The input fills the whole press, not the dot inside it: left to itself
          a colour input takes its own intrinsic 50×27, under the child floor. */}
      <input
        type="color"
        value={colour}
        onChange={(e) => onColour(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Pick any colour"
      />
    </label>
  );
}

// --- The ＋ fan ------------------------------------------------------------

export type PlusOption = {
  key: string;
  label: string;
  /** A wide pill (a named choice) rather than a 72px square (a shape). */
  wide?: boolean;
  icon?: IconName;
  art?: ReactNode;
  onSelect: () => void;
};

export type PlusItem = {
  key: string;
  icon: IconName;
  label: string;
  /** 0 = the inner ring (what a child gets), 1 = the teacher's outer ring. */
  ring: 0 | 1;
  /** Shown pressed while its window is open. */
  pressed?: boolean;
  /** A second row of choices; absent means the item acts on the first tap. */
  options?: PlusOption[];
  onSelect?: () => void;
};

export function PlusFan({
  u,
  cx,
  dir,
  open,
  items,
  row,
  teacher,
  onToggle,
  onRow,
}: {
  u: Unit;
  cx: number;
  dir: 1 | -1;
  open: boolean;
  items: PlusItem[];
  /** Which item's second row is fanned out. */
  row: string | null;
  teacher: boolean;
  onToggle: () => void;
  onRow: (key: string | null) => void;
}) {
  const inner = items.filter((i) => i.ring === 0);
  const outer = items.filter((i) => i.ring === 1);
  const openItem = items.find((i) => i.key === row) ?? null;
  const radii = secondRowRadii(teacher);
  const places = openItem?.options ? secondRow(openItem.options.length, radii) : [];

  return (
    <>
      {open && (
        <>
          <Band u={u} cx={cx} dir={dir} r={R_PLUS_INNER} half={44} from={-58} to={46} fill={KRAFT_TAG} delay={0} />
          {outer.length > 0 && (
            <Band u={u} cx={cx} dir={dir} r={R_PLUS_OUTER} half={44} from={-62} to={32} fill={HONEY_TINT} delay={40} />
          )}

          {[...inner, ...outer].map((item) => {
            const isOuter = item.ring === 1;
            const list = isOuter ? outer : inner;
            const i = list.indexOf(item);
            const angles = isOuter ? PLUS_OUTER_ANGLES : PLUS_INNER_ANGLES;
            const deg = angles[i] ?? angles[angles.length - 1];
            const pressed = item.pressed || row === item.key;
            return (
              <FanItem
                key={item.key}
                u={u}
                cx={cx}
                dir={dir}
                r={isOuter ? R_PLUS_OUTER : R_PLUS_INNER}
                deg={deg}
                size={72}
                delay={(isOuter ? 40 : 0) + i * STAGGER_MS}
                onClick={() => {
                  if (item.options) onRow(row === item.key ? null : item.key);
                  else item.onSelect?.();
                }}
                aria-label={item.label}
                aria-pressed={pressed}
                aria-expanded={item.options ? row === item.key : undefined}
                title={item.label}
              >
                <span style={face(u, { selected: pressed })}>
                  <Icon name={item.icon} size={u(26)} decorative />
                  <span style={{ font: `600 ${u(12)}px var(--font-fredoka)`, lineHeight: 1 }}>
                    {item.label}
                  </span>
                </span>
              </FanItem>
            );
          })}

          {/* The second row, on the same arcs the colours use, mirrored. */}
          {openItem?.options && (
            <>
              <Band
                u={u}
                cx={cx}
                dir={dir}
                r={radii[0] + (openItem.options.length > 4 ? 44 : 0)}
                half={openItem.options.length > 4 ? 88 : 44}
                from={-70}
                to={2}
                fill={KRAFT_TAG}
                delay={0}
              />
              {openItem.options.map((opt, i) => {
                const place = places[i];
                const w = opt.wide ? 150 : 72;
                return (
                  <FanItem
                    key={opt.key}
                    u={u}
                    cx={cx}
                    dir={dir}
                    r={place.r}
                    deg={place.deg}
                    size={72}
                    width={w}
                    delay={i * STAGGER_MS}
                    onClick={opt.onSelect}
                    aria-label={opt.label}
                    title={opt.label}
                  >
                    <span
                      style={{
                        ...face(u),
                        gap: u(8),
                        flexDirection: opt.wide ? "row" : "column",
                        padding: opt.wide ? `0 ${u(14)}px` : 0,
                      }}
                    >
                      {opt.art ?? (opt.icon ? <Icon name={opt.icon} size={u(26)} decorative /> : null)}
                      {opt.wide && (
                        <span style={{ font: `600 ${u(15)}px var(--font-fredoka)`, whiteSpace: "nowrap" }}>
                          {opt.label}
                        </span>
                      )}
                    </span>
                  </FanItem>
                );
              })}
            </>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onToggle}
        // `title="Add"` is the hook a dozen canvas specs already reach for; the
        // accessible name is the words a child hears.
        title={open ? "Close" : "Add"}
        aria-label={open ? "Close the add menu" : "Add something"}
        aria-expanded={open}
        style={{
          position: "absolute",
          left: u(cx - DISC / 2),
          top: u(CY - DISC / 2),
          width: u(DISC, 64),
          height: u(DISC, 64),
          borderRadius: 999,
          background: JAM,
          border: `${Math.max(2, u(3))}px solid ${INK}`,
          boxShadow: `0 ${u(5)}px 0 #93304f`,
          color: "#faf6ee",
          font: `400 ${u(52)}px var(--font-fredoka)`,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 7,
          transform: open ? "rotate(45deg)" : undefined,
          transition: `transform ${SPRING_MS}ms ${SPRING}, background ${FADE_MS}ms`,
        }}
      >
        <span aria-hidden="true">＋</span>
      </button>
    </>
  );
}
