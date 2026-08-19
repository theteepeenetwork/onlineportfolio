import { test, expect } from "@playwright/test";
import { normalizeTemplateObjects } from "../../src/lib/canvasObjects";

// Pure tests over the shape-object validator. No browser: this is the gate that
// decides what actually reaches the database, and it is worth pinning directly
// rather than only through the UI that happens to exercise it.
//
// It matters more than it looks. An unrecognised kind is silently coerced to
// "rect" — which is the right failure (a template still opens) but a quiet one,
// so the coercion is asserted here rather than left to be discovered when a
// teacher's hundred flat turns into a rectangle.

const base = {
  id: "a",
  type: "shape",
  x: 10,
  y: 10,
  w: 100,
  h: 100,
  fill: "#ffffff",
  stroke: "#000000",
  strokeWidth: 6,
};

function normaliseOne(raw: Record<string, unknown>) {
  return normalizeTemplateObjects([[raw]]).pages[0][0] as Record<string, unknown> | undefined;
}

test.describe("canvas object validation", () => {
  test("known kinds survive; an unknown one falls back to a rectangle", () => {
    expect(normaliseOne({ ...base, shape: "line" })?.shape).toBe("line");
    expect(normaliseOne({ ...base, shape: "arrow" })?.shape).toBe("arrow");
    // The forward-compatibility case: a template saved by a newer client and
    // re-saved by an older one loses the shape rather than the whole object.
    expect(normaliseOne({ ...base, shape: "base10-ten" })?.shape).toBe("rect");
  });

  test("flip is gone; rotation replaced it", () => {
    // Two mechanisms for one idea is worse than either. A line pointing the
    // other way is a rotation now, so `flip` is not stored at all.
    expect(normaliseOne({ ...base, shape: "line", flip: true })?.flip).toBeUndefined();
  });

  test("rotation wraps into 0-359, and a full turn is no rotation at all", () => {
    expect(normaliseOne({ ...base, shape: "rect", rot: 45 })?.rot).toBe(45);
    expect(normaliseOne({ ...base, shape: "rect", rot: 400 })?.rot).toBe(40);
    expect(normaliseOne({ ...base, shape: "rect", rot: -90 })?.rot).toBe(270);
    // Wrapped BEFORE the zero test, so 360 stores nothing rather than `rot: 0`.
    expect(normaliseOne({ ...base, shape: "rect", rot: 360 })?.rot).toBeUndefined();
    expect(normaliseOne({ ...base, shape: "rect", rot: 0 })?.rot).toBeUndefined();
    expect(normaliseOne({ ...base, shape: "rect", rot: NaN })?.rot).toBeUndefined();
  });

  test("a vector may be a couple of units thin; an area shape may not", () => {
    // A number line or a table rule IS a very shallow box, so the ordinary
    // floor would round it back into a square.
    expect(normaliseOne({ ...base, shape: "line", h: 1 })?.h).toBe(1);
    // An area shape keeps the floor, so a rectangle can't be squashed away to
    // nothing and lost off the page.
    expect(normaliseOne({ ...base, shape: "rect", h: 1 })?.h).toBe(8);
  });

  test("grid divisions and circle parts are clamped into what can be drawn", () => {
    const grid = normaliseOne({ ...base, shape: "grid", cols: 10, rows: 10 });
    expect(grid?.cols).toBe(10);
    expect(grid?.rows).toBe(10);

    // A grid of zero columns is a divide-by-zero and a grid of five hundred is
    // an unreadable smear, so both ends are pulled into range rather than
    // dropping the object.
    expect(normaliseOne({ ...base, shape: "grid", cols: 0, rows: 999 })?.cols).toBe(1);
    expect(normaliseOne({ ...base, shape: "grid", cols: 0, rows: 999 })?.rows).toBe(20);
    expect(normaliseOne({ ...base, shape: "grid", cols: "six" })?.cols).toBe(1);

    expect(normaliseOne({ ...base, shape: "pie", parts: 9 })?.parts).toBe(9);
    expect(normaliseOne({ ...base, shape: "pie", parts: 1 })?.parts).toBe(2);
    expect(normaliseOne({ ...base, shape: "pie", parts: 99 })?.parts).toBe(24);
  });

  test("a ring may have no divisions at all, where a pie may not", () => {
    // The plain ring — a hoop, not a fraction ring. The pie's floor of 2 would
    // turn it into a semicircle diagram nobody asked for.
    expect(normaliseOne({ ...base, shape: "ring", parts: 1 })?.parts).toBe(1);
    expect(normaliseOne({ ...base, shape: "ring", parts: 4 })?.parts).toBe(4);
  });

  test("parameters are only stored for the kinds that read them", () => {
    // A rectangle carrying a stray `parts` would be a field nothing draws and
    // everything has to keep carrying.
    const rect = normaliseOne({ ...base, shape: "rect", cols: 5, rows: 5, parts: 7 });
    expect(rect?.cols).toBeUndefined();
    expect(rect?.rows).toBeUndefined();
    expect(rect?.parts).toBeUndefined();
  });

  test("lockAspect survives, because it is what keeps a hundred a hundred", () => {
    expect(normaliseOne({ ...base, shape: "grid", lockAspect: true })?.lockAspect).toBe(true);
    expect(normaliseOne({ ...base, shape: "grid" })?.lockAspect).toBeUndefined();
    expect(normaliseOne({ ...base, shape: "grid", lockAspect: "yes" })?.lockAspect).toBeUndefined();
  });

  test("a ring's band is clamped to something you can actually see", () => {
    expect(normaliseOne({ ...base, shape: "ring", thickness: 70 })?.thickness).toBe(70);
    // 0% is not a ring and 100% is a disc, so both ends are pulled in rather
    // than producing a shape that is not the shape it claims to be.
    expect(normaliseOne({ ...base, shape: "ring", thickness: 0 })?.thickness).toBe(10);
    expect(normaliseOne({ ...base, shape: "ring", thickness: 500 })?.thickness).toBe(90);
    // Untouched rings stay untouched — absent means the default band.
    expect(normaliseOne({ ...base, shape: "ring" })?.thickness).toBeUndefined();
  });

  test("a clock stores whether its numbers show, and nothing about hours", () => {
    expect(normaliseOne({ ...base, shape: "clock", numerals: true })?.numerals).toBe(true);
    expect(normaliseOne({ ...base, shape: "clock" })?.numerals).toBeUndefined();
    // Twelve hours is not a setting, so a clock never carries `parts` — a
    // clock with seven hours is not a clock.
    expect(normaliseOne({ ...base, shape: "clock", parts: 7 })?.parts).toBeUndefined();
  });

  test("infinite survives, because it is the teacher's decision", () => {
    expect(normaliseOne({ ...base, shape: "ellipse", infinite: true })?.infinite).toBe(true);
    expect(normaliseOne({ ...base, shape: "ellipse" })?.infinite).toBeUndefined();
    expect(normaliseOne({ ...base, shape: "ellipse", infinite: "yes" })?.infinite).toBeUndefined();
  });
});
