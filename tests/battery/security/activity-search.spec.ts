import { test, expect } from "@playwright/test";
import { matchesActivitySearch, searchResultLabel } from "@/lib/activitySearch";

// ===========================================================================
// The matching rules, checked directly rather than through a rendered grid.
//
// Search is the one feature in an activities screen that can quietly become a
// disclosure: a box that queries "everything" is a box that returns everything.
// The design that prevents it is that filtering happens in memory over data the
// screen was already authorised to hold, so this module has no database access
// at all and cannot widen anything. That structure is asserted here, and the
// scoping it depends on is asserted on the running screens in
// shared-activities.spec.ts and activity-search-screens.spec.ts.
// ===========================================================================

const AUTUMN = {
  title: "Our autumn walk",
  instructions: "Draw one thing you found outside today.",
  tags: ["Leaves", "Outdoors"],
};

test("an empty search hides nothing", () => {
  expect(matchesActivitySearch(AUTUMN, "")).toBe(true);
  expect(matchesActivitySearch(AUTUMN, "   ")).toBe(true);
});

test("a word from the title, the instructions or a tag all find it", () => {
  expect(matchesActivitySearch(AUTUMN, "autumn")).toBe(true);
  expect(matchesActivitySearch(AUTUMN, "outside")).toBe(true);
  expect(matchesActivitySearch(AUTUMN, "leaves")).toBe(true);
});

test("case and punctuation are noise", () => {
  expect(matchesActivitySearch(AUTUMN, "AUTUMN")).toBe(true);
  expect(matchesActivitySearch(AUTUMN, "autumn!")).toBe(true);
  expect(matchesActivitySearch(AUTUMN, "  Autumn  ")).toBe(true);
});

test("every word must appear, but not in one field and not in order", () => {
  // Across two fields, reversed: this is what a person means by those words.
  expect(matchesActivitySearch(AUTUMN, "leaves autumn")).toBe(true);
  expect(matchesActivitySearch(AUTUMN, "walk outside")).toBe(true);
  // A word that appears nowhere excludes it, even when the others match. Any
  // other rule turns a two-word search into "most of the library".
  expect(matchesActivitySearch(AUTUMN, "autumn phonics")).toBe(false);
});

test("a search that matches nothing matches nothing", () => {
  expect(matchesActivitySearch(AUTUMN, "fractions")).toBe(false);
});

test("the count sentence says what happened", () => {
  expect(searchResultLabel(3, 3, "")).toBe("3 activities");
  expect(searchResultLabel(1, 1, "")).toBe("1 activity");
  expect(searchResultLabel(0, 6, "fractions")).toBe("Nothing matches that");
  expect(searchResultLabel(2, 6, "autumn")).toBe("2 of 6 activities");
});
