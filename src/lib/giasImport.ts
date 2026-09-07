// ---------------------------------------------------------------------------
// Reading the DfE's GIAS all-establishments extract. Pure: no network, no
// database, no filesystem, no `server-only`.
// ---------------------------------------------------------------------------
//
// The half that talks to the internet and writes rows is scripts/gias-import.ts.
// Everything that decides what a row MEANS is here, so it can be checked
// against a small fixture in `npm run check` rather than by downloading sixty
// megabytes from a government service.
//
// Everything in this file was measured against the real extract of 24 August
// 2026 (52,484 rows). Where a number is quoted below, it was counted, not
// estimated.
// ---------------------------------------------------------------------------

/** The six columns of `Establishment`, ready to write. */
export type EstablishmentRow = {
  urn: string;
  name: string;
  postcode: string;
  localAuthority: string;
  phase: string;
  town: string;
};

// -- Which rows we take ------------------------------------------------------

/**
 * A school somebody could sign up from today.
 *
 * "Open, but proposed to close" is included and it is not an oversight: 63 of
 * them were open on the day this was written, with children in them and staff
 * who may want StoryJar this term. A school closing next August is open now.
 */
const OPEN_STATUSES = new Set(["Open", "Open, but proposed to close"]);

/**
 * Establishment types that are not English schools, however English the file
 * they arrive in is. 2,035 open rows on 24 August 2026.
 *
 * GIAS carries Welsh establishments, British schools overseas, offshore schools
 * and MoD service children's education. The picker is England-only by owner
 * decision, and every other country goes down the free-text path, which the
 * plan is explicit is a first-class route and not a degraded one. Letting a
 * Welsh school into an England picker would be worse than leaving it out: it
 * would tell a teacher in Cardiff that StoryJar has their school, and then join
 * them to nothing.
 */
const NOT_ENGLISH_TYPES = new Set([
  "Welsh establishment",
  "British schools overseas",
  "Offshore schools",
  "Service children's education",
]);

/**
 * Phases that are primary-facing on their face.
 *
 * `Nursery` is on this list because StoryJar has an EYFS register. A maintained
 * nursery school is a StoryJar customer, not an edge case, and there are 357
 * open ones.
 */
const PRIMARY_PHASES = new Set(["Primary", "Middle deemed primary", "All-through", "Nursery"]);

/**
 * The age band StoryJar is for: 3 to 11.
 *
 * WHY THERE IS AN AGE RULE AT ALL, AND NOT JUST A PHASE RULE. This is the one
 * place the implementation departs from the plan, and it is worth reading
 * before anyone "simplifies" it back.
 *
 * The plan says to filter to "open establishments in primary-facing phases",
 * expecting about 20,000 rows. Phase alone gives 16,836 — because GIAS records
 * `PhaseOfEducation` as "Not applicable" for every independent school and for
 * most special schools. Filtering on phase alone therefore silently drops:
 *
 *   - 1,485 independent schools, a great many of them preps and pre-preps
 *     teaching exactly 3 to 11 (237 of the excluded set are 2–11, 214 are 3–11,
 *     191 are 4–11);
 *   - 906 independent special schools and around 1,000 maintained special
 *     schools, many of them primary-aged, which is a large part of what the
 *     EYFS register was added for.
 *
 * A teacher at one of those schools would find the picker did not have their
 * school and fall back to free text — which is precisely the URN-less row this
 * whole launch exists to stop being created. Under-inclusion is the expensive
 * mistake here; over-inclusion costs a bounded picker nothing.
 *
 * So a row also qualifies if its statutory age range overlaps 3–11. The upper
 * bound of the test is 10 and not 11 deliberately: a secondary school starts at
 * 11, so `lowAge <= 11` would sweep in every secondary in England.
 *
 * With this rule the count is 20,296, which is the number the plan predicted.
 * The plan's arithmetic was right and its stated rule was not.
 */
const YOUNGEST = 3;
const OLDEST_START = 10;

// -- The columns we read, by name --------------------------------------------
//
// The extract has 135 columns and the order is not a promise. They are read by
// HEADER NAME, and a missing one is a hard failure rather than a silent
// `undefined` that would import 20,000 schools with no postcode.
const COLUMNS = [
  "URN",
  "EstablishmentName",
  "EstablishmentStatus (name)",
  "TypeOfEstablishment (name)",
  "PhaseOfEducation (name)",
  "StatutoryLowAge",
  "StatutoryHighAge",
  "LA (name)",
  "Town",
  "Locality",
  "Postcode",
  "Country (name)",
] as const;

export class GiasFormatError extends Error {}

export type ParseSummary = {
  rows: EstablishmentRow[];
  /** Every data row in the file, whether kept or not. */
  seen: number;
  /** Why the rest were left out, for the line the script prints. */
  skipped: { closed: number; notEngland: number; notPrimary: number; unusable: number };
};

/**
 * Parse the extract and keep the rows a primary teacher could sign up from.
 *
 * Takes the decoded text. Decoding is the caller's job because it is the one
 * part that depends on where the bytes came from — see the note in
 * scripts/gias-import.ts about the file being Windows-1252 and not UTF-8.
 */
export function parseGias(text: string): ParseSummary {
  const table = parseCsv(text);
  if (table.length === 0) throw new GiasFormatError("the extract is empty");

  const header = table[0];
  const index = new Map<string, number>();
  header.forEach((h, i) => index.set(h.trim(), i));
  const missing = COLUMNS.filter((c) => !index.has(c));
  if (missing.length) {
    throw new GiasFormatError(
      `the extract is missing ${missing.length} expected column(s): ${missing.join(", ")}. ` +
        "The DfE changed the file's shape; read the new header before changing this list.",
    );
  }
  const at = (row: string[], column: (typeof COLUMNS)[number]) =>
    (row[index.get(column)!] ?? "").trim();

  const rows: EstablishmentRow[] = [];
  const skipped = { closed: 0, notEngland: 0, notPrimary: 0, unusable: 0 };
  const seenUrns = new Set<string>();

  for (let i = 1; i < table.length; i += 1) {
    const row = table[i];
    // The trailing newline, and any blank line, is not a row.
    if (row.length === 1 && row[0].trim() === "") continue;

    if (!OPEN_STATUSES.has(at(row, "EstablishmentStatus (name)"))) {
      skipped.closed += 1;
      continue;
    }
    if (!isEnglish(at(row, "TypeOfEstablishment (name)"), at(row, "Country (name)"))) {
      skipped.notEngland += 1;
      continue;
    }
    const phase = at(row, "PhaseOfEducation (name)");
    if (!teachesPrimaryAge(phase, at(row, "StatutoryLowAge"), at(row, "StatutoryHighAge"))) {
      skipped.notPrimary += 1;
      continue;
    }

    const urn = at(row, "URN");
    const name = at(row, "EstablishmentName");
    // A row with no URN or no name cannot be picked or joined, so it is not a
    // register entry. A duplicate URN would mean the file disagrees with itself
    // and the second one is dropped rather than allowed to overwrite the first.
    if (!urn || !name || seenUrns.has(urn)) {
      skipped.unusable += 1;
      continue;
    }
    seenUrns.add(urn);

    rows.push({
      urn,
      name,
      // Seven open rows have no postcode. They are still schools, and the name
      // is what a teacher searches, so an empty string goes in rather than the
      // row being dropped.
      postcode: at(row, "Postcode"),
      localAuthority: at(row, "LA (name)"),
      phase,
      // Town, falling back to Locality: GIAS populates Town far more reliably,
      // and 19 kept rows have neither.
      town: at(row, "Town") || at(row, "Locality"),
    });
  }

  return { rows, seen: table.length - 1, skipped };
}

function isEnglish(type: string, country: string): boolean {
  if (NOT_ENGLISH_TYPES.has(type)) return false;
  // `Country (name)` is blank for English maintained schools and "United
  // Kingdom" for a large minority, so it cannot be the primary test — but a row
  // that names a country other than the UK is definitely not an English school.
  const c = country.trim();
  return c === "" || c === "United Kingdom";
}

function teachesPrimaryAge(phase: string, lowAge: string, highAge: string): boolean {
  if (PRIMARY_PHASES.has(phase)) return true;
  if (!/^\d+$/.test(lowAge) || !/^\d+$/.test(highAge)) return false;
  return Number(lowAge) <= OLDEST_START && Number(highAge) >= YOUNGEST;
}

// -- CSV ---------------------------------------------------------------------

/**
 * RFC 4180 CSV, written out rather than pulled in.
 *
 * The extract has school names with commas in them ("Bishop's Stortford, The
 * Ferrers"), names with quotes in them, and addresses with line breaks inside a
 * quoted field, so splitting on commas produces a plausible-looking register
 * that is wrong in a few hundred places. This is thirty lines and it has no
 * supply chain.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // A byte-order mark at the start is not part of the first column's name.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // \r\n is one line ending, not two.
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// -- Resolving which file to download ----------------------------------------

/** Where the extract is published. Resolved per import; never assumed. */
export const GIAS_DOWNLOADS_PAGE = "https://get-information-schools.service.gov.uk/Downloads";

/** The tag the Downloads page gives the all-establishments extract. */
export const GIAS_ALL_DATA_TAG = "all.edubase.data";

/**
 * Pull the date of the latest all-establishments extract out of the Downloads
 * page.
 *
 * WHAT THE PLAN ASKED FOR, AND WHAT IS ACTUALLY THERE. The plan says to resolve
 * the download URL from the Downloads page rather than hardcoding a date
 * pattern, because the DfE's own JSON mirror was archived in January 2025 and
 * that is what depending on a convenience mirror buys you. The instinct is
 * right. The page, read on 24 August 2026, does not contain a link to resolve:
 * it is a form that POSTs a selection of files to `/Downloads/Collate` with an
 * ASP.NET `__RequestVerificationToken` and a session cookie, and then hands back
 * a prepared archive. Following that would mean holding a CSRF token and
 * impersonating a browser session on every import, which is the fragile
 * scraping the plan says to report rather than invent a way around.
 *
 * What the page DOES carry, in a hidden input beside each file, is the
 * authoritative generation date of that file. So this resolves the DATE — the
 * part that actually changes, and the part a hardcoded pattern gets wrong — and
 * the script builds the direct public download URL from it. The host and path
 * of that endpoint are fixed and public; the day is never guessed.
 *
 * If this ever stops finding the date, it throws. It does NOT fall back to
 * today's date: an import that quietly asks for a file that does not exist, or
 * worse silently gets an older one, is how a register goes stale without
 * anybody noticing, and the tile on /ops/health exists to make staleness
 * visible rather than to be lied to.
 */
export function resolveExtractDate(downloadsHtml: string): string {
  // The tag and its date are two hidden inputs in the same checkbox item, so
  // the date wanted is the first FileGeneratedDate AFTER the matching tag. The
  // index is part of the input name, which is what ties them together.
  const tag = new RegExp(
    `name="Downloads\\[(\\d+)\\]\\.Tag"[^>]*value="${GIAS_ALL_DATA_TAG}"`,
  ).exec(downloadsHtml);
  if (!tag) {
    throw new GiasFormatError(
      `the Downloads page no longer offers "${GIAS_ALL_DATA_TAG}". Open ${GIAS_DOWNLOADS_PAGE} ` +
        "and find what the all-establishments extract is called now. Do not guess a date.",
    );
  }
  const dated = new RegExp(
    `name="Downloads\\[${tag[1]}\\]\\.FileGeneratedDate"[^>]*value="([^"]+)"`,
  ).exec(downloadsHtml);
  if (!dated) {
    throw new GiasFormatError(
      "the Downloads page offers the all-establishments extract but no longer says when it was " +
        "generated. Do not guess a date.",
    );
  }
  return americanDateToIso(dated[1]);
}

/** "8/24/2026 12:00:00 AM" — the DfE writes month first — to "2026-08-24". */
export function americanDateToIso(value: string): string {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(value);
  if (!m) throw new GiasFormatError(`cannot read "${value}" as a date`);
  const [, month, day, year] = m;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (Number(month) > 12 || Number(day) > 31) {
    throw new GiasFormatError(`"${value}" is not a date the DfE could have written`);
  }
  return iso;
}

/**
 * The direct download for one day's extract.
 *
 * Note for anyone testing this by hand: the endpoint answers GET and returns
 * 500 to HEAD, so `curl -I` will tell you it is broken when it is not.
 */
export function extractUrl(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new GiasFormatError("expected YYYY-MM-DD");
  return `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${isoDate.replace(/-/g, "")}.csv`;
}

/**
 * The fewest rows a believable import can contain.
 *
 * A truncated download, a changed column name or a filter that accidentally
 * matches nothing all produce a short list, and the import REPLACES the
 * register wholesale — so without this, one bad afternoon empties the picker
 * and every teacher signing up that day falls back to free text. 20,296 rows
 * were kept on 24 August 2026; a real week-to-week change is dozens.
 */
export const MINIMUM_PLAUSIBLE_ROWS = 15_000;
