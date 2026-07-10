# Testing

This project has two layers of testing: **automated end-to-end tests** that
drive a real browser through the whole app, and a **manual smoke-test
checklist** for a quick human check before sharing a new version.

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

Useful variants:

```bash
npm run test:headed    # watch the browser click through the tests
npm run test:report    # open the detailed HTML report after a run
```

When something fails, Playwright saves a screenshot under `test-results/` and
the HTML report (`npm run test:report`) shows exactly where it stopped.

### What's covered

| File | What it checks |
| --- | --- |
| `tests/e2e/auth.spec.ts` | Teacher sign-in, wrong-password rejection, student class-code sign-in |
| `tests/e2e/account.spec.ts` | Teacher **sign-up** (+ first class), duplicate-email rejection, creating **more than one class** |
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
3. **Sign out**, then **student sign-in** — class code `SUN123`, tap a name.
4. **Do the activity** — My activities → open it. **The template should be on
   the canvas.** Draw on it, tap the green ✓.
5. **Add to journal** — ＋ Add to my journal → Draw → scribble → ✓. It shows as
   "Waiting for you".
6. **Sign out**, **teacher sign-in** again → Approvals. Your work is waiting.
   Approve it. Open that child's journal — it's published.
7. **Check the activity** — Activities → open your activity → you see everyone's
   responses side by side.

If all seven steps work, the core app is healthy.
