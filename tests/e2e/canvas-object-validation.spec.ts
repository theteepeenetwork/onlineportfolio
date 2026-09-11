import { test, expect } from "@playwright/test";
import { displayHost, normalizeTemplateObjects, parseTeacherLink } from "../../src/lib/canvasObjects";

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

// The photo frame is its own member of the union, so unlike an unknown shape
// kind it is dropped by an older build rather than coerced. That makes this
// gate the whole of what decides whether a teacher's frame reaches a child.
const frameBase = { id: "f", type: "frame", x: 10, y: 10, w: 400, h: 300 };

test.describe("photo frame validation", () => {
  test("a frame survives, and one without an id is dropped", () => {
    expect(normaliseOne(frameBase)?.type).toBe("frame");
    expect(normaliseOne({ ...frameBase, id: "" })).toBeUndefined();
  });

  test("geometry is clamped and never below the retake floor", () => {
    // 160×120 is the room a 64px "take it again" button needs at scale 1.
    expect(normaliseOne({ ...frameBase, w: 10 })?.w).toBe(160);
    expect(normaliseOne({ ...frameBase, h: 10 })?.h).toBe(120);
    expect(normaliseOne({ ...frameBase, w: 5000 })?.w).toBe(1000);
    expect(normaliseOne({ ...frameBase, h: 5000 })?.h).toBe(700);
    expect(normaliseOne({ ...frameBase, x: -9999 })?.x).toBe(-1000);
    expect(normaliseOne({ ...frameBase, w: "wide" })?.w).toBe(400);
  });

  test("the prompt is capped, and an empty one is not stored", () => {
    expect((normaliseOne({ ...frameBase, label: "x".repeat(600) })?.label as string).length).toBe(500);
    expect(normaliseOne({ ...frameBase, label: "" })?.label).toBeUndefined();
    expect(normaliseOne({ ...frameBase, label: 42 })?.label).toBeUndefined();
    expect(normaliseOne({ ...frameBase, label: "Your model" })?.label).toBe("Your model");
  });

  test("a source is kept only where it is a picture or could be served", () => {
    expect(normaliseOne({ ...frameBase, src: "data:image/webp;base64,AA" })?.src).toBe(
      "data:image/webp;base64,AA",
    );
    expect(normaliseOne({ ...frameBase, src: "/uploads/a.webp" })?.src).toBe("/uploads/a.webp");
    expect(normaliseOne({ ...frameBase, src: "https://evil.example/x.png" })?.src).toBeUndefined();
    expect(normaliseOne({ ...frameBase, src: "javascript:alert(1)" })?.src).toBeUndefined();
    expect(normaliseOne(frameBase)?.src).toBeUndefined();
  });

  test("a frame carries neither a padlock nor a turn", () => {
    // Fixed for a child by what it is; storing `locked` would pin it for the
    // teacher too, and a photo is always drawn flat.
    expect(normaliseOne({ ...frameBase, locked: true })?.locked).toBeUndefined();
    expect(normaliseOne({ ...frameBase, rot: 45 })?.rot).toBeUndefined();
  });

  test("a page of frames is capped like any other page", () => {
    const page = Array.from({ length: 121 }, (_, i) => ({ ...frameBase, id: `f${i}` }));
    expect(normalizeTemplateObjects([page]).pages[0]).toHaveLength(120);
  });
});

// Web links (SAFEGUARDING rule 26). The one thing on a canvas a child can press
// that leaves StoryJar, so the address rules are pinned here as a table: one
// validator, `parseTeacherLink`, decides in the builder AND on the server, and
// `normalizeTemplateObjects` drops the whole object when it says no.
test.describe("web link validation", () => {
  const linkBase = { id: "l1", type: "link", x: 50, y: 50, w: 380, h: 110 };

  const accepted: [string, string][] = [
    ["https://www.bbc.co.uk/bitesize", "https://www.bbc.co.uk/bitesize"],
    // A teacher pasting without the scheme means https.
    ["bbc.co.uk/bitesize/topics", "https://bbc.co.uk/bitesize/topics"],
    ["  https://example.org/a?b=c#d  ", "https://example.org/a?b=c#d"],
    ["HTTPS://Example.ORG/Path", "https://example.org/Path"],
    // The default port is the ordinary address, and the parser drops it.
    ["https://example.org:443/x", "https://example.org/x"],
  ];
  for (const [typed, stored] of accepted) {
    test(`accepts ${JSON.stringify(typed)}`, () => {
      const r = parseTeacherLink(typed);
      expect(r.ok && r.href).toBe(stored);
      expect(normaliseOne({ ...linkBase, href: typed })?.href).toBe(stored);
    });
  }

  const refused: [unknown, string][] = [
    ["", "empty"],
    [42, "empty"],
    ["http://example.org", "not-https"],
    ["javascript:alert(1)", "not-https"],
    ["data:text/html,<script>alert(1)</script>", "not-https"],
    ["file:///etc/passwd", "not-https"],
    ["ftp://example.org/x", "not-https"],
    ["https://teacher:secret@example.org/", "credentials"],
    ["https://example.org@evil.example/", "credentials"],
    ["https://127.0.0.1/", "ip-address"],
    ["https://2130706433/", "ip-address"],
    ["https://0x7f.1/", "ip-address"],
    ["https://[::1]/", "ip-address"],
    ["https://localhost/", "not-a-public-host"],
    ["https://printer.local/", "not-a-public-host"],
    ["https://intranet/", "not-a-public-host"],
    ["https://metadata.internal/", "not-a-public-host"],
    ["https://example.org:8443/", "port"],
    // The media route authorises by matching path TEXT (FINDINGS F75), so an
    // address that names an upload is refused wherever it names it.
    ["https://example.org/uploads/abc.webp", "uploads"],
    ["https://storyjar.co.uk/uploads/abc.webp", "uploads"],
    ["https://example.org/x?next=/uploads/abc.webp", "uploads"],
    ["https://example.org/%2Fuploads%2Fabc.webp", "uploads"],
    // The URL parser deletes a tab, a newline or a carriage return wherever it
    // finds one, so each of these is STORED as "/uploads/…". A check on the
    // typed text alone sees "/up<tab>loads/"; a check on the path alone never
    // sees the query or the fragment.
    ["https://example.org/?q=/up\tloads/abc123.png", "uploads"],
    ["https://example.org/#/up\nloads/abc123.png", "uploads"],
    ["https://example.org/?q=/up\rloads/abc123.png", "uploads"],
    // Encoded, in the path and in the query, including an encoded letter.
    ["https://example.org/%75ploads/abc.webp", "uploads"],
    ["https://example.org/x?q=%2F%75ploads%2Fabc.webp", "uploads"],
    ["https://example.org/x#%2F%75ploads%2Fabc.webp", "uploads"],
    ["https://example.org/x?q=%252Fuploads%252Fabc.webp", "uploads"],
    ["https://example.org/up%09loads/abc.webp", "uploads"],
    // An escape that cannot be decoded is an address that cannot be read, so
    // it cannot be vouched for either.
    ["https://example.org/x?q=%E0%A4%A", "not-a-web-address"],
    ["https://example.org/" + "a".repeat(2000), "too-long"],
    ["not a web address", "not-a-web-address"],
  ];
  for (const [typed, why] of refused) {
    test(`refuses ${JSON.stringify(typed).slice(0, 60)} (${why})`, () => {
      const r = parseTeacherLink(typed);
      expect(r.ok ? "accepted" : r.why).toBe(why);
      // A refused address takes its object with it: a link box with no
      // address is not a thing to keep.
      expect(normaliseOne({ ...linkBase, href: typed })).toBeUndefined();
    });
  }

  test("a link carries no padlock and no turn, and its name is capped", () => {
    const l = normaliseOne({
      ...linkBase,
      href: "https://example.org",
      locked: true,
      rot: 30,
      label: "x".repeat(200),
    });
    expect(l?.locked).toBeUndefined();
    expect(l?.rot).toBeUndefined();
    expect((l?.label as string).length).toBe(80);
    expect(normaliseOne({ ...linkBase, href: "https://example.org", label: "   " })?.label).toBeUndefined();
  });

  // A link's name is stored in the same payload as its address, and the media
  // route reads that payload as text (FINDINGS F75). So the name is held to the
  // address's rule: one that names an upload is taken off, and the link stays.
  const refusedLabels = [
    "/uploads/deadbeef.png",
    "see /UPLOADS/deadbeef.png",
    "/up\tloads/deadbeef.png",
    "/up\nloads/deadbeef.png",
    "%2Fuploads%2Fdeadbeef.png",
    "/%75ploads/deadbeef.png",
  ];
  for (const label of refusedLabels) {
    test(`a link's name ${JSON.stringify(label)} is taken off`, () => {
      const out = normalizeTemplateObjects([[{ ...linkBase, href: "https://example.org/", label }]]);
      expect(out.pages[0][0]).toMatchObject({ type: "link", href: "https://example.org/" });
      expect((out.pages[0][0] as { label?: string }).label).toBeUndefined();
      expect(JSON.stringify(out), "nothing the route could read as a file").not.toMatch(/\/uploads\//i);
    });
  }

  test("an ordinary name is kept, including one a decoder cannot read", () => {
    expect(normaliseOne({ ...linkBase, href: "https://example.org", label: "50% off: uploads of fun" })?.label).toBe(
      "50% off: uploads of fun",
    );
    // A name is one line: control characters never reach the page.
    expect(normaliseOne({ ...linkBase, href: "https://example.org", label: "Rain\tand\nsnow" })?.label).toBe(
      "Rain and snow",
    );
  });

  test("a link is never smaller than a child's finger on the smallest tablet", () => {
    const l = normaliseOne({ ...linkBase, href: "https://example.org", w: 10, h: 10 });
    // 64px at the 0.77 scale of a 768px portrait tablet is 84 model units.
    expect(l?.h as number).toBeGreaterThanOrEqual(84);
    expect(l?.w as number).toBeGreaterThanOrEqual(200);
  });

  test("the host a child is shown is the real one", () => {
    expect(displayHost("https://www.bbc.co.uk/bitesize")).toBe("bbc.co.uk");
    expect(displayHost("https://example.org/")).toBe("example.org");
    // A Cyrillic "а" in place of the Latin one: shown in the form that cannot
    // pass for the real apple.com.
    const lookalike = parseTeacherLink("https://аpple.com/");
    expect(lookalike.ok).toBe(true);
    expect(displayHost(lookalike.ok ? lookalike.href : "")).toMatch(/^xn--/);
    // Shortened from the LEFT: the end of a host says who owns it.
    const long = displayHost(`https://${"a".repeat(60)}.evil.example/`);
    expect(long.startsWith("…")).toBe(true);
    expect(long.endsWith(".evil.example")).toBe(true);
    expect(long.length).toBe(40);
  });
});
