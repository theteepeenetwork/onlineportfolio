// Reading the shape of what a caller sent — and saying what arrived when it is
// wrong.
//
// WHY THIS EXISTS. On 21 Aug 2026 a teacher spent a dozen round-trips on one
// call. `page_content` was correct in every particular — right name, right
// structure, valid JSON — and came back "`page_content` has to be a list" every
// time. Their MCP client was holding a cached tool list from before the field
// existed, and a client that does not know a parameter does not necessarily
// pass it through untouched: it had JSON-ENCODED it. A list left as a string.
// Nested objects the same, which is why pictures had appeared to vanish without
// complaint earlier that morning.
//
// Two things follow, and both are this module.
//
// 1. TOLERATE IT. If a string parses as JSON and yields the shape the field is
//    declared to hold, take it. Nothing is lost: JSON has one meaning, we ask
//    for it by name, and the alternative is a caller who cannot reach a field
//    that works. This is Postel's rule applied where it is actually safe —
//    a strict reader is still doing the checking, one step later.
//
// 2. SAY WHAT ARRIVED. "has to be a list" describes the requirement and hides
//    the evidence. "I received a string" is the whole diagnosis in four words.
//    Every type refusal below echoes the type it got and a short excerpt, so a
//    caller can tell a wrong field from a mangled one WITHOUT a second call.
//    The teacher's own note: "a type error that echoes back what the server
//    actually received would have caught this in one call instead of a dozen."
//
// The excerpt is capped hard. This is the caller's own payload coming back to
// the caller, so there is nothing here that is not already theirs — but an
// error is a place data goes to be logged, and a whole base64 page in an error
// string helps nobody (SAFEGUARDING rule 8: refusals stay small and say only
// what the person needs).

import { ActivityInputError } from "./errors";

const EXCERPT = 60;

// What we got, in a few words a person and a model can both act on.
export function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (Array.isArray(value)) return `a list of ${value.length}`;
  if (typeof value === "string") {
    const short = value.length > EXCERPT ? `${value.slice(0, EXCERPT)}…` : value;
    return `a string (${value.length} characters) starting ${JSON.stringify(short)}`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    return keys.length ? `an object with ${keys.map((k) => `\`${k}\``).join(", ")}` : "an empty object";
  }
  return `${typeof value} (${JSON.stringify(value)})`;
}

// A string that is really JSON, undone. Returns undefined for anything else, so
// a caller who genuinely meant to send text is never surprised by it.
function unwrapJson(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

// The line every stringified-shape refusal ends with. Worth naming: it is the
// single most useful sentence in this file, and it should read the same
// wherever it appears.
const CLIENT_HINT =
  "If you did send a list and it reached us as text, your copy of the tool list is out of date — remove and re-add the StoryJar connector so it picks up the current fields.";

export function asList(value: unknown, field: string, what = "one entry per page"): unknown[] {
  if (Array.isArray(value)) return value;
  const unwrapped = unwrapJson(value);
  if (Array.isArray(unwrapped)) return unwrapped;
  throw new ActivityInputError(
    `\`${field}\` has to be a list, ${what}. I received ${describe(value)}. ${CLIENT_HINT}`,
  );
}

export function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  const unwrapped = unwrapJson(value);
  if (unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)) {
    return unwrapped as Record<string, unknown>;
  }
  throw new ActivityInputError(
    `${where} has to be an object with named fields. I received ${describe(value)}. ${CLIENT_HINT}`,
  );
}

// ---------------------------------------------------------------------------
// Unknown fields
// ---------------------------------------------------------------------------
// Ignoring a field nobody declared is how a picture goes missing in silence.
// The caller believes they sent one; the activity has none; nothing anywhere
// says so. So an undeclared key is a refusal, and it names the fields that DO
// exist — which is also how a caller working from a stale tool list finds out
// what the server can actually do today.

// Levenshtein, small and unclever: the lists being compared are five words long.
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? corner : 1 + Math.min(corner, above, prev[j - 1]);
      corner = above;
    }
  }
  return prev[b.length];
}

// The guesses people and models actually make. Edit distance does not reach
// these — `picture` is five edits from `image` — and they are not hypothetical:
// `url`, `src`, `data` and `base64` are the four names a teacher tried against
// the live connector in one morning, each of which was accepted and ignored.
// Where a word could mean more than one field, the candidates are listed in
// order and the first one this object actually has wins.
const ALIASES: Record<string, readonly string[]> = {
  picture: ["image"],
  photo: ["image"],
  photograph: ["image"],
  img: ["image"],
  graphic: ["image"],
  figure: ["image"],
  illustration: ["image"],
  url: ["source"],
  uri: ["source"],
  href: ["source"],
  link: ["source"],
  src: ["source"],
  data: ["source"],
  dataurl: ["source"],
  data_url: ["source"],
  base64: ["source"],
  bytes: ["source"],
  file: ["source"],
  content: ["passage", "source", "page_content"],
  body: ["passage", "source"],
  story: ["passage"],
  paragraph: ["passage"],
  extract: ["passage"],
  alt_text: ["alt"],
  alttext: ["alt"],
  caption: ["alt"],
  description: ["alt", "instructions"],
  label: ["alt", "heading"],
  title: ["heading"],
  question: ["prompt"],
  answers: ["options"],
  choices: ["options"],
  answer: ["correct"],
  correct_answer: ["correct"],
  correct_index: ["correct"],
  correctindex: ["correct"],
  correct_option: ["correct"],
  page_number: ["page"],
  pagenumber: ["page"],
  page_index: ["page"],
  pageindex: ["page"],
  pagecontent: ["page_content"],
  page_contents: ["page_content"],
  pages_content: ["page_content"],
  page_count: ["pages"],
  pagecount: ["pages"],
  num_pages: ["pages"],
};

function suggest(key: string, allowed: readonly string[]): string | null {
  const lower = key.toLowerCase();
  for (const candidate of ALIASES[lower] ?? []) {
    if (allowed.includes(candidate)) return candidate;
  }
  let best: string | null = null;
  let bestScore = Infinity;
  for (const candidate of allowed) {
    const score = distance(lower, candidate.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best && bestScore <= Math.max(2, Math.floor(key.length / 3)) ? best : null;
}

export function checkKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (!unknown.length) return;
  const parts = unknown.map((k) => {
    const guess = suggest(k, allowed);
    return guess ? `\`${k}\` (did you mean \`${guess}\`?)` : `\`${k}\``;
  });
  throw new ActivityInputError(
    `${where} has ${unknown.length === 1 ? "a field" : "fields"} I don't know: ${parts.join(", ")}. ` +
      `The fields it can have are ${allowed.map((k) => `\`${k}\``).join(", ")}. ` +
      `Nothing was saved — an unknown field is refused rather than ignored, so a picture cannot go missing without anyone being told.`,
  );
}
