import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

// ===========================================================================
// check-like-wildcards: a value reaching Prisma's LIKE operators must be safe
// AT THE CALL SITE, visibly, without the reader having to trace where it came
// from. FINDINGS.md F55.
// ===========================================================================
//
// WHAT IT IS FOR
//
// `contains`, `startsWith` and `endsWith` compile to SQL `LIKE`, and Prisma does
// not escape LIKE's own wildcards in the value. `contains: "%"` returns every
// row of the table; `_` matches any single character. Measured on 2026-08-24
// against SQLite: all 35 seeded Student rows came back.
//
// Every other LIKE in this codebase is safe because the `where` around it is
// already scoped to the caller's own rows. **That is safety by accident of
// scoping rather than by design**, and the establishment search is the first
// public, unscoped search this product has ever had. It will not be the last.
//
// WHY IT CHECKS THE EXPRESSION AND NOT THE DATA FLOW
//
// The honest thing to say first: **this gate does not do taint analysis, and a
// regex scanner cannot.** Whether a value is user-supplied is a question about
// everything that ever called the function, and no amount of pattern matching
// answers it. A gate that pretended otherwise would be the thing the handbook
// warns about — coverage-shaped and hollow.
//
// So the burden is inverted. The gate does not try to prove a value is
// dangerous; it requires the call site to prove the value is safe, by being one
// of a small set of shapes it can read directly:
//
//   • a string literal, or a template literal with nothing interpolated. A
//     literal cannot be user input.
//   • a call to `likeSafe(...)` (src/lib/likeSafe.ts), which strips `%`, `_`
//     and `\`. This is the marker the safe path carries.
//   • a template literal whose every `${...}` is one of the above — so
//     `` `${likeSafe(q)}%` `` is fine and `` `${q}` `` is not.
//   • a TypeScript type position (`{ name: { contains: string } }`), which is a
//     declaration and not a query.
//   • a reviewed exception, registered BELOW IN THIS FILE with a written reason.
//
// Everything else fails. The rule is local and syntactic, which is what makes it
// checkable at all — and it is why the fix for a failure is to make the safety
// visible where the query is written rather than to argue about a call chain.
//
// WHY THE EXCEPTIONS LIVE IN THIS FILE
//
// Same reason `scripts/audit-static.mjs` keeps its `dangerouslySetInnerHTML`
// allowlist in the script: **silencing this gate has to be a diff a reviewer
// sees.** A magic comment in the source file can be added by whoever is trying
// to get a build green, at the moment they are least inclined to think about it.
//
// This allowlist is keyed tighter than that one. An entry names the file AND the
// exact expression it permits, so a DIFFERENT expression in an allowlisted file
// still fails. (`audit-static.mjs`'s entries are keyed on the file alone; its
// comment says a second use in an allowlisted file would fail and, read
// closely, it would not. Reported rather than changed here — that gate is not
// this one's to edit.)
//
// The exceptions are PRINTED on every successful run, deliberately. One of them
// below is a value that is genuinely not sanitised, and a residual that scrolls
// past twice a minute is a residual somebody eventually fixes.
// ===========================================================================

const ROOT = process.cwd();
const SCAN_ROOTS = ["src", "scripts", "prisma"];
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];

/** The operators that become SQL LIKE. */
const LIKE_OPERATORS = ["contains", "startsWith", "endsWith"];

/** The one function that makes a value safe, and the only marker this gate trusts. */
const SANITISER = "likeSafe";

// ---------------------------------------------------------------------------
// Reviewed exceptions. Keep this list tiny and re-justify on every change.
// ---------------------------------------------------------------------------
const ALLOWLIST = [
  {
    file: "src/app/uploads/[...path]/route.ts",
    expression: "urlPath",
    why:
      "The authorising media route. `urlPath` is built at line 54 from a filename already validated against SAFE_NAME " +
      "(`/^[A-Za-z0-9._-]+\\.(png|jpe?g|webp|gif|svg|webm|ogg|m4a|mp3)$/`), so it cannot carry `%` or `\\`. It CAN carry " +
      "`_`, which SAFE_NAME permits because real filenames contain one — and `likeSafe()` is the wrong fix here for " +
      "exactly that reason: stripping `_` would stop the route finding a file whose name legitimately has one. What " +
      "makes the residual harmless is the second control: every canAccess branch is already scoped to the requester " +
      "(the F17 fix), so a `_` can only broaden matching WITHIN rows that caller may already read, and the file read " +
      "then 404s identically. Scoping is the control; the pattern is the belt.",
  },
  {
    file: "src/lib/libraryPermission.ts",
    expression: "p",
    why:
      "The provenance check that refuses to publish a template pointing at a file it does not own. `p` is not a " +
      "user string: it comes from `ownMediaPathsIn()`, whose token is `/\\/uploads\\/(?!shared\\/)[A-Za-z0-9._-]+/g`, " +
      "so `%` and `\\` are impossible by construction. It CAN carry `_`, for the same reason the uploads route can — " +
      "real filenames have one — and `likeSafe()` is not merely unhelpful here, it is DANGEROUS: it STRIPS `_` rather " +
      "than escaping it, so `/uploads/my_photo.png` would be searched for as `/uploads/myphoto.png`, match nothing, " +
      "and the check would report the file as unowned. That is a FALSE NEGATIVE on a safeguarding gate — a child's " +
      "photograph published to every school because its filename had an underscore. " +
      "The residual runs the safe way. `_` matching any single character can only BROADEN these queries, and every " +
      "one of them is a refusal test whose only output is a verdict string: a broadened match refuses a publish that " +
      "might have been allowed, and can never allow one that should have been refused. They select `{ id: true }` " +
      "and disclose nothing. Fail-safe by construction, which is why the belt is left off rather than fitted backwards.",
  },
  {
    file: "src/lib/api/activities.ts",
    expression: "search",
    why:
      "NOT SANITISED, and listed here so that stays visible rather than becoming invisible. `search` is the connector " +
      "caller's own string, trimmed and passed straight to `contains`. A `%` therefore returns that teacher's whole " +
      "template library — which they can already list with no search at all, so there is no privilege gain: the query " +
      "is scoped by `teacherId` with a bounded `take`, and a bearer token is that teacher by definition. It is " +
      "accepted rather than fixed because wrapping it changes connector behaviour in a file this change does not own. " +
      "RECOMMENDED FOLLOW-UP: `likeSafe(search)`, at which point this entry should be deleted rather than reworded.",
  },
];

// ---------------------------------------------------------------------------
// Expression reading
// ---------------------------------------------------------------------------

/**
 * Read the value expression that follows `operator:` at `from`.
 *
 * Walks forward tracking quotes, template literals, brackets and comments, and
 * stops at the first `,` or closing bracket that is not nested. Written out
 * rather than regexed because the thing being read can contain both — a
 * template literal with an object inside its interpolation is legal.
 */
function readExpression(src, from) {
  let i = from;
  let depth = 0;
  const stack = [];
  let out = "";

  while (i < src.length) {
    const c = src[i];
    const top = stack[stack.length - 1];

    if (top === "line") {
      if (c === "\n") stack.pop();
      i += 1;
      continue;
    }
    if (top === "block") {
      if (c === "*" && src[i + 1] === "/") {
        stack.pop();
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (top === '"' || top === "'") {
      out += c;
      if (c === "\\") {
        out += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === top) stack.pop();
      i += 1;
      continue;
    }
    if (top === "`") {
      out += c;
      if (c === "\\") {
        out += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === "$" && src[i + 1] === "{") {
        out += "{";
        stack.push("${");
        i += 2;
        continue;
      }
      if (c === "`") stack.pop();
      i += 1;
      continue;
    }

    // Ordinary code, possibly inside a `${}`.
    if (c === "/" && src[i + 1] === "/") {
      stack.push("line");
      i += 2;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      stack.push("block");
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      stack.push(c);
      out += c;
      i += 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth += 1;
      out += c;
      i += 1;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (top === "${" && c === "}" && depth === 0) {
        stack.pop();
        out += c;
        i += 1;
        continue;
      }
      if (depth === 0) break; // end of this value
      depth -= 1;
      out += c;
      i += 1;
      continue;
    }
    if (c === "," && depth === 0 && stack.length === 0) break;

    out += c;
    i += 1;
  }
  return out.trim();
}

/** A quoted string with no interpolation. */
function isPlainLiteral(expr) {
  if (/^"([^"\\]|\\.)*"$/.test(expr)) return true;
  if (/^'([^'\\]|\\.)*'$/.test(expr)) return true;
  if (/^`[^`]*`$/.test(expr) && !expr.includes("${")) return true;
  return false;
}

/** A direct `likeSafe(...)` call. */
function isSanitiserCall(expr) {
  return new RegExp(`^${SANITISER}\\s*\\(`).test(expr) && expr.endsWith(")");
}

/**
 * A template literal whose every interpolation is itself acceptable.
 *
 * This is the shape a prefix search wants — `` `${likeSafe(q)}%` `` and
 * `` ` ${likeSafe(q)}` `` — and the shape it must refuse is the same thing with
 * the sanitiser left off.
 */
function isSafeTemplate(expr) {
  if (!expr.startsWith("`") || !expr.endsWith("`")) return false;
  const holes = [...expr.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].map((m) => m[1].trim());
  if (holes.length === 0) return true;
  return holes.every((h) => isSanitiserCall(h) || isPlainLiteral(h));
}

/**
 * A TypeScript type position rather than a query.
 *
 * `{ name: { contains: string } }` inside a `type` declaration is a shape, not a
 * value, and there is nothing to sanitise. Matched narrowly — the bare type
 * keywords and nothing else — so a variable really called `string` would still
 * be caught by the following rules rather than waved through by this one.
 */
function isTypePosition(expr) {
  return /^(string|number|boolean)(\s*\|\s*(string|number|boolean))*$/.test(expr);
}

function classify(expr) {
  if (isPlainLiteral(expr)) return "literal";
  if (isSanitiserCall(expr)) return "sanitised";
  if (isSafeTemplate(expr)) return "sanitised template";
  if (isTypePosition(expr)) return "type position";
  return null;
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.includes(path.extname(entry))) out.push(full);
  }
  return out;
}

/**
 * Blank out comment bodies, keeping every index and line number identical, so a
 * `contains:` written in prose is not read as a query. Same technique, and the
 * same reason, as `stripComments` in check-ops-blindness.mjs.
 *
 * String literals are deliberately NOT blanked. A LIKE operator assembled inside
 * a string is a dynamic query shape and should be looked at, not waved past.
 */
/**
 * Is the `/` at `i` the start of a regex literal rather than a division?
 *
 * The classic ambiguity in JavaScript, decided the classic way: by what came
 * before. A regex may follow an operator, an opening bracket, a comma, a
 * keyword or the start of the file; a division follows a value. Being wrong in
 * the cautious direction costs nothing here — a misread division skips to the
 * next `/`, and the worst case is a `contains:` between two divisions going
 * unread, which is not a shape that occurs.
 */
function startsRegexLiteral(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return true;
  const prev = src[j];
  if ("(,=:[!&|?{};+-*%~^<>".includes(prev)) return true;
  // `return /x/`, `typeof /x/`, `case /x/` — a keyword, not a value.
  const word = /[A-Za-z_$][\w$]*$/.exec(src.slice(0, j + 1));
  return word ? ["return", "typeof", "case", "in", "of", "new", "delete", "void", "do", "else", "yield", "await"].includes(word[0]) : false;
}

function stripComments(src) {
  const out = src.split("");
  let i = 0;
  let state = "code";
  let quote = "";
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") {
        out[i] = out[i + 1] = " ";
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && d === "*") {
        out[i] = out[i + 1] = " ";
        state = "block";
        i += 2;
        continue;
      }
      if (c === "/" && startsRegexLiteral(src, i)) {
        state = "regex";
        i += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        state = "string";
      }
      i += 1;
      continue;
    }
    if (state === "regex") {
      // A regex literal is skipped WHOLE and left in place. It is not a comment,
      // so blanking it would be wrong, but its contents must not be read as code
      // either: `/^"([^"\\]|\\.)*"$/` holds three double quotes, and without
      // this branch the third one opens a "string" that never closes and every
      // comment after it in the file is missed.
      //
      // This is the case check-ops-blindness.mjs's own stripComments does not
      // handle. It gets away with it because it only ever reads application code
      // under the ops roots; this gate reads scripts/, where a gate script is
      // mostly regexes. Reported to the lead rather than edited into that file.
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "[") state = "class";
      else if (c === "/") state = "code";
      i += 1;
      continue;
    }
    if (state === "class") {
      // Inside [...], where an unescaped "/" is an ordinary character.
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "]") state = "regex";
      i += 1;
      continue;
    }
    if (state === "string") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === quote) state = "code";
      i += 1;
      continue;
    }
    // Inside a comment: blank everything but the newlines.
    if (state === "line" && c === "\n") {
      state = "code";
      i += 1;
      continue;
    }
    if (state === "block" && c === "*" && d === "/") {
      out[i] = out[i + 1] = " ";
      state = "code";
      i += 2;
      continue;
    }
    if (c !== "\n") out[i] = " ";
    i += 1;
  }
  return out.join("");
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

const violations = [];
const reviewed = [];
const usedAllowlistEntries = new Set();
let checked = 0;
let filesScanned = 0;

function scan(file, rawSrc, rel) {
  filesScanned += 1;
  const src = stripComments(rawSrc);
  const re = new RegExp(`\\b(${LIKE_OPERATORS.join("|")})\\s*:`, "g");
  let m;
  while ((m = re.exec(src))) {
    const expr = readExpression(src, m.index + m[0].length);
    if (expr === "") continue;
    checked += 1;
    const line = lineOf(src, m.index);
    const verdict = classify(expr);
    if (verdict) continue;

    const entry = ALLOWLIST.find((a) => a.file === rel && a.expression === expr);
    if (entry) {
      usedAllowlistEntries.add(`${entry.file}::${entry.expression}`);
      reviewed.push(`${rel}:${line}  (reviewed) ${m[1]}: ${expr}`);
      continue;
    }
    violations.push({
      rel,
      line,
      operator: m[1],
      expr,
    });
  }
}

for (const root of SCAN_ROOTS) {
  for (const file of walk(path.join(ROOT, root))) {
    const rel = path.relative(ROOT, file);
    scan(file, readFileSync(file, "utf8"), rel);
  }
}

// An allowlist entry that matches nothing is an entry protecting nothing, and
// the next reader would take it as evidence the case still exists. Same
// both-directions drift check the ops blindness gate applies to its own lists.
const stale = ALLOWLIST.filter((a) => !usedAllowlistEntries.has(`${a.file}::${a.expression}`));

// ---------------------------------------------------------------------------
// Self-test (--self-test), same convention as the ops blindness gate
// ---------------------------------------------------------------------------
const SELF_TEST_DIR = "tests/fixtures/like-wildcards";

function runSelfTest() {
  const abs = path.join(ROOT, SELF_TEST_DIR);
  if (!existsSync(abs)) {
    console.error(
      `✖ LIKE-wildcard gate self-test: ${SELF_TEST_DIR} does not exist.\n` +
        "  A gate nobody has seen fail is a decoration. Restore the corpus; do not delete the flag.",
    );
    process.exit(1);
  }
  const files = readdirSync(abs).filter((f) => f.endsWith(".txt")).sort();
  const failures = [];
  let bad = 0;
  let good = 0;

  for (const f of files) {
    const raw = readFileSync(path.join(abs, f), "utf8");
    const pathHeader = raw.match(/^\/\/\s*@path:\s*(\S+)/m);
    if (!pathHeader) {
      failures.push(`${f}: no "// @path:" header, so the gate cannot know which file it is judged as.`);
      continue;
    }
    const before = violations.length;
    scan(f, raw, pathHeader[1]);
    const found = violations.slice(before);
    violations.length = before; // fixtures never contribute to the real run

    if (f.startsWith("bad-")) {
      bad += 1;
      // "Something fired" is not proof that the right thing fired. A bad fixture
      // declares WHICH operator it is about, and it must be that one — the
      // lesson of a corpus where one fixture naming two operators quietly
      // covered neither.
      const expected = [...raw.matchAll(/^\/\/\s*@expect:\s*(\S+)/gm)].map((m) => m[1]);
      if (expected.length === 0) {
        failures.push(`${f}: a bad fixture must declare "// @expect: <operator>", otherwise "something fired" counts as proof.`);
        continue;
      }
      const firedOperators = new Set(found.map((v) => v.operator));
      for (const op of expected) {
        if (!firedOperators.has(op)) {
          failures.push(
            `${f}: expected ${op} to fire and it did not. Fired: ${[...firedOperators].join(", ") || "nothing"}.`,
          );
        }
      }
    } else if (f.startsWith("good-")) {
      good += 1;
      if (found.length) {
        failures.push(
          `${f}: clean fixture was flagged: ${found.map((v) => `${v.operator}: ${v.expr}`).join("; ")}`,
        );
      }
    } else {
      failures.push(`${f}: fixture names must start with "bad-" or "good-".`);
    }
  }

  if (bad === 0 || good === 0) {
    failures.push(
      `the corpus needs both kinds: ${bad} bad and ${good} good found. A gate that fails on everything ` +
        "passes a naive self-test while being useless.",
    );
  }
  if (failures.length) {
    console.error("✖ LIKE-wildcard gate self-test FAILED:\n");
    for (const f of failures) console.error("  " + f);
    console.error("\nFix the gate or the fixture. Never delete a fixture to get a green build.");
    process.exit(1);
  }
  console.log(
    `✓ LIKE-wildcard gate self-test passed (${bad} violating fixtures all fired, ${good} clean fixtures all passed).`,
  );
  process.exit(0);
}

if (process.argv.includes("--self-test")) runSelfTest();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (stale.length) {
  for (const a of stale) {
    violations.push({
      rel: "scripts/check-like-wildcards.mjs",
      line: 0,
      operator: "allowlist",
      expr: `${a.file} → ${a.expression}`,
      stale: true,
    });
  }
}

if (violations.length) {
  console.error("✖ LIKE-wildcard gate FAILED:\n");
  for (const v of violations) {
    if (v.stale) {
      console.error(
        `  ${v.rel}  allowlist entry "${v.expr}" matched nothing. The call site was moved, renamed or fixed, ` +
          "so the entry now protects nothing — delete it.",
      );
      continue;
    }
    console.error(
      `  ${v.rel}:${v.line}  ${v.operator}: ${v.expr}\n` +
        `      This value reaches SQL LIKE and the call site does not show that it is safe. Prisma does not escape\n` +
        `      LIKE's wildcards, so a "%" here can match every row in the table (FINDINGS.md F55).\n` +
        `      Fix it by wrapping the value: ${SANITISER}(${v.expr}) — from @/lib/likeSafe.\n` +
        `      If the value genuinely cannot be user-supplied, add a reviewed entry to the allowlist in this\n` +
        `      script with a reason. Do not add a magic comment to the source file; there is no such escape and\n` +
        `      there must not be one.`,
    );
  }
  console.error(
    `\n${violations.length} violation(s). See SAFEGUARDING.md rule 4 — scoping a query by ownership is the` +
      "\ncontrol that matters, and this gate is for the searches scoping cannot cover.",
  );
  process.exit(1);
}

if (reviewed.length) {
  console.log("Reviewed exceptions (allowlisted):");
  for (const r of reviewed) console.log("  • " + r);
  for (const a of ALLOWLIST) console.log(`    ${a.file} → \`${a.expression}\`: ${a.why}`);
}
console.log(
  `✓ LIKE-wildcard gate passed (${checked} LIKE operator(s) across ${filesScanned} file(s); ` +
    `${reviewed.length} reviewed exception(s)).`,
);
