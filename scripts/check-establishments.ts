import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_LIMIT,
  SEARCH_MIN_CHARS,
  establishmentLabel,
  nameMatches,
  planSearch,
} from "@/lib/establishmentSearch";
import {
  GIAS_IMPORT_JOB,
  JOB_DETAIL_SAFE,
  formatImportDetail,
  parseImportDetail,
} from "@/lib/establishmentRegister";
import {
  GiasFormatError,
  MINIMUM_PLAUSIBLE_ROWS,
  americanDateToIso,
  extractUrl,
  parseCsv,
  parseGias,
  resolveExtractDate,
} from "@/lib/giasImport";
import { readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// check-establishments: the establishment register's rules — the search's
// bounds and the GIAS parser's filter — asserted in forty milliseconds against
// no network and no database. Part of `npm run check`.
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS RATHER THAN ONLY A SPEC. The endpoint's bounds are asserted
// against a running app in tests/battery/security/establishment-search.spec.ts,
// which is where they belong and which is a blocking gate. But the single most
// important line in the feature — dropping LIKE's own wildcards out of an
// unauthenticated query — is pure string handling, and a regression in it is a
// character's worth of edit. Verified against SQLite on 24 August 2026: a
// Prisma `contains: "%"` returns EVERY row of the table, and `contains: "_"`
// does too, because Prisma does not escape LIKE metacharacters in the value.
// That is a nine-minute battery run away from being noticed, and it is two
// seconds away here.
//
// It is not a substitute for the spec. It cannot see the database, the query,
// the throttle or the picker. It checks the rules the comments claim.
// ---------------------------------------------------------------------------

let failures = 0;
let assertions = 0;

function check(what: string, ok: boolean, detail = ""): void {
  assertions += 1;
  if (ok) return;
  failures += 1;
  console.error(`  ✖ ${what}${detail ? ` — ${detail}` : ""}`);
}

function eq<T>(what: string, actual: T, expected: T): void {
  check(what, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

// -- The wildcard strip. The reason this file is in `npm run check`. ----------
//
// Each of these reaches the database as the value inside a LIKE. If any of them
// survives the plan with its metacharacter intact, one unauthenticated request
// returns the whole register and the "bounded result set" the gate asks for is
// a comment rather than a fact.
for (const hostile of ["%", "%%", "_", "___", "\\", "%_%"]) {
  const plan = planSearch(hostile);
  check(
    `a query of ${JSON.stringify(hostile)} is refused outright`,
    !plan.ok,
    "it planned a search instead",
  );
}
for (const hostile of ["St %", "LA1%", "Bede_", "a%b%c", "St\\Marys"]) {
  const plan = planSearch(hostile);
  if (!plan.ok) continue; // refused is also a correct answer
  check(
    `no LIKE wildcard survives ${JSON.stringify(hostile)}`,
    !/[%_\\]/.test(plan.namePrefix) && !plan.postcodePrefixes.some((p) => /[%_\\]/.test(p)),
    `planned ${JSON.stringify(plan.namePrefix)} / ${JSON.stringify(plan.postcodePrefixes)}`,
  );
}

// -- The minimum, and that it is measured after cleaning ---------------------
eq("SEARCH_MIN_CHARS is 3", SEARCH_MIN_CHARS, 3);
check("two characters are refused", !planSearch("St").ok);
check("a trailing space does not count toward the minimum", !planSearch("St ").ok);
check("three real characters are answered", planSearch("Oak").ok);
check("whitespace alone is refused", !planSearch("     ").ok);
check("an empty query is refused", !planSearch("").ok);
check(
  "punctuation does not pad a short query to the minimum",
  !planSearch("S%%").ok,
  "a two-letter query got through by being padded with characters that are dropped",
);

// -- The bound and the debounce, as numbers somebody can read ----------------
eq("SEARCH_LIMIT is 20", SEARCH_LIMIT, 20);
eq("SEARCH_DEBOUNCE_MS is 250", SEARCH_DEBOUNCE_MS, 250);

// -- Word-prefix name matching, which is the decision this feature turns on --
const bedes = "St Bede's Catholic Primary School";
const grange = "The Grange Primary School";

check("a teacher who types the start of the name finds it", nameMatches(bedes, "St Bede"));
check("a teacher who types the DISTINCTIVE word finds it", nameMatches(bedes, "Bede"));
check("case does not matter", nameMatches(bedes, "bede"));
check("'Grange' finds 'The Grange Primary School'", nameMatches(grange, "Grange"));
check("'The Grange' finds it too", nameMatches(grange, "The Grange"));
check(
  "a mid-word fragment does NOT match",
  !nameMatches(bedes, "ede"),
  "this is a substring match, which is the unbounded wildcard shape",
);
check("an unrelated word does not match", !nameMatches(bedes, "Oakfield"));

// -- The postcode space, in both directions ----------------------------------
const spaced = planSearch("LA1 5QP");
check("a postcode typed with its space is planned as typed", spaced.ok && spaced.postcodePrefixes.includes("LA1 5QP"));

const squashed = planSearch("LA15QP");
check(
  "a postcode typed without its space still reaches 'LA1 5QP'",
  squashed.ok && squashed.postcodePrefixes.includes("LA1 5QP"),
  squashed.ok ? squashed.postcodePrefixes.join(", ") : "refused",
);
check(
  "and the string as typed is still tried, for a register that ever stores it that way",
  squashed.ok && squashed.postcodePrefixes.includes("LA15QP"),
);

const lower = planSearch("la15qp");
check(
  "a lower-case postcode is planned upper-case",
  lower.ok && lower.postcodePrefixes.includes("LA1 5QP"),
  lower.ok ? lower.postcodePrefixes.join(", ") : "refused",
);

const nameQuery = planSearch("Grange");
check(
  "a plain name does not generate postcode spellings",
  nameQuery.ok && nameQuery.postcodePrefixes.length === 1,
  nameQuery.ok ? nameQuery.postcodePrefixes.join(", ") : "refused",
);

const outward = planSearch("LA1");
check(
  "a three-character outward code is answered",
  outward.ok && outward.postcodePrefixes.includes("LA1"),
);

// -- The accessible name is ONE string ---------------------------------------
eq(
  "an option's label is one coherent sentence, not four fragments",
  establishmentLabel({
    urn: "119456",
    name: bedes,
    town: "Lancaster",
    postcode: "LA1 5QP",
    localAuthority: "Lancashire",
  }),
  "St Bede's Catholic Primary School, Lancaster, LA1 5QP",
);
eq(
  "a missing town leaves no stray comma",
  establishmentLabel({
    urn: "1",
    name: "Oakfield Infant School",
    town: "",
    postcode: "LA1 4XX",
    localAuthority: "Lancashire",
  }),
  "Oakfield Infant School, LA1 4XX",
);

// -- The register's job vocabulary -------------------------------------------
check(
  "the import job key is a fixed vocabulary word, not free text",
  /^[a-z]+:[a-z-]+$/.test(GIAS_IMPORT_JOB),
  GIAS_IMPORT_JOB,
);
eq("a source date round-trips", parseImportDetail(formatImportDetail("2026-08-24")), "2026-08-24");

// -- The log-hygiene invariant on JobRun.outcomeDetail -----------------------
//
// Added after the cold battery caught `source=2026-08-24`. That value was
// written through a strict formatter and validated on the way back out, and it
// still failed, because the invariant on that COLUMN is stricter than "cannot
// carry a path": tests/battery/security/ops-mail.spec.ts walks every JobRun row
// in the database — not only the mail ones — and holds outcomeDetail to word
// characters and spaces.
//
// The fix was to satisfy the pattern, never to widen it. These assertions exist
// so the next person who changes this format finds out in a second rather than
// nine minutes into a lane, and so the two patterns cannot drift apart in
// silence.
for (const day of ["2026-08-24", "2026-01-01", "2026-12-31"]) {
  const detail = formatImportDetail(day);
  check(
    `the detail for ${day} satisfies the JobRun column invariant`,
    JOB_DETAIL_SAFE.test(detail),
    JSON.stringify(detail),
  );
  check(
    `the detail for ${day} carries no address character`,
    !detail.includes("@"),
    JSON.stringify(detail),
  );
  eq(`and ${day} still comes back out as an ISO date`, parseImportDetail(detail), day);
}
check(
  "the mirrored pattern is the one the spec uses, not a looser cousin",
  JOB_DETAIL_SAFE.source === "^[\\w ]*$",
  JOB_DETAIL_SAFE.source,
);
check(
  "and it would still reject the spelling the battery caught",
  !JOB_DETAIL_SAFE.test("source=2026-08-24"),
);
eq("a run with no detail has no source date", parseImportDetail(null), null);
eq("free text is not read back as a date", parseImportDetail("last Tuesday"), null);
eq("a half-formed date is not read back", parseImportDetail("source=2026-08"), null);
check(
  "a source date that is not a date is refused on the way in",
  (() => {
    try {
      formatImportDetail("last Tuesday");
      return false;
    } catch {
      return true;
    }
  })(),
);

// ---------------------------------------------------------------------------
// The GIAS extract parser, against a fixture of fourteen invented schools.
//
// NOTHING HERE TOUCHES THE NETWORK. The live extract is sixty megabytes from a
// government service and is not a thing to fetch on every dev loop, or from a
// test, or from CI. See tests/fixtures/gias/README.md.
// ---------------------------------------------------------------------------

const fixture = new TextDecoder("windows-1252").decode(
  readFileSync(path.join(process.cwd(), "tests/fixtures/gias/sample-extract.csv")),
);

const parsed = parseGias(fixture);
const kept = new Map(parsed.rows.map((r) => [r.urn, r]));

eq("the fixture's fourteen data rows are all seen", parsed.seen, 14);
eq("seven of them are kept", parsed.rows.length, 7);

check("an ordinary community primary is kept", kept.has("900001"));
check("an independent prep with phase 'Not applicable' is kept", kept.has("900003"), "this is the row phase-only filtering drops: 1,485 independent schools");
check("a maintained nursery school is kept — StoryJar has an EYFS register", kept.has("900004"));
check("a school open but proposed to close is kept — it is open now", kept.has("900005"));
check("a special school with primary-aged children is kept", kept.has("900006"));
check("a school with no postcode is kept — the name is what a teacher searches", kept.has("900007"));

check("a closed school is dropped", !kept.has("900101"));
check("a secondary starting at 11 is dropped", !kept.has("900102"), "an age test of lowAge <= 11 would sweep in every secondary in England");
check("a Welsh establishment is dropped — England picker, free text elsewhere", !kept.has("900103"));
check("a British school overseas is dropped", !kept.has("900104"));
check("a sixth form centre is dropped", !kept.has("900105"));
eq("a duplicate URN does not overwrite the first row", kept.get("900001")?.name, "Bramblewick Community Primary School");

eq("closed rows are counted as closed", parsed.skipped.closed, 1);
eq("non-English rows are counted separately", parsed.skipped.notEngland, 2);
eq("rows that teach no primary-aged child are counted separately", parsed.skipped.notPrimary, 2);
eq("a duplicate and a URN-less row are counted as unusable", parsed.skipped.unusable, 2);

// The two things a naive parser gets wrong, which is why the fixture has them.
eq(
  "a comma inside a quoted school name does not split the row",
  kept.get("900002")?.name,
  "St Cuthbert\u2019s Catholic Primary School, Ambledon",
);
check(
  "the extract is Windows-1252, so a curly apostrophe survives",
  kept.get("900002")?.name.includes("\u2019") === true,
  "decoded as UTF-8 this becomes mojibake in twenty thousand places",
);
eq("Town falls back to Locality when Town is empty", kept.get("900004")?.town, "Wren Hill");
eq("Town is used when it is there", kept.get("900001")?.town, "Ambledon");

// -- The CSV parser's own corners --------------------------------------------
eq('a doubled quote is one quote', parseCsv('a,"He said ""hi""",c')[0][1], 'He said "hi"');
eq("CRLF and LF are both one line ending", parseCsv("a,b\r\nc,d\ne,f").length, 3);
eq("an empty trailing field is a field", parseCsv("a,b,")[0].length, 3);
check(
  "a newline inside a quoted field does not end the row",
  parseCsv('a,"one\ntwo",c')[0].length === 3,
);

// -- Resolving which day's file to fetch, never guessing ---------------------
eq(
  "the extract date is read from the Downloads page",
  resolveExtractDate(
    '<input name="Downloads[0].Tag" type="hidden" value="all.edubase.data" />' +
      '<input name="Downloads[0].FileGeneratedDate" type="hidden" value="8/24/2026 12:00:00 AM" />',
  ),
  "2026-08-24",
);
eq(
  "the date is taken from the MATCHING file, not the first one on the page",
  resolveExtractDate(
    '<input name="Downloads[0].Tag" type="hidden" value="all.governance.records" />' +
      '<input name="Downloads[0].FileGeneratedDate" type="hidden" value="1/2/2020 12:00:00 AM" />' +
      '<input name="Downloads[3].Tag" type="hidden" value="all.edubase.data" />' +
      '<input name="Downloads[3].FileGeneratedDate" type="hidden" value="8/24/2026 12:00:00 AM" />',
  ),
  "2026-08-24",
);
check(
  "a Downloads page that no longer offers the extract FAILS rather than guessing today",
  (() => {
    try {
      resolveExtractDate("<html>we have redesigned the site</html>");
      return false;
    } catch (e) {
      return e instanceof GiasFormatError;
    }
  })(),
  "a silent fallback to today's date is how a register goes stale unnoticed",
);
eq("the DfE writes month first", americanDateToIso("12/1/2026 12:00:00 AM"), "2026-12-01");
eq(
  "the download URL is built from the resolved date",
  extractUrl("2026-08-24"),
  "https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata20260824.csv",
);

check(
  "the wholesale replace has a floor under it",
  MINIMUM_PLAUSIBLE_ROWS >= 10_000,
  "20,296 rows were kept on 24 August 2026; a truncated download must not empty the register",
);

if (failures) {
  console.error(`\n✖ Establishment check FAILED (${failures} of ${assertions} assertion(s)).`);
  process.exit(1);
}
console.log(
  `✓ Establishment check passed (${assertions} assertions: query planning, search bounds, the GIAS filter and the register vocabulary).`,
);
