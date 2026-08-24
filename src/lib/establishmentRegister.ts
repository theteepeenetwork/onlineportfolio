// ---------------------------------------------------------------------------
// The establishment register's vocabulary: what the import job is called, and
// how it writes down which day's CSV it read.
// ---------------------------------------------------------------------------
//
// Pure. No Prisma, no filesystem, no fetch, no `server-only`. Three constants
// and two string functions, so the import script, the operator's health tile
// and a plain `tsx` test can all import it without dragging anything behind
// them.
//
// WHY THIS IS A SEPARATE MODULE FROM src/lib/establishmentSearch.ts, which is
// the file you would expect this to live in.
//
// `src/lib/ops/reads.ts` imports GIAS_IMPORT_JOB to render the register tile,
// and any file an ops module imports is walked and scanned AS ops code by
// scripts/check-ops-blindness.mjs. The search helpers name the column
// `postcode`, which is on that gate's denied-identifier list, so putting them
// here would fail the gate the moment the tile imported them — and the right
// answer to that is not to un-deny the column. This is the same split, for the
// same reason, as @/lib/mailStatus against @/lib/mailer.
//
// The rule to keep: nothing in this file may name a denied identifier, import
// the database, or grow a function that does work. It is a vocabulary.
// ---------------------------------------------------------------------------

/**
 * The `JobRun.job` key the GIAS import writes under.
 *
 * The name reads as what the job DOES to the register rather than where the
 * rows came from, which is the right way round: the CSV is one source of a
 * refresh, not the meaning of one.
 *
 * It was originally chosen for a second reason that no longer applies, recorded
 * here because the comment that stood in its place said the opposite and a stale
 * warning about a fixed bug is its own small trap. "gias:import" tripped a fault
 * in the ops blindness gate's import scanner: the bare-import pattern was
 * anchored to a word boundary and allowed zero whitespace, so the word `import`
 * at the END of any string literal matched, taking that string's closing quote
 * as an opening one and reading the file as importing whatever followed. Fixed
 * on 2026-08-24 in scripts/check-ops-blindness.mjs, which is now anchored to a
 * statement position and has a fixture in both directions
 * (bad-bare-side-effect-import.txt, good-string-literal-ending-in-import.txt).
 *
 * So there is no longer any constraint on this name from the tooling. Call it
 * whatever reads best; a literal ending in the word "import" is safe again.
 */
export const GIAS_IMPORT_JOB = "register:refresh";

/**
 * A whole run of the import is one `JobRun` row, and the day the CSV itself was
 * published goes in `outcomeDetail`.
 *
 * THE FORMAT IS `source 20260824` AND NOT `source=2026-08-24`. DO NOT "TIDY" IT
 * BACK TO AN ISO DATE — that spelling was written first and a blocking test
 * caught it, which is worth recording rather than quietly fixing.
 *
 * `tests/battery/security/ops-mail.spec.ts` walks EVERY `JobRun` row, not only
 * the mail ones, and asserts `outcomeDetail` matches `/^[\w ]*$/` — word
 * characters and spaces, nothing else. That is a log-hygiene invariant on the
 * COLUMN rather than on any one job, which is why a mail spec caught a register
 * bug: free text on an operational row is how a recipient address, a path or a
 * child's name ends up somewhere nobody expected, and `=` and `-` are the first
 * two characters a path or an address needs. Widening the pattern to admit them
 * would relax an assertion guarding every job this product will ever write, for
 * the convenience of one of them.
 *
 * ON "NOTHING FROM THE PROVIDER", which the invariant also says, and which this
 * value has to answer for. The day is read out of a hidden input on the DfE's
 * Downloads page, so it is provider-derived. So is `Mailjet answered 4xx`, which
 * has sat in this column since the sync was written: `res.status` is the
 * provider's number. The distinguishing line is not where a value came from, it
 * is whether any of the provider's BYTES survive into it. Here none do —
 * `americanDateToIso` captures three groups of digits with a regex and rebuilds
 * the string, so the output is structurally incapable of carrying a path, a
 * filename or an address whatever the DfE serves. The pattern above is what
 * enforces that, and this format satisfies it rather than negotiating with it.
 *
 * The ISO form is what everything else here speaks, so it is what goes in and
 * what comes back out; the compact spelling exists only inside the column.
 */
const SOURCE_DETAIL = /^source (\d{4})(\d{2})(\d{2})$/;

/** Format the source file's date for `JobRun.outcomeDetail`. Takes YYYY-MM-DD. */
export function formatImportDetail(sourceDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
    throw new Error("source date must be YYYY-MM-DD");
  }
  return `source ${sourceDate.replace(/-/g, "")}`;
}

/**
 * The invariant the column is held to, mirrored here so the fast gate can assert
 * it too. `scripts/check-establishments.ts` checks every value this module can
 * produce against it, because the spec that owns it is a nine-minute lane away
 * and this is a second away. Kept character for character with
 * `tests/battery/security/ops-mail.spec.ts`; if that pattern ever changes,
 * change this one with it rather than letting the two drift.
 */
export const JOB_DETAIL_SAFE = /^[\w ]*$/;

/**
 * Read the source file's date back, or null if the row does not carry one.
 *
 * Null is a real answer and the caller must render it as one: a run written by
 * an older version of the script, or by hand, has no source date, and the tile
 * says it does not know rather than inventing today's.
 */
export function parseImportDetail(detail: string | null): string | null {
  if (!detail) return null;
  const m = SOURCE_DETAIL.exec(detail);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * The Open Government Licence v3.0 attribution, one string.
 *
 * It belongs on the page that shows the data — the signup picker — not here and
 * not on an operator screen. It lives in this file so there is one copy of the
 * wording; docs/brand-and-copy.md carries the same sentence and says where it
 * has to appear.
 */
export const GIAS_ATTRIBUTION =
  "School information from Get Information about Schools, © Crown copyright, licensed under the Open Government Licence v3.0.";

export const GIAS_ATTRIBUTION_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
