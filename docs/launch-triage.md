# Launch triage — Wave 1 decision sheet

Written 22 August 2026. Read-only reconnaissance by the four surface leads
(`ops-lead`, `teacher-lead`, `child-lead`, `platform-lead`). Nothing here was
edited or built. The rule for the whole sheet: **Mark decides what changes; the
leads say what they found and what it would cost.** Wave 2 (build) starts only
when Mark picks from this sheet.

This sheet is the evidence for the choices in [`launch-runway.md`](./launch-runway.md).
Each lead covered their own surface only: a route/journey map with duplication
marked, the persona findings that land on their patch ranked by harm (with
file:line, surfacing-vs-build, and honest hours), and anything not yet logged.

---

## Read this first — what changed, and three cross-cutting facts

### The persona re-run moved the numbers

`npm run test:personas` was re-run today before any lead looked at anything, so
`USER_TESTING.md` is current. It is a different picture from the run the runway
was built on:

| | Runway's basis (last run) | Today |
| --- | --- | --- |
| Findings | 122 | 106 |
| **Blockers** | **0** | **2** |
| Major | 42 | 25 |
| Journeys that ended early | 0 | **4** |

Fewer findings, but two blockers and four abandoned journeys where there were
none. The three headline items below explain all of it.

### 1. The "operator can't work" blockers are an environment artefact, not product bugs

Three of Ravi's four operator journeys ended early ("nightly check", "family code
to the wrong house", "is anybody's email broken?"). Both `ops-lead` and
`platform-lead` reached the same root cause independently: every operator journey
dies at `/ops/sign-in` returning **404**, because `OPS_ENABLED` is unset on the
server the run used. `opsEnabled()` (`src/lib/ops/enabled.ts:21`) requires
`OPS_ENABLED === "1"`; the battery config sets it, but the persona run
`reuseExistingServer: true` re-used a warm dev server started without it
(`playwright.battery.config.ts:101,127`).

**Consequence:** no operator screen was exercised at all this run. The two
"blocker" observations attributed to Ravi and the three "404 at /ops/sign-in"
majors are the same warm-server cause. **To get a valid operator run:** kill the
dev server, then `OPS_ENABLED=1 npm run test:personas` (or run the operator spec
alone against a cold server). This also means the ops findings below are read from
the *code*, not from a run that reached the screens — noted where it matters.

### 2. The child surface now *throws* on bad URLs — a real regression

The Wriggler hit `TypeError: Failed to execute 'measure' on 'Performance':
'StudentCapturePage' cannot have a negative time stamp` on `/student/new/nonsense`
and `/student/activities/not-a-real-id`. Last week these were merely *major*
dead-ends; now the page throws. `child-lead` traces it to `notFound()` unwinding
`StudentCapturePage` before Next.js closes a `performance.measure`, most likely
widened by commit `32922f7` ("canvas", 2026-08-20). This is Tier 1.4 turned from
"ugly" into "broken", and it is a 1–2h surfacing fix (child-friendly `not-found.tsx`
boundaries, or redirect instead of throw). **Ranked top of the child section.**

### 3. "Three testers couldn't find teacher feedback" is stale — F38's fix holds

`child-lead` verified against today's run: Wren's feedback check
(`children.spec.ts:218`, `/show me each step/i`) **passes**. F38's fix
(`src/app/student/page.tsx:245`, `activities/[id]/page.tsx:87`) works on the path
the personas take. The runway's "three testers, separately" line is from the
*previous* run, before/around the fix. **Not a regression — do not re-open F38.**

### Cross-cutting notes for Wave 2

- **The snap toggle is agreed.** `child` and `teacher` negotiated by message and
  settled on: `snapEnabled Boolean @default(true)` on `ActivityTemplate` **and** on
  `Assignment` (copied by `assignTemplate` at assign time); builder checkbox is
  teacher-side; the builder canvas *and* the child canvas consume it as a prop
  (default `true` when absent, so existing callers are unaffected); free drawing
  passes `snapEnabled={false}`. **Combined ~6–7h** (teacher 3–4h schema+migration+
  builder+snapshot; child ~3h prop + two handler lines + threading + test). Schema
  migration gates both sides. No safeguarding review (no child data/auth/media).
  **One open sub-question for Mark:** should `snapEnabled: false` kill *both*
  position snap and rotation snap, or position only? The leads' default is both;
  child-lead decides at write-time if you don't state a preference.
- **Anything touching children's data still needs safeguarding-reviewer sign-off
  in Wave 2** — per-child/school-wide export, account closure, any export that
  adds media *bytes*. Flagged in the teacher section.
- **F26/F27 (erasure gaps) block account closure.** Building "close our account
  and delete the data" correctly requires resolving them first.
- **`SNAP_UNITS` line correction:** the constant is `DrawingCanvas.tsx:167`; `:5004`
  (named in the runway) is the *usage* site. Both are in the child section.

---

## Operator console — ops-lead

*Read from code; the persona run never reached these screens (see cross-cutting
fact 1).*

### 1. Route and journey map

| Route | File | What the operator is doing | Status |
|---|---|---|---|
| `/ops/sign-in` | `src/app/ops/sign-in/page.tsx` | The door. Password then TOTP (or enrolment on first use). | Live |
| `/ops` | `src/app/ops/page.tsx` | Dashboard landing. Describes what the area contains, session limits. **No live data feed.** | Live, but hollow — "nothing needs you tonight" is static copy |
| `/ops/schools` | `src/app/ops/schools/page.tsx` | List every registered school: name, registration date, staff count, billing band, pupil band. Read-only. | Live |
| `/ops/billing` | `src/app/ops/billing/page.tsx` | Same schools, sorted by payment urgency. Stripe links where a subscription exists. No controls. | Live |
| `/ops/mail` | `src/app/ops/mail/page.tsx` | Mail delivery counters (today + 7 days), suppression counts, last sync run. No controls. | Live, but F30/F31 mean the data is usually empty or stale |
| `/ops/lookup` | `src/app/ops/lookup/page.tsx` | Find one adult by exact email. Reveal masked address, rotate family code. All audited. | Live |
| `/ops/health` | `src/app/ops/health/page.tsx` | DB answer time + uptime (monitored); media/startup/backups/jobs/external (all "not monitored"). | Live |
| `/ops/handbook` | `src/app/ops/handbook/page.tsx` | The operator handbook. Read-only. | Live |

**No duplication.** Schools and Billing overlap on data but differ in sort and
intent (register vs money); the register deliberately links nowhere (blocking
spec), Billing is the one place with outbound Stripe links. That separation is
load-bearing.

**Dead ends today:** `/ops` surfaces no status (static copy); `/ops/health` has
five of seven tiles "not monitored" (intentional, each says why); `/ops/mail`
shows "Never" until the suppression sync is scheduled (F31), and needs
`MAIL_HMAC_KEY` set or every surface says "not monitored".

### 2. Persona findings on the ops patch — ranked by harm

- **BLOCKER — environment, not product.** The three Ravi early-ends all die at
  `/ops/sign-in` 404 (warm server without `OPS_ENABLED`; `src/lib/ops/session.ts:226`
  → `notFound()`). Fix is operational: cold server for persona runs.
- **MAJOR — "I cannot issue them a new code" (likely a false negative).** The
  parent lookup renders a `ConfirmAction` for `OPS_FAMILY_CODE_ROTATED`
  (`src/app/ops/lookup/forms.tsx:176–208`); the persona searches
  `/rotate|new code|change the code/i`. Either the registry label
  (`src/lib/ops/registry.ts`) doesn't match the pattern, or the lookup page was
  never reached (warm server). **The action is wired — not a missing feature.**
  0h if the label matches once the server is fixed; 1–2h if the label needs a word.
- **MAJOR — F32: operator loses the whole nav in forced colours.**
  `src/app/ops/shell.tsx` paints the bar with inline `background/color`, overridden
  in forced-colours mode; axe reports all six elements failing. One account runs
  the service. **Build, ~2–3h**: `@media (forced-colors: active)` handling with
  system colours; the gate already asserts it (widen the scan to close it).
- **MAJOR — `/ops` dead-end for a child (Wriggler).** Correct `notFound()`, but no
  child-appropriate escape. **Fix belongs in the global/child not-found handler,
  not ops** — coordinated with child-lead.
- **MAJOR — F30 (mail silent) / F31 (sync unscheduled).** The `/ops/mail` copy is
  honest about both. Ops-lead's part is rendering an alert once platform-lead wires
  the signal (~2–4h) and the last-run once the schedule fires (~1h). The bigger
  build is platform-lead's.

### 3. Unlogged

- `/ops` is always "nothing needs you tonight" — honest static copy, no feed. The
  nightly-check journey's text pattern would pass *if* sign-in worked.
- A new operator who hasn't set `MAIL_HMAC_KEY` sees `/ops/mail` as "no emails ever
  sent" rather than "not configured" — worth a line in the runbook.

### Mark's question — ordered runbook to a working operator account in production

Today: `OPS_ENABLED` and `MAIL_HMAC_KEY` unset, no operator row. `/ops` 404s to
everyone including Mark. The seed (`scripts/seed-operator.ts`) refuses to run if an
operator already exists and has no `--force`; TOTP enrolment is in-browser on first
sign-in, no bypass. **Steps 1, 2, 4, 7 need Railway auth — Mark's hands only.**

1. **Set `OPS_ENABLED=1`** in Railway (service *onlineportfolio*, production).
   Exactly `1`. Triggers redeploy. Verify:
   `curl -s -o /dev/null -w "%{http_code}" https://storyjar.co.uk/ops/sign-in` → `200`.
2. **Set `MAIL_HMAC_KEY`** to a 32+ byte random secret. De-identifies suppressed
   addresses; no effect on delivery. Batch with step 1 to avoid a second deploy.
3. **Prep materials** (local): authenticator app, password manager open, printer/
   paper. The seed prints credentials **once**.
4. **Run the seed:** `railway run npx tsx scripts/seed-operator.ts you@example.com`
   (address is an identifier, no email sent). Prints a 28-char password, a TOTP
   secret, and 10 recovery codes; creates the `Operator` row `ACTIVE`,
   `totpConfirmedAt: null`, `role: OWNER`. Password → manager; recovery codes →
   **paper in a drawer, not the manager, not email** (`docs/ops-recovery.md`);
   clear scrollback.
5. **Sign in + enrol TOTP** at `/ops/sign-in`: email+password → scan QR / paste
   `otpauth://` → type the 6-digit code. Until enrolment completes, a leaked
   password alone is not a way in. Verify: you land at `/ops`, seven nav links.
6. **Confirm the 10 recovery codes are on paper, stored physically.** Five wrong
   codes lock for 15 min; the lock survives a restart.
7. **Schedule the mail suppression sync** (Tier 0.4) — mechanism is an owner
   decision (see platform section F31). Until it runs once, `/ops/mail` says "Never".
8. **Verify each screen loads** (`/ops`, `/ops/schools`, `/ops/billing`,
   `/ops/mail`, `/ops/lookup`, `/ops/health`, `/ops/handbook`). Any 404 means
   `OPS_ENABLED` or the session isn't set — sign out and back in.

Ops-lead will **not** widen the five-module import allowlist for any of the Wave 2
items.

---

## Teacher & school-admin surface — teacher-lead

### 1. Route & journey map

| Route | What the user is doing | Primary? |
|---|---|---|
| `/teacher` | Dashboard: what needs me + the open class's register | Primary home |
| `/teacher/class` (`?class=<id>`) | Manage a class: roster, code, age mode, export, delete | Primary class management |
| `/teacher/queue` (`/<id>`) | Approval queue; sticker/praise sub-route | Primary |
| `/teacher/activities` (`/new`, `/<id>`, `/<id>/edit`, `/<id>/preview`, `/shared`) | Library, builder, detail, edit, preview, shared library | Primary |
| `/teacher/students/<id>` (`/new`, `/letter`) | A child's journal; add-on-behalf; sign-in letter | Primary |
| `/teacher/account` (`/billing`) | Settings, billing, password, Claude connector | Primary |
| `/teacher/calendar` | Due dates and live runs | Primary |
| `/teacher/export/<classId>` | Class export JSON (API route, no UI) | API |
| `/admin` | Whole-school console: staff, classes, billing, audit | Primary admin |
| `/signup/teacher` | Onboarding wizard | Onboarding |

**Duplication analysis:**
- `/teacher` (glanceable dashboard, opens first class) vs `/teacher/class` (full
  manager) — **not duplicated, but invisible distinction**: the "Manage class →"
  link is 109×17px and nothing explains the difference; a first-timer doesn't know
  `/teacher/class` exists.
- Assign sheet opens from both `/teacher/activities` and `/teacher/activities/<id>`
  — same `AssignSheet`, **shortcut not duplication**, but both pass `classes[0]` as
  default (the Tier 1.8 bug).
- Library reachable three ways (rail, class "Set an activity", stat card) — three
  entry points, one destination. Fine.
- `/teacher/account` hosts settings **and** billing in one route with no URL
  distinction — a shareable "billing screen" link doesn't exist. Genuine conflation.

### 2. Persona findings — ranked by harm

1. **Class code "nothing here to change it"** — false report; `rotateClassCode` IS
   wired but buried behind the "Class settings" toggle
   (`ClassManager.tsx:303`). **Surfacing, 1h.**
2. **Assign panel preselects the wrong class** — `AssignSheet.tsx:28`
   `useState(classes[0]?.id ?? "")` = oldest class. **Surfacing, 2–3h.**
3. **Admin gets an empty "make a class" screen** — Mrs Hartley is ADMIN with no
   classes; `teacher/page.tsx:109` → `active = null` → wrong empty state
   (`page.tsx:220–232`). **Surfacing, 2–3h.**
4. **Export beside the delete-class button** — `ClassManager.tsx:304–311` inside
   `SettingsStrip` next to `DeleteClassZone`. **Surfacing, 1h** (move to header).
5. **No account-close / data-deletion route** — real gap, **blocked on F26/F27**;
   **build 6–10h after those, safeguarding sign-off required.**
6. **September rollover** — none exists; runway defers to Tier 2. Guide-tab manual
   path 1h; full automation 2–3 days.
7. **No DSAR / school-wide export** — class export exists, per-child and
   school-wide do not. **Build** (see §4).
8. **Admin can't see email health** — F30/F31 (platform). Min teacher-side is a
   status badge in the Admin Billing tab once platform provides data (1–2h).
9. **TA can't tell what she may do** (`/teacher/queue`) — needs a role-gate check;
   1h investigate, 1–2h if surfacing.
10. **Edit-while-live has no warning** (`activities/<id>/edit`) — **surfacing, 1–2h**
    (banner when a LIVE assignment exists).

**Teacher-nav touch targets (collapsed):** seven controls under 44px/24px across
`/teacher*` and `/admin`; one fix in `TeacherShell.tsx` + nav. **2–3h.**

### 3. Unlogged

- Account closure absent while `RETENTION.md` implies it (product-level gap beyond
  F26/F27).
- TA role undefined in-product (`staffRole` exists; the Guide tab doesn't enumerate
  it).
- `/teacher/billing` redirect purpose unclear — verify it lands somewhere useful.
- Password change gives no session-invalidation warning (shared-device schools).
- Class code not shown at end of signup — verify `/signup/teacher/welcome`, ~1h.
- Browser tab has no title on `/teacher` and the editor — ~1h.

- **Assigning is entirely template-centric — there is no class-scoped entry point.**
  Both callers of `AssignSheet` start from a template and neither knows a class:
  the library (`ActivityLibrary.tsx:303`) and a template's detail page
  (`TemplateActions.tsx:90`) each pass the teacher's whole `classes[]` list
  through. `/teacher/activities/[id]` has no class in its URL or its scope, so a
  teacher never reaches the sheet *from* a class. That absence is why the old
  `classes[0]` preselection existed and why it was wrong: with no class in
  context, any default is a guess, and the guess sat one tap above "Assign to
  whole class".
  (The Wave 1 line claiming the detail page knows the class is incorrect —
  checked against the code on 22 August 2026.)

  Item 5 removed the default, which is right but leaves every teacher paying a
  tap. The autumn fix is to create the context the default needs: an **Assign
  button on the class page**, or **`?classId=` on the assign URL**. Either gives
  a caller that genuinely knows the class, at which point an optional
  `defaultClassId` threaded into `AssignSheet` — preselecting where the caller
  knows, no preselection in the library where it does not — becomes honest
  rather than a guess. Do not thread it before that entry point exists; it would
  only reintroduce the silent wrong-class default on the page where most tests
  happen to click.
  Guarded by `tests/e2e/activities.spec.ts` — "the assign sheet cannot send work
  anywhere until a class is chosen".

### 4. Specific questions

**`rotateClassCode()` — reachable but buried.** `src/app/actions/classes.ts:130`
→ imported `ClassManager.tsx:6` → `useActionState` `:404` → `<RotateCodeZone>`
`:303`, rendered only when `settings` is toggled (`:253`, button `:248`). Four
steps, invisible until the toggle. F16 ("reachable from Class settings") and the
persona ("nothing here") are both true — surface the button at rest. **1h, no
schema, no safeguarding surface.**

**Export contents (`teacher/export/[classId]/route.ts`).** JSON attachment,
schema `storyjar-class-export-v1`. Includes class metadata, per-pupil first name +
createdAt, and each pupil's moments (type, caption, textContent, status, activity
title, skills, media **paths**, createdAt, approvedAt) — **all statuses, incl.
PENDING/RETURNED**. Omits: media **bytes** (paths only), assignment config
(quiz/objects/template JSON), family access data, teacher identity beyond
`exportedBy`.
- **Per-child (DSAR):** paths-only ~2h; **with media bytes zipped 6–8h** (streaming
  zip). Touches a named child + family email → **safeguarding sign-off.**
- **School-wide:** admin-gated loop over all classes, streaming for payload size,
  **6–10h**, **safeguarding sign-off**. Adding media bytes to any export crosses
  Rule 9 territory.

**Assign preselect.** `AssignSheet.tsx:28` always defaults to the oldest class.
Mounted from `ActivityLibrary.tsx:302` (no class context — defaulting is wrong) and
`TemplateActions.tsx:90` (detail page knows a run's class but passes no
`defaultClassId`). "Class in context" is genuinely undefined from both entry points
today. **Option A (2h): default to no selection, disable submit until chosen.**
Option B (3–4h): thread an optional `defaultClassId`. Recommend A first.

**Admin empty screen.** Layout fetches `db.class.findMany({ where: { teacherId } })`
(`teacher/layout.tsx:47`), scoped to her own classes — she has none → wrong "make a
class" state. **Fix (2–3h):** branch on `staffRole === "ADMIN"` when `active === null`
→ point to `/admin`. No account-close route and no admin email visibility confirmed
(the latter is the platform/ops boundary; a 24h delivery badge in Admin Billing is
1–2h once platform provides the source).

### 5. Snap-toggle agreement

Agreed with `child`: **per-activity, `snapEnabled Boolean @default(true)` on
`ActivityTemplate`, snapshotted to `Assignment` at assign time**, control in the
builder. Teacher owns schema migration + builder checkbox (`ActivityBuilder.tsx`) +
snapshot copy in `assignTemplate`. **Teacher side 3–4h.** Reasoning: a teacher
authors snap behaviour at template time, alongside `quizJson`/`objectsJson`; a
mid-lesson edit must not retroactively change a live run (hence the snapshot).

**Surfacing-only items (1.7, 1.8, 1.3, export move, edit banner, nav targets):
~9–12h total, no safeguarding review needed.**

---

## Child & family surface — child-lead

### 1. Route & journey map

| Route | What a user is trying to do |
|---|---|
| `/student` | Child's jar/home: stickers/praise, what's waiting, tap in to add work. Primary. |
| `/student/new/[type]` (photo/words/drawing/audio) | Add a specific type of work. |
| `/student/new` (redirect) | Legacy tombstone → redirects. Not a real screen. |
| `/student/activities` | All assigned activities, to-do and done. |
| `/student/activities/[id]` | Respond to one activity (canvas, quiz). |
| `/student/popped` | Post-submit celebration. |
| `/family` | Parent signs in (magic-link/code) or read-only jar of approved moments. |
| `/family/enter` | Magic-link redemption (server redirect). |

**Duplication:** `/student` previews recent activities, `/student/activities` is
the full list — **shortcut, needs signposting not consolidation.** `/student/new`
is a correct redirect tombstone. Returned-work reachable from the jar strip and the
activities "Try again" card — two intentional entry points to one destination,
though they look different enough to confuse.

### 2. Findings — ranked by harm

1. **BLOCKER (new) — `performance.measure` throw on bad URLs.** `notFound()`
   unwinds `StudentCapturePage` before Next closes the measure
   (`student/new/[type]/page.tsx:26`, `activities/[id]/page.tsx:29`). Regression
   (last week = dead-end, now = throw), most likely widened by commit `32922f7`.
   **Surfacing, 1–2h:** add child-friendly `not-found.tsx` boundaries under
   `/student`, `/student/new`, `/student/activities`, **or** redirect instead of
   throw (the pattern already at `student/new/page.tsx:22`).
2. **MAJOR — child stranded with no way back.** Escape links exist on most
   `/student` pages (`activities/page.tsx:52`, `StudentCapture.tsx:45`,
   `popped/page.tsx:34`); the gap is the activity response form — audit
   `ActivityResponseForm.tsx`. 1h audit + 1–2h. `/ops` landing is ops-lead's 404.
3. **MAJOR — quiz answers 190×57px, under the 64px child floor.** "One/Two/Three"
   for a 4-year-old. Figures suggest they render in the form's HTML, not canvas
   model space — check `ActivityResponseForm.tsx` / quiz layout. 1–2h to enforce
   `min-height: 64px`.
4. **MAJOR — placeholder-only caption input** (`StudentCapture.tsx` ~:79). Add a
   real `<label>`. 30 min.
5. **MAJOR — EYFS quiz question not read aloud.** In the pre-reader register the
   question is the one silent thing. Read-aloud infra exists
   (`lib/readAloud.ts`, `TeacherNote.tsx:74`); wire it into the quiz question box.
   **Build, 2–3h.**
6. **MAJOR — `/family` overflows 345px on a 390px phone** (`FamilySignIn.tsx`).
   CSS, 1h.
7. **MAJOR — plain-text capture loses typed text on reload.** Canvas has
   IndexedDB autosave (F34); the words `<textarea>` has none
   (`StudentCapture.tsx`). **Build, 2–3h** (sessionStorage, same pattern as
   `AddChildForm`).

### 3. Unlogged

- **A.** `/family` phone overflow has no FINDINGS entry / repro — extend
  `ux/responsive.spec.ts` to `/family` at 390px.
- **B.** `/student/activities` uses the *teacher-shell* visual register
  (`btn-ghost`, `card`, `text-muted`) while `/student` is full-bleed child styling
  — a non-reader navigates by landmark; the register change mid-journey disorients.
- **C.** `/student/popped/page.tsx:16` falls back to KS1 for a non-student rather
  than redirecting (layout guards it in practice; fragile/inconsistent pattern).
- **D.** `/family/enter?token=invalid` has no `not-found` — a parent gets a generic
  error with no next step.

### Specific questions

**SNAP_UNITS — why unconditional.** `SNAP_UNITS = 10` is a module constant at
**`DrawingCanvas.tsx:167`** (the `:5004` in the runway is the *usage* site).
Introduced in commit `32922f7` as a single design decision (10 model-units ≈ 1% of
width so maths apparatus self-aligns; comment `:4997–5003`). Never had a toggle —
no per-activity/class/teacher setting exists. Built unconditional by design.

**Rotation 15°.** `const ROTATE_STEP = 15` at `DrawingCanvas.tsx:197`, applied
unconditionally at `:5015` (shape rotate) and `:5581` (quiz-object rotate).

**Smallest honest toggle (canvas side).** Agreed interface with `teacher`
(Option 1, per-activity `snapEnabled` on `ActivityTemplate`, snapshotted at assign).
Canvas changes: add `snapEnabled?: boolean` prop (default true); at `:5004` use
`snapEnabled !== false ? SNAP_UNITS : 1`; same guard at `:5015`/`:5581` for
`ROTATE_STEP`. Position and rotation snap toggle **together** (free drawing wants
both). Setting reaches the canvas by adding `snapEnabled` to the assignment
`select` in `activities/[id]/page.tsx` → `ActivityResponseForm` → `DrawingCanvas`
(3 lines, no new network); free drawing (`StudentDrawCapture`) passes
`snapEnabled={false}`. **Canvas side ~3h** (prop + two handler lines + threading +
test). **Combined ~6–7h; schema migration gates both sides.** Open sub-question:
`false` kills both position and rotation snap (leads' default) or position only —
child-lead decides unless Mark states otherwise.

**Three error-page dead-ends.** (1) `/student/new/nonsense` —
`student/new/[type]/page.tsx:26` `notFound()`, no boundary; add
`not-found.tsx` or `redirect('/student')`. (2) `/student/activities/not-a-real-id`
— `activities/[id]/page.tsx:29`; add boundary or redirect to `/student/activities`.
(3) `/ops` — ops-lead's route; child-side mitigation is the ever-present back-to-jar
link.

**Teacher-feedback findability — F38 holds, finding is stale.** F38's fix is real
(`student/page.tsx:245` renders `<TeacherNote>` on returned items;
`activities/[id]/page.tsx:87` passes `teacherNote` to the form). Today's run:
Wren's check (`children.spec.ts:218`, `/show me each step/i`) **passes**; the only
Wren feedback-adjacent finding is the reload text-loss (item 7). The runway's
"three testers" line predates the fix / used a different seed. **Not a regression.**

---

## Platform (schema, mail, deploy, CI) — platform-lead

### 1. Surface map (infra journeys, not URL routes)

- **Deploy** — `railway.json` → `scripts/railway-start.sh`: creates media dirs,
  `prisma migrate deploy` (P3005 auto-baseline), `next start`. Healthcheck
  `/api/health` checks `SELECT 1` + a media write; response is strictly
  `{"ok":true}`/`{"status":"degraded"}`. **Gap:** healthcheck does not probe the
  Mailjet credential or `OPS_ENABLED` — both can be absent and `{"ok":true}` still
  returns.
- **Mail send + status** — `requestMagicLink` → `sendMail` (`src/lib/mailer.ts`,
  8s abort, reads per-message `Status`, not just HTTP 200) → `recordMailAttempt`
  (`src/lib/mailCounters.ts`, upserts `MailCounter` keyed by
  day/template/outcome/statusClass; no address/subject/body stored).
  `/ops/mail` reads via `readMailStatus` (`src/lib/ops/reads.ts`). **Gap:** UTC-day
  granularity (no hourly window); no alert channel.
- **Suppression sync** — `scripts/mail-suppression-sync.ts` polls Mailjet, HMACs
  addresses under `MAIL_HMAC_KEY`, upserts `MailSuppression`, writes a `JobRun`
  every run incl. failure. **Gap:** nothing schedules it (F31); screen says so
  (`ops/mail/page.tsx:168–170`).
- **Schema change** — edit schema → `migrate dev` locally → commit both; CI uses
  `db push`; prod uses `migrate deploy`; `migrations-match-schema.spec.ts` catches
  divergence (F21, mitigated).
- **CI/gate** — `battery.yml` selects suites on PRs; `main`/nightly/dispatch run
  all blocking suites; `npm run check` ~2s (tsc + static gates).
- **Routes owned:** only `/api/health` (public by design). Boundary with ops is
  clean: platform owns the counters/DTOs (`reads.ts`), ops renders `/ops/mail`.

### 2. Findings — ranked by harm

- **Blocker-class (Tier 0.1, env not code):** `OPS_ENABLED` unset → all three Ravi
  early-ends (`/ops/sign-in` 404). **0 build**, ~30 min to document + verify the
  seed. Same root cause ops-lead found.
- **F35 — backup residency, High.** Full answer below.
- **F30 — mail silent, Medium.** Full answer below.
- **F31 — sync unscheduled, Medium.** Full answer below.
- **F32 — ops nav vanishes in forced colours, Medium.** `src/app/ops/shell.tsx`
  inline colours. 1–2h ops fix + 1–2h to sweep `src/` for the same pattern (child
  surfaces too). Gate already asserts (scoped to `main`); widen to close.
- **F26 — teacher delete erases rows not files, Medium, Open.** `removeStaff`
  (`src/app/actions/admin.ts`) `db.teacher.delete` cascade with no media gather.
  Unreachable today (only INVITED staff), but account-deletion PR will inherit it.
  Not launch-week.
- **F27 — template media no erasure path, Medium, Open.** `duplicateTemplate`
  copies path strings; unresolved design question. Not launch-week.
- **F21 — schema/migration split, Mitigated.** Spec catches drift; not urgent.

### 3. Unlogged

- **Admin email-visibility gap is a boundary, not a new bug** — Hartley's
  "can't see anything about email" is F30 seen from the `/admin` side. Data is
  platform's (`reads.ts`); the `/admin` screen is teacher's; whether school admins
  get *any* view, and at what granularity, is Mark's call.
- **`MAIL_HMAC_KEY` unset is a silent double state** — without it, suppression reads
  "Not monitored" (honest) but counters still accumulate. Setting it affects only
  suppression checking, **not** delivery. Worth stating plainly in the runbook.

### Specific questions

**F35 — what closes it.** Not code. **Deliverable:** Mark asks Railway support, in
writing, *"For volume backups on service [name] in europe-west4, in which country/
region are the snapshots stored?"*
- **Branch A (EU/UK):** record the region + the *actual* retention windows
  (6 days / 1 month / 3 months — **not** the 35-day cycle `RETENTION.md` currently
  claims) in `RETENTION.md` and the DPIA sub-processor entry. No new sub-processor,
  no school notice. F35 closeable.
- **Branch B (US / unnamed):** a Rule 10 problem →
  either Option B in `docs/ops-backup-options.md` (self-managed encrypted backups
  to an EU object store — **new sub-processor, signed DPA, sub-processor list row,
  DPIA entry, school notice with lead time**; not a same-week step), or an explicit
  recorded owner decision that backups may leave UK/EU, with schools told.
- **Platform can:** draft the support message, draft `RETENTION.md` for either
  branch, build the Option B script if chosen. **Only Mark/DPO can:** send the query
  (binds a DPA commitment), choose the option, write the school notice, edit the
  published legal pages. **Regardless of branch:** the 35-day claim in
  `RETENTION.md` is wrong and needs correcting to the real schedule.
- **Concrete next action:** Mark sends Railway the written question. Its answer
  picks the branch.

**F30 / F31 — minimal "mail is broken" signal.** The Ravi "is anybody's email
broken?" early-end is **not** F30 — it's the `OPS_ENABLED` 404; Ravi never reached
`/ops/mail`. Fix 0.1 and he gets there.
- **F30 minimal:** a daily-verdict banner on the `/ops` index that reads today's
  `MailCounter` and renders `mailVerdict` as one sentence — the operator sees it on
  opening `/ops`, no new channel, no hourly window, no new data.
  **1–2h** (query exists in `reads.ts`; boundary with ops-lead on who writes the
  tile). What it does **not** close: a true *push* alert (needs D13 revisited /
  an out-of-band channel — "an alert from the failing mail provider is not an
  alert"). That's a Mark infra-cost decision.
- **F31 minimal:** schedule the sync. **Option 1 — in-app scheduler** (extract the
  sync into a shared module, call from an interval inside the running process which
  has the volume mounted; runs on the web process, restarts on deploy — acceptable
  for a once-daily pilot job). **Option 2 — authenticated endpoint hit by a Railway
  cron service** (new inbound endpoint + shared secret). **Recommend Option 1,
  2–3h**, with a spec asserting a `JobRun` is written when it fires. **Do F31 before
  F30** so the banner has real data instead of "Never".

| Item | Root cause | Minimal fix | Hours |
|---|---|---|---|
| Ravi early-ends | `OPS_ENABLED` unset | Set env var in Railway | 0 build, ~30 min |
| F30 (signal) | No channel; UTC-day only | Verdict banner on `/ops` index | 1–2h |
| F31 (schedule) | Railway can't double-mount the volume | In-app scheduler (Option 1) | 2–3h |
| F35 | Backup region unknown | Mark asks Railway in writing; branch | 0 (A) / significant (B) |

---

## What Wave 2 could pick up, if Mark wants a shortlist

Sorted by the runway's own "small and dangerous is the best ratio" test. This is
the leads' read, **not** a decision — Mark picks.

**Tier 0 (doors don't open) — mostly Mark's hands:**
- Ops account runbook (ops §, 8 steps) — env vars + seed + TOTP. **0 build.**
- One Stripe checkout end-to-end, then refund (teacher + platform). *Not covered in
  depth this wave — flag for Wave 2 scoping.*
- F35: send the Railway backup-region question **today** (it has lead time in
  Branch B). Fix the 35-day `RETENTION.md` claim regardless.
- F31 then F30: schedule the sync (2–3h) then the `/ops` verdict banner (1–2h).

**Tier 1 small-and-dangerous (do first per the runway):**
- 1.7 rotate-code surfacing — **1h.**
- 1.8 assign-panel no-preselect (Option A) — **2h.**
- 1.4 child dead-ends incl. the new throw — **1–2h.**

**Tier 1 safeguarding-gated builds:**
- 1.1 per-child + school-wide export — 2h / 6–10h, **safeguarding sign-off.**
- Account closure — blocked on F26/F27, **safeguarding sign-off.**

**Snap toggle (1.2):** ~6–7h combined, schema migration gates it. Open
sub-question: does `snapEnabled: false` disable rotation snap too, or position only?

Everything above is Wave 1 evidence only. No files were changed.
