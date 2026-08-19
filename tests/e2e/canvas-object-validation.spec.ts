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

  test("flip is stored only when it is actually set", () => {
    expect(normaliseOne({ ...base, shape: "line", flip: true })?.flip).toBe(true);
    // Absent rather than `false`, so the stored payload stays small and a
    // default-direction line and an untouched one look identical at rest.
    expect(normaliseOne({ ...base, shape: "line", flip: false })?.flip).toBeUndefined();
    expect(normaliseOne({ ...base, shape: "line", flip: "yes" })?.flip).toBeUndefined();
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
});
