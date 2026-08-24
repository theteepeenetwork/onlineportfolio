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

**When to run what.** The Playwright suites run serially against a dev server,
because they share one SQLite database. Do not run them after every edit:

| While | Run | Takes |
| --- | --- | --- |
| Writing code | `npm run check` | ~2s |
| Working on one area | that one suite, e.g. `npm run test:a11y`, or a single file: `npx playwright test -c playwright.battery.config.ts --project=security tests/battery/security/uploads.spec.ts` | seconds–3 min |
| **Before you push** | `npm run test:changed` | ~6 min for a product change |
| Before something lands on `main`, or when you are unsure | `npm run test:changed -- --all` | ~9 min (every blocking suite) |
| The same thing, one suite at a time, on a small machine | `npm run test:gate` | ~19 min |
| Changing anything a person has to *understand* — copy, a flow, a form, a child-facing screen | `npm run test:personas` | ~2 min |

`npm run check` is the whole dev loop: typecheck plus every static gate
(raw-query/`dangerouslySetInnerHTML`, reduced-motion, R2 tripwire, ops blindness
+ its self-test). It is cheap enough to run constantly and it catches the class
of breakage — a broken import, a leaked ops field — that used to be found the
slow way, by three suites going red at once.

**Where the minutes went, and where they are now.** Until 19 August 2026 the
batteries were dominated by one thing: the operator door. Every ops test signed
in for itself, TOTP replay protection is monotonic, so each sign-in queued for
its own 30-second window — 1,197 of the a11y project's 1,305 seconds of test
time, and most of security's, spent watching a clock. The door is now walked
**once per worker** and the session reused (`asOperator` in
`tests/battery/helpers.ts`), which is what an operator does too. a11y went from
17.4 minutes to 2.9; the security project went from not reaching test 200 in 25
minutes to 306 tests in 8.9. Nothing was skipped to get there: the password is
still typed, a genuine TOTP code is still computed and accepted, and
`ops-auth.spec.ts` — the spec that is *about* the door — still walks the whole
thing for every one of its cases. If you are adding an ops test, use
`asOperator`; use `signInOperator` only when the sign-in itself is the subject.

**What a PR runs.** Every blocking gate runs unselected on every push to `main`,
on the nightly, and on `workflow_dispatch`. *On a PR* they are selected by what
changed — `scripts/select-suites.mjs`, which `npm run test:changed` and
`.github/workflows/battery.yml` both call, so what you run locally is what the PR
runs:

| You changed | It runs |
| --- | --- |
| prose only | nothing |
| `src/app/teacher`, `src/components`, `src/app/student`… | security + a11y + e2e, product specs |
| `src/app/ops`, `src/lib/ops`, `src/app/actions/ops` | the operator specs |
| one of the five modules ops is allowed to import | **both** |
| `prisma/`, the harness, the lockfile, a config, anything unclassified | **everything** |

The claim underneath it — that a change to a teacher's register cannot move the
operator screens — is not a guess. It is what `check-ops-blindness.mjs` already
enforces, deny-by-default, on every PR: ops code may import `@/lib/ops/*` and
five named modules and nothing else. The selector re-reads that allowlist and
refuses to narrow anything if it has moved, it selects everything for any path it
does not recognise, and `npm run check` self-tests all of it. The net under the
whole arrangement is that `main` runs the lot: the worst a wrong rule can do is
move a red gate from the PR to the merge minutes later, not hide it. Label a PR
`full-battery` to opt back into everything.

The static gates are never selected away, and the **report-only** half — ux,
personas, findings, perf — has left the PR path entirely. None of it could ever
block a merge, so paying for it on every PR bought nothing that reading it the
next morning does not.

**How it runs.** Both configs keep `workers: 1`: the suites share one SQLite
database and mutate sessions and rows, so a second worker would buy speed by
making the security gate flaky. What they can each have is their own database.
`scripts/run-suites.mjs` gives every (suite, shard) job a lane — its own port,
its own dev server, its own `dev-shard-N.db` and its own build output — and runs
three lanes at once, which is the isolation CI gets from three runners, on one
machine. `PW_SHARDS=1` turns it off; `PW_SHARDS=4` on a bigger machine turns it
up. Nothing is skipped: `--shard` splits by file.

The cost of three lanes on a four-core machine is that a single test can lose a
race it would never lose alone: three dev servers compiling at once have twice
pushed a `waitForURL` past its budget — once on the operator door's keyboard
walk, once on a child handing in words. Both passed alone in a second or two. So
**a lone timeout in a lane run is a re-run before it is a bug**: run that spec
by itself, and believe the second answer. Anything that fails both ways is real.

The lanes run `next dev`, not a shared `next build`, and that is deliberate
however tempting the 30-second build looks. A production build is a different
application — `signInLinkMayBeShown()` withholds a parent's magic-link URL when
`NODE_ENV` is production, which is the fix for F19 — so `family.spec.ts` fails
against `next start` *because the gate is working*. Speed is not worth testing a
build no school will ever be given.

A red blocking gate is a blocked merge. Running `test:changed` before you push,
and `test:gate` before you merge, is how you find out before CI does — and, while
this repo has no branch protection, it is the only thing standing between a red
gate and `main`.

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
- `npm run test:changed` — only the suites your branch's changes need, by the
  same rules the PR will use (`scripts/select-suites.mjs`). Run before pushing.
- `npm run test:changed -- --all` — all three blocking suites, still across
  lanes. The quick way to run everything.
- `npm run test:gate` — the same three, one after another in a single lane.
  Slower, but it is the plainest thing to read when a run has gone strange.
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
- Adding an ops test → `asOperator(page)`, not `signInOperator(page)`. The
  second walks the whole door and waits on the TOTP clock, which is right only
  when the door is what you are testing.
- Never weaken a gate to make it pass. Fix the app or log a finding.
- Adding a persona journey → it goes in `tests/battery/personas/`, uses
  `t.say()` / `t.expects()` rather than `expect()`, and speaks in the persona's
  voice ("I could not find…"), because the output is read by whoever has to fix
  it. Reserve `blocker` for "could not do the job" and errors — a severity that
  is used for taste is a severity that gets muted.

# Run the battery cold

Kill the dev server and clear `.next`, `.next-lane-*` and the shard databases
before any run you intend to believe. A warm server made one full run take
**1 hour 3 minutes**; the same suites cold took **5.4 minutes**. Worse than the
time, a warm server started without `OPS_ENABLED` produced three false operator
"blockers" in a persona run, because every operator journey died at
`/ops/sign-in` with a 404. For persona runs of the operator surface, use
`OPS_ENABLED=1 npm run test:personas` against a cold server.

# Where things are written down

Everything an agent or a person needs is in the repository. Nothing important
lives only in a chat session.

**Binding, read before you change the thing they govern**

| Document | Governs |
| --- | --- |
| [`SAFEGUARDING.md`](./SAFEGUARDING.md) | Auth, access control, the approval queue, children's data, uploads. Rule 1. |
| [`RETENTION.md`](./RETENTION.md) | What is kept, for how long, and what deletion means |
| [`docs/DPIA.md`](./docs/DPIA.md) | The data protection impact assessment, and what is still open before sign-off |
| [`docs/exceptional-access.md`](./docs/exceptional-access.md) | Any access to a child's data that does not come through a StoryJar screen |
| [`docs/brand-and-copy.md`](./docs/brand-and-copy.md) | Anything published in StoryJar's name, including pricing claims |

**Product and design**

| Document | Covers |
| --- | --- |
| [`docs/product-overview.md`](./docs/product-overview.md) | The one-page orientation: audience, features, age modes, pricing, exclusions, competitors |
| [`docs/AGE_MODE_COPY.md`](./docs/AGE_MODE_COPY.md) | The child-facing copy for each register, approved |
| [`docs/canvas-toolbox.md`](./docs/canvas-toolbox.md) | The parameterised shape kits: decisions, constraints, phasing |
| [`docs/showcase-template-ideas.md`](./docs/showcase-template-ideas.md) + [`docs/template-design-sheet.html`](./docs/template-design-sheet.html) | The shared activity library and the house style, including where the line sits with schools |
| [`docs/claude-connector.md`](./docs/claude-connector.md) | What the MCP connector can and cannot touch, and what to tell a school |

**Decisions, dated**

| Document | Covers |
| --- | --- |
| [`docs/pricing-decisions.md`](./docs/pricing-decisions.md) | Pricing and packaging |
| [`docs/dpo-decisions.md`](./docs/dpo-decisions.md) | Data protection decisions taken as data protection lead |
| [`docs/ops-architecture.md`](./docs/ops-architecture.md) | The operator programme. An owner decision here outranks the handbook and the briefs |
| [`docs/admin-billing-and-import.md`](./docs/admin-billing-and-import.md) | The admin Billing tab and paste-a-class-list, and the four billing bugs fixed alongside them |
| [`docs/billing-safeguarding-review.md`](./docs/billing-safeguarding-review.md) | The safeguarding checklist worked through for the billing gate |
| [`docs/policy-readiness.md`](./docs/policy-readiness.md) | What has to be true before the "Draft for review" banner comes off |

**Launch and operations**

| Document | Covers |
| --- | --- |
| [`docs/launch-runway.md`](./docs/launch-runway.md) | The plan to 1 September 2026. Supersedes `LAUNCH_PLAN.md`, which is stale |
| [`docs/launch-triage.md`](./docs/launch-triage.md) | Wave 1 evidence from the four surface leads |
| [`docs/launch-batch-b.md`](./docs/launch-batch-b.md) | Batch B, the Railway variables table, and the Batch A outcome |
| [`docs/ops-recovery.md`](./docs/ops-recovery.md) | How the operator gets back in. Read it while you can still sign in |
| [`docs/ops-facts.md`](./docs/ops-facts.md), [`docs/ops-backup-options.md`](./docs/ops-backup-options.md) | The briefs checked against the repository; the backup options for decision D2 |
| [`docs/TEST_LOGINS.md`](./docs/TEST_LOGINS.md) | Every fixture account, all four roles. Fictional data only, forever |
| [`docs/agent-fleet.md`](./docs/agent-fleet.md) | Running several Claude sessions on this repo at once |
| [`docs/MANUAL_USABILITY_KIT.md`](./docs/MANUAL_USABILITY_KIT.md) | Running a moderated session with real teachers |

**What is deliberately not here.** This repository is public. Live credentials,
DNS and mailbox administration, social and LinkedIn account state, the current
Railway environment, and anything identifying a real person stay out of it, in
the owner's own notes. If a task needs one of those, ask rather than writing it
down here.
