import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { GIAS_IMPORT_JOB, formatImportDetail } from "@/lib/establishmentRegister";
import {
  GIAS_DOWNLOADS_PAGE,
  GiasFormatError,
  MINIMUM_PLAUSIBLE_ROWS,
  extractUrl,
  parseGias,
  resolveExtractDate,
  type EstablishmentRow,
} from "@/lib/giasImport";

// ---------------------------------------------------------------------------
// gias-import: refresh the establishment register from the DfE's published
// extract of every school in England.
// ---------------------------------------------------------------------------
//
// WHY THIS IS A COMMAND AND NOT A SCREEN
//
// The obvious place for this is a button inside /ops. It is not there, and it
// should not be added. That area has exactly two named write operations, each
// carrying a stated reason, a confirm step and an audit row written in the same
// transaction (handbook R15). A bulk replace of twenty thousand rows fits none
// of that: there is no row to name, no reason to state, and no meaningful undo.
// Putting it behind a button would mean widening the ops blindness gate to
// permit a bulk write, and the register is classified PUBLIC_REFERENCE — read
// only — precisely so that widening has to be a deliberate, reviewed act rather
// than a side effect of adding a screen.
//
// The same reasoning as F43: a person choosing to run something is a different
// thing from a machine deciding to. There is no job runner in this repository
// and nothing here may depend on one.
//
// WHY IT WRITES A JobRun ROW
//
// So that /ops/health can say when the register was last refreshed and how old
// the source file was, without an operator having to remember. Staleness is
// accepted here — schools open, close and merge constantly and a hand-run
// import is a snapshot — and the honest way to accept it is to show it.
//
// WHAT IT DELIBERATELY DOES NOT TOUCH
//
// One file, `all.edubase.data`. The same Downloads page offers governance
// records: 32.9 MB of named governors, their terms of office and their
// appointing bodies. Those are records about people, StoryJar has no use for
// them, and importing them would start a new data category (rule 9) to no end.
//
// Usage:
//   npm run gias:import                      # resolve the latest, download, replace
//   npm run gias:import -- --dry-run         # download and parse, write nothing
//   npm run gias:import -- --file ./x.csv    # parse a file already on disk
//
// Against production, inside the container, because it writes rows and the
// database is a file on the volume:
//   railway ssh
//   npm run gias:import
//
// NOT `railway run` — that would give you the variables and somebody else's
// database file. This is the same trap F44 recorded for the mail suppression
// sync.
// ---------------------------------------------------------------------------

const CHUNK = 1_000;

// Long enough for twenty thousand inserts on a volume-backed SQLite file, which
// takes seconds rather than the interactive default of five.
const TRANSACTION_MS = 5 * 60 * 1000;

type Source = { text: string; sourceDate: string; describe: string };

async function fetchText(url: string, what: string): Promise<Response> {
  const res = await fetch(url, {
    // The DfE serves this to browsers. Identifying ourselves is politeness and
    // it is also what makes StoryJar findable in their logs if we ever ask too
    // often.
    headers: { "user-agent": "StoryJar establishment register import (storyjar.co.uk)" },
  });
  if (!res.ok) {
    throw new Error(`${what} answered ${res.status}. Nothing was changed.`);
  }
  return res;
}

async function resolveAndDownload(): Promise<Source> {
  process.stdout.write(`[gias-import] reading ${GIAS_DOWNLOADS_PAGE}\n`);
  const page = await (await fetchText(GIAS_DOWNLOADS_PAGE, "the GIAS Downloads page")).text();
  const sourceDate = resolveExtractDate(page);

  const url = extractUrl(sourceDate);
  process.stdout.write(`[gias-import] the latest extract is ${sourceDate}; downloading\n`);
  // The extract is Windows-1252 and NOT UTF-8. res.text() would decode it as
  // UTF-8 and turn every curly apostrophe in the file into mojibake, so the
  // bytes are taken and decoded deliberately. There are a great many schools
  // with an apostrophe in their name.
  const bytes = await (await fetchText(url, "the extract download")).arrayBuffer();
  return {
    text: new TextDecoder("windows-1252").decode(bytes),
    sourceDate,
    describe: `${url} (${(bytes.byteLength / 1_048_576).toFixed(1)} MB)`,
  };
}

function readLocal(file: string): Source {
  const text = new TextDecoder("windows-1252").decode(readFileSync(file));
  // A file on disk cannot say when the DfE generated it, and inventing a date
  // would put a wrong one on the health tile. --file is for parsing something
  // already downloaded, so it declines to guess and the JobRun row carries no
  // source date, which the tile renders as "not recorded".
  return { text, sourceDate: "", describe: file };
}

async function replaceRegister(
  db: PrismaClient,
  rows: EstablishmentRow[],
): Promise<void> {
  await db.$transaction(
    async (tx) => {
      // Wholesale replace, in one transaction. A school that closed since the
      // last import has to LEAVE the register, and an update-only pass would
      // leave it there forever. The transaction is what makes that safe: a
      // failure halfway through rolls back to the register that was working
      // this morning rather than leaving an empty picker.
      //
      // READ THIS BEFORE BUILDING STEP 4 (the claim). This line deletes rows
      // that nothing in the schema protects: `urn` is a primary key here, and
      // `School.urn` is planned as a `@unique` SCALAR with no foreign key —
      // deliberately, so it stays out of the ops gate's relation-path logic. So
      // an import can remove the row a school's identity was derived from, and
      // the database will not object.
      //
      // For a PICKER that is correct and cheap: a school that vanishes is a
      // school a teacher types by hand, and the free-text path is a first-class
      // route. For a CLAIMED school it is neither, and there is no equivalent
      // fallback — the free text protects a teacher who cannot find their
      // school, not a school that has already paid.
      //
      // OWNER DECISIONS, TAKEN 2026-08-24. Two, and they are settled rather than
      // open. Whoever builds steps 4 to 7 inherits the decision, not the
      // question.
      //
      //   (a) THE CLAIM SNAPSHOTS. IT DOES NOT JOIN. At claim time, copy the
      //       name, postcode, local authority and town onto the `School` row.
      //       `School.urn` stays as a reference for reconciliation and is never
      //       a live pointer to this table.
      //
      //       Deletion is the obvious reason and it is the lesser one. The
      //       better reason is that GIAS RENAMES SCHOOLS — routinely, on
      //       academisation — and a paying customer's name changing on their
      //       invoice and in their admin console because of a data refresh is
      //       its own small betrayal. The name and address they bought under
      //       are theirs.
      //
      //   (b) THE IMPORT COUNTS VANISHED REFERENCED URNs AND NEVER BLOCKS ON
      //       THEM. When a `School` references a URN this import did not find,
      //       count it and show it on the register tile in /ops/health. It is a
      //       RECONCILIATION SIGNAL, NOT A GATE: a closed school should leave
      //       the register, and the import must not refuse to run because a
      //       customer's school merged. A paying school whose URN went with it
      //       is a conversation somebody needs to be able to have, which is a
      //       different thing from an error.
      //
      // Neither is built here, because there is no `School.urn` yet. Nothing in
      // steps 1 to 2 treats the register as a live pointer, and nothing built
      // on it should start.
      await tx.establishment.deleteMany();
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.establishment.createMany({ data: rows.slice(i, i + CHUNK) });
      }
    },
    { timeout: TRANSACTION_MS, maxWait: TRANSACTION_MS },
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const fileAt = argv.indexOf("--file");
  const file = fileAt >= 0 ? argv[fileAt + 1] : undefined;
  if (fileAt >= 0 && !file) throw new Error("--file needs a path");

  const startedAt = new Date();
  const source = file ? readLocal(file) : await resolveAndDownload();

  const { rows, seen, skipped } = parseGias(source.text);
  process.stdout.write(
    `[gias-import] ${source.describe}\n` +
      `[gias-import] ${seen} rows read, ${rows.length} kept\n` +
      `[gias-import]   ${skipped.closed} not open, ${skipped.notEngland} not in England, ` +
      `${skipped.notPrimary} teach no primary-aged child, ${skipped.unusable} unusable\n`,
  );

  // The floor under the wholesale replace. A truncated download or a renamed
  // column produces a short list, and without this one bad afternoon empties
  // the picker and every teacher signing up that day falls back to free text —
  // which is the exact outcome this whole feature exists to prevent.
  if (rows.length < MINIMUM_PLAUSIBLE_ROWS) {
    throw new Error(
      `only ${rows.length} establishments parsed, which is below the floor of ` +
        `${MINIMUM_PLAUSIBLE_ROWS}. The register was NOT replaced. Look at the extract before ` +
        "lowering this number: a short list usually means the download was cut off or a column " +
        "was renamed, not that England has closed its schools.",
    );
  }

  if (dryRun) {
    process.stdout.write("[gias-import] --dry-run: nothing written\n");
    return;
  }

  const db = new PrismaClient();
  try {
    await replaceRegister(db, rows);
    await db.jobRun.create({
      data: {
        job: GIAS_IMPORT_JOB,
        startedAt,
        finishedAt: new Date(),
        outcome: "SUCCESS",
        itemsAffected: rows.length,
        outcomeDetail: source.sourceDate ? formatImportDetail(source.sourceDate) : null,
      },
    });
    process.stdout.write(`[gias-import] register replaced: ${rows.length} establishments\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  // A GiasFormatError is the DfE having changed something, and its message says
  // what and where to look. Anything else is printed by name only, in the house
  // style: an error object can carry the request it failed on.
  if (e instanceof GiasFormatError) {
    console.error(`[gias-import] the extract is not the shape this script expects:\n  ${e.message}`);
  } else {
    console.error(`[gias-import] failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  process.exit(1);
});
