# Rule 1: safeguarding comes first

StoryJar holds the work of children aged 3–11. **Before changing anything that
touches authentication, access control, the approval queue, children's data, or
uploaded media, read [`SAFEGUARDING.md`](./SAFEGUARDING.md) and follow it.** Its
rules override convenience, speed and every other consideration. When a choice is
unclear, take the more protective option. Every PR touching those areas must work
through the safeguarding review checklist in that document.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The QA battery — keep it green

This repo has a standing UX / security / accessibility test battery. It is the
executable form of `SAFEGUARDING.md`. **Nothing reaches `main` with a red gate.**
Plan & findings live in [`TEST_PLAN.md`](./TEST_PLAN.md) and
[`FINDINGS.md`](./FINDINGS.md).

**When to run what.** The battery is slow — the Playwright suites run serially
against a dev server and take minutes. Do not run it after every edit. Instead:

| While | Run | Takes |
| --- | --- | --- |
| Writing code | `npm run check` | ~2s |
| Working on one area | that one suite, e.g. `npm run test:a11y`, or a single file: `npx playwright test -c playwright.battery.config.ts --project=security tests/battery/security/uploads.spec.ts` | seconds–a minute |
| **Before anything lands on `main`** — the merge, not each commit on the branch | `npm run test:gate` | minutes |
| Changing anything a person has to *understand* — copy, a flow, a form, a child-facing screen | `npm run test:personas` | ~2 min |

`npm run check` is the whole dev loop: typecheck plus every static gate
(raw-query/`dangerouslySetInnerHTML`, reduced-motion, R2 tripwire, ops blindness
+ its self-test). It is cheap enough to run constantly and it catches the class
of breakage — a broken import, a leaked ops field — that used to be found the
slow way, by three suites going red at once.

This changes *when* the gates run, never *whether* they pass. CI still runs the
full battery on every PR and every push to `main`
(`.github/workflows/battery.yml`), and a red blocking gate there is a blocked
merge. Running `test:gate` locally before merging is how you find out before CI
does — and, while this repo has no branch protection, it is the only thing
standing between a red gate and `main`.

**Layout**
- `tests/battery/security/` — tenant isolation, auth/sessions, uploads, CSRF,
  headers, injection/XSS, data-protection. **Blocking gate.**
- `tests/battery/a11y/` — axe-core (WCAG 2.2 AA baseline) + keyboard nav.
  **Blocking gate.**
- `tests/battery/ux/` — core-flow step budgets, interruption, responsive.
  Report-only.
- `tests/battery/findings/` — repro tests for **known, logged gaps** (see
  `FINDINGS.md`). They assert the *intended* secure behaviour and **fail on
  purpose** until fixed. Report-only.
- `tests/battery/personas/` — **the user-tester team**: an operator, teachers, a
  school business manager, parents, a child in each register and a fuzzing bot,
  each using the real product on their own device with their own reading age.
  They record OBSERVATIONS rather than assertions; `npm run test:personas`
  rewrites [`USER_TESTING.md`](./USER_TESTING.md). Report-only, with one hard
  rule: a **blocker** (an unhandled error, a 5xx, or a job the tester could not
  finish) fails the test. They work in their own school
  (`prisma/seed-personas.ts`) because they delete staff, classes and access —
  never point them at the fixtures the gates depend on.
- `tests/e2e/` — the original functional suite. Blocking gate.
- `scripts/persona-report.mjs` (turns a persona run into `USER_TESTING.md`),
- `scripts/audit-static.mjs` (raw-query / `dangerouslySetInnerHTML` gate),
  `scripts/check-r2-tripwire.mjs` (R2 migration guard),
  `scripts/error-string-audit.mjs` (jargon in user copy).
- Fixtures: `prisma/seed-test.ts` seeds **two schools** (A = St Bede's demo,
  B = Oakfield) so cross-tenant isolation is testable.

**Commands**
- `npm run check` — static gates only, ~2s. The dev loop.
- `npm run test:gate` — the three blocking suites (security, a11y, e2e). Run
  before merging to `main`.
- `npm run test:battery` — `test:gate` plus the report-only UX and persona suites.
- `npm run test:personas` — the user-tester team, then rewrite `USER_TESTING.md`.
- Individually: `test:security` / `test:a11y` / `test:ux` / `test:e2e` /
  `test:security:findings` / `test:personas` / `test:perf`.
- CI: `.github/workflows/battery.yml`.

**Conventions when adding tests**
- New endpoint/action taking an id → add a cross-tenant isolation test (School B
  must never reach School A) before it ships.
- Fixing a logged finding → move its repro from `findings/` into the matching
  blocking suite (so it stays fixed), and delete the finding from `FINDINGS.md`.
- Closing the a11y contrast debt (F11) → empty `BASELINE_RULES` in
  `a11y/axe.spec.ts` to make the gate strict.
- Never weaken a gate to make it pass. Fix the app or log a finding.
- Adding a persona journey → it goes in `tests/battery/personas/`, uses
  `t.say()` / `t.expects()` rather than `expect()`, and speaks in the persona's
  voice ("I could not find…"), because the output is read by whoever has to fix
  it. Reserve `blocker` for "could not do the job" and errors — a severity that
  is used for taste is a severity that gets muted.
