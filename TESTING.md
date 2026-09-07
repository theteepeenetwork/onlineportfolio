# Testing

This project has three layers of testing: **automated end-to-end tests** that
drive a real browser through the whole app, a **QA battery** (security,
accessibility, UX — see below), and a **manual smoke-test checklist** for a
quick human check before sharing a new version.

## The QA battery (security · a11y · UX)

Beyond the functional e2e tests, `tests/battery/` holds the standing quality
battery — the executable form of `SAFEGUARDING.md`. It seeds **two schools** so
tenant isolation is testable, scans every page with axe-core, and checks
headers, uploads, sessions, CSRF and more.

```bash
npm run test:battery     # everything: security + a11y + ux + e2e
npm run test:security    # tenant isolation, auth, uploads, headers, injection (BLOCKING gate)
npm run test:a11y        # axe-core WCAG 2.2 AA + keyboard nav (BLOCKING gate)
npm run test:ux          # core-flow step budgets, interruption, responsive (report-only)
npm run test:personas    # the user-tester team → rewrites USER_TESTING.md (report-only)
npm run test:perf        # Lighthouse budgets (report-only)
npm run test:security:findings   # repro tests for KNOWN gaps — these fail on purpose
```

### The user-tester team

`tests/battery/personas/` is a team of people rather than a list of assertions:
a platform operator, a brand-new teacher, a teacher mid-lesson on an iPad, a
school business manager, an admin whose account has lapsed, a parent on a phone
at 9pm, a child in each of the three registers, and a bot that taps everything
twice inside a real child's session. They sign in to **their own school**
(Bramblewood Primary, `prisma/seed-personas.ts` — separate from the fixtures the
gates rely on, because these testers delete staff, classes and access) and do
whole jobs of work: set a quiz, watch a child answer it, mark it, send it back
with feedback, and pick that feedback up as the child.

They write down what confused them, stalled them, broke, or was beyond them, and
`npm run test:personas` turns the run into [`USER_TESTING.md`](./USER_TESTING.md)
— worst first, with who hit it, on what device, doing what. Report-only, with one
exception: a **blocker** (an unhandled error, a 5xx, or a job a tester could not
finish) fails its test.

Known defects and which test covers each are in [`FINDINGS.md`](./FINDINGS.md);
the plan and rationale are in [`TEST_PLAN.md`](./TEST_PLAN.md); the moderated
usability kit is in [`docs/MANUAL_USABILITY_KIT.md`](./docs/MANUAL_USABILITY_KIT.md).
CI runs it all in `.github/workflows/battery.yml`.

---

## Automated tests (Playwright)

The automated tests open a real browser and click through the actual app —
signing in, drawing, submitting, approving, creating activities, and responding
to them. They're the fastest way to know a change didn't break anything.

### One-time setup

Already done in this project, but on a fresh machine:

```bash
npm install
npx playwright install chromium   # downloads the browser the tests drive
```

### Running the tests

```bash
npm test
```

That's it. The tests will:

1. **Reset the database** to the clean demo class (so runs are repeatable).
2. Start the app if it isn't already running.
3. Drive a browser through every core flow and report pass/fail.

> ⚠️ Running the tests **wipes the database back to the demo data**. Don't run
> them against real class data — they're for checking the app works.

### Before you open a PR: run it once from cold

The tests reuse a dev server that is already running, which is what makes them
quick. It also means a warm server can hide a real fault: it has already compiled
the old version of a file and will happily keep serving it. CI always starts from
nothing, so CI sees faults your machine does not.

Once, before opening a PR:

```bash
pkill -f "next dev"; rm -rf .next; npm run test:battery
```

This is not belt and braces. On 16 August 2026 a merge dropped three `import`
lines from a server action; every local run passed against a warm server and a
production build, and three blocking suites went red the moment CI compiled it
cold. `npm run test:battery` now runs `tsc --noEmit` first, which catches that
particular class of fault in about a second, but the cold run is what catches the
rest.

There is now a second reason to start cold. The operator area (`/ops`) answers
404 to everybody unless the server was started with `OPS_ENABLED=1`, and the
battery's Playwright config sets that when it starts its own dev server. A warm
server you started yourself with plain `npm run dev` does not have it, so the
operator specs fail on their very first test. That test exists to say so in
words rather than leaving you reading twenty 404s: if you see "the dev server was
started without OPS_ENABLED=1", kill the warm server and let Playwright start
its own.

**Never run two battery invocations at once.** Every project seeds the same
SQLite file, so a second run's `global-setup` wipes the first run's schools
while its tests are mid-flight. What that looks like is not a database error: it
is a screen that renders one school instead of three, an operator whose fixture
has vanished, and a handful of red tests in files nobody touched. On 17 August
2026 it produced six failures, then fourteen, in specs that were green when run
on their own, and cost an hour before the cause was found by polling the
database during a run. If a battery result surprises you, check nothing else is
running first (`ps aux | grep playwright`), then re-run cold on its own.

**"attempt to write a readonly database" is a warm server, not a permission.**
If a page dies with `PrismaClientUnknownRequestError` and SQLite's *"attempt to
write a readonly database"*, check the extended code in the message before you
touch a single file permission:

| code | meaning | what to do |
| --- | --- | --- |
| `1032` | `SQLITE_READONLY_DBMOVED` — the file was replaced under an open connection | restart `next dev` |
| `8` | `SQLITE_READONLY` — genuinely not writable | fix the file/volume permissions |

`1032` is by far the common one here, and it is not a permission problem at all.
`npm run db:reset` runs `prisma db push --force-reset`, which **deletes and
recreates** `dev.db`; so does `prisma migrate reset`, and so does deleting the
file by hand. SQLite compares the file it opened against the file now on disk,
sees a different one, and refuses every write to avoid corrupting it. The dev
server never notices, because `src/lib/db.ts` deliberately caches one
`PrismaClient` on `globalThis` so that Next's module reloading does not open a
new connection per edit — and that cached client is still holding the deleted
file. Every write then fails: the first one most people hit is signing out,
because that deletes the session row.

Restarting the dev server is the whole fix — the new process opens the new file:

```bash
pkill -f "next dev"; npm run dev
```

Signing out is the exception that no longer breaks: `destroySession` clears the
cookie before it touches the database and tolerates the write failing, so a
stale connection cannot leave someone signed in on a shared device. Everything
else on the page will still fail until you restart.

The battery's config injects two more variables for the same reason.
`STRIPE_SECRET_KEY` is set to the obviously fictional test key in
`tests/battery/stripeFixtureKey.ts`. The operator billing screen offers a link
into the Stripe dashboard only when a key is configured, and CI sets none, so
without this the link-out would exist on your machine and not on the build that
gates the merge. Nothing spends it: no code path under `/ops` calls Stripe at
all. On a warm server started without it, the billing link tests fail with a
message naming this paragraph.

`STRIPE_WEBHOOK_SECRET` is the fictional signing secret in
`tests/battery/stripeWebhookFixtureKey.ts`, added on 2 September 2026. Until
then `tests/battery/security/stripe-webhook.spec.ts` skipped itself entirely —
its describe-level `test.skip` needs both variables and the battery set only the
first — so no webhook behaviour was gated on a PR at all. It stays hermetic:
signature verification is local HMAC over the raw request body and opens no
socket, and the spec drives only events the route answers without calling
Stripe. Note that it rewrites Oakfield's and Pennyfields' billing rows while it
runs and puts them back afterwards, which is why `ops-billing.spec.ts` asserts
their headcounts and never their billing status.

Useful variants:

```bash
npm run test:headed    # watch the browser click through the tests
npm run test:report    # open the detailed HTML report after a run
PORT=3100 npm test     # run on a different port if 3000 is busy
```

When something fails, Playwright saves a screenshot under `test-results/` and
the HTML report (`npm run test:report`) shows exactly where it stopped.

### Two branches at once: give each one a worktree

The rule above says never run two batteries at once. The exception is when each
run has its own checkout, its own port and its own database file, and a git
worktree is how you get all three. This is how two pieces of work proceed in
parallel without either one's results being a lie.

```bash
git worktree add ../sj-mywork -b my-branch
cd ../sj-mywork
npm ci                                  # do NOT symlink or share node_modules
cp ../onlineportfolio/.env .env
PORT=3200 npm run test:battery
```

Three things about that recipe are load-bearing.

**Each worktree needs its own `node_modules`.** Sharing one is the obvious
saving and it is wrong: `npm ci` writes a generated Prisma client into
`node_modules/.prisma` from whichever schema ran last, so two branches with
different schemas quietly overwrite each other's client. The failure surfaces
somewhere unrelated as a column that does not exist.

**Each worktree needs its own database.** `DATABASE_URL` is
`file:./dev.db`, deliberately relative, so a worktree resolves it inside its own
directory and gets a separate file for free. Do not change it to an absolute
path.

**Pick a port per worktree and never kill by name.** `pkill -f "next dev"` kills
every worktree's server, not yours. On 17 August 2026 that produced nine
failures in tenant-isolation specs that read exactly like a security regression
and were nothing of the sort. Kill by port instead, and treat any run whose
server disappeared under it as void rather than as a result:

```bash
lsof -ti tcp:3200 | xargs kill
```

Remove the worktree when the branch has merged, with
`git worktree remove ../sj-mywork`.

### What's covered

| File | What it checks |
| --- | --- |
| `tests/e2e/auth.spec.ts` | Teacher sign-in, wrong-password rejection, student class-code sign-in |
| `tests/e2e/account.spec.ts` | Teacher **sign-up** (+ first class), duplicate-email rejection, creating **more than one class**, and **adding several students at once by pasting a list** |
| `tests/e2e/journal.spec.ts` | A child draws → it waits in the queue → teacher approves → it's published in the journal |
| `tests/e2e/activities.spec.ts` | Teacher creates a **reusable template** (with a PDF template canvas) → **assigns** it as a run → a child opens the run and **the template is on their canvas** → child responds → teacher sees it on the run. Also: the library **filters** by tag and status |
| `tests/e2e/objects.spec.ts` | An imported PDF/image is a **movable, resizable, deletable object** on the canvas (not a locked background) |
| `tests/e2e/shapes.spec.ts` | A **shape** can be added, recoloured (fill + line), moved, and resized |
| `tests/e2e/text.spec.ts` | A **text box** can be placed, re-selected, moved, and re-edited |
| `tests/e2e/layers.spec.ts` | Drawing tools **write over** objects; the **cursor tool** moves them; a shape's **label stays locked inside it** and re-fits when the shape resizes |

The activities test is also the guard for the "PDF template didn't show for the
child" bug — it fails if the template ever stops loading onto the child's canvas.

### Adding a test

Tests live in `tests/e2e/`. Copy an existing file, and reuse the helpers in
`tests/e2e/helpers.ts` (`teacherLogin`, `studentLogin`, `drawOnCanvas`, …).

---

## Manual smoke test (5 minutes)

Do this after a change if you want to see it with your own eyes. Start the app
with `npm run dev` and open http://localhost:3000.

1. **Teacher sign-in** — `teacher@school.uk` / `password`. You land on the
   dashboard with Sunflower Class.
2. **Make an activity** — Activities → New activity → give it a title → Build a
   template → add a PDF or draw something → ✓ Done → assign to Whole class →
   Save. It appears in the list.
3. **Sign out**, then **student sign-in** — class code `SUN234`, tap a name.
4. **Do the activity** — My activities → open it. **The template should be on
   the canvas.** Draw on it, tap the green ✓.
5. **Add to journal** — ＋ Add to my journal → Draw → scribble → ✓. It shows as
   "Waiting for you".
6. **Sign out**, **teacher sign-in** again → Approvals. Your work is waiting.
   Approve it. Open that child's journal — it's published.
7. **Check the activity** — Activities → open your activity → you see everyone's
   responses side by side.

If all seven steps work, the core app is healthy.
