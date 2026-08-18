import { test, expect, type Page } from "@playwright/test";
import { teacherLogin, studentLogin, logout, drawOnCanvas, clickHydrated } from "./helpers";

// Local-first draft autosave: in-progress work survives an accidental close /
// crash / lost connection (simulated here by a full page reload, which throws
// away all in-memory React state — exactly what a crash does).

// Wait until the drawn work is actually ON DISK, rather than guessing how long
// that takes.
//
// The canvas debounces its save by 1000ms and then writes to IndexedDB
// asynchronously, so a fixed sleep races an unbounded write. A 1300ms sleep
// left ~300ms of headroom and failed on CI three times across unrelated PRs
// while passing locally every time.
//
// Waiting for a RECORD to exist isn't enough either: `doPersist` writes one
// whether or not anything has been drawn, so an empty draft satisfies that —
// the test then reloads and finds nothing to restore, which is the same failure
// wearing a different hat. Wait for `anyDrawn`, which is the app's own word for
// "there is work here worth keeping".
async function waitForDraftSaved(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open("storyjar-drafts");
              req.onerror = () => resolve(false);
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("drafts")) return resolve(false);
                const all = db.transaction("drafts", "readonly").objectStore("drafts").getAll();
                all.onerror = () => resolve(false);
                all.onsuccess = () =>
                  resolve(
                    all.result.some(
                      (r: { canvas?: { anyDrawn?: boolean; pages?: string[] } }) =>
                        r.canvas?.anyDrawn === true && (r.canvas?.pages?.length ?? 0) > 0,
                    ),
                  );
              };
            }),
        ),
      { message: "the canvas should autosave the DRAWN work to IndexedDB", timeout: 15_000 },
    )
    .toBe(true);
}

test("a teacher's in-progress template survives a reload and saves correctly", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Recovered worksheet");

  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await waitForDraftSaved(page);

  // Crash/close: reload throws away React state (templatePages, the title field).
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#title")).toHaveValue(""); // proves state was really lost

  // Reopen the editor → the restore prompt offers the saved work.
  //
  // This assertion used to carry a 30 second budget, on the reading that the
  // prompt waited on three things in order and the third was a Server Action
  // round trip that a cold CI runner made slow. That reading was wrong, and the
  // budget went with it (see F29 → F34). The prompt did not arrive late, it did
  // not arrive: the canvas awaited the cross-device lookup and the local draft
  // together, so a lookup that hung suppressed the prompt for as long as the
  // test was willing to wait. Raising the budget to 30 seconds produced a
  // failure at 33.9 seconds.
  //
  // The lookup is now bounded and the local copy is never held behind it, so the
  // default budget is the right one, and this assertion is once again a straight
  // question: does saved work come back? The stalled-lookup case has its own
  // test at the bottom of this file.
  await clickHydrated(page, /Build a template/);
  await expect(page.getByRole("dialog", { name: /restore your unsaved work/i })).toBeVisible();
  await page.getByRole("button", { name: /Restore my work/i }).click();

  // The restored drawing is back in the editor's hidden field…
  await expect
    .poll(async () => (await page.locator('input[name="__templateEditor"]').inputValue()).length)
    .toBeGreaterThan(5000);
  await page.locator('button[title="Done"]').click();
  // …the restored pages come back as builder thumbnails…
  await expect(page.locator('img[alt^="Template page"]').first()).toBeVisible();
  // …and the title field was restored too.
  await expect(page.locator("#title")).toHaveValue("Recovered worksheet");

  // The restored work saves like any other template (restore→submit fidelity).
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Recovered worksheet" })).toBeVisible();
});

test("a child's in-progress drawing survives a reload", async ({ page }) => {
  // Assign a blank activity to the whole class first.
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Draft recovery activity");
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Draft recovery activity" })).toBeVisible();
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  await logout(page);

  // Child opens it and starts drawing.
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Draft recovery activity/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await waitForDraftSaved(page);

  // Their tablet reloads (lost connection / closed lid) — work would be gone.
  await page.reload({ waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: /restore your unsaved work/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // a11y: the primary action is auto-focused and meets the child touch-target floor.
  const restoreBtn = page.getByRole("button", { name: /Restore my work/i });
  await expect(restoreBtn).toBeFocused();
  expect((await restoreBtn.boundingBox())!.height).toBeGreaterThanOrEqual(64);

  await restoreBtn.click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(async () => (await page.locator('input[name="drawingPages"]').inputValue()).length)
    .toBeGreaterThan(1000);
});

test("a child never sees another child's draft on a shared device", async ({ page }) => {
  // Assign an activity to the whole class.
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Shared device activity");
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Shared device activity" })).toBeVisible();
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  await logout(page);

  // Amara drafts on the class tablet.
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Shared device activity/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await waitForDraftSaved(page);

  // Ben signs in on the same device (same browser storage) and opens the activity.
  await logout(page);
  await studentLogin(page, "Ben");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Shared device activity/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  // Ben is NEVER offered Amara's work (drafts are keyed per pupil).
  await expect(page.getByRole("dialog", { name: /restore your unsaved work/i })).toHaveCount(0);
});

// F34 repro. The restore prompt used to be gated on BOTH the local (IndexedDB)
// draft and the cross-device (server) copy arriving, via
// `Promise.all([loadDraft, serverLoadDraft])`. `serverLoadDraft` catches errors
// and returns null, but a HANG is not an error: a request that is accepted and
// never answered leaves that promise pending forever, and `Promise.all` waits.
// The teacher's work was safe on their own disk and they were never offered it
// back, because of a network call they knew nothing about.
//
// This test forces the condition, which is why it exists: the CI failure it
// stands for happens roughly one run in two and has never happened locally, so
// waiting for an unlucky run is not a test.
test("the restore prompt still arrives when the cross-device lookup never answers", async ({
  page,
}) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Stalled-network worksheet");

  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await waitForDraftSaved(page);

  // Swallow every Server Action round trip from here on: accepted, never
  // answered, never failed. That is what a dead hotspot, a captive portal or a
  // stalled proxy looks like from inside the browser, and it is the case the old
  // try/catch could not see.
  //
  // Scoped to this page's own URL, which is where Next posts a Server Action, and
  // matched on the `next-action` header rather than the body. A wider pattern
  // (`**/*` with route.fallback()) also works but slows every script chunk enough
  // to delay hydration, and then the click below lands on a button React has not
  // wired up yet, which is a broken test rather than a caught bug.
  let stalled = 0;
  await page.route(/\/teacher\/activities\/new/, async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      stalled += 1;
      return; // never fulfil, never abort, so this promise never settles
    }
    await route.fallback();
  });

  // Crash/close, then reopen the editor.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#title")).toHaveValue("");
  await clickHydrated(page, /Build a template/);
  await expect(page.locator("canvas")).toBeVisible();

  // The local copy is the one guaranteed to exist. It must be offered.
  await expect(page.getByRole("dialog", { name: /restore your unsaved work/i })).toBeVisible();
  await page.getByRole("button", { name: /Restore my work/i }).click();
  await expect
    .poll(async () => (await page.locator('input[name="__templateEditor"]').inputValue()).length)
    .toBeGreaterThan(5000);

  // Guard against this test going quietly green because the stall stopped
  // biting (a changed action transport would match nothing above, and then the
  // test would be asserting the ordinary happy path and calling it a pass).
  expect(stalled, "the cross-device lookup should have been stalled").toBeGreaterThan(0);
});

// F34, second instance. The restore-on-mount effect is keyed on `ready`, and
// `ready` is only set after the seeding pass has awaited loadImage() for every
// template background. loadImage() rejected on `onerror` but had no deadline, so
// a stalled /uploads request (the same hang, reached through a different call)
// left a child on a permanent "Loading…" overlay: unable to draw, and never
// offered the work they had already done.
//
// This test outlasts IMAGE_LOAD_BUDGET_MS on purpose, so it needs more room than
// the 60 second per-test default. That is not a budget covering an unknown; it is
// a test of a deadline, and it cannot be shorter than the deadline it tests.
test("a stalled template background still lets a child draw and restore", async ({ page }) => {
  test.setTimeout(150_000);

  // Assign a template-backed activity so the child's canvas has a background to
  // stall. A blank activity would not exercise loadImage at all.
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Stalled background activity");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await page.locator('button[title="Done"]').click();
  await expect(page.locator('img[alt^="Template page"]').first()).toBeVisible();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await expect(page.getByRole("heading", { name: "Stalled background activity" })).toBeVisible();
  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  await logout(page);

  // The child opens it and draws, so there is work worth offering back.
  await studentLogin(page, "Amara");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Stalled background activity/ }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await drawOnCanvas(page);
  await waitForDraftSaved(page);

  // Now the media request for the background is accepted and never answered.
  let stalled = 0;
  await page.route("**/uploads/**", async () => {
    stalled += 1;
    // never fulfil, never abort
  });

  await page.reload({ waitUntil: "domcontentloaded" });

  // The editor must still open, and their work must still be offered. Both are
  // gated on `ready`, which used to wait on that request forever.
  await expect(page.getByRole("dialog", { name: /restore your unsaved work/i })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: /Restore my work/i }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("text=Loading…")).toHaveCount(0);
  await expect
    .poll(async () => (await page.locator('input[name="drawingPages"]').inputValue()).length)
    .toBeGreaterThan(1000);

  expect(stalled, "the template background request should have been stalled").toBeGreaterThan(0);
});
