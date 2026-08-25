#!/usr/bin/env node
// ---------------------------------------------------------------------------
// check-persona-patterns: the persona suite's "did it work?" checks, held to
// the two rules that F58 found it breaking. Part of `npm run check`, ~40ms,
// no network and no browser.
// ---------------------------------------------------------------------------
//
// WHY A GATE AND NOT A SWEEP.
//
// The suite already knew this class. `operator.spec.ts` carries a comment about
// the first version of the child-name leak check matching "bo" inside "about"
// and reporting a safeguarding breach that did not exist — "a tester who cries
// wolf about the one promise the whole product rests on is worse than no
// tester." That was fixed at that one site, with word boundaries, and nowhere
// else, and fifteen other unsound patterns were written afterwards. Sweeping
// again would buy exactly as much as sweeping bought the first time.
//
// WHAT IT REFUSES, and why each rule is the shape it is.
//
// RULE 1 — a bare alternation shorter than MIN_TOKEN characters.
//   `getByText(/…/)` matches a SUBSTRING of the rendered text, so a short
//   alternative matches inside longer words. Measured against the product's own
//   copy on 25 August 2026: `ok` is inside "broken", "looks", "cookie" and
//   "handbook"; `ask` inside "task" and "asked"; `done` inside "undone"; `sure`
//   inside "measured", "erasure" and "exposure"; `back` inside "background" and
//   "feedback".
//
//   The `ok` case is why this rule is not merely about tidiness. It matches the
//   exact word a health screen uses WHEN SOMETHING IS WRONG, so the check that
//   asks "is health stated in words?" passed on "Mail is broken". A loose check
//   is a nuisance; a check that is inverted on the one case it exists to catch
//   is worse than no check.
//
//   `\b` escapes it: `\bok\b` cannot match "broken", and a persona who is
//   genuinely looking for the word "ok" should say so.
//
// RULE 2 — a failure word inside a success pattern.
//   `/bramblewood|family|code|parent|no match|not found|nothing/i` was used to
//   answer "did I find the family?". The screen said "No account has that
//   address. Nothing else was searched" — and `nothing` matched, so a miss was
//   recorded as a find and the journey filed a false major against a feature
//   that works.
//
//   A pattern cannot be the question and the answer at once. If a journey wants
//   to detect a refusal it should name the boolean for the refusal and negate
//   it, which is what `assistant.spec.ts` already does with
//   `const reachable = !(await t.seesText(/not found|404/i))` — and which this
//   gate permits, because the negation is right there on the line.
//
// WHAT IT DELIBERATELY DOES NOT DO.
//
// It does not judge whether a pattern is a fair description of the screen. That
// is F58's third remedy and it is a matter for whoever writes the journey: no
// script can tell that `/nothing needs you|no alerts/` is looking for words the
// verdict tile never says. This gate catches the two mechanical faults, which
// are the two that produced every proven misreport.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = "tests/battery/personas";
const MIN_TOKEN = 5;

// Words that mean "it did not work". Inside a success pattern, each is a way to
// score a failure as a pass.
const FAILURE_WORDS = [
  "no match",
  "not found",
  "nothing",
  "no account",
  "none",
  "empty",
  "no results",
];

// Real words from the product's own copy, so a refusal can name the collision
// rather than saying "too short". Checked into the gate rather than derived
// from src/ at run time: the point is to show the author a concrete word, and a
// word that has since been edited out of the app still makes the point.
const COLLISIONS = {
  ok: ["broken", "looks", "cookie", "handbook"],
  ask: ["task", "asked", "asking"],
  done: ["undone"],
  sure: ["measured", "erasure", "exposure"],
  back: ["background", "feedback"],
  work: ["working", "worksheet", "paperwork"],
  jar: ["jargon"],
  code: ["codes", "recovery codes"],
  plan: ["plans", "planned"],
  role: ["roles"],
  data: ["database", "datalist"],
  view: ["preview", "reviewed"],
  safe: ["safeguarding"],
  copy: ["copyright"],
  live: ["delivery", "lively"],
  next: ["nextdoor"],
  year: ["years"],
  sent: ["sentence", "consent"],
  stop: ["stopped"],
  sam: ["same", "sample"],
  why: ["whyever"],
  tap: ["tapped"],
  hold: ["household", "holder"],
  redo: ["redone"],
  ["do"]: ["done", "download"],
};

let problems = 0;
let patterns = 0;

function report(file, line, pattern, message) {
  problems += 1;
  console.error(`  ✖ ${file}:${line}\n      ${pattern}\n      ${message}`);
}

/** Split a regex source into top-level alternatives, ignoring those in groups. */
function topLevelAlternatives(source) {
  const out = [];
  let depth = 0;
  let cur = "";
  let escaped = false;
  for (const ch of source) {
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      cur += ch;
      escaped = true;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "|" && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".spec.ts"))
  .sort();

for (const file of files) {
  const lines = readFileSync(path.join(DIR, file), "utf8").split("\n");
  lines.forEach((raw, i) => {
    const line = i + 1;
    // Every seesText call on this line, with its pattern.
    for (const m of raw.matchAll(/seesText\(\s*\/((?:[^/\\]|\\.)+)\/([gimsuy]*)/g)) {
      const source = m[1];
      patterns += 1;
      // Is this a REFUSAL check — one deliberately looking for the failure?
      //
      // Line-local detection is not enough, and the file that proves it is
      // `wriggler.spec.ts`, whose `stranded` is exactly right:
      //
      //     const stranded =
      //       (await t.seesText(/404|not found|…/i, 1200)) &&
      //       !(await t.seesText(/jar|journal|…/i, 800));
      //     t.expects(!stranded, …)
      //
      // The failure words are the point, the negation is two lines below, and a
      // gate that flagged it would be teaching the author to write it worse. So
      // the whole statement is read, and then how its variable is USED: a
      // boolean that only ever reaches `t.expects()` negated is a refusal check
      // however it was spelled.
      const statement = lines.slice(i, i + 6).join("\n").split(";")[0];
      const name = /(?:const|let)\s+(\w+)\s*=/.exec(statement)?.[1];
      const usedNegated =
        name !== undefined &&
        lines.slice(i, i + 14).some((l) => new RegExp(`!\\s*${name}\\b`).test(l));
      const negated =
        /!\s*\(?\s*await\s+t\.seesText/.test(statement) ||
        /!\(await/.test(statement) ||
        usedNegated;

      // RULE 1 — short bare alternatives.
      for (const alt of topLevelAlternatives(source)) {
        const bare = alt.trim();
        if (!/^[A-Za-z]+$/.test(bare)) continue; // has boundaries, groups or classes
        if (bare.length >= MIN_TOKEN) continue;
        const also = COLLISIONS[bare.toLowerCase()];
        const hint = also
          ? `it also matches inside ${also.map((w) => `"${w}"`).join(", ")}`
          : `it matches inside any longer word containing "${bare}"`;
        report(
          file,
          line,
          `/${source}/`,
          `"${bare}" is a bare alternative of ${bare.length} characters and getByText matches a SUBSTRING — ${hint}.\n` +
            `      Write \\b${bare}\\b if the word itself is what this person is looking for.`,
        );
      }

      // RULE 2 — failure words in a success pattern.
      if (!negated) {
        for (const word of FAILURE_WORDS) {
          if (!source.toLowerCase().includes(word)) continue;
          report(
            file,
            line,
            `/${source}/`,
            `"${word}" means the product did NOT work, and this pattern's answer is used as though it did.\n` +
              `      This is F58's false major: "nothing" matched "Nothing else was searched" in a refusal,\n` +
              `      so a search that found nobody was recorded as a find. Name the refusal and negate it —\n` +
              `      const reachable = !(await t.seesText(/not found|404/i)) — or drop the word.`,
          );
        }
      }
    }
  });
}

if (process.argv.includes("--self-test")) {
  // The gate has to reject what it claims to reject. Fixtures rather than the
  // real files, so this keeps working once the real files are clean.
  const cases = [
    { src: "not monitored|healthy|ok|watching", negated: false, rule: 1 },
    { src: "bramblewood|family|nothing", negated: false, rule: 2 },
    { src: "not found|404", negated: true, rule: 0 }, // a refusal check: allowed
    { src: "\\bok\\b|healthy", negated: false, rule: 0 }, // bounded: allowed
    { src: "accepted|attempted|delivered", negated: false, rule: 0 }, // all long: allowed
  ];
  let bad = 0;
  for (const c of cases) {
    let fired = 0;
    for (const alt of topLevelAlternatives(c.src)) {
      const bare = alt.trim();
      if (/^[A-Za-z]+$/.test(bare) && bare.length < MIN_TOKEN) fired = 1;
    }
    if (!c.negated && FAILURE_WORDS.some((w) => c.src.toLowerCase().includes(w))) fired = 2;
    if ((c.rule === 0 && fired !== 0) || (c.rule !== 0 && fired !== c.rule)) {
      console.error(`  ✖ self-test: /${c.src}/ expected rule ${c.rule}, fired ${fired}`);
      bad += 1;
    }
  }
  if (bad) {
    console.error(`\n✖ Persona-pattern gate SELF-TEST FAILED (${bad}).`);
    process.exit(1);
  }
  console.log(`✓ Persona-pattern gate self-test passed (${cases.length} fixtures).`);
  process.exit(0);
}

if (problems) {
  console.error(
    `\n✖ Persona-pattern gate FAILED: ${problems} unsound check(s) in ${patterns} pattern(s).\n` +
      `  A persona that scores a failure as a pass is worse than no persona — see FINDINGS F58.`,
  );
  process.exit(1);
}
console.log(
  `✓ Persona-pattern gate passed (${patterns} success pattern(s) across ${files.length} journey file(s)).`,
);
