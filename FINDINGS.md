# FINDINGS — StoryJar QA battery

Defects and gaps found while building the test battery, and how each was
resolved. Data-protection failures are treated as critical/high per the brief
(UK GDPR, ICO Children's Code).

> **Baseline note.** Assessed against the repo HEAD at the time of writing.
> During this work the branch advanced (PRs #28/#29): PR #28 added `RETENTION.md`,
> tightened SAFEGUARDING rule 9, and fixed the media-erasure gap on single-moment
> delete (`deleteItem`). Findings reflect that state — F3 was narrowed to
> `removeStudent`, which this work then fixed too.

**Status: F1 to F19 addressed.** Fixes were applied after explicit sign-off
(the Phase-1 plan was "findings only"; the user then asked to fix them). Every
fix is covered by a test that now passes.

**F20 to F22 were opened on 16 August 2026** by the SRE work (OPS-0a, 0c and
0d). F20 was the most serious entry in this file and was not fixable by an
agent, because it was owner decision D2. **D2 was answered and executed by the
owner on 17 August 2026** and the backups exist; F20's entry below records what
that leaves. It is written as a proposal because closing a Critical finding is
the owner's call, not an agent's.

**F23 and F24 were opened on 16 August 2026** by the QA half of PR0, doing to
the new ops blindness gate what handbook ruling R3 exists to make someone do:
the author of a gate is the worst person to certify it fires. F23 is the reason
that ruling is worth having.

**F37, F38 and F39 were opened on 18 August 2026** by the user-tester team's
first run (`tests/battery/personas/`, TEST_PLAN B7) — nine people and a bot
using the product for whole jobs of work rather than asserting against it. All
three were found by somebody doing something ordinary: a six-year-old picking up
a pen, a ten-year-old looking for what his teacher asked him to change, and a
teacher pasting her register on her first morning.

**All three were fixed on 19 August 2026**, each on an owner decision rather than
a guess: grow the target and keep the icon (F37); the note on the jar and on the
work, in every register, spoken only by an on-device voice (F38); strip the
surnames and show the teacher what was stored (F39). Their repros moved into the
blocking a11y and e2e suites.

> **F15–F18 were found later**, while working through the July 2026 intuitiveness
> audit — not during the original battery work. All four are fixed. F16 shipped
> as the class-code rotation release's second half (rotation first, then the
> throttle). **F17** was fixed after safeguarding review approved loosening the
> path-first branch: `/uploads` now authorises across ALL matching records (Option
> A) and the fixture no longer shares a media path (Option C).
>
> **F18 is the one to learn from:** a child could not read their own initial, and
> the a11y gate passed the whole time because F11's `color-contrast` baseline
> hid it. "The a11y gate will catch it" is not a safe argument until
> `BASELINE_RULES` is empty — an assumption already made twice in planning.

Severity key: **Critical** · **High** · **Medium** · **Low** · **Info**.

| ID | Sev | Area | One-line | Status | Covering test |
|----|-----|------|----------|--------|---------------|
| F1 | High | AuthZ | `studentLogin` trusted a client `studentId` (cross-school impersonation) | **Fixed** | `security/f1-student-impersonation.spec.ts` |
| F2 | High | Rate-limit | No throttling on login / family-code / magic-link | **Fixed** | `findings/rate-limit-enumeration.spec.ts` |
| F3 | Medium | Erasure | Removing a pupil orphaned their media files on disk | **Fixed** | `security/f3-pupil-removal-erases-media.spec.ts` |
| F4 | Medium | Compliance | Landing promised data export, but no export path existed | **Fixed** | `security/data-protection.spec.ts` (F4) |
| F5 | Low | Uploads | `/uploads` would serve an SVG if one existed | **Hardened** | `security/uploads.spec.ts` |
| F6 | Low | Enumeration | Magic-link request revealed whether an email is on file | **Fixed** | `findings/rate-limit-enumeration.spec.ts` |
| F7 | Low | Sessions | Session cookie set no explicit `Secure` flag | **Fixed** | `security/auth-sessions.spec.ts` |
| F8 | Info | Repo hygiene | `.env` + root `dev.db` git-tracked | **Fixed** (dev.db untracked) | — |
| F9 | Info | XSS surface | `dangerouslySetInnerHTML` on a library QR SVG | **Reviewed** (allowlisted) | `scripts/audit-static.mjs` |
| F10 | Low | Deps | Moderate `postcss` advisory via `next` (upstream) | **Deferred** (needs Next bump) | `npm run audit:prod` |
| F11 | High | A11y | App-wide WCAG 2.2 AA colour-contrast + colour-only links | **Substantially fixed.** **Measured cold 2026-08-24: 11 nodes remain**, all `color-contrast`, all on adult admin surfaces — admin console 8, admin guide 1, admin promises 1 collapsed + 1 with the procedure open. No child-facing surface is baselined. **This row is the count's home**: `docs/DPIA.md` R9 cites it rather than carrying its own figure, because it previously said ~30 while this row said ~19 and neither had been measured. `link-in-text-block` is still in `BASELINE_RULES` but reported nothing in that run — worth removing when somebody next has the file open, since a baseline entry that suppresses nothing is a licence nobody is using | `a11y/axe.spec.ts` |
| F18 | High | A11y (child-facing) | Six of the eight avatar colours gave a child an unreadable initial on their own name card (1.8–2.5:1 vs a 4.5:1 floor) — **hidden by F11's `color-contrast` baseline**, so the name-picker scan passed throughout | **Fixed** | `a11y/avatar-contrast.spec.ts` |
| F12 | Low | Resilience | Reload discarded the add-child draft & lost your place | **Fixed** | `ux/interruption.spec.ts` |
| F13 | Low | Responsive | Landing scrolled horizontally at iPad-portrait | **Fixed** | `ux/responsive.spec.ts` |
| F14 | Low | Touch target | Approval-queue buttons < 44px on tablet | **Fixed** | `ux/responsive.spec.ts` |
| F15 | Critical | AuthZ | `createJournalItem` trusted a client `studentId` — a teacher could publish into another school's pupil's journal, past the approval queue | **Fixed** | `security/f15-cross-tenant-journal-write.spec.ts` |
| F16 | High | Rate-limit / Enumeration | Class-code lookup is unthrottled, and a hit discloses the class name + every pupil's first name | **Fixed** | `security/classcode-throttle.spec.ts` (+ `findings/classcode-throttle-grind.spec.ts`) |
| **F19** | **Critical** | **AuthN** | `requestMagicLink` returned the parent's single-use sign-in URL to the browser, rendered as "Open it now →", with no environment guard — so typing any parent's email into the PUBLIC family form handed over a working session for that family | **Fixed** | `security/f19-magic-link-never-on-screen.spec.ts` |
| F17 | Medium | AuthZ / robustness | `/uploads` authorised **path-first**: it decided on the first journal item matching a media path and never fell through to the draft/template branches, so two records sharing a path mis-authorised each other. Now scopes ownership into each branch and grants if any (Option A); the fixture no longer shares a path (Option C). | **Fixed** | `security/uploads-path-collision.spec.ts` |
| **F20** | **Critical** | **Availability / Claims** | The volume holding every child's photograph, drawing and voice note had no backups, and three documents schools read said it did. **Answered and executed by the owner on 17 August 2026** (`docs/ops-architecture.md:41`): Railway on Pro, daily and weekly volume backups on, RPO nightly. Two residuals remain and are tracked elsewhere — **a restore has never been rehearsed** (handbook R12, still blocks PR8) and **backup residency is unconfirmed** (F35) | **Original ground resolved. Status is a proposal for the owner, not an agent's decision** — see the entry | none possible; the rehearsal is an owner action |
| F21 | Medium | Schema / deploy | Production applies schema changes with `prisma migrate deploy`; local setup and CI still use `prisma db push`, so a schema edit made the usual way ships without a migration | **Mitigated, not closed** | `security/migrations-match-schema.spec.ts` |
| F22 | Low | Log hygiene | The stdout static check scans `src/` only; scripts run by hand against production are audited by hand too | **Accepted** | `security/log-hygiene.spec.ts` (scope stated in its header) |
| F23 | High | Ops blindness gate | Twenty-nine of forty-two attempted evasions got past the gate as first written, including three that handed over password hashes and family codes through a *permitted* call on a *permitted* model | **Fixed** (28 closed, 1 accepted in F24) | `security/ops-blindness-gate.spec.ts` + the 69-file corpus behind `--self-test` |
| F24 | Info | Ops blindness gate | What the gate still cannot see: runtime-assembled identifiers, and `scripts/ops/` being deliberately out of scope | **Accepted** | scope stated in the gate header and in A15 |
| F25 | Low | Ops surface | With ops enabled, an unauthorised `/ops` 404 is about 1,700 bytes smaller than a genuine one, so the route's existence is inferable by size. Accepted: the body names nothing and the sign-in door is openly reachable anyway. | Accepted | none, and none wanted. The size difference is Accepted; the assertion that actually matters — `/ops` answers 404 to the unauthorised — is covered by `security/ops-auth.spec.ts` |
| F26 | Medium | Erasure | Deleting a `Teacher` row cascades their classes, pupils, moments, drafts and templates and erases **no** media files. Latent today (only never-activated staff are ever deleted), but it is the exact shape PR8's account deletion will reach for | **Open, logged not fixed** | none yet; must be written with the fix |
| F27 | Medium | Erasure / Claims | Teacher-authored **template** media (`templatePathsJson`, `quizJson` option pictures, `objectsJson` image srcs) has no erasure path at all: templates are only archived, never deleted. `RETENTION.md` says this media is "deleted with the template/account". `duplicateTemplate` also copies the path strings, so two templates share files on disk | **Open, logged not fixed** | none yet; must be written with the fix |
| F28 | Medium | Availability / build | The app fetched its two webfonts from Google at build and dev-server startup via `next/font/google`. A 404 or outage from `fonts.gstatic.com` failed the build, which took out a CI job on 2026-08-17 and would equally fail a production deploy. **Fixed 2026-08-19:** both typefaces are vendored in `src/app/fonts` with their OFL licence texts, loaded via `next/font/local`, and `scripts/check-font-independence.mjs` (in `npm run check`) fails the build if anything imports `next/font/google` again. | **Fixed** | `scripts/check-font-independence.mjs` |
| F29 | Low | Test timing | The template restore prompt waits on an IndexedDB purge, an IndexedDB read and a Server Action round trip before it can render. On a cold CI runner that exceeded the 10 second default assertion budget twice in one day while passing locally every time. The assertion now names the precondition and allows 30 seconds. | **Withdrawn: wrong diagnosis, superseded by F34 and F36** | none — withdrawn. The real fault was F34's unbounded cross-device lookup (`e2e/drafts.spec.ts`) and the flake was F36's hydration race (`e2e/helpers.ts` `clickHydrated`). Both are covered there, which is why nothing is needed here |
| F30 | Medium | Mail | Mail health is readable at /ops/mail and nothing announces a problem. No alert channel exists, and a MailCounter row is a UTC day so the finest window the data supports is a day, not the hour brief 05 asks for. | Open | **partial.** `security/ops-mail.spec.ts` covers what the screen says, including that the verdict is a daily figure. **The alerting half has no test because there is no alert:** D13 took the default, so there is no channel to assert against |
| F31 | Medium | Mail | The suppression sync has no schedule. Until it is scheduled, MailSuppression is a snapshot of whenever somebody last ran it by hand, and a parent who started bouncing this morning reads as not refused. **And until 23 August 2026 the by-hand route did not work either** — the documented command could never have reached the production database (F44), so the fallback this entry rests on was unavailable for its whole life. | Open | none. The scheduler's refusal outside a production build is F43's test, not this one. Nothing asserts the sync has ever run, and nothing can until `MAIL_SUPPRESSION_SYNC=1` is set in production |
| F32 | Medium | Accessibility | In forced-colours mode the entire operator bar vanished: the header painted background and text as inline colours, so a high-contrast operator lost all four nav links and the sign-out button on the one account that runs the service. Nothing in `src/` handled `forced-colors` at all. | **Fixed on the operator bar** 2026-08-23 (`shell.module.css` overrides the inline colours with system-colour keywords). **The wider sweep this entry asked for is NOT done:** `forced-colors` is still handled in that one file and nowhere else, so the teacher and child surfaces are unassessed | `a11y/ops-health-a11y.spec.ts` — and specifically that its forced-colours scan is **no longer scoped to `main`**. The entry named widening it back as the assertion that this is closed; it has been widened, so a regression on the bar turns it red |
| F33 | Medium | Deploy | railway.json pinned the deprecated NIXPACKS builder while the live service runs RAILPACK, and configuration in code overrides the dashboard. The next deploy would have moved the builder backwards. | Fixed | **none, and that is a finding inside the finding.** Nothing in `tests/` or `scripts/` reads `railway.json`, so nothing stops the `build` block being re-added. The fix was a deletion, and a deletion is exactly the kind of fix that comes back quietly |
| **F34** | **High** | **Resilience / data loss** | Saved work was withheld from the person who made it. The restore prompt awaited the local draft and a cross-device server lookup **together**, and the lookup had no deadline, so a request that was accepted and never answered suppressed the prompt entirely, and a teacher's or a child's work sat safe in their own browser while they were told nothing. The same shape was found a second time on `loadImage`, where a stalled template background left a child on a permanent "Loading…" overlay. Both are now bounded. | **Fixed** | `e2e/drafts.spec.ts`: "the restore prompt still arrives when the cross-device lookup never answers" and "a stalled template background still lets a child draw and restore" |
| F35 | **High** | Data residency | Volume backups were switched on 2026-08-17, and Railway's own DPA says its primary processing is in the United States, with backups "across multiple sites and regions" and none named. A backup is a complete copy of every child's photograph, drawing and voice note, and SAFEGUARDING rule 10 commits StoryJar to UK or EU storage. The claim that backups stay in Amsterdam has been removed from RETENTION.md rather than repeated. | Open | none possible from inside the product. Where a backup physically sits is a fact about Railway's estate rather than about this codebase; the evidence is Railway's DPA and `RETENTION.md`'s backup row, and confirming it is an owner action |
| F36 | **Medium** | Test correctness | Every post-reload click in `drafts.spec.ts` raced hydration. Playwright's actionability checks pass on server-rendered HTML, so the click landed before React attached its handler, was swallowed without error, and the test failed one line later on a missing canvas that looked like a product fault. **Measured on 2026-08-18: F36 caused the one-in-two CI flake.** With it fixed the prompt appears in 38ms and all 133 functional tests pass; without it `main` failed at 33.9s. Raised from Low because a fault that fails a blocking gate every other run, and was twice misdiagnosed as a product defect, is not a low-severity test nit. | **Fixed** | `e2e/helpers.ts` `clickHydrated`, used at both post-reload click sites |
| **F37** | **High** | A11y (child-facing) | The blocking 64px child touch-target gate covered neither **canvas** — `/student/new/drawing` or an activity response — nor the **EYFS jar**, a different shell for the youngest children in the product. Every tool on them was under the floor: pens 58 wide, undo/redo/clear/close at 44×44, Done and ＋ at 56×56, the Text tool at 48×48, page tiles at 57, and the colour slider **24px wide**. The quiz answers a pre-reader taps measured 57 because the canvas sized them in MODEL units and scaled them down — a floor in the wrong coordinate space is not a floor. Same shape as F18: a gate reading as "child touch targets are covered" while the busiest child screens sat outside its list of URLs | **Fixed** | `a11y/child-touch-targets.spec.ts` (both canvases and the EYFS jar now in the blocking gate) |
| **F38** | **Medium** | Feedback loop / child-facing | A teacher sent work back with a note — the queue asks for one and gives an example — and the child was never shown it. `/student` rendered a returned moment with a fixed status line ("Have another go") and nothing else; `teacherNote` was rendered by one component, on the teacher's own view. The child was told something came back and left to guess which part | **Fixed** | `e2e/journal.spec.ts` ("the teacher's note reaches the child…") |
| **F39** | **High** | Data minimisation / SAFEGUARDING rule 2 | The sign-up wizard stored children's **surnames**. Step 4 wrote `raw.trim()` straight to `Student.name`; the roster's own paste path ran the identical input through `deriveChildNames`, which keeps first names only. The full names were then the buttons on the class sign-in screen, reached with a code written on the board | **Fixed** | `e2e/auth.spec.ts` ("a register pasted at sign-up is stored as first names only") |
| F40 | Medium | Test isolation / diagnostic cost | The e2e suite has **no per-test draft cleanup**, and `globalSetup` reseeds once per RUN rather than per test. A test that dies inside the template builder leaves its local-first draft behind; every later test that opens the builder is then met by the "restore your draft?" dialog, which is `aria-modal` and intercepts pointer events, so the next click times out on a failure that has nothing to do with what it was testing. One broken PDF renderer presented as eleven extra red specs. **A red suite that names twelve specs when one thing is broken is a suite people stop reading** | **Open** | none; the fix is an `afterEach` in a shared fixture (local storage + the `Draft` table), not a line remembered in each spec |
| F41 | Medium | A11y (child-facing) / gate coverage | F37 grew every drawing-canvas control to the 64px child floor and added the page to the blocking sweep — but the sweep measures the page as it **loads**, and the four controls that exist only once a child taps an object were never on it: resize and turn at 20×20, delete and edit at 24×24. These are the controls a child uses to *arrange* their work, which is most of what an apparatus worksheet asks. Sibling of F37's own lesson: **a page sweep is exactly as good as the states it visits**. Not fixable by growing them — four 64px handles on a 90px counter would bury the shape | **Fixed** 2026-08-20 (owner decision: a small visible dot inside a 64px press at all four corners, unified in `ObjectCorners`) | `a11y/child-touch-targets.spec.ts`, which now **places a shape, taps it, and measures the selected state** — the half that keeps it fixed |
| F42 | Medium | Child-facing / WCAG 2.2 2.1.1 (A) | A text box on the canvas had exactly one way back into it: **double-click**. Invisible — nothing on screen said it could be reopened — unreliable for a young child on a classroom iPad whose second tap is often not read as a double-tap, and unreachable from a keyboard. The object *made of words* was the one with no visible way in, and a child who mistyped had to delete it and start again. Found by reading a red gate rather than a screen. Two more holes surfaced with it: a text box **could not be deleted at all**, and could not be turned | **Fixed** 2026-08-20 (owner decision: the same four corner controls a shape has, each a 64px press; double-click still works, it is simply no longer the only way) | `e2e/text.spec.ts` ("re-edit via the ✎ button"), already in the blocking suite |
| **F43** | **High** | Third-party calls / test isolation | An in-app scheduler gated on **credentials rather than environment**, so it called the live Mailjet account and wrote production personal data into a test database. `.env` holds the real Mailjet keys on every machine in the project, so "do I have credentials" was true everywhere, including the battery's three dev servers. **It would have done the same in CI** | **Fixed** | `security/ops-mail.spec.ts` ("the in-app scheduler refuses to schedule outside a production build") |
| **F44** | **High** | Recovery / documentation | Every database command in the operator recovery runbook said `railway run`, which executes on the operator's own Mac with production variables injected. `DATABASE_URL` is `file:/data/prod.db` on the Railway volume, which is not mounted there, so all five commands failed with SQLite error 14. The page had said since it was written that the wrapper was unrehearsed. **The only way back into the service had never once been executed** | **Fixed.** Docs corrected 2026-08-23 and **the runbook was rehearsed against production the same day: `railway ssh` reaches the container and the read-only operator query runs there.** The destructive break-glass steps stay unrehearsed by choice | none, and none proposed: see "why there is no test" in the entry |
| F45 | Low | Family access / truthfulness | A family place is labelled "In use" / "Not used yet" from `sessions > 0 \|\| email !== null`, and both halves are wrong. Sessions are per-browser and purged 7 days after expiry, so a household that used the jar all last term reads as unused; a parent who typed an address and never looked again reads as in use. A truthful answer needs a `lastSignInAt` column, which records more about a parent's behaviour than StoryJar keeps today — a decision, not a patch. **The per-pupil export copied this heuristic before the safeguarding review caught it**, which is why the screen matters more than its severity | **Open** | none; `security/data-protection.spec.ts` asserts the export no longer carries the claim |
| F46 | Medium | Assessment / activities | Editing a LIVE quiz rewrites `quizSnapshotJson` on runs already in flight — deliberately, so a mid-lesson fix reaches the class. But `quizScore` and `quizTotal` are computed at submit time against the snapshot as it then stood, so two children who answered the same named activity an hour apart can be marked out of different papers, and **both marks are stored as bare integers as though comparable**. Nothing in the data or the UI says otherwise | **Open**; no fix for launch. The edit screen now warns the teacher so it is an informed choice | none; `e2e/activities.spec.ts` covers the edit path, not the marking |
| F47 | Medium | Roles / access clarity | **TEACHER and TA are byte-for-byte identical.** Every access check asks `staffRole === "ADMIN"`; `"TA"` appears six times in `src/` and gates nothing. Four surfaces implied otherwise — a Guide card titled "Change what a colleague can do", a role picker beside two controls that really do change access, per-role badge colours, and `STAFF_ROLE_CHANGED` written to the audit log as a safeguarding-relevant action that has no effect. A head teacher setting a colleague to "Teaching assistant" believed they had limited her access to the approval queue. Underneath: `Class.teacherId` is singular and assigning *moves* a class, so **the missing thing is a relationship, not a label** | **Copy fixed** 2026-08-23 (option A); **the gap is open**, autumn, with the many-to-many change | none; scoping was verified correct throughout and no gate was bypassed |
| F48 | Low | Mail / answerability | The Admin Billing email badge can only tell a school business manager whether StoryJar's email is working **across all schools**, not whether it is working for hers — `MailCounter` has no school dimension and deliberately never will. A per-school answer **is** derivable from `MailSuppression` by hashing the school's own adult addresses, and the version she can act on names the parent, which discloses a named adult's delivery status to an ADMIN who may not be that class's teacher. **Deferred to the autumn on purpose**, needing `safeguarding-reviewer` and two Railway variables first | **Open, deferred** | `security/school-mail-health.spec.ts` guards the shipped badge against overclaiming in the meantime |
| F49 | Low | A11y (teacher-facing) | Five controls in teacher page bodies below the 44px floor, measured by the persona team: `Manage class →` 109×17, `See all →` 59×16, `Make a class` 140×42, and class chips at 155×42 and 92×42. A sixth, `Renew your plan →` at 137×18, was fixed rather than logged — it is the only control on the banner a frozen school sees on every screen. The 42s are two pixels short from one shared padding, so a single class-chip component fixes three at once. **Not an exhaustive sweep** — it is what the personas happened to walk, which is why `a11y/teacher-touch-targets.spec.ts` is scoped to the shell's own regions rather than whole pages | **Open**; the shell's own 13 controls are fixed and gated | `a11y/teacher-touch-targets.spec.ts` covers the shell, deliberately not these |
| F50 | Medium | A11y (child-facing) / gate blindness | **The canvas's Turn and Resize handles are announced as buttons and cannot be operated by any key.** Both are `<div role="button">` with `onPointerDown/Move/Up`, no `onKeyDown` and no `tabIndex` (`DrawingCanvas.tsx:5508-5533`) — a WCAG 2.2 **2.1.1 Keyboard** failure on two controls that are labelled, sized and, to a screen reader, present. There is no other way to rotate or resize an object, so for a keyboard or switch user those operations do not exist. **The part that generalises is why no gate caught it:** without `tabIndex` the element is not in the tab order, so a keyboard walk never reaches it to fail, and `role="button"` alone breaks no axe rule — the gate is blind precisely because the control is unreachable, which is the defect. Found while reading for the rotation investigation (`docs/rotation-findings.md`), not by a test | **Fixed** 2026-08-23, with the rotation work (options A + E). Both handles take `tabIndex` and arrow keys, stepping by the object's own rotation step so a keyboard reaches every position a pointer can; Turn and Resize are also real `<button>`s in `ObjectToolbar` | `e2e/rotation.spec.ts` — "the turn and resize handles are reachable and operable by keyboard", which asserts the `tabindex` AND that the key actually moves the object |
| F52 | Medium | Gate hygiene / user copy | `scripts/error-string-audit.mjs` extracts strings with `/["'`]([^"'`]{6,})["'`]/g`, and both halves of that pattern are wrong. The character class excludes all three quote types, so **an apostrophe ends a double-quoted string** — 79 user-facing strings across `src` are audited only as far as their first "doesn't". And the `{6,}` sits *inside* the pattern, so a string too short to match never consumes its own quotes and every later quote on the line is off by one — 208 of the 1,521 "strings" it currently audits are **code caught between mis-paired quotes**, which is where the standing HARD hit comes from. The false negatives are the finding; the noisy line is only what led to it | **Fixed** 2026-08-23; the freeze deferral was reversed once `scripts/` was already dirty and the cost was sunk | n/a — a gate script, not the product. What makes the fix safe is the before-and-after across `src`: HARD 1 → 0, SOFT 6 → 6 on the same six sites, no new findings |
| F53 | Low | Repo hygiene / gate legibility | Four editor duplication artefacts (`… 2.ts`, `… 2.sql`) were committed and sat in the tree for days. Three were spec files — including one in the **blocking security directory that has never executed**, because the space before `2.ts` cannot match Playwright's default `*.spec.ts` glob. A file that reads as coverage and is not is worst in that directory. The fourth is an **older draft of a migration**, still tracked, whose column is named `template` — the exact name the schema rejected because the ops blindness gate derives its child-relation denylist from relation names | **Three deleted** 2026-08-23; the migration artefact is **open**, untouched under the schema freeze | n/a — nothing collected or applied any of them, which is the finding |
| F56 | Medium | Test harness / gate reachability | **The lane path and the direct path are two different test environments, and `npm run test:gate` is the one nobody checks.** Found 2026-08-24, twice in one evening, in two unrelated classes. **Setup:** bringing the database up to the committed schema is done in **three** independent places — `scripts/run-suites.mjs:56` (per lane, to that lane's shard database, never `prisma/dev.db`), `tests/battery/global-setup.ts:36` and `tests/global-setup.ts` — and the third had none until it was found for a third time, so plain `npm run test:e2e`, and therefore `test:gate`, died on any branch adding a column. Each of the three was added by whoever was standing on that path. **Timing:** `e2e/school-picker.spec.ts`'s in-flight test passed in lanes and failed on the direct path **deterministically**, because its outcome turned on whether a 250ms debounced search returned before a click completed, and the two paths differ in port, dist dir, database and compile order. **That instance no longer reproduces (25 Aug 2026):** the product defect under it was fixed with the school picker, and all 10 school-picker specs pass on the direct path. The instance is gone; the divergence that hid it is not. | **Open.** Neither stated closure criterion is met — still three independent setup sites, and the direct path is still not a lane. The port guard of 25 Aug 2026 closes the stale-database class for the lane path only | n/a — the finding is that the harness has two environments, so no single suite can hold it. The setup half is closed at all three sites; the divergence is not |
| F57 | Medium | Operations / the school register | **The documented way to refresh the school register could not run where the database is.** `npm run gias:import` — the command the script's own header gives as the production procedure — answers **403 inside the Railway container** and 200 from a laptop the same minute, because the DfE blocks the datacentre range. It fails at the FIRST fetch, before anything downloads, so nothing was ever half-written; it simply could not be done. Found 25 Aug 2026 the only way it could be: by somebody trying it for the first time. Third instance of the F44 class — a documented operational capability that had never once been exercised. **Established 25 Aug 2026: production's register had never been imported at all** — one `register:refresh` row ever, that morning's — so the live signup picker was empty from the day the feature shipped, with every gate green over an empty table. | **Mitigated, not closed.** `--extract-date` ships (2d1ad9b) and `/ops/health` now carries the procedure. What stays open is that the register can only be refreshed by a person with a browser and a laptop, so it goes stale by default | `scripts/check-establishments.ts` asserts the extract is fetched from a host that is not the blocked Downloads page — the invariant `--extract-date` rests on. Nothing can test the container's network from here |

---

## F20 · No backups exist, and the documents say otherwise · Critical → original ground resolved 17 August 2026, status awaiting the owner

Found while doing OPS-0a/0c/0d (SRE), 16 August 2026. Not fixable by an agent at
the time: it was owner decision D2.

**UPDATE, D2 WAS ANSWERED AND EXECUTED ON 17 AUGUST 2026.** Recorded at
`docs/ops-architecture.md:41`: Railway was upgraded to Pro and daily and weekly
volume backups were switched on, with RPO and RTO stated as nightly and back
within a day, both knowingly accepted for a ten-school pilot. `RETENTION.md`'s
backup row was rewritten to Railway's real schedule — daily kept 6 days, weekly
1 month, monthly 3 months — and the "35-day rolling cycle" figure, which matched
no tier, was removed rather than quietly edited, because a school's data
protection lead may have read the old wording.

So both halves of the original finding are addressed: the backups exist, and the
document schools read during procurement no longer describes a cycle that does
not. **This correction is six days late reaching this file**, which is its own
small lesson: a finding whose blocker is an owner decision does not update itself
when the owner takes it, and the entry stayed "Open, blocked on D2" in a public
repository that a school's due-diligence questionnaire reaches for. The same
staleness was live on the operator health screen until 23 August (F44's sweep
found it there), where it read as "no backups exist" to the one person who would
decide whether to attempt a restore.

**What is NOT resolved, stated precisely, because it is not nothing:**

- **A restore has never been rehearsed.** `docs/ops-architecture.md:41` says so
  in terms — "R12 is NOT yet satisfied: a restore still has to be rehearsed
  before deletion (PR8) can ship". A backup nobody has restored is a belief, not
  a recovery position, and the RTO figure is therefore unmeasured. This is an
  owner action; nothing an agent writes can substitute for it.
- **Backup residency is unconfirmed, and one school-facing page still claims
  it.** That is F35: Railway's DPA says primary processing is in the United
  States with backups "across multiple sites and regions", none named, while
  SAFEGUARDING rule 10 commits StoryJar to UK or EU storage. `RETENTION.md` had
  the Amsterdam claim removed rather than repeated, but
  `src/app/legal/privacy/page.tsx:56` still tells schools that the database,
  uploaded media **and backups** are stored in Amsterdam. That page is the
  owner's as DPA and DPO and is deliberately not edited here.

**PROPOSED STATUS, for the owner to accept or reject in one line.** An agent does
not close a Critical finding. The proposal is: **Fixed on its original ground** —
the backups exist and the documents no longer contradict them — **with two named
residuals tracked elsewhere**, the unrehearsed restore under handbook R12 (which
continues to block PR8) and backup residency under F35. If that reading is
accepted, F20 becomes Fixed and R12 and F35 carry what is left. If the owner
would rather F20 stay open until a restore has actually been rehearsed, that is
equally defensible and the entry should say so instead — the one thing that
should not persist is the current text, which says the backups do not exist.

---

**The original finding follows, unaltered, as the record of what was found on 16
August 2026.**

One 5 GB Railway volume in EU West holds `/data/prod.db` and `/data/media`,
which together are every school, every pupil name, and every photograph, drawing
and voice note a child has saved. The volume has no backup and no point in time
recovery. A volume corruption, a mistaken command or a provider incident destroys
all of it with no recovery path.

The second half is worse than the first. `RETENTION.md` promises schools a
35-day rolling backup cycle with deletions propagating out within one cycle;
`/legal/privacy` states that the database, uploaded media **and backups** are
stored in Amsterdam; `/legal/data-processing` presents a list of Article 32
measures that a reader will take as complete and that omits availability and
restore. A school's data protection lead reads the first of those during
procurement. It is currently untrue.

**Why no repro test exists.** There is nothing to assert. A test that fails
because backups are absent would be asserting a decision that has not been made,
and the missing piece is not code.

**What has been done instead:** the costed options, their RPO and RTO, their
retention windows, and what each would oblige StoryJar to tell schools are
written up in [`docs/ops-backup-options.md`](./docs/ops-backup-options.md). No
plan was changed, no provider was added, no money was spent, and the backup line
in `RETENTION.md` was deliberately left exactly as it is: correcting it without
fixing it means telling schools their children's work has no disaster recovery,
and that sentence is the owner's to write.

**Blocks:** OPS-0b, and handbook R12, which holds school deletion out of v1 until
a backup exists and a restore has been rehearsed.

*(End of the 16 August record. OPS-0b was unblocked by D2 the following day. R12
is still not satisfied, because the backup now exists and the restore has not
been rehearsed. Read the update at the top of this entry, not this paragraph.)*

---

## F21 · Two ways to change the schema, only one of which reaches production · Medium → Mitigated

Found while doing OPS-0c, 16 August 2026.

`scripts/railway-start.sh` now runs `prisma migrate deploy`, which applies only
the SQL committed under `prisma/migrations`. Local development still runs
`prisma db push` (`npm run setup`, `npm run db:reset`), and so does CI, and
`db push` reads `schema.prisma` directly without ever looking at the migrations
folder.

So the trap is: edit `schema.prisma`, push it locally, watch the battery go
green, deploy, and `migrate deploy` finds nothing new to apply. The container
boots against last week's tables and fails on the first request that touches the
new column, at whatever time of the morning the deploy went out, on a database
whose best recovery point is last night (F20: volume backups exist as of 17
August 2026, RPO nightly, and no restore has been rehearsed).

**Mitigated** by `tests/battery/security/migrations-match-schema.spec.ts`, which
fails the blocking security project whenever the committed migrations and the
committed schema stop describing the same database. That turns the trap into a
red build rather than a broken deploy, and it was watched failing with a model
appended to `schema.prisma`.

**Not closed**, because the two workflows still exist. Closing it properly means
either moving local and CI onto `prisma migrate dev` / `migrate deploy`, or
accepting the split and relying on the spec. Prisma's own guidance is not to mix
the two against one database. That change touches the CI workflow and the npm
scripts, so it belongs in its own reviewed PR rather than being bundled into a
log-hygiene and healthcheck change.

---

## F22 · The stdout check covers the app, not the scripts · Low → Accepted

Found while doing OPS-0d, 16 August 2026.

`tests/battery/security/log-hygiene.spec.ts` statically scans `src/`, which is
the application's own stdout, and that is where the accidental leak lives: a
`console.error("...", e)` whose error object turns out to contain a rejected
Prisma payload or a Stripe parameter.

Scripts under `scripts/` are different. They print deliberately, to an operator's
terminal, and several exist precisely to show a delivery status or a masked
address. A blanket rule there would be wrong, so they were audited by hand
instead:

- `scripts/mail-events.mjs` already masked recipient addresses by default, with
  an explicit `--full` opt-out. Left as it is.
- `scripts/fix-demo-parent-address.mjs` printed a parent's name and their family
  code. A family code is a credential: reading one is enough to sign in and see
  that child's jar. It now selects and prints row ids only.
- `scripts/freeze-expired.mjs` logs its caught error in full. Left as it is,
  deliberately: the only payload it can carry is subscription ids and fixed
  strings, no child data, and it is the one production job with no other
  observability at all.

**Accepted**, not fixed: a script added tomorrow is protected by nothing here.
The durable answer is the mail alerting and `JobRun` work, where an operator
reads counters rather than log lines.

---

## F23 · The blindness gate missed twenty-eight ways past it · High → Fixed

Found on 16 August 2026 by the QA half of PR0, under handbook ruling R3: the
gate's author does not certify that it fires, so QA tries to defeat it before
writing a single fixture. Forty-two evasions were written across four waves,
each wave aimed at the rules the previous one had just added. **Twenty-nine got
through.** The first wave alone was twenty-five attempts of which twenty passed
clean. Twenty-eight of the twenty-nine are now a rule in
`scripts/check-ops-blindness.mjs` and a canary in
`tests/fixtures/ops-blindness/`; the twenty-ninth was judged permitted and is
recorded in F24.

The pattern across all of them is the same, and it is worth naming because the
next person will hit it too: **each original rule was correct about the shape it
was written for, and every miss was one spelling away from a shape it caught.**

- `db["journalItem"]` was caught; `db?.["journalItem"]` and
  `Reflect.get(db, name)` were not.
- `db.journalItem.findMany()` was caught; `const { journalItem } = db` and
  `const items = db.journalItem` were not, because every model rule matches the
  three-part shape `<client>.<delegate>.<method>(`.
- `select: { familyCode: true }` was caught; `familycode`, `["family" + "Code"]`,
  `` [`family${"Code"}`] `` and `[["family","Code"].join("")]` were not.
- `groupBy({ by: ["classId"] })` was caught; `by: "classId"` (Prisma accepts a
  bare string), `by: KEYS` and `db.student.count({ where: { classId } })` were
  not. The last of those is the same per-class number R10 refuses, by a route
  the rule never looked at.
- `import { teacherNav } from "@/lib/teacherNav"` was caught;
  `"../../lib/teacherNav"` was not, because the allowlist skipped every relative
  specifier. The same hole silenced the session-reuse rule, which compared
  specifier strings by equality, and the reverse-membership test, which was a
  substring search for `"@/lib/ops/"`.
- `export { db }` was caught; `export default db` and `export const client = db`
  were not.
- `export function` and `export const f = () => {}` were guard-checked;
  `export default async (props) => {}`, `export const f = async function () {}`,
  `export { handler as GET }`, `export const GET = handler`, an inline
  `"use server"` action inside a component, and an entire `"use server"` module
  parked at `src/app/ops/mutations.ts` instead of `src/app/actions/ops/` were
  not.
- `signInAs` was caught; `masqueradeAs` and `loginAs` were not.
- `fetch("/api/drafts")` was caught; `` fetch(`${process.env.APP_URL}/api/drafts`) ``
  was not.

Three of the misses were not variations on a caught shape at all, and these are
the ones worth reading twice:

1. **A permitted read of a permitted model handed over credentials.** A Prisma
   read with no `select:` returns every scalar column, so
   `db.teacher.findMany({ take: 50 })` was a clean pass that returned fifty
   password hashes, and `db.parent.findUnique({ where: { email } })` returned the
   family code that signs an operator in as that family (amendment C1). Nothing
   in the gate was wrong; the gate simply had no rule about projection.
   `OPS-UNPROJECTED-READ` now requires an explicit `select:` on any row-returning
   call against a model that owns a denied column, and the model list is derived
   from the schema so a new credential column joins it the day it lands.
2. **The same hole one level down.** `select: { id: true, staff: true }` on a
   school returns whole Teacher rows through the relation. `staff` points at an
   adult model, so it is not a child relation and nothing looked at it.
3. **`_count: true` inside a select** counts every relation on the row. On a
   Parent that is the linked-children count ruling R11 refuses, obtained without
   naming the relation the gate was watching for.

Also fixed here: shared definition-of-done item 9 ("no img, next/image, video,
audio, source, picture, object, embed, iframe, CSS `url()` or `data:` media
anywhere under ops") had no gate behind it at all. `next/image` was doubly
invisible, because `next/` is on the package prefix allowlist. Every byte of
media in this product is a child's photograph, drawing or voice note, and an
`<img src={dto.path} />` renders one while satisfying every data rule in the
file.

**Fixed.** Seven new rules (`OPS-UNPROJECTED-READ`, `OPS-DB-HANDLE`,
`OPS-ASSEMBLED-IDENTIFIER`, `OPS-COMPUTED-SELECTION`, `OPS-COUNT-WILDCARD`,
`OPS-CHILD-SCOPE-KEY`, `OPS-MEDIA-ELEMENT`) and widenings to ten existing rules
and to reverse membership. Nothing was removed or relaxed. Two rules were made *narrower* in the same pass,
both to remove a false positive before anyone met it and was tempted to delete
the rule: `by:` is now read only inside a `.groupBy(` argument rather than
anywhere in the file, so a DTO field called `by` is safe; and `_count: true` is
refused only inside a `select`/`include`, because inside a `groupBy` it means
"rows in this group" and is correct. Both narrowings ship with a fixture proving
the true positive still fires.

**Guards:** `security/ops-blindness-gate.spec.ts` (A15) and the 69-file corpus
behind `--self-test`. The spec's mutation test deletes each declared rule in turn
from a throwaway copy of the gate and requires the self-test to go red, so a
fixture that fires the wrong rule cannot pass for the right-looking reason.

---

## F24 · What the blindness gate still cannot see · Info → Accepted

Recorded so no document claims more for the gate than is true. The gate's own
header states three limits; these are the ones the QA pass found by trying, and
they are in addition to those.

**A name built at runtime cannot be decoded.** `["family","Code"].join("")`,
`atob(...)`, `String.fromCharCode(...)` and anything else that assembles an
identifier while the process is running are outside what a text scanner can
read. This is mitigated rather than closed, and the mitigation is the important
part: the *consequence* is gated even though the *construction* is not. A
computed key inside a query object is refused outright by
`OPS-COMPUTED-SELECTION` whatever the expression is, on the same principle as
the `groupBy` key rule, so an unreadable name cannot select a column; and
reaching a credential off a fetched row first requires an unprojected read,
which `OPS-UNPROJECTED-READ` refuses. A determined author with arbitrary
JavaScript still wins against any regex gate, which is why the gate is paired
with review and with the runtime specs and is described as a floor.

**A count of a parent's own sign-in artefacts passes.**
`_count: { select: { magicTokens: true } }` on a parent record is permitted, and
this was a judgement rather than an oversight. It is a figure about an adult's
own account, of exactly the shape amendment C2 allows ("has this family ever
signed in, when did they last"), and it names no child and reveals no token
value. If the owner reads C2 more narrowly, the change is to add `magicTokens`
and `sessions` to `NEVER_LINK_RELATIONS` with a fixture; the gate is written so
that is a two-line edit.

**`scripts/ops/` is deliberately not scanned.** Handbook section 5 makes the
interim one-off operator scripts "procedurally constrained, not structurally
blind": they run on the server with full database access by design. Pretending
the gate covers them would be exactly the overstatement the programme exists to
avoid. This belongs in the DPIA, next to the larger fact the gate header already
records: the gate constrains the **product**, not the person, and the operator
has host access to the SQLite file and the media volume regardless.

**Accepted.** No action beyond keeping these sentences in the DPIA and out of
anything a school is shown.

---

## F25 · An ops 404 is distinguishable from a real 404 by response size · Low → Accepted

Found in review of PR1 by measuring, not by reading code.

With `OPS_ENABLED=1` and no session, `/ops` returns 404 as ruling R17 requires.
The body is 7,321 bytes. Two genuinely nonexistent routes return 8,997 and 9,011
bytes on the same build, repeatably. So the existence of `/ops` as a route can be
inferred from the size of its not-found response, which is the kind of signal
R17 exists to remove.

Why it is Accepted rather than Fixed:

- **It reveals only that the route exists**, not who may use it, not what it
  does, and nothing about any child or adult. The 404 body names nothing: the
  page deliberately carries no `title`, which was a real leak found and fixed
  during PR1, and the only occurrence of the path in the payload is Next echoing
  the segment the requester themselves typed. A control against `/wibble` shows
  the identical echo, so that part is generic framework behaviour.
- **The door is openly reachable anyway.** When ops is enabled, `/ops/sign-in`
  returns 200 to anybody, because a sign-in page nobody can reach is not a
  sign-in page. Anyone curious enough to measure a 404 body would find that
  first, so closing the size difference would buy nothing while the door exists.
  What R17 actually forbids is a login page that NAMES the area, and this one
  does not: its whole visible text is "Sign in", "Email", "Password",
  "Continue".
- **The fix is disproportionate.** Making the response byte-identical to a
  framework 404 means either not routing `/ops` at all, or reproducing Next's
  own not-found payload by hand and keeping it identical across upgrades. Both
  are more fragile than the thing they would hide.

What would change this: if the sign-in door ever moves behind something
unguessable, the size difference becomes the remaining signal and should be
closed at the same time. Recorded so that decision is made deliberately rather
than by forgetting this exists.

## F26 · Deleting a teacher erases rows but no files · Medium → Open

Found on 2026-08-17 while pulling the erasure paths into `src/lib/erasure.ts`
(PR7). **Logged, deliberately not fixed here**, because PR7 is behaviour
preserving and a fix is a behaviour change that deserves its own review.

`removeStaff` in `src/app/actions/admin.ts` deletes the `Teacher` row outright
when the staff member's status is `INVITED`:

```
if (staff.status === "INVITED") {
  await db.teacher.delete({ where: { id: staffId } });
}
```

`Teacher` cascades widely in `prisma/schema.prisma`: `Class` (and through it
`Student`, `JournalItem`, `Draft`, `Assignment`), `ActivityTemplate`, `Folder`,
`Subscription` and `Session` all carry `onDelete: Cascade`. So that one line can
in principle remove every row holding a media filename while leaving every file
on the volume, with nothing left that can name them. That is the failure mode
rule 9 exists to prevent, and it is silent: no error, no log, no red test.

**Why it is Medium and not High.** It is not reachable today. Only `INVITED`
staff are deleted, and an invited teacher has not signed in, so they own no
class, no template and no draft. Nothing in the code says so, though. It holds
because of a lifecycle assumption sitting two files away from the delete.

**Why it matters anyway.** Handbook §5 PR8 is account deletion, and a school
account deletion is a teacher deletion with the same cascade and far more behind
it. Whoever writes it will reach for `db.teacher.delete` and inherit this.

**The fix, when it is its own change.** An `eraseTeacher(teacherId)` entry point
in `src/lib/erasure.ts` alongside the others: gather the teacher's classes'
journal-item and draft media, their template media (see F27), and the parent ids
that could be orphaned, **before** the delete; then delete the row, then the
files, then sweep orphaned families. `removeStaff` calls it instead of
`db.teacher.delete`. It needs a spec of the same shape as
`security/f3-pupil-removal-erases-media.spec.ts`, plus a positive control that
the files existed immediately before.

---

## F27 · Template media has no erasure path, and the schedule says it does · Medium → Open

Found on 2026-08-17 alongside F26, and **logged rather than fixed** for the same
reason.

Three columns on `ActivityTemplate` hold `/uploads` paths to teacher-authored
media: `templatePathsJson` (background pages), `quizJson` (answer-option
pictures) and `objectsJson` (movable picture srcs). `src/app/actions/activities.ts`
has no delete action at all: `setTemplateArchived` archives, and its own comment
says it "never deletes runs or responses". So there is no route by which that
media is ever erased, while `RETENTION.md` tells schools it is "Deleted with the
template/account like other teacher-authored template media". The document
describes a path that does not exist.

**A trap sits on top of it.** `duplicateTemplate` copies the path *strings*, not
the files:

```
templatePathsJson: t.templatePathsJson,
quizJson: t.quizJson,
objectsJson: t.objectsJson,
```

so an original and its copy point at the same files on disk. `assignTemplate`
does the same thing again into `templateSnapshotJson` / `quizSnapshotJson` /
`objectsSnapshotJson` on the `Assignment`. Any future "delete this template and
its files" written the obvious way will therefore blank the background pages of
every copy and every live run made from it.

This is also why `eraseClass` in `src/lib/erasure.ts` deliberately does **not**
gather assignment snapshot paths, even though a class delete cascades its
assignments: those paths belong to the teacher's template, which survives. That
is existing behaviour, it is correct, and PR7 preserved it. It is written down
here so nobody "fixes" it later and deletes a teacher's whole activity library
by removing one class.

**The fix, when it is its own change.** Decide first whether duplicate and
assign should copy the files rather than the strings (they should, then
ownership is one-to-one and erasure is simple), or whether erasure must
reference-count paths across templates, copies and assignment snapshots. Only
then add template deletion. Until it is settled, `RETENTION.md`'s
teacher-template row is a claim ahead of the code.

**Extended 2026-08-18, by the shared activity library. F27 is NOT fixed and this
work does not claim to fix it.** `duplicateTemplate` still copies path strings,
`assignTemplate` still snapshots them, and template media still has no erasure
path at all.

What changed is that one new road was built the other way, deliberately, so the
finding does not grow. "Add to my activities" copies the FILES
(`src/lib/sharedActivities.ts`), not the strings, so a teacher's copy of a
StoryJar library activity shares no bytes with the original or with any other
teacher's copy. Had it been written the obvious way, every teacher's copy would
have depended on a file StoryJar owns, and withdrawing or replacing a library
background would have blanked that activity in every classroom that had added
it, discovered by a teacher mid-lesson. That is this finding's exact shape, made
structural instead of latent.

It also settles half of the open question above for one case: where copying was
written fresh, files won, and ownership is one-to-one. When F27 is fixed
properly, `copySharedMediaForTeacher` is the shape to copy, and the assertion
that proves it is "adding produces an independent copy" in
`tests/battery/security/shared-activities.spec.ts`.

---

## F19 · A parent's sign-in link was handed to whoever asked — Critical → Fixed

**Was:** `requestMagicLink` (`src/app/actions/family.ts`) minted a single-use
magic token and returned its URL in the action result:

```ts
return { sent: true, openUrl: `/family/enter?token=${token}` };
```

`FamilySignIn.tsx` rendered that as an **"Open it now →"** link, and there was
**no environment guard anywhere in the path**. The family sign-in page is
public. So on a live deployment: type any parent's email address into the form,
receive a working sign-in link on screen, open it, and you are signed in as that
parent — reading that child's photographs, drawings and voice notes.

**Why it is worse than F1 and F15.** Both of those needed a crafted request with
a tampered id. This needed a form submission with an address someone knows — a
parent at the same school, a separated partner, anyone who has seen a class
letter. It breaks rule 4 and rule 6 outright.

**It also quietly defeated F6.** That finding made the response deliberately
identical for known and unknown emails so the form could not be used to discover
whether an address was registered. The neutral sentence was then followed by a
sign-in link that answered the question far more emphatically.

**Why it survived:** the comment above it explained itself honestly — *"here (no
mail server) we mint the same single-use token and hand back the URL"*. It was a
correct decision for a build that could not send email, and it was never revised
when the code moved toward deployment. **A convenience justified by a temporary
limitation needs a guard that expires with the limitation, not a comment.**

**Fix:** the link is emailed (`src/lib/mailer.ts`, `src/lib/emailTemplates.ts`). The
on-screen version is gated behind `signInLinkMayBeShown()` in
`src/lib/signInLinkPolicy.ts` — a pure function of `NODE_ENV`, kept in its own
tiny module precisely so a test can assert it rather than trusting an `if`
buried in a server action. Development keeps the affordance, because local work
still has no mail server. Send failures are logged server-side and never change
what the user is told, so F6's neutrality holds even when the mail provider is
down.

**Guards:** `security/f19-magic-link-never-on-screen.spec.ts` — blocking.
Asserts production returns no link, that development still does, and states
explicitly why an unset `NODE_ENV` is treated as non-production.

## F15 · Cross-tenant journal write, past the approval queue — Critical → Fixed

**Was:** `createJournalItem` (`src/app/actions/journal.ts`) read `studentId` from
the form and resolved it with an **unscoped** `findUnique`, then took `classId`
off that student. The only remaining gate, `requireWritableAccountForClass`
(`src/lib/billing.ts`), resolves the **owning** class's teacher and checks *their*
subscription — it never compares against the teacher who is acting. Because
teacher-authored items publish immediately (`status: isTeacher ? "APPROVED"`),
any signed-in teacher could post into any school's pupil's journal and have it
land **already approved** — visible to that school's parents, without their own
teacher ever seeing it. Breaks rules 3 (the queue is sacred), 4 (scope every
child-data query by ownership) and 8 (deny by default) at once.

**Why it survived:** it is F1's twin — F1 fixed the *student* side of the same
mistake, and this file already applies the principle correctly three more times
(the `assignmentId` re-resolve, the `returned` lookup, the student branch), with
comments citing rules 4 and 8. The teacher branch was the one place it wasn't.
The add-work **page** is scoped correctly
(`teacher/students/[studentId]/new/page.tsx` → `findFirst` on `class.teacherId`
→ `notFound`), and `tenant-isolation.spec.ts` asserts exactly that: the UI route
was closed, the server action behind it was not. Server actions are callable
directly, so the page check was never the control.

**Fix:** the teacher branch re-resolves the student with
`findFirst where id AND class.teacherId = <acting teacher>`, mirroring
`studentLogin`'s F1 fix. No match denies.

**Not part of this fix:** `skillIds` is also read unscoped from the form, but
`Skill` is a deliberately global taxonomy (`prisma/schema.prisma` — no
`schoolId`, globally-unique `name`, and the teacher page offers every skill), so
there is no tenant boundary to cross. A non-existent id would throw rather than
leak; worth tidying, not a security fix.

**Guards:** `security/f15-cross-tenant-journal-write.spec.ts` — a School B
teacher tampering the hidden `studentId` on their own add-work page cannot reach
a School A pupil; asserted against what School A's *own* teacher can see in the
pupil's journal and in their queue. Blocking gate. Fails against the pre-fix
code.

## F16 · Class-code lookup: unthrottled, and discloses the roster — High → Fixed

**Was:** `/login/student?code=…` (`src/app/login/student/page.tsx`) validated the
class code with a direct Prisma lookup **in the page render** — a plain GET with
no rate limiting. `src/lib/rateLimit.ts` was wired into `teacherLogin` and the
family/magic-link actions only; F2 never covered this path. A hit returned the
class name **and every pupil's first name** in it.

**Fix:** the lookup now goes through `src/lib/classCodeLookup.ts`
(`lookupClassByCode`), the one throttled door — the login page no longer touches
Prisma directly, so a future caller can't reintroduce an unthrottled path. The
throttle (`src/lib/rateLimit.ts`, `allowCodeLookup` / `recordCodeMiss` /
`recordCodeHit`) is keyed on `clientIp()` and is deliberately *not* the auth
limiter: it is **miss-only, clears on every hit, and trickles rather than hard-
blocks** (one lookup / 5s once over a 50-miss budget). A throttled request
returns `null` — the same not-found screen a wrong code shows — so a grinder
can't tell throttling from a miss, and a *correct* code is never withheld for
more than the trickle window, then clears the block for everyone behind the IP.

**Severity reasoning:** the code alphabet is 31 chars at length 6 (≈887M), so
blind brute force is impractical — this is grinding, not instant. But it is
unbounded, unlogged, and the response is the roster itself.

**The trap this had to clear:** a school is one NAT IP. The auth limiter is 5
failures / 15 min **per IP** — thirty children mistyping twice would lock out the
whole school. So the counter is miss-only with a classroom-safe budget, and *the
test proving honest classrooms aren't locked out mattered more than the one
proving the throttle works.* Both exist: the blocking
`security/classcode-throttle.spec.ts` runs 30 children × (2 typos + their real
code) — 60 misses interleaved with 30 successes — from one IP and asserts every
child still reaches the name wall (proved red by removing clear-on-success: it
locked out at child ~26). The report-only `findings/classcode-throttle-grind.spec.ts`
drives a pure-miss grind past the budget and shows a valid code is briefly
withheld, then recovers.

**Verified 2026-07-17 — the throttle key is NOT spoofable, so a limiter here is
sound.** A separate worry was raised: `clientIp()` reads the *leftmost*
`x-forwarded-for` value, which is attacker-controlled on any edge that *appends*
to a client-supplied header — that would let anyone mint a fresh key per request
and walk around every limiter in the app. Tested against the live Railway edge
with a temporary diagnostic route (since removed): a forged
`X-Forwarded-For: 1.1.1.1, 2.2.2.2` reached the app as `<real client IP>,
<railway internal hop>` — Railway **overwrites** the header, discarding the
forged chain. So leftmost = the real client, and the limiters (teacher login,
family codes) are not bypassable. **Do not change `clientIp()` to the rightmost
value** — that entry is Railway's internal hop and it *rotates* between requests,
so keying on it would break the limiter. This is what makes keying the F16
throttle on `clientIp()` sound. Re-verify if the hosting edge ever changes.

Note the child-facing PIN planned for KS2 does **not** answer this — the roster
is disclosed before any PIN is reached, which is why the throttle sits on the
lookup itself.

**Rotation shipped (the remedy half).** `rotateClassCode` (`actions/classes.ts`)
lets a teacher issue a new code and retire the old one — reachable from Class
settings the moment a code leaks. Until this existed, a leaked code had no fix
short of rebuilding the class by hand, so hardening a code nobody could change
was only half an answer. Scoped to the owning teacher, not write-gated (a leak
must be revocable even in a frozen account), audited without logging the new
code. Guards: `security/tenant-isolation.spec.ts` (School B cannot rotate School
A's code — proved red) and `e2e/class-code-rotation.spec.ts` (old code dies, new
works, signed-in children stay in). Rotation closed the "no remedy" gap; the
throttle above closes the unthrottled-lookup/disclosure one — together they
complete F16.

---

## F1 · Student session from a client-supplied `studentId` — High → Fixed

**Was:** `studentLogin` (`src/app/actions/auth.ts`) minted a STUDENT session from
a posted `studentId` with no check it belonged to the entered class — a crafted
submit could impersonate any pupil, including one in another school.
**Fix:** `studentLogin` now requires the class `code` and re-queries
`student findFirst where id AND class.classCode = code`; a mismatch denies and
redirects back. The class code is the access control, enforced server-side. The
login page carries the verified code as a hidden field.
**Guards:** `security/f1-student-impersonation.spec.ts` — a swapped cross-class
id is refused (now blocking gate).

## F2 · Rate limiting — High → Fixed

**Was:** no throttling on `teacherLogin`, `signInWithFamilyCode`,
`requestMagicLink`.
**Fix:** `src/lib/rateLimit.ts` — a dependency-free, failure-count limiter
(5 failures / 15 min → 15 min block), keyed per account+IP (login) or per IP
(family/magic). A correct sign-in clears the counter, so honest repeated logins
are never blocked. Friendly, jargon-free message.
**Note:** in-process store — sufficient for a single instance; swap for a shared
store (Prisma table / Redis) behind the same interface if StoryJar scales out.
**Guards:** `findings/rate-limit-enumeration.spec.ts` (report-only — the tests
trip real 15-min blocks that would contaminate the gating run).

## F3 · Removing a pupil orphaned media — Medium → Fixed

**Was:** `removeStudent` (`src/app/actions/roster.ts`) deleted the pupil row
(cascading journal rows) but never erased the media files.
**Fix:** `removeStudent` now gathers the pupil's `mediaPath`/`mediaPathsJson`
before deletion and calls `deleteMediaFiles`, mirroring `deleteClass`/
`deleteItem`. Right to Erasure is real across all three delete paths.
**Guards:** `security/f3-pupil-removal-erases-media.spec.ts` (upload → remove
pupil → file gone) + the `deleteItem` guard in `data-protection.spec.ts`.

## F4 · Data export — Medium → Fixed

**Was:** the landing promised "export … your class's data at any time"; no
export existed.
**Fix:** `GET /teacher/export/[classId]` (`src/app/teacher/export/[classId]/route.ts`)
returns an ownership-scoped JSON bundle (class + pupils + every moment's
metadata + media paths); non-owners get 404. An "⭳ Export class data" link sits
in class settings.
**Guards:** `security/data-protection.spec.ts` — own class exports (200, JSON,
attachment); another tenant is denied (404).

**Extended 2026-08-23 — the per-pupil export.** `GET /teacher/export/pupil/[studentId]`
(`src/app/teacher/export/pupil/[studentId]/route.ts`, schema
`storyjar-pupil-export-v1`) answers a subject access request about one named
child. Same shape and the same mapper as the class export
(`src/lib/exportBundle.ts`), so the two cannot drift; reached from a link on the
pupil's own journal page. Paths only — media bytes stay a manual,
identity-checked route.

*Guard:* `security/data-protection.spec.ts` — "the per-pupil export answers for
one child, and only to that child's teacher": 200 for the owning teacher, 404 for
a colleague in the same school who does not teach that class, 404 cross-tenant,
no other pupil's name in the file, and no class code, family code or `jarSeenAt`
anywhere in it.

*Scope:* the teacher who holds the class, and nobody else — not every teacher in
the school, and not a school ADMIN by virtue of being an admin. A subject access
request is a reason to read out what is held, not a reason to widen who may read
it. The cost (an admin fielding a parent's request goes via the class teacher) is
a recorded product decision, not an oversight.

*Passed safeguarding review 2026-08-23 with five required changes, all applied:*
family access reduced to a bare count (a per-household date or flag is a written
claim about the *other* household in a file handed to this one, and the
session-derived `takenUp` was wrong in both directions besides — see F45); both
exports now write an audit row (`PUPIL_DATA_EXPORTED` / `CLASS_DATA_EXPORTED`,
rule 16, child never named in `detail`); the count of not-yet-approved work is
carried at the top of the payload and in plain words beside the button, because
rule 3's gate is a person reading it; quiz answers are resolved from opaque
option ids into the words the child was shown, because a disclosure nobody can
read is a disclosure in name only.

## F5 · Media route SVG handling — Low → Hardened

**Was:** the `/uploads` route would serve an SVG if one existed (uploads reject
SVG; `nosniff` mitigated in-page risk).
**Fix:** media responses now also carry `Content-Security-Policy:
default-src 'none'; style-src 'unsafe-inline'; sandbox`, so a directly-opened
SVG can neither run script nor load resources. (Seeded placeholder SVGs still
serve; the CSP just neutralises any active content.)
**Guards:** `security/uploads.spec.ts` asserts `nosniff` on served media.

## F6 · Magic-link enumeration — Low → Fixed

**Was:** `requestMagicLink` returned "we couldn't find a family…" for unknown
emails.
**Fix:** the response is now identical for known and unknown emails ("If that
email is on file, we've sent a link"); the dev-only direct link is included only
when a family matches, but the visible message never differs.
**Guards:** `findings/rate-limit-enumeration.spec.ts`.

## F7 · Session cookie `Secure` flag — Low → Fixed

**Fix:** `createSession` and the magic-link route now set
`secure: process.env.NODE_ENV === "production"`, so the session cookie is
Secure in production while local http dev still works.

## F8 · Repo hygiene — Info → Fixed

Root `dev.db` untracked (`git rm --cached`) and added to `.gitignore` alongside
`/prisma/dev.db`. `.env` is kept intentionally (only the SQLite path, no secret).

## F9 · `dangerouslySetInnerHTML` on QR SVG — Info → Reviewed

Unchanged: it renders a `qrcode`-library SVG (machine-generated, not user HTML).
Recorded in the static gate's allowlist so any *new* use still fails CI.

## F10 · Moderate `postcss` advisory via `next` — Low → Deferred

Fix requires a breaking Next upgrade. The CI gate is at **high** on production
deps (`audit:prod`, green). Tracked for the next Next bump.

## F18 · A child could not read their own initial — High → Fixed

**Was:** the avatar disc drew every initial in cream. Six of the eight palette
colours are warm pastels, so six children in eight had an initial at **1.8–2.5:1**
against their own disc — the AA floor is 4.5:1. A child's name card is *how they
sign in*: they are asked to find themselves by it (and per SJ-05, with surnames
banned by rule 2, the colour is one of only two compliant ways to tell two
Olivias apart). SAFEGUARDING rule 18 puts WCAG 2.2 AA under "Access for every
child".

**Why nothing caught it:** `a11y/axe.spec.ts` baselines `color-contrast` away
while F11 is open, so the name-picker scan passed the whole time. This is the
concrete cost of a baselined rule, and it is why "the a11y gate will catch it"
is not a safe argument until `BASELINE_RULES` is empty.

**Fix:** the INK adapts to the disc rather than the palette being dulled — the
warm colours are the brand and are load-bearing on the name wall
(`src/lib/avatar.ts`). Worst case across the palette went from 1.83:1 to
**4.68:1**; measured on a real name wall, every child now clears AA.

**Also fixed — the drift underneath it:** `prisma/seed.ts` had its OWN avatar
palette (six Tailwind defaults), unrelated to the app's. Three of those cannot
reach AA at *any* ink (best 3.6:1), so the demo showed unreadable initials while
real classes were fine. `actions/auth.ts` is `"use server"` and can only export
async functions, which is *why* the palette got copy-pasted — it now lives in a
shared module both import, like `classCodeChars.ts` for the code alphabet.

**Guards:** `a11y/avatar-contrast.spec.ts` — un-baselined, and deliberately not
an axe scan: it asserts arithmetically that **every** palette colour (plus the
schema's fallback) gives a readable initial, so a pretty-but-unreadable colour
fails the build the moment it is added. Proved by adding one. Plus a live check
of a real name wall.

## F11 · WCAG 2.2 AA colour-contrast — High → Substantially fixed

**Was:** serious `color-contrast` failures on ~13/15 surfaces (~150+ nodes) plus
colour-only legal links.
**Fixes:**
- Darkened the shared muted text vars (`--sj-muted`, `--muted` → `#5b6379`).
- Darkened `--glass` (`#4e9c94 → #37796f`) so white button text passes 4.5:1,
  and added `--glass-ink` (`#2e6b64`) for small teal text; swapped stray
  hardcoded teal/gray to the passing tokens.
- Nudged `--jam` (`#c2476b → #bd3f63`, imperceptible) so the primary CTA and
  jam-on-light text pass 4.5:1.
- Underlined legal-prose links (fixes `link-in-text-block`).
**Result:** contrast debt cut from ~150+ nodes to ~30, spread thin; the queue,
student and parent surfaces are now clean; `link-in-text-block` cleared.
**Remaining (tracked baseline):** a handful of brand-colour badges/pills (white
on pastel role chips, jam/orange status pills) and sub-0.1 near-misses that need
a palette decision from the design owner. The `a11y` gate stays green and blocks
**new** serious/critical violations via the tracked F11 baseline
(`BASELINE_RULES` in `a11y/axe.spec.ts`); empty that list to make it strict once
the badge palette is settled.

## F12 · Reload lost draft & place — Low → Fixed

**Fix:** the open class now lives in the URL (`/teacher/class?class=<id>`), so a
reload lands you back on the same class and — deliberately — landing on the bare
`/teacher/class` (nav, bookmark, typed URL) always shows the grid, never the
last class you had open. The half-typed add-child draft is kept by
`AddChildForm` in `sessionStorage` (transient); on a reload (Navigation Timing
`type === "reload"`) `ClassManager` re-opens the Add-pupil panel when a draft
survives, so the recovered text is visible again.
**Guards:** `ux/interruption.spec.ts` — a half-typed name survives a reload.

## F13 · Landing horizontal scroll at iPad-portrait — Low → Fixed

**Fix:** the "How it works" grid uses `repeat(3, minmax(0,1fr))` + `overflow-x:
clip` so cards shrink instead of overflowing at 768px. **Guards:**
`ux/responsive.spec.ts`.

## F14 · Approval-queue touch targets — Low → Fixed

**Fix:** queue action buttons given `minHeight: 44`. **Guards:**
`ux/responsive.spec.ts`.

---

## F28 · The build depends on Google's font CDN being up · Medium → Fixed

Found on 2026-08-17 when the accessibility job failed on a green commit.

`src/app/layout.tsx` loads Fredoka and Atkinson Hyperlegible through
`next/font/google`. That fetches the font files from `fonts.gstatic.com` at
build time and at dev-server startup. On this run Google answered **404** for a
Fredoka `.woff2`, the dev server never finished starting, and Playwright gave up
after 120 seconds:

```
Received response with status 404 when requesting
https://fonts.gstatic.com/s/fredoka/v17/...woff2
Error: Timed out waiting 120000ms from config.webServer.
```

The E2E job passed on the same commit, so the outage was brief or partial. That
is what makes it worth writing down rather than shrugging at: it looked exactly
like a flaky test, and it was not.

**Why this matters beyond a red CI job.** The same fetch happens when Railway
builds a deployment. A Google hiccup during a deploy fails that deploy. The
healthcheck means the previous deployment keeps serving, so it degrades to "you
cannot ship right now" rather than "the site is down", but a service schools
depend on should not have its ability to deploy gated on a third party's CDN
answering a hashed URL correctly.

It is also a small privacy point in our favour that should not be overstated:
`next/font/google` downloads at build time and self-hosts the result, so a
child's browser never requests anything from Google. The dependency is on the
build, not on the user.

**The fix, when someone picks it up:** vendor the two font files into the repo
and switch to `next/font/local`. That removes the build-time network dependency
entirely and changes nothing a user sees. It is a small, self-contained change,
and it wants its own PR with the font licences checked (both are open licensed,
but that should be confirmed and recorded rather than assumed).

Not fixed here because it is unrelated to the PR that surfaced it, and a font
change touches every page in the product.

## F34 · Saved work was withheld because a network call never came back · High → Fixed

Opened and fixed on 2026-08-17. **This finding supersedes F29, which was the
wrong diagnosis of the same symptom.** Read F29 below afterwards: it is left in
place deliberately, because how it went wrong is the more useful half.

### The symptom

`tests/e2e/drafts.spec.ts` "a teacher's in-progress template survives a reload
and saves correctly" failed in CI roughly one run in two, four times on
17 August 2026 across four unrelated commits. It had never failed locally,
including a full cold run of all 131 e2e tests in CI's order
(`pkill -f "next dev"; rm -rf .next; npm run test:e2e`). One failing run also
carried `[WebServer] ⨯ Error: aborted`.

### The wrong diagnosis, and why it was wrong

F29 read the failure as a slow machine. The prompt needs an IndexedDB purge, an
IndexedDB read and a Server Action round trip, and on a cold runner that last one
is also the first compile of the action, so the assertion budget went from the
10 second default to 30 seconds, with a careful comment explaining that this was
a budget sized to a named sequence and not padding.

It then failed at **33.9 seconds**. That number is the whole finding. The prompt
was not arriving late; it was not arriving at all. A budget cannot fix a wait
that never ends, and the 30 seconds only bought two more days of the same failure
looking slightly less like a bug.

The reasoning in F29 was not lazy, which is what makes it worth keeping. It named
a real precondition, it was honest about how a raised timeout looks in a diff, and
it was still wrong, because it explained the observation without ever testing
whether the prompt arrives *eventually*. The check that would have caught it is
cheap: before widening a budget, force the wait to be infinite and see whether
the test fails differently. It does not.

### The actual defect

`DrawingCanvas`, restore-on-mount:

```
const [local, server] = await Promise.all([
  loadDraft(draftKey, ownerId),                    // IndexedDB, on the device
  serverLoadDraft(serverSurface, serverContext),   // a Server Action round trip
])
```

`serverLoadDraft` wraps its call in try/catch and returns null on error, and the
header of `draftSync.ts` promised on that basis that the local-first draft "is
never blocked by the network". **A hang is not an error.** A request that is
accepted and then never answered fires no rejection, no `error` event and no
timeout of its own, so the catch never runs, the promise stays pending, and
`Promise.all` waits for it forever.

The test failure is the small harm. The product harm is the one that matters:

> A teacher's or a child's work is saved safely in their own browser, and they
> are never offered it back, because a network call they know nothing about did
> not come back.

The local copy is the one guaranteed to exist. It was being held hostage to a
remote one.

### The second instance, found while checking

The restore effect is keyed on `[ready]`, and `ready` is only set after a seeding
pass that awaits `loadImage` for every template background. `loadImage` rejected
on `onerror` but had no deadline either, and `ready` gates both the restore
prompt and the "Loading…" overlay that covers the canvas. So one stalled
`/uploads` request left a child unable to draw *and* never offered the work they
had already done. It is the same defect, reached through a different call.

This was **not** the cause of the failing test, and it is worth saying why rather
than fixing both and implying either might have been it. The failing test is a
fresh template build: `ActivityBuilder` passes `background={undefined}` when
`templatePages` is empty and there are no image objects, so that code path makes
zero `loadImage` calls. It could not have been the cause. It is a real defect on
the child's surface, and it is fixed here because it is the same bug.

### The fix

1. **`serverLoadDraftBounded`** (`src/lib/draftSync.ts`) returns the lookup as two
   views: `settled`, which reports `{ timedOut: true }` after
   `SERVER_LOOKUP_BUDGET_MS` (4 seconds) rather than leaving the caller waiting,
   and `eventual`, the same lookup with no deadline.
2. The canvas awaits `loadDraft` and `settled` together. That `Promise.all` is
   now safe because *both* legs are bounded: every path in `draftStore` resolves,
   even when storage is unavailable.
3. **`loadImage`** takes a deadline of 30 seconds, which turns a hang into the
   error path every caller already handles (that page's background simply does
   not render).

### What happens when the server copy is genuinely newer but slow

Offering the older local copy in silence is its own small harm, so the fix does
not stop at "prefer local". If the lookup only overran its deadline, the canvas
keeps listening on `eventual` and upgrades the offer when the server copy turns
out to be the newer one, replacing the open prompt, or opening one if nothing
was offered. Two rules keep that narrow:

- Once the person has restored or discarded, **nothing changes under them**.
- Once they have edited anything (a non-empty undo stack), no prompt appears and
  none is swapped. A dialog materialising over work in progress is worse than a
  late copy going unoffered, and worse still if they aim "Start fresh" at strokes
  they just made. Nothing is lost by waiting: both copies survive 30 days, so
  reopening the editor offers it again.

Two costs are accepted rather than hidden. An open dialog's wording can change
from "your unsaved work" to "work from another device" while it is being read;
that is the honest thing to show, and rarer than handing someone a stale copy
without telling them. And a genuinely slow image load that trips the 30 second
deadline loses that page's worksheet background, which is a child's context for
their own work. Accepted, because their own strokes still come back, and a lost
background is better than an editor that never opens.

### Watched fail before watched pass

Both tests force the condition with a Playwright route that accepts a request and
never answers it, because neither symptom reproduces locally by waiting. Each was
run against unmodified `main` first and fails there (the cross-device one at the
10 second default with the prompt never rendering, the background one at 60
seconds with the child still on "Loading…") and passes with the fix. The
inflated 30 second budget from F29 has been reverted to the default, which the
first test now holds without it.

**Amended on review.** The first of those tests went red in CI on this branch,
and then locally on every run once reproduced. That failure was **not** this
defect: it was the test's own click racing hydration, logged separately as F36.
Both faults were real.

**Then it was measured, on 18 August 2026, rather than argued about.** An
instrumented run recorded, after the reload, whether the draft survived, whether
the canvas mounted, and how long until the prompt appeared, polling for a full
minute. Three candidate causes were eliminated first, each with evidence rather
than reasoning: CPU throttled to 4x, 8x and 20x made no difference (506ms, 508ms,
518ms, 542ms), and neither did a cold server with `.next` deleted (511ms). The
throttle was itself verified, because an unconnected knob produces exactly that
table: a busy loop in the page went from 10ms to 85ms, and stayed at 87ms after
a reload.

In CI, with F36 fixed, **the prompt arrived in 38 milliseconds** and all 133
functional tests passed. On `main`, without F36 fixed, the same test failed at
33.9 seconds on the very next run. So the answer to "late or never" is neither:
once the click actually registers, the prompt is immediate, and the one-in-two
CI flake was F36. F29's slow-runner theory is now disproved by measurement
rather than merely withdrawn.

That leaves this finding's own claim narrower and still true: an unbounded
lookup **could** withhold work indefinitely, was reachable by a stalled network
rather than a slow one, and no longer can.

### Residual, logged not fixed

If the lookup is slow **and** an older local copy exists **and** the person
restores it before the server answers, the canvas resumes from the older copy,
and their next edit will eventually overwrite the newer server copy on the 25
second sync debounce. Restoring itself does not overwrite it (`flushServerSync`
only fires when a sync is already pending, and hydrating does not schedule one),
so this needs a real edit to bite. Properly fixing it means merging two
divergent drafts rather than last-writer-wins, which is a larger change than this
one and wants its own decision about what a teacher should be shown. Narrow: it
needs two devices, a stalled lookup and a restore inside a 4 second window.

## F29 · A restore prompt that needs three round trips, against a ten-second budget · Low → **Withdrawn (wrong diagnosis; see F34)**

**Kept deliberately.** This was the wrong reading of the F34 symptom, and the
reasoning below is preserved unedited because it is a good example of an argument
that is careful, self-aware about how it looks, and still wrong. The claim it
never tested is the one that mattered: that the prompt arrives *at all*.

Written up on 2026-08-17. The row existed in the table above with no section
under it, unlike every other finding, so this is that section rather than a new
discovery.

`tests/e2e/drafts.spec.ts` reopens the template editor after a reload and waits
for the "restore your unsaved work" dialog. The prompt cannot appear until the
canvas has done three things in order: purged expired drafts from IndexedDB,
read the local draft back, and completed a Server Action round trip for the
cross-device copy (`DrawingCanvas`: `purgeExpired`, then
`Promise.all([loadDraft, serverLoadDraft])`). On a cold CI runner that last step
is also the first compile of that action. The sequence exceeded Playwright's
ten-second default assertion budget twice in one day, once on `main` and once on
an unrelated pull request, while passing locally every time.

The assertion now names that precondition in a comment and allows thirty
seconds.

**Why this is written down rather than shrugged at.** Raising a timeout is the
classic way to make a flaky test pass while hiding a real defect, and a reader
finding `timeout: 30_000` in a diff is right to be suspicious. The distinction
worth holding on to: this wait is not padding around an unknown, it is a budget
sized to a named sequence of three operations that a fast local machine hides.
The assertion still fails if the prompt never arrives, which is the thing the
test is for, and a failure at *this* budget is a genuine defect in draft restore
rather than a slow runner.

**Not a product defect, and no user is waiting thirty seconds for anything.**
The three steps are fast in production, where the Server Action is already
compiled. It is a test-timing finding, which is why it is Low.

## F30 · Mail failures are visible, and nothing announces them · Medium → Open

PR5 makes mail health readable at `/ops/mail`. Reading it requires somebody to
look, and nobody is watching at 4am.

Brief 05 asks for a failure alert (five in sixty minutes, or a twenty per cent
ratio) and a silence alert. Neither is built, for two reasons stated rather than
skipped over.

**The hour is not expressible.** A `MailCounter` row is keyed by UTC day, so the
finest window the data supports is a day. The screen says its ratio is a daily
figure rather than implying otherwise.

**There is no channel.** Decision D13 was answered on 2026-08-17 by taking the
default: no external monitor. And an alert about mail delivery, delivered by the
mail provider that is failing, to an address behind Porkbun forwarding, is not
an alert.

The screen says in words that nothing here will tell you it has gone wrong,
which is the honest interim. Closing this needs a channel first, then hourly
buckets, then thresholds, in that order.

## F31 · The suppression check runs only when somebody remembers · Medium → Open

`npm run mail:suppression-sync` exists, is idempotent, and writes a `JobRun`
every time including on failure. Nothing runs it.

Until it is scheduled, `MailSuppression` is a snapshot of whenever it was last
invoked by hand. A parent who started bouncing this morning reads as "not
refused", which is the wrong answer to the one support question the table
exists to answer.

The screen does not paper over this: it renders the age of the last run in words
and says "Never" when there has not been one.

Scheduling it is blocked on an unresolved Railway question from brief 05: a cron
service starts the service's start command in a new instance, and Railway will
not mount one volume twice. So the choice between an in-app scheduler and a cron
service calling an authenticated endpoint has to be made before this can close.

**Update, 2026-08-23.** The choice was made — an in-app scheduler, because the
volume is mounted to the web service only — and it is built
(`src/instrumentation-node.ts`). Its first version gated on credentials rather
than environment and called the live Mailjet account from the test suite; see
**F43**, which is the more important entry of the two. **F31 stays open** until
`MAIL_SUPPRESSION_SYNC=1` is set on the Railway web service: the scheduler now
refuses to run anywhere that variable is absent, which is currently everywhere.

**And the by-hand route had never worked either, which is the part this entry
was missing.** Everything above rests on "somebody runs it by hand" being
available. It was not. The documented command, in this file and in the script's
own header, was `railway run npm run mail:suppression-sync`, and that could not
have worked at any point in F31's life: the CLI wrapper opens its own
`PrismaClient`, and `railway run` executes on the operator's own machine, where
`file:/data/prod.db` — a path on the Railway volume — does not exist. It fails
with SQLite error 14. Corrected to `railway ssh` on 2026-08-23; the whole story
is **F44**.

So the honest reading of this entry is worse than it said and better than it
sounds. Worse: for its entire life F31 had no mitigation at all, only the
appearance of one, because the fallback it named was a command nobody had run
and nobody could have run. Better: unless the sync was invoked some other way,
production's `MailSuppression` is *empty* rather than *stale*, and `/ops/mail`
has been reading "Never" — which is the true answer, plainly stated, rather than
an old date being mistaken for a current one. The screen was right the whole
time. **A mitigation nobody has ever executed is not a mitigation**, and that is
the same lesson as F44, arrived at from the other end.
## F32 · The operator loses the whole nav in forced colours · Medium → Fixed on the operator bar; the wider sweep is still open

Found by PR6's accessibility spec, which is why its forced-colours scan is
scoped to `main` rather than the whole page: widening it back is the assertion
that this is closed.

`src/app/ops/shell.tsx` paints the operator bar with inline colours,
`background: var(--ink)` with `color: var(--paper)` on the wordmark, four nav
links and the sign-out button. With `forcedColors: "active"`, axe reports a
serious `color-contrast` failure on all six. Nothing anywhere in `src/` handles
`forced-colors` at all.

**Why this one matters more than its severity suggests.** The person affected is
the operator, and there is exactly one operator account, and it is the account
that runs the service for every school. Losing the nav and the sign-out button
in high contrast is not a cosmetic problem for that person; it is the difference
between being able to work and not.

It is scoped to the ops area here because that is where it was found. The same
inline-colour pattern is likely elsewhere in the product, which is worth a sweep
rather than a spot fix: children with low vision use the child surfaces.

**Fixed on the operator bar, 2026-08-23** (commit `6b5109b`, "Keep the
operator's navigation visible in forced colours"). `src/app/ops/shell.module.css`
overrides the inline bar colours with the `Canvas` / `LinkText` / `ButtonText`
system-colour keywords under `@media (forced-colors: active)`.

**And the assertion this entry asked for has been made.** The paragraph at the
top said the forced-colours scan was scoped to `main` *because* of this defect,
and that "widening it back is the assertion that this is closed". It has been
widened: `ops-health-a11y.spec.ts` now runs the forced-colours pass over the
whole page with no `within` scope, so the bar regressing turns a blocking gate
red. That is the half that keeps it fixed, and it is why this counts as closed on
the operator surface rather than merely patched.

**The sweep is still open, and this entry is deliberately not closed outright
because of it.** Checked on 2026-08-23: `forced-colors` appears in exactly one
file in the whole of `src/`, the operator shell's own CSS module. Forty-six files
under `src/app/student`, `src/app/teacher` and `src/components` paint with inline
`style={{ … }}`, and none of them has been assessed in forced colours. The
sentence above — *children with low vision use the child surfaces* — is still
true and still unanswered, and it is the half with more people behind it than the
half that has been fixed.

Status is therefore written as "fixed on the operator bar; the wider sweep is
still open" rather than as Fixed. Closing it on the operator fix alone would
retire the finding that carries the child-surface question, and nothing else in
this file is currently asking it.

## F33 · railway.json pinned a builder the service no longer uses · Medium → Fixed

`railway.json` carried `"build": { "builder": "NIXPACKS" }` while the live
service runs **RAILPACK**, confirmed by reading the deployed service config on
2026-08-17 (`docs/ops-facts.md` 9.4).

Railway's documentation states that configuration defined in code always
overrides values set in the dashboard. So the next deploy would have moved the
builder backwards onto the deprecated one, silently.

That next deploy is not an ordinary one: it is also the first deploy to apply
`healthcheckPath` and the first to run the migration baseline. Three unfamiliar
things at once, one of them an unnoticed builder change, is how a bad afternoon
starts.

**Fixed** by deleting the `build` block entirely rather than setting it to
RAILPACK, so the service keeps using whatever Railway selects and the repository
stops asserting a fact it was wrong about.
## F35 · Backups exist now, and the written evidence points at the United States · High → Open
Raised 2026-08-17, the same day backups were switched on, because turning them
on created this question rather than answering it.

The owner upgraded to Railway Pro and enabled daily and weekly volume backups.
That closes the far worse problem, which was three documents telling schools
there were backups when there were none. It opens this one.

**A volume backup is a complete second copy of every child's photograph, drawing
and voice note.** `SAFEGUARDING.md` rule 10 says all personal data, including
backups, is stored and processed in the UK or EU, and `docs/DPIA.md` and the
privacy notice repeat it. Railway's backups documentation describes the
schedule, the pricing and the restore procedure, and says nothing at all about
where the snapshots live. The service runs in `europe-west4` (Amsterdam), but a
backup is not obliged to sit in the same region as the volume it came from, and
assuming it does is exactly the kind of inference this programme has repeatedly
found to be wrong.

**What was done in the meantime:** the claim that backups stay in Amsterdam has
been removed from `RETENTION.md` rather than restated. Saying nothing is honest;
repeating an unverified claim about children's data is not.

**What closes this:** a written answer from Railway support naming the region,
recorded in `RETENTION.md` and in the DPIA sub-processor entry. If the answer is
that backups may leave the UK and EU, that is not a documentation update. It is
a rule 10 problem needing either a different destination (option B in
`docs/ops-backup-options.md`, an EU object store under our own control) or an
explicit recorded owner decision, with the schools told.

### Raised to High on 2026-08-17, because this is no longer an unknown

The owner's understanding was that backups are held in Europe. That was checked
against Railway's own published terms before anything was written into a
document a school reads, and the terms say close to the opposite.

Railway's Data Processing Agreement (`railway.com/legal/dpa`) states:

> Customer acknowledges that Company's primary processing operations take place
> in the United States and that the transfer of Personal Data to the United
> States is necessary for the provision of the Services to Customer.

The same document's security measures describe backups as taken "across
multiple sites and regions" and name none of them. Local data residency is
offered only as an option Railway "may provide" to paid customers, with no
region identified. The sub-processor list at `trust.railway.com` names five
vendors and gives a location for none of them.

**So the position has changed from "nobody knows" to "the only written evidence
available points to the United States, against a rule that promises the UK or
EU".** Nothing here is proof about volume snapshots specifically, which is
precisely the gap: the residency question has an answer in Railway's paperwork
for processing generally, and no answer at all for backups particularly.

**Do not resolve this by inference in either direction.** The service running in
`europe-west4` is not evidence that its snapshots do, and the DPA's US clause is
not proof that they do not. Both are inferences about a different thing than the
one being asked. The only thing that closes it is Railway answering the direct
question in writing: *for volume backups on this service, in which country or
region are the snapshots stored?*

## F36 · Every post-reload click raced hydration · Medium → Fixed

Found on 2026-08-17 while reviewing the F34 fix, which is the only reason it was
found at all: F34 shipped a test that forced a stalled network, and that test
went red in CI.

The first reading was that the fix did not work. It was reproduced instead: a
worktree of its own, its own port, its own database, cold. It failed there every
single time, at the line *before* the one the fix is about.

```
> 212 |   await expect(page.locator("canvas")).toBeVisible();
      Error: element(s) not found
```

The page snapshot at that moment still showed the "🎨 Build a template or quiz"
button, and no canvas. The click had been reported as successful and had done
nothing.

**The defect.** After `page.reload()` the markup returns almost immediately and
the JavaScript does not. Playwright's actionability checks are all satisfied by
server-rendered HTML: the button is visible, enabled and stable while React has
not yet attached its `onClick`. A click in that window is swallowed in complete
silence, and the test then fails on whatever the click should have produced,
one line later, wearing the costume of a product bug.

Inserting a six second sleep in that spot made the test pass, which is what
identified the cause. The sleep was then removed, because a fixed sleep races
the same unknown it is covering up and this repository has already paid for that
lesson once (`waitForDraftSaved`, same file).

**The fix.** `clickHydrated` in `tests/e2e/helpers.ts` waits for React's own
signal: on hydrating a node React stores its props on the DOM element under a
`__reactProps$…` key, so the presence of that key is the element saying its
handlers are live. It is a React internal, and it is still the honest choice
here, because it waits for the actual precondition rather than for a guess at
how long the precondition takes.

Both post-reload click sites in `drafts.spec.ts` now use it, including the one
in the *original* test, which had the identical race and is the test that was
failing about one run in two.

**Measured, not argued.** On 18 August 2026 an instrumented run settled what two
sessions had guessed at. In CI with this fixed, the restore prompt appears **38
milliseconds** after the click and all 133 functional tests pass. On `main`
without it, the same test failed at 33.9 seconds on the next run. Three other
candidate causes were eliminated first, each with evidence: CPU throttling to
4x, 8x and 20x changed nothing, and nor did a cold server. The throttle was
verified to be real and to survive a reload before those negatives were trusted,
because an unconnected knob would have produced identical numbers.

That also rehabilitates F29 as a question and then closes it. Its slow-runner
theory was withdrawn because a 30-second budget still failed at 33.9 seconds,
which this finding explains: the click never registered, so no budget would ever
have helped. The theory was not wrong about timing being involved; it was
looking at the wrong clock.

**Not a product defect.** A real person cannot click faster than their own page
hydrates often enough for this to matter, and if they do the click simply does
nothing and they click again. It is logged because it burned a day's diagnosis
across two sessions while masquerading as two different product faults.

## F37 · The child touch-target gate stopped at the edge of the canvas · High → Fixed

Found on 2026-08-18 by the user-tester team's first run — by Nell, aged six, on
a classroom tablet, trying to draw something and put it in her jar
(`tests/battery/personas/children.spec.ts`).

`a11y/child-touch-targets.spec.ts` is a **blocking** gate, and it is a good one:
it sweeps whole pages rather than naming buttons, so a control added tomorrow is
covered without anyone remembering to update a list. It exists because three
child controls shipped at 44px in one week, including the read-aloud buttons —
the affordance *for* the pre-readers rule 18 is written to protect.

It sweeps the class-code screen, the name picker, a child's jar, and
`/student/new/photo`, `/words` and `/audio`.

It does not sweep `/student/new/drawing`, and it does not sweep an activity
response. Those are the two full-screen canvases: the surface a child is on for
most of their time in this product, and the densest set of controls in it.
Measured at 1024×768, the classroom iPad these screens are designed for:

| Control | Size | Floor |
| --- | --- | --- |
| Pen, felt tip, highlighter, eraser, text | 44×44 | 64 |
| Undo, redo, clear page, close | 44×44 | 64 |
| Done (✓) and ＋ (add a picture or shape) | 56×56 | 64 |
| Colour slider | **24** wide | 64 |
| Line thickness | 36×36 | 64 |

**And it is not only the canvases.** The gate's "a child's jar" case signs in as
a KS1 child at 1024×768. The EYFS register renders a different shell entirely
(`EyfsHome`), for the youngest children in the product, and nothing measures it:
on a tablet held portrait, which is how a Reception child holds one, its three
buttons — Start, "Send a heart back", "Bye bye" — are **56px** tall. The quiz
answer buttons a pre-reader taps inside an activity are 57px.

The pattern is the one F18 should have taught us and did not: a gate whose name
says "child touch targets" while the busiest child-facing screen sits outside
its list of URLs. F18 was hidden by a baseline; this is hidden by a page list.
Both read, from outside, as "covered".

**The fix (19 August 2026), decided by the product owner: grow the target, keep
the icon.** Every control listed above now measures at least 64px as a box while
the glyph inside it is untouched — the pen a child sees is the same pen, drawn
in a wider button; the line-thickness dial is still a 36px circle inside a 64px
press; the rainbow slider is still 24px of colour, centred in a 64px column. The
alternative (making the icons themselves bigger) was rejected because it spends
the drawing area to buy the same hit rate.

Two of these were not padding at all, and they are the interesting ones:

- **The quiz answers a pre-reader taps** were already written as `minHeight:
  px(64)`. `px()` converts MODEL units to display units by the canvas's scale, so
  at k≈0.9 that "64" reached the child as 57 real pixels. A floor expressed in
  the wrong coordinate space is not a floor. There is now a `touch()` helper —
  `px()` with a hard floor at the real 64 — and the answer buttons use it.
- **The page thumbnails** were 57px tall because their column was 96px wide and
  the tiles are 10:7. The column is 112px now; nothing else moved.

**And the gate was widened, which is the half that keeps it fixed.**
`a11y/child-touch-targets.spec.ts` — blocking — now sweeps the drawing canvas,
an activity response and the EYFS jar alongside the screens it already covered,
and its sweep counts `[role="button"]` and `[role="slider"]` so a control that is
not a `<button>` (the colour slider) cannot slip through the way it did here.

## F38 · The teacher writes the child a note, and the child never sees it · Medium → Fixed

Found on 2026-08-18 by two of the user testers independently: Wren, aged ten,
looking for what his teacher wanted changed, and Mr Reeves, who had just written
it (`tests/battery/personas/children.spec.ts`,
`personas/teacher-activities.spec.ts`).

`returnItem` stores the teacher's words on the moment as `teacherNote`, and the
approval queue asks for them with a placeholder that models a good one: *"A kind
note — e.g. 'Lovely! Can you add a label to your diagram?'"*.

The child gets a strip with a luggage tag and a fixed sentence from
`studentCopy` — "Have another go" — and, for an activity, a link back into it.
Nothing on `/student` renders `teacherNote`. The only component that does,
`JournalItemCard`, is used on exactly one screen: `/teacher/students/[id]`, the
teacher's own view.

So the loop the product asks a teacher to complete stops one step short of the
person it was written for. The teacher types what to change; the child is told
only that something came back, and has to guess, or ask — which is the classroom
time this product is meant to give back.

**The fix (19 August 2026).** The note now appears in both places a child looks:
on the returned-work strip on their jar, and again at the top of the work when
they reopen it. In all three registers — including EYFS, which previously showed
a returned piece nowhere at all, so a four-year-old had neither the note nor a
route back into the activity. One component (`student/TeacherNote.tsx`) renders
it everywhere, so the two places cannot drift.

**The read-aloud decision, which is the part that needed one.** A teacher's note
is free text written by an adult, and `readAloud` speaks only Storyjar's fixed
copy for a reason that is not editorial: on some platforms `speechSynthesis`
ships the text to a cloud voice service, and sending a teacher's words about a
named child to a third party with no DPA is what rules 10 and 11 forbid.

So the listen button uses a different mechanism. `readAloudOnDevice` selects a
voice the platform reports as **local** (`SpeechSynthesisVoice.localService ===
true`) and speaks with that voice explicitly; where the device offers none, the
button is not rendered and the note stays as text beside a teacher. An
implementation that does not report `localService` counts as remote and says
nothing — deny by default, rule 8. Nothing ever speaks unprompted (WCAG 1.4.2).
Recorded as an amendment in `SAFEGUARDING.md`.

Three things made this worth logging rather than shrugging at:

1. It is the assessment loop. Returning work with feedback is the difference
   between a portfolio and a marking pile, and it is what the queue's own copy
   invites the teacher to do.
2. It is invisible from the teacher's side. Mr Reeves can see his note on the
   child's journal page, so nothing tells him it never arrived.
3. It was a **safeguarding-adjacent** decision rather than a one-line render,
   which is why it waited for the owner: whether the note appears on the jar or
   only inside the work, whether a pre-reader hears it, and whether the EYFS
   register gets returned work at all. All three were answered above.

## F39 · The sign-up wizard kept the surnames · High → Fixed

Found on 2026-08-18 by the user-tester team's first run, in Ms Blake's first
twenty minutes (`tests/battery/personas/teacher-first-day.spec.ts`). She did
what every teacher does: pasted her register in, as it comes out of the office
system, with surnames on it.

**What is stored.** Verified against the database after that run:

```
6W3TSN | Sparrows | EYFS | Ali Hassan,Bea Turner,Callum Reid,Daisy Okon | blake.…@newschool.test
```

**The two paths, and why only one of them is right.**

`addStudents` (`src/app/actions/roster.ts`) — the "＋ Add pupil" paste inside the
app — runs every entry through `deriveChildNames`, which exists for exactly this
and says so in its own header: *"Storyjar stores a child's FIRST NAME only —
never a surname (SAFEGUARDING.md rule 2, data minimisation)."* It drops the
surname and adds back only the shortest prefix needed to tell two Olivias apart.

`createTeacherAccount` (`src/app/actions/auth.ts`) — step 4 of the wizard, the
**first** class list a teacher ever types — does this instead:

```ts
const child = raw.trim();
…
children.push(child);
```

Trim, de-duplicate, store. `deriveChildNames` is not imported.

**Why it matters more than a tidy-up.** SAFEGUARDING rule 2 is written as a hard
limit under UK GDPR Art. 5(1)(c), not a preference. And these names are not
buried in a settings page: `Student.name` is the label on the name cards at
`/login/student?code=…`, the screen a whole class looks at, on a code that is
written on the board and shared with children. A surname pasted on day one is
displayed to every child in the room and to anybody who has the code.

The wizard's own copy makes this worse rather than better: the field is labelled
**"First names"**, the placeholder shows four first names, and the validation
message says *"Add at least one first name to get started."* A teacher who
pastes a full register is told, in three places, that this is a first-names
field, and is given no indication that the product has kept what they pasted —
while the same paste made ten minutes later, inside the app, is silently
corrected.

**The fix (19 August 2026).** `createTeacherAccount` calls `deriveChildNames`,
the same function the roster's paste path uses. The "disambiguate against the
existing roster" question that made this more than a one-line import answers
itself at signup: there is no existing roster, because the class is created from
this very list, so it is called with no existing names and two Olivias in the
first paste are separated against each other exactly as they would be later.

**And the teacher is told.** The wizard now shows what will be stored — "Stored
as first names only: Ali, Bea, Callum" — but only when the paste actually
contains surnames, because a list of plain first names previewing as itself is
noise. That was the product owner's call over the two alternatives: stripping
silently (consistent with the roster, but a teacher who pasted thirty full names
is never told the surnames went) and refusing the paste outright (explicit, but
it hands a thirty-line editing job to somebody in their first five minutes).

## How the battery encodes fixed findings

- **F1, F3** repro tests were promoted from the findings project into the
  **blocking** `security` gate, so a regression re-breaks the build.
- **F2, F6** stay in the report-only `findings` project because they trip real
  15-minute rate-limit blocks in the shared dev server that would contaminate
  sibling tests in a gating run.
- **F11** keeps a *reduced* tracked baseline in the blocking `a11y` gate: new
  serious/critical violations block; the residual brand-badge contrast is
  counted and reported until the palette is finalised.
- **F37, F38, F39** were opened on 18 August 2026 with their repros in the
  report-only `findings` project, asserting the behaviour that *should* exist so
  each failed on purpose. That was deliberate: a blocking gate that goes red on a
  defect nobody has yet decided how to fix turns `main` red for everyone and gets
  weakened within the week. They were fixed on 19 August once the owner had
  answered the three questions they turned on, and each repro then **moved into a
  blocking suite** — F37 into `a11y/child-touch-targets.spec.ts`, F38 into
  `e2e/journal.spec.ts`, F39 into `e2e/auth.spec.ts` — which is what stops them
  coming back. Nothing is left in `findings/` for them.
- Everything else is guarded by an ordinary passing test in its suite.

## F40 · One failing test in the e2e suite takes eleven more down with it · Medium → Open

*(Logged as F38 on the toolbox branch, renumbered on merge: `main` had already
taken F37–F39 for the user-tester findings. The duplicate F37 that branch
carried — the canvas touch targets — was the same defect as `main`'s F37, found
independently a day later, and has been deleted rather than kept twice. What it
said that `main`'s does not is now F41, below.)*

Found on 2026-08-19, while establishing whether a red suite was caused by the
toolbox work. It was not — the same failures reproduce on `main` — but working
that out surfaced something worth recording.

The suite has **no per-test draft cleanup**. When a test dies inside the template
builder, the local-first draft it was midway through writing survives. Every
later test that opens the builder is then met with the "restore your draft?"
modal, which is `aria-modal` and intercepts pointer events, so the next click
times out:

```
- <div role="dialog" aria-modal="true" aria-labelledby="draft-restore-title" …>
  intercepts pointer events
```

The failure it reports has nothing to do with what it was testing. Observed
concretely: `object-toolbar.spec.ts:6` leaves a draft, and
`object-toolbar.spec.ts:56` then fails inside the same file — on `main`, with no
changes applied, in isolation. In a full run this is worth eleven extra red
tests, which is how a single broken PDF renderer presented as a suite-wide
collapse.

Two things follow. The first is diagnostic cost: a red suite that names twelve
specs when one thing is broken is a suite people stop reading. The second is that
`globalSetup` reseeds the database once per RUN, not per test, so state written
mid-suite is shared by everything after it — drafts are simply the first place
that has bitten.

**To close this.** Clear drafts (local storage and the `Draft` table) between
tests — an `afterEach` in a shared fixture rather than a line remembered in each
spec. Worth checking at the same time whether the restore modal should be
dismissible by pressing Escape, since a modal that can only be answered is also
a modal that can only block.

## F41 · The gate cannot see the controls that only appear once you tap something · Medium → Fixed

Found on 2026-08-19, immediately after F37 was fixed. F37 grew every control on
the drawing canvas to the 64px child floor and — the part that matters — added
`/student/new/drawing` to the blocking sweep so it cannot drift back.

The sweep loads that page and measures what is on it. Nothing is selected, so a
whole class of controls is not on it: the chrome that appears **around an object
once a child taps it**.

| Control | Size when found | Now |
| --- | --- | --- |
| Resize handle | 20×20 | **64×64 press, 20px dot** |
| Turn handle | 20×20 | **64×64 press, 20px dot** |
| Delete (✕) | 24×24 | **64×64 press, 28px dot** |
| Add / edit label (✏) | 24×24 | **64×64 press, 28px dot** |

These are the controls a child uses to *arrange* their work rather than to draw
it, and moving a counter into place is most of what an apparatus worksheet asks
of them. F37's own lesson — "a page list is exactly as good as the pages on it"
— has a sibling: **a page sweep is exactly as good as the states it visits.**

**Why this is not just "grow them too".** A counter is 120 model units, about
90px on a classroom iPad. Four 64px handles on a 90px shape would cover the
shape entirely and overlap each other. Growing them needs a design answer, not a
number: handles outside the shape's bounds, or a long-press menu, or handles
that scale with the object down to a floor. That is a real decision and it is
the owner's, which is why this is logged rather than guessed at.

**Fixed on 2026-08-20, by the owner's decision.** The affordance is a **small
visible dot inside a 64px press** — the pattern the text box's resize handle
already used — at all four corners: edit top-left, delete top-right, turn
bottom-left, resize bottom-right, the same on a shape and on a text box. That is
what answers the objection above: the dot is what a 90px counter can carry
without being buried, and the press is what a five-year-old can actually hit, so
nothing had to be grown into something that covers its own shape. All four now
live in one component (`ObjectCorners`), so the two object types cannot drift
apart again.

**And the sweep now visits the selected state**, which is the half of this
finding that keeps it fixed: `child-touch-targets.spec.ts` places a shape, taps
it, measures; then places a text box, taps it, and measures again. Watched fail
before watched pass — with the press shrunk back to 24px it names all four
controls on both object types.

## F42 · A child can write, but cannot get back into what they wrote · Medium → Fixed

Found on 2026-08-19 while reading a red gate rather than a screen, which is the
only reason it was found at all: `tests/e2e/text.spec.ts` fails on `main` at
"re-edit via the ✎ button", and the button is genuinely not there.

A text box on the canvas has exactly one way back into it: **double-click**.
`TextObjectView` wires `onDoubleClick` and nothing else. A shape still carries a
corner ✎ (`aria-label="Edit text"`, 24×24), so the two object types disagree,
and the one that is *made of words* is the one with no visible way in.

Double-tap is the wrong affordance here twice over. It is invisible — nothing on
screen says the box can be reopened — and on a classroom iPad a three-year-old's
second tap is frequently not read as a double-tap at all. A child who mistypes
their sentence has to delete it and start again.

**Why this is not just "add the ✎ back".** The shape's ✎ is 24×24 against a 64px
child floor, so copying it onto text objects would ship a fifth control below the
floor — see **F41**, which logs those four and explains why growing them needs a
design answer rather than a number. `TextObjectView`'s own comment says edit and
delete now live "in the floating toolbar at 64px", but `ObjectToolbar` has no
edit control: order, padlock, duplicate, style, and that is all. So the intended
home for this affordance exists and is empty.

**Fixed on 2026-08-20, by the owner's decision: a text box gets the same four
controls a shape has, in the same places** — edit top-left, delete top-right,
turn bottom-left, resize bottom-right, each a 64px press (see F41, fixed by the
same change). Double-click still opens the words, because it is quicker once you
know it; it is simply no longer the only way, and the pencil is a real `button`,
so re-editing text is reachable from a keyboard for the first time (WCAG 2.2
**2.1.1**, Level A). `tests/e2e/text.spec.ts` finds it by its accessible name and
was already in the blocking e2e suite, so the repro stays where it is.

**Two more holes closed by the same decision, both found while fixing this:**

*A text box could not be deleted at all.* `TextObjectView` rendered a resize
handle and nothing else, and its own comment claimed delete had "moved to the
floating toolbar" — a toolbar that never had one. A child who placed a text box
could not remove it. It now has the same ✕ a shape has.

*A text box could not be turned.* That one needed more than a button: `TextObj`
had no `rot` at all. It now carries the same field, wrapped by the same
`normaliseRotation` a shape's goes through, and the **export renderer turns the
text the same way the screen does** — about a centre measured from the same font
at the same size, because a text box has no stored width or height; its size is
its words. Without that mirror a child would turn their label on screen and find
it straight in their hand-in.

## F43 · A scheduler asked "have I got the keys?" when it meant "am I allowed?" · High → Fixed

Found on 2026-08-22 by a red gate, and only because the fixture it corrupted was
built to be corrupted noticeably. `security/ops-mail.spec.ts` asserts that an
adult record reads **"Mailjet is not refusing this address"** for
`demo-parent@storyjar.co.uk`, whose whole job in `prisma/seed-test.ts` is to be
the clear half of a pair — the seed says so in a comment, "deliberately NOT here,
so the two adult records read differently and neither sentence can be the
component's only output". It read "Bounced" instead. The address really is
bouncing, in the real world, on the real Mailjet account.

**What happened.** F31's fix — an in-app scheduler, `registerNode()` in
`src/instrumentation-node.ts` — scheduled unconditionally, five seconds after
every server start. `runMailSuppressionSync` then checked three things:
`MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAIL_HMAC_KEY`. All three were
present in the battery. The first two come from `.env`, which holds the real
production Mailjet credentials because the mailer needs them locally and because
running the sync by hand against production was documented as `railway run` (a
wrapper that could never have worked for it either — see F44). The third is set by
`playwright.battery.config.ts` on purpose, so that PR5's suppression behaviour
exists to be tested at all.

So every battery lane — three dev servers, three times a run — issued a `GET` to
`api.mailjet.com/v3/REST/message` for the production account's last 30 days and
upserted what came back into its own `dev-shard-N.db`. Other people's bounced
mail, HMAC-keyed but real, written into a test database by a test run.

**The class of mistake, which is the part worth keeping.** The check read like a
guard and was not one. *Credentials answer "could this call be made?" They say
nothing about "should this process, on this machine, right now, be the one
making it."* Every machine in this project holds the production mail keys: the
developer's laptop, the test runner, any script anybody writes. Gating on their
presence gates on nothing. The question a scheduler has to answer is about its
**environment**, not its capabilities, and the two look identical right up until
a test suite starts phoning a third party.

**It would have done the same in CI.** `.github/workflows/battery.yml` runs the
same lanes; whether it called out depended only on whether the runner had the
Mailjet secrets in scope. Nothing in the code would have stopped it, and nothing
in the output would have said it happened — the sync logs an outcome and a
count, never a destination. This was found by a fixture assertion, not by a
network alarm, and there was no network alarm to find it.

**Fixed on 2026-08-23. The guard is on the scheduler, not on the sync**, and
that division is deliberate: `scripts/mail-suppression-sync.ts` is a person
typing a command, and the typing *is* the consent. A guard inside
`runMailSuppressionSync` would have refused the one caller that never needed
permission. `registerNode()` now returns early, with its own log line for each,
unless both hold:

- `NODE_ENV === "production"` — the condition that protects the battery, because
  the lanes run `next dev` and so can never reach the call however the rest of
  the environment is set;
- `MAIL_SUPPRESSION_SYNC === "1"` — an operator kill switch that stops a
  misbehaving sync by unsetting a Railway variable rather than by shipping a
  deploy. Exactly `"1"`, the `OPS_ENABLED` convention, because a switch with
  several spellings gets turned on by accident with `=false`.

Both paths log `not scheduled: …`. A scheduler that declines in silence is
indistinguishable from one that is broken, and the next person wondering why the
suppression figures are stale needs something to read.

**Deployment note:** `MAIL_SUPPRESSION_SYNC=1` has to be set on the Railway web
service or F31 is still open in production — the scheduler is now correctly
refusing to run everywhere. It belongs in the same variable change as
`OPS_ENABLED=1` and `MAIL_HMAC_KEY`, so it is one deploy rather than three.

**Repro** (on the code before the fix):

1. Confirm the credentials are inherited, which is the whole premise:
   `node -e 'require("dotenv").config(); console.log(!!process.env.MAILJET_API_KEY)'`
   → `true`. There is no test-only value here; these are the production keys.
2. Start any battery lane: `npm run test:changed -- --all`, or just
   `MAIL_HMAC_KEY=battery-fixture-mail-hmac-key npm run dev`.
3. Wait five seconds past server start.
4. Watch the outbound call — `[mail-suppression-scheduler] SUCCESS: N suppressed
   address(es)` in the dev-server output, with `N` non-zero.
5. Count the damage: `MailSuppression` now holds rows whose `addressHmac` matches
   no seeded fixture. The two the seed writes are
   `HMAC(demo-parent-oakfield@storyjar.co.uk)` and
   `HMAC(someone-who-left@storyjar.test)` under
   `battery-fixture-mail-hmac-key`; anything else arrived from Mailjet.
6. The visible symptom: `npx playwright test -c playwright.battery.config.ts
   --project=security tests/battery/security/ops-mail.spec.ts` fails at "an adult
   record says whether Mailjet is refusing that address", reading "Bounced" for
   an address the seed left clear.

After the fix, step 4 prints `not scheduled: not a production build` and steps 5
and 6 find nothing to report.

**Blast radius, checked rather than assumed.** The pollution reached only the
per-lane `prisma/dev-shard-*.db` files, which `scripts/run-suites.mjs` deletes
between runs and which are gitignored. `prisma/dev.db` was verified clean — both
its suppression rows hash to seeded fixtures, and it holds zero
`MAIL_SUPPRESSION_SYNC` job runs, because a plain `npm run dev` has no
`MAIL_HMAC_KEY` and so never got past the third check. Nothing was committed:
no `.db` file is tracked, and the only one ever committed (a bare `dev.db` at the
repo root, `055c154`, deleted in `aca6aa8`) contains schema and no rows.

**The root cause underneath, which this fix does not close.** Local `.env` holds
live Mailjet credentials, so any code running on a developer's machine can reach
the production mail account by accident. The guard fixes this instance, not the
class. Running the sync inside the container (`railway ssh`) gives it the
production credentials without them touching anyone's disk, so the stronger fix
is to take `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` out of local `.env`
entirely. Worth
doing once launch week is over. **Until it is, the same shape of mistake is one
unguarded outbound call away, in any code path, not just this one.**

## F44 · The way back in had never been run · High → Fixed, and rehearsed 2026-08-23

Found on 2026-08-23 by the owner, not by a gate, in the way this class of defect
is always found: he tried to use it. Seeding the production operator account with
the command `docs/ops-recovery.md` and `docs/TEST_LOGINS.md` both give —
`railway run npx tsx scripts/seed-operator.ts you@example.com` — and got SQLite
error 14, "unable to open database file". No account was created.

**What happened.** `railway run` fetches the service's environment variables and
runs the command **on your own machine** with those variables set. That is the
right tool for a script that only needs a credential. It is the wrong tool for a
script that needs a *file*. `DATABASE_URL` is `file:/data/prod.db`, a path on the
Railway volume, and the volume is mounted in the container and nowhere else. The
variables travel; the file does not. Prisma dutifully opened the path it was
given, on a Mac where nothing is mounted at `/data`, and failed.

Five commands on the recovery page were affected, and they are not incidental
ones: clear the lockout, list the operator rows, delete the operator row, create
the replacement, read the audit trail. That is the entire break-glass procedure.
Two more copies of the seed command said the same thing (`docs/TEST_LOGINS.md`,
`docs/launch-triage.md` step 4, `docs/launch-batch-b.md`), and so did
`Context/CONTEXT.md`.

**The class of mistake.** *Documentation that has never been executed is not
documentation. It is a plan, and you find out it was wrong at the moment you
needed it to be right.* Every individual command here was rehearsed — on
2026-08-17, against a throwaway SQLite database, honestly and in detail, and the
rehearsal notes are still on the page because they are still true. What was never
run was the one word in front of them. The rehearsal covered the payload and
skipped the wrapper, which is precisely the half that depends on where the code
is standing.

**The page knew.** The "Rehearsal" section of `docs/ops-recovery.md` said, before
this fix:

> **Not yet rehearsed:** the `railway run` wrapper, against a real Railway
> environment. [...] So the commands are known to work against the same Prisma
> client and the same schema the service uses; the wrapper around them is not yet
> proved.

That is the finding, written down by the author, in the document, before the
event — and it shipped anyway. "Not yet proved" turned out to be too generous:
it could not have worked, for a reason already stated two sections earlier on the
same page (the database is a file on the volume). An unrehearsed step in a
recovery runbook is not a documentation debt to tidy up later. It is the runbook
being untrue, with the discovery deferred to the worst possible day.

**Why High rather than Low.** It is only prose, and prose is normally Low. Three
things move it up. It is the **only** way back into the service — there is
deliberately nothing in the repository that can mint an operator session
(handbook ruling R8), so this page is not one recovery option among several, it
is the whole set. It fails **exactly when it is needed**, which is the moment
somebody is locked out, probably alone, probably at speed. And it fails
**silently in advance**: nothing in CI, no gate and no test had any opinion about
it, so its being wrong generated no signal for as long as it existed. It is not
Critical because no child's data is at risk and nothing is destroyed by it — the
commands fail closed, and the correct wrapper existed the whole time.

**Fixed on 2026-08-23.** Every Prisma-touching command now runs inside the
container:

```bash
railway ssh
```

then the command at the container prompt. Given as two steps rather than
`railway ssh node -e "..."` on one line because the one-liners contain double
quotes and `$`, and putting them through two shells replaces a lockout with a
quoting exercise. `docs/ops-recovery.md` gained a section, **before the first
command rather than in a footnote**, saying why `railway run` cannot work here,
in the sentence a skimmer will still hit: *the variables come to your machine;
the file does not.*

**Two more instructions were wrong, found by checking rather than by being
told.** The brief that raised this named four mail scripts as safe to leave
alone. Two of them are not:

- `scripts/mail-suppression-sync.ts` — the CLI wrapper opens its **own**
  `PrismaClient` in `main()` before delegating to `runMailSuppressionSync`, so
  `railway run npm run mail:suppression-sync`, printed in the script's own header
  and repeated in F43 above, has never worked either. The documented way to run
  the suppression sync by hand against production has been broken for as long as
  it has been documented, which matters because F31 leaves the by-hand route as
  the only route until `MAIL_SUPPRESSION_SYNC=1` is set.
- `scripts/fix-demo-parent-address.mjs` — imports `PrismaClient` at module scope
  and updates a `Parent` row, and its own comment said "this script is run with
  `railway run` against production". It is a remediation script for a live
  bouncing address; it would have failed the same way.

The other two are genuinely fine and were left alone deliberately:
`scripts/verify-mail.ts` and `scripts/mail-events.mjs` never construct a
`PrismaClient`, never import `@/lib/db`, and reach nothing but `api.mailjet.com`
over HTTPS. They need the credential, not the file, so `railway run` is correct
for them and remains. **The test is not which command is newer. It is whether
what you are running needs the file on the volume.**

**What was verified rather than assumed.** That the container can actually run
these: the service's start command is `bash scripts/railway-start.sh`, which
itself runs `npx prisma migrate deploy` and reads `prisma/schema.prisma`, so both
`scripts/` and `prisma/` demonstrably exist in the running container and `npx`
works there; and `tsx` is in `dependencies` rather than `devDependencies`, so
`npx tsx` resolves locally and fetches nothing. `package.json` sets no
`"type": "module"`, so the `require()` in each `node -e` one-liner is valid.
`railway ssh` (CLI 5.41.2) takes the linked project, service and environment by
default, so the commands need no flags.

**Repro — and why there is no test.**

The repro is not a spec, and pretending otherwise would repeat the mistake this
finding is about. It is:

1. On a machine that is not the container, with the Railway project linked, run
   any of the old commands, for example `railway run node -e
   "const{PrismaClient}=require('@prisma/client');new
   PrismaClient().operator.findMany().then(console.log)"`.
2. Observe SQLite error 14, "unable to open database file". The environment
   variables are present and correct; the path they name does not exist locally.
3. Run `railway ssh`, then the same `node -e` at the container prompt. It answers.

**A static check was considered and is not proposed.** The mechanical rule would
be: no fenced `railway run` line in `docs/` may contain `PrismaClient`, `prisma`
or a `.ts` script that imports `@/lib/db`. It would have caught this exact
defect, it is perhaps thirty lines in the style of `scripts/audit-static.mjs`,
and it does not earn its keep. It gates one wrapper against one class of callee
in one directory; it would not have caught a wrong service name, a command
needing a flag the container does not have, or any of the other ways a runbook is
wrong. Worse, it would produce the feeling of coverage over exactly the surface
where that feeling did the damage — the page already carried a truthful warning
that it was unrehearsed, and the warning did not save it. A green check saying
"the runbook's wrappers are consistent" is a *weaker* signal than the sentence
that was already there and was ignored.

**The real remedy is a rehearsal, and it is Mark's hands, not an agent's.**
Nothing an agent can write proves a Railway command works; only running it does.
The rehearsal worth doing is small and carries no risk, and it is not the
destructive one:

- `railway ssh` reaches a shell on the running service;
- `ls` there shows `package.json`, `prisma/` and `scripts/`;
- the **read-only** command from situation 4 step 1 lists the operator rows.

That is three minutes and it proves the wrapper. Steps 2 and 3 of situation 4
delete and recreate the live operator account and stay unrehearsed by choice.
`docs/ops-recovery.md` now carries a dated line, and it distinguishes the cheap
rehearsal from the full break-glass one so that "unrehearsed" cannot again mean
two different things at once.

**REHEARSED 2026-08-23. IT PASSES.** The owner ran it against the production
service the same evening the documentation was corrected, so this finding is no
longer "fixed as documentation and unproven as a procedure" — the procedure has
been executed and it works. What was covered, in order:

- `railway ssh` reached a shell on the running service.
- The prompt starts in **`/app`**, with the repository present. The runbook's
  `cd /app` hedge was written as an assumption and is now a confirmed fact.
- It is the container and not the operator's own machine, checked deliberately
  rather than assumed: `/data` is mounted with `media/` and `media-shared/`, and
  the hostname is a container id. Worth doing, because a first `ls` can look
  enough like a local checkout to fool somebody in a hurry.
- The **read-only** command from situation 4 step 1 ran there and returned one
  operator row, `role: OWNER`, `status: ACTIVE`.

So the wrapper, the working directory, the availability of `node` and `npx`, and
Prisma's path to the file are all proved end to end. **This is the point of the
whole entry**: the defect was a capability nobody had ever exercised, and the
remedy was never a test — it was somebody exercising it. That has now happened.

**What is still unrehearsed, and deliberately so:** situation 4 steps 2 and 3,
which delete and recreate the live operator account. Those are not a gap to
close. Rehearsing them against production means deleting the live account to
watch what happens, and there is no non-production environment to do it in
(decision D12, still open).

**One thing the corrected runbook still cannot do**, now stated on the page
rather than discovered in the moment: `railway ssh` attaches to the *running*
deployment. A service that is crash-looping has nothing to attach to, so no
command on that page is available during the one failure mode where the app
itself is down. That is a real gap, it is not closable from this side, and it is
written down so the next person meets it in prose first.

## F45 · "In use" is a guess dressed as a fact · Low → Open

Found on 2026-08-23 by `safeguarding-reviewer`, reviewing the per-pupil export
(F4), and it turned out to be about a screen rather than the export.

A family place is labelled **"In use" / "Not used yet"** on a pupil's journal
page (`src/app/teacher/students/[studentId]/page.tsx`, `FamilyAccess.tsx`). The
label is derived as `sessions > 0 || email !== null`. Both halves are wrong.

**It says yes when it means nothing.** A parent who typed an address in and never
looked at the jar again has `email !== null`, so they read as "In use". The
address being on file is a different fact, and it is one the screen does not
otherwise show.

**It says no when it means yes.** `Parent.sessions` are per-signed-in-browser and
are purged within 7 days of expiry (`RETENTION.md`). A household that used the
jar every week last term and is signed out today reads as "Not used yet" — as
does one that used it this morning on a phone that has since been cleared. The
count means "has a live session right now", which is not the question the label
asks.

**Why Low.** It is staff-facing, it discloses nothing to anybody, and the wrong
answer costs a teacher a wasted conversation ("has the letter arrived?") rather
than any harm to a child.

**Why it is logged rather than fixed.** A truthful answer needs a
`lastSignInAt` column on `Parent`, written on session creation, with its own
`RETENTION.md` entry — a schema change, and one that records more about a
parent's behaviour than StoryJar currently keeps, which is a decision rather
than a patch. It is out of scope for the launch freeze.

**Why it matters more than its severity.** The per-pupil export copied this
heuristic before the review caught it. Fixing the export and leaving the screen
is how the mistake comes back: the next thing that wants to know "has this family
started using it" will read the same two columns and reach the same wrong answer.

## F46 · Editing a live quiz marks a class against two different papers · Medium → Open

Found on 2026-08-23 while building the edit-while-live warning (Batch B item 2).
**No fix is proposed for launch and none should be attempted in the freeze.**

`updateTemplate` (`src/app/actions/activities.ts:201-212`) pushes an edit onto
every LIVE run of a template, `quizSnapshotJson` included. That behaviour is
deliberate and right — a teacher who spots a wrong answer mid-lesson needs the
fix to reach the class in that lesson, not next term.

What nobody has reckoned with is the mark. `JournalItem.quizScore` is computed at
submit time against the snapshot as it stood at submit time, and `quizTotal` is,
in the schema's own words, "the number of questions in the assignment snapshot at
submit time". So:

- a child who answers at 10am is scored against the quiz as it was at 10am;
- the teacher adds a question, or fixes a `correctOptionId`, at 10:30;
- a child who answers at 11am is scored against a different paper;
- **both marks are stored as bare integers under the same activity title**, with
  nothing recording that the papers differed.

A teacher looking down the class list sees "3/4" and "3/5" and reads them as
comparable. They are not. Nothing in the data says so, and nothing in the UI
hints at it.

**Why Medium and not High.** It needs a teacher to edit a quiz while a class is
mid-run, which is uncommon, and it damages a *judgement about* a child's work
rather than the work itself — no child's moment is lost or altered, and nothing
reaches anybody it should not. It is above Low because assessment evidence is one
of the things StoryJar is for, and a mark that is quietly incomparable is worse
than a missing one: the school does not know to distrust it.

**What is done about it now.** Nothing to the data. The edit screen
(`src/app/teacher/activities/[id]/edit/page.tsx`) now names the classes working
on the activity and says in terms that "children who answer after you save are
answering a different question from the ones who answered before", and points at
Duplicate as the way to edit without touching a live run. That converts a silent
problem into an informed choice, which is the most a surfacing change can do.

**What a real fix looks like**, so the autumn does not start cold. Three shapes,
cheapest first:

1. **Stop pushing quiz edits onto runs with responses.** Narrow the `updateMany`
   to runs with no submitted work, and tell the teacher when a run is excluded.
   Cheapest, and it protects the mark — but it takes away the mid-lesson fix that
   the push exists for, which is a real loss.
2. **Version the snapshot.** Add a monotonic `quizVersion` to `Assignment`,
   stamp it onto each response, and show it wherever marks are listed. Honest,
   small schema change, and it makes the incomparability visible instead of
   preventing it.
3. **Re-score on edit.** Recompute stored scores for submitted responses against
   the new snapshot. Superficially tidy and probably wrong: it rewrites a record
   of what a child actually did, against a paper they never sat.

Option 2 is the one to cost first.

## F47 · The teaching assistant role gates nothing · Medium → Copy fixed, gap open

Found on 2026-08-23 by investigation (Batch B item 4), prompted by a persona
teaching assistant who wrote: *"Nothing says what a teaching assistant is allowed
to do. I found out by pressing things, which is exactly how somebody publishes the
wrong thing."*

**TEACHER and TA are byte-for-byte identical in behaviour.** Every access check in
the product asks one question — `staffRole === "ADMIN"` — at
`src/app/admin/page.tsx:14`, `src/app/actions/admin.ts:16`,
`src/app/actions/billing.ts:49`, `src/app/actions/classImport.ts:75` and
`src/app/teacher/layout.tsx:73`. The string `"TA"` appears six times in `src/`
and gates nothing: a badge colour, a submenu entry, a dropdown option, an input
allowlist, a type comment and an operator display string.

So a TA holding a class can approve work into a child's jar and out to their
family, send work back, delete a moment, rotate the class code, create family
access, print the sign-in letter, and export the class and any child in it.
Nothing about being a TA changes any of it.

**The access model itself is defensible.** Access follows the class you hold, not
your title, and somebody handed a class is being trusted with it. The defect is
that four surfaces implied otherwise: a Guide card titled "Change what a
colleague can do", a role picker sitting beside two controls that really do
change access, distinct badge colours per role, and `STAFF_ROLE_CHANGED` written
to the audit log — which `prisma/schema.prisma` describes as the record of
"safeguarding-relevant actions", so StoryJar audits a change that has no effect.

A head teacher who set their TA to "Teaching assistant" believed they had limited
her. They had not, and the thing they believed they had limited was the approval
queue.

**The second half is worse, and is why this is not merely a copy bug.**
`assignClassToStaff` (`src/app/actions/admin.ts:87`) does
`db.class.update({ data: { teacherId: staffId } })` — it *moves* the class.
`Class.teacherId` is singular, so a TA gets access to a class only by taking it
away from the teacher who runs it. StoryJar cannot express what every primary
school actually has: a TA who supports a class alongside its teacher. **The
missing thing is a relationship, not a label.**

**Why Medium.** No data is exposed to anyone who should not have it and no gate
is bypassed — the scoping is correct everywhere, which was checked rather than
assumed (the same persona reported that the approval queue "shows me children's
work but neither lets me act on it"; `src/app/teacher/queue/page.tsx:43` scopes
to `class: { teacherId: user.teacher.id }`, so her queue was empty and nothing of
anybody else's was ever reachable). It is above Low because the product made a
false statement about access to the person responsible for controlling it, and a
safeguarding control a school believes it has and does not have is worth more
than a cosmetic defect.

**Fixed on 2026-08-23 (option A — the words).** The Guide card is now "Record
what a colleague's job is", says plainly that Teacher and Teaching assistant
permit the same things and that only Admin changes what somebody can do, and is
followed by a second card saying what actually decides access — which classes
they hold, and that giving a class takes it from whoever held it. The role
submenu and the invite form say the same in one line each. The empty queue, the
empty class list and the empty dashboard now say "you have not been given a class
yet" instead of "All caught up ☕", which was the sentence that made a teaching
assistant think the screen was broken.

**Still open: the gap.** Making TA mean something is a change to the approval
queue and needs the DPO, and it is only meaningful once a TA can be *on* a class
without owning it — so it belongs with the many-to-many staff-to-class change
rather than before it. Autumn term, together.


## F48 · The badge answers a question she did not ask · Low → Open, deferred to the autumn

Opened 2026-08-23 while building the Admin Billing email health badge (Batch B
item 6). Proposed by `teacher-lead`, who was right that it is derivable and right
that it is the question that matters; deferred on the reasoning below, which is
`platform-lead`'s. Nothing here is broken. What is here is a gap between the
question a school business manager asks and the question StoryJar can answer.

**The question she asks.** She is the person parents ring when a sign-in link
does not arrive. What she wants to know is "are *my* families getting our
emails". What the shipped badge tells her is whether StoryJar's email is working
across every school at once.

**Why the shipped badge cannot do better.** `MailCounter` is keyed
`[day, templateKey, outcome, statusClass]` and holds a count. No school, no
recipient, not even a domain. That is deliberate and it is not going to change:
F6 requires `requestMagicLink` to answer identically for an address on file and
one that is not, so a per-send record inside the product rebuilds the very
enumeration signal the public family form is careful not to give. **Adding a
school dimension to `MailCounter` is therefore a safeguarding change and not a
schema convenience, and should be argued on those terms if it is ever argued.**
The badge says so on screen — `scopeNote` is a rendered field rather than a
comment, so it cannot be dropped by whoever rebuilds the card.

**But a per-school answer IS derivable, from the other table.** Not by adding a
column. `MailSuppression` is keyed by an HMAC of the address, and the model's own
comment blesses the direction that works: you may ask "is THIS address, which I
already hold, being refused". So: walk the school's own adults, hash each under
`MAIL_HMAC_KEY`, look each up. That never enumerates the suppression list and
never reverses a hash. It counts refusals among addresses the school already has.

**Three reasons it is not being built this week, in the order that decided it.**

1. **The version she can act on names a parent, and that needs sign-off.**
   "3 of your 40 families are being refused" stops one question short of useful:
   her next question is *which three*, and she cannot ring anybody without it.
   That version is equally derivable — and it discloses a named adult's delivery
   status to a school **ADMIN**, who may not be that child's class teacher.
   SAFEGUARDING rule 5 is "admins are not all-seeing", and the admin console
   already redacts child names from its own audit feed for that reason. This is a
   `safeguarding-reviewer` question. **It is also why the aggregate version is a
   door rather than a feature:** nobody would leave it at a count for long.
2. **It would ship dark.** `MailSuppression` is populated only by
   `runMailSuppressionSync`, which needs `MAIL_HMAC_KEY` **and** either
   `MAIL_SUPPRESSION_SYNC=1` for the scheduler or somebody running the CLI by
   hand — and the documented by-hand command had never worked until 2026-08-23
   (**F44**, and see F31's update). None of that has happened. A launch-week
   badge sitting behind two unset variables and an unexecuted procedure is a
   badge that says nothing on the day it is most likely to be looked at.
3. **The obvious `monitored` flag is a trap, and naming it is the most reusable
   thing in this entry.** The natural design gates the badge on
   `MAIL_HMAC_KEY` being set. That is not enough: a key that is set, with a sync
   that last succeeded three weeks ago, produces "0 refused" — a green badge
   that means *we have not looked*. `monitored` has to mean **key set AND a sync
   succeeded recently**, or the fix for F30 contains F30. This applies to any
   future health indicator built on a periodically-synced table, not just this
   one.

**What shipped instead**, so this entry is not read as a gap left uncovered:
`src/lib/schoolMailHealth.ts`, platform-wide, four distinct states with `NO_DATA`
kept separate from "working", the scope sentence as a rendered field, and
`tests/battery/security/school-mail-health.spec.ts` asserting in all four states
that the badge does not claim to know about her school. It needs no Railway
variable, because `MailCounter` is written by `recordMailAttempt` inside the
mailer on every attempt regardless.

**Why there is no repro test.** There is no defect to reproduce. The shipped
badge is accurate; this is a capability that has been deliberately not built, and
a test asserting the presence of a feature nobody has approved would be asserting
a decision rather than a behaviour. The nearest honest thing is the existing spec
holding the shipped badge to its own scope, and that is already in the blocking
security suite.

**To close this, in order:** `safeguarding-reviewer` rules on disclosing a named
adult's delivery status to a school ADMIN; the owner sets `MAIL_HMAC_KEY` and
`MAIL_SUPPRESSION_SYNC=1`; the sync runs once against production by the corrected
route in `docs/ops-recovery.md`; then roughly one to two hours of query work,
with `monitored` defined as above. **Autumn term, not launch fortnight.**

## F49 · Controls below the adult touch floor in teacher page bodies · Low → Open

Logged on 2026-08-23 alongside the shell fixes (Batch B item 3), deliberately as
a finding rather than a fix: the freeze is four days away, and the shell was the
part that renders on *every* teacher screen. These are in page bodies, each on
one screen, and each is a smaller miss.

Measured by the persona team on their own devices, so the numbers below are real
rather than estimated. Floor is 44px for a control on a classroom iPad; 24px is
WCAG 2.2 AA 2.5.8, which the 17-20px entries also fail.

| Control | Measured | Where |
| --- | --- | --- |
| `Manage class →` | 109×17 | the dashboard (`src/app/teacher/page.tsx`) |
| `See all →` | 59×16 | the dashboard |
| `Make a class` | 140×42 | the dashboard empty state and `/teacher/class` |
| class chips | 155×42 | the assign sheet on `/teacher/activities` |
| class chips | 92×42 | the sticker/praise screen on `/teacher/queue` |

**A seventh was on this list and has been fixed rather than logged.**
`Renew your plan →` (`src/components/FrozenBanner.tsx`) measured 137×18 and is
the *only* control on the banner a frozen school sees on every screen — the one
thing a business manager is there to press, at the moment she is already cross.
One line, and too important to defer. It sits outside the shell's `data-shell`
regions, so the touch-target gate does not cover it; a comment in the component
says so.

**`Manage class →` deserves its own sentence too.** At 109×17 it is the link the
triage separately flagged as an "invisible distinction": a first-time teacher
does not know `/teacher/class` exists, and the affordance that would tell them is
seventeen pixels tall.

**The 42px entries are two pixels short**, which is worth saying because it looks
like carelessness and is not: they are `padding: "9px 10px"` on a 15px line, and
nobody who wrote them was aiming at 42. A single shared class-chip component
would fix three rows of this table at once, which is the shape the autumn fix
should take rather than six separate paddings.

**This list is what the persona team happened to walk, not an exhaustive sweep.**
A full-page gate would very probably find more — the per-moment "Delete" links on
a child's journal are `text-xs` and were never measured. That incompleteness is
exactly why `tests/battery/a11y/teacher-touch-targets.spec.ts` is scoped to the
shell's own regions, whose universe is known and entirely fixed, rather than
sweeping whole pages and going red on the first thing nobody had looked at.

**Estimate:** about 2 hours for the five, or 3 if the class chip becomes one
component. No schema, no safeguarding surface, no gate change beyond widening
the spec's region list afterwards.

## F50 · Announced as a button, operable by no key · Medium → Fixed

Logged on 2026-08-23 out of the Batch B rotation investigation
([`docs/rotation-findings.md`](./docs/rotation-findings.md)). It was found by
reading the rotate handler, not by any test, and the reason no test found it is
the more useful half of the finding.

### What it is

Two controls on the drawing canvas — the **Turn** handle and the **Resize**
handle — are `<div role="button">` carrying `onPointerDown`, `onPointerMove` and
`onPointerUp` and nothing else (`src/components/DrawingCanvas.tsx:5508-5533`).
No `onKeyDown`, no `tabIndex`, no `onClick`.

They are labelled (`aria-label="Turn a shape"` / `"Resize a shape"`), they are
64px (F41 saw to that), and they are the only way to rotate or resize an object
anywhere in the product. So for anyone driving the canvas from a keyboard or a
switch, rotating and resizing **do not exist** — while the accessibility tree
says they are buttons sitting right there.

That is WCAG 2.2 **2.1.1 Keyboard** (A), and arguably **4.1.2 Name, Role, Value**
as well: the role promises an interaction the element does not implement.

### Why no gate caught it, which is the part that generalises

The two failures cancel each other out in front of the tests:

- Without `tabIndex`, the element is **not in the tab order**. `a11y/keyboard.spec.ts`
  walks what is tabbable, so it never reaches these to fail on them.
- `role="button"` on a `div` breaks **no axe rule** on its own. axe checks that a
  control has an accessible name and a valid role; it does not check that a thing
  claiming to be a button can be pressed.

So the gate is blind *because* the control is unreachable — the defect is its own
camouflage. Any future control built this way will be equally invisible, and the
lesson is not about this canvas: **nothing in the battery asserts that an element
announced as a button is reachable by keyboard.** A rule to that effect would be
cheap (sweep for `[role="button"]` with no `tabindex`) and would have caught both
of these the day they were written.

### Does anything else share the shape?

Checked, rather than assumed. `role="button"` on a non-`<button>` appears exactly
**twice** in `src/`, and they are these two handles. There are no `role="slider"`
elements. Every other control a child or teacher taps is a real `<button>`.

One neighbouring gap, named so it is not mistaken for being covered: **objects
themselves** are moved by pointer drag with no keyboard path either. That is not
this finding — a shape is not announced as a button, so nothing is promised and
nothing is broken — but a keyboard user cannot move an object any more than they
can turn one, and a full answer for the canvas would have to cover all three.

### What closed it — 23 August 2026

Both halves, because either alone leaves a gap.

**The handles are now operable.** `tabIndex={0}` and an arrow-key handler on
each, in `ObjectCorners`. They step by the object's own rotation step
(`rotateStepFor`), not by a coarser one, so **a keyboard reaches every position a
pointer can** rather than a subset of them — which is the difference between
2.1.1 being satisfied and being nearly satisfied.

**And Turn / Resize are real `<button>`s in `ObjectToolbar`**, at the 64px child
floor, where a child already looks for what they can do to a thing they have
tapped. Those step by the coarse `ROTATE_STEP` (15°) on purpose: the toolbar is
the control for squaring something up, and pressing one thirty times to reach a
right angle on a long line would be its own bad screen. Every rung of the ladder
divides 45 and 90, so a press and a drag land on the same angles.

The narrower fix — keys on the handles alone — was possible only once the
rotation work answered what a step should be. Before that, a drag handle driven
by arrow keys had no step size to use, which is why the two were always the same
decision.

### What is still not covered

Objects cannot be **moved** by keyboard. That is not this finding — a shape is
not announced as a button, so nothing is promised and nothing is broken — but a
keyboard user can now turn and resize an object and still cannot move it. A full
answer for the canvas is all three, and it is the obvious next request.

The general gap this finding named is also still open: **nothing in the battery
asserts that an element announced as a button is reachable by keyboard.**
`e2e/rotation.spec.ts` now asserts it for these two, by name. A sweep for
`[role="button"]` without a `tabindex` would generalise it and would be cheap.

---

## F52 · The jargon gate cannot read past an apostrophe · Medium → Fixed

Found on 2026-08-23 by `teacher-lead`, from a standing false positive; **diagnosed
by `platform-lead`, who corrected the first diagnosis and found the half that
matters.** Both halves below were reproduced and measured before this was
written.

`node scripts/error-string-audit.mjs` ends every run with one HARD hit —
"a teacher must never see these" — on a line of `DrawingCanvas.tsx` that contains
no user copy at all. That was the visible symptom. It is not the finding.

**The extractor is `/["'`]([^"'`]{6,})["'`]/g` (`scripts/error-string-audit.mjs:38`)
and both halves of it are wrong.**

**1. An apostrophe ends a string.** The character class `[^"'`]` excludes all
three quote characters, so a single quote inside a double-quoted string
terminates the match. Every one of these is audited only as far as the
apostrophe:

| Audited as | Actually |
| --- | --- |
| `That refresh token isn` | `That refresh token isn't valid.` |
| `This server doesn` | `This server doesn't open an event stream. Send JSON-RPC with POST.` |
| `This server doesn` | `This server doesn't support "${req.method}".` |

English contractions are not an edge case in user-facing copy — "doesn't",
"isn't", "can't", "we'll", "you're" are how the whole product is written.
**Measured across `src`: 79 strings on candidate lines are truncated this way.**
Anything after the apostrophe has been invisible to this gate for as long as it
has existed, and nothing anywhere would have said so.

**2. A short string steals the next one's quotes.** The `{6,}` minimum is
*inside* the pattern rather than applied afterwards, so a string shorter than six
characters never matches and never consumes its own quotes. The engine retries
from that string's **closing** quote, treating it as an opening one, and runs to
the next opening quote — auditing the code in between. On
`src/components/DrawingCanvas.tsx:3268`:

```
<FanBtn label="Quiz" onClick={() => { setFanOpen(false); setOpenKit(null); setTool("cursor"); ... }}>
```

`"Quiz"` is four characters, so the "string" the gate audits is
`" onClick={() => { setFanOpen(false); setOpenKit(null); setTool("` — and `\bnull\b`
fires on it. **Measured: 208 of the 1,521 strings it currently pulls from `src`
contain `=>`, `{`, `}` or `; `** — they are code, not copy. That is one in seven.

*A scanner whose extractor can mistake a closing quote for an opening one is not
reporting on strings. It is reporting on whatever happens to lie between them.*

**Why Medium rather than Low.** The false positive costs a second of reading and
would be Low on its own; the reason it is logged at all is that it led to the
false negatives. A gate that claims to enforce "a teacher must never see this
word" and cannot read past a contraction has been reporting a pass it never
earned. That is the same shape as F18 and F37 — a gate reading as "covered" while
the real surface sat outside it — and as F44, a procedure that had never been
executed. It is not High: the audit gates nothing (it is not in `npm run check`,
CI runs it as `... || true` at `.github/workflows/battery.yml:160`, and nothing
passes `--strict`), and no bad copy has actually been shown to have shipped
because of it.

**The fix was two lines** — extract with *matching* quote types, and apply the
length minimum **afterwards**:

```js
const strings = line.match(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g) ?? [];
// then, inside the loop:
const val = raw.slice(1, -1);
if (val.length < 6) continue;
```

**Both halves are needed, and this is the part worth reading before you start.**
Same-quote alternation *alone does not work* — reproduced: with `{6,}` still
inside the pattern, the mis-pairing survives untouched and the DrawingCanvas line
produces the identical bogus match. The length minimum has to move out. Kept here
although the fix has landed, because it is the trap: it is the obvious fix, it is
the one two of us would have written, and the next person to touch this extractor
should not have to find that out twice.

**Measured on a patched copy before it landed:** HARD 1 → 0, SOFT 6 → 6, the same
six sites with their strings complete rather than truncated, and no new findings
anywhere — so fixing it handed nobody new work, which is what made it safe to
take during a freeze.

**A third fault, found only after the fix landed, and it explains a lot.**
`--strict` **now exits 0, and it never could before.** This script has advertised
a strict mode since it was written; the permanent false positive meant it exited
1 against a clean tree, so nobody could have promoted this gate to blocking even
if they had wanted to. The mis-pairing did not merely make the output noisy — it
made the one mechanism for taking the gate seriously unusable, which is the
likeliest reason it still runs under `|| true`. Spotted by `platform-lead` after
landing; verified here by running `node scripts/error-string-audit.mjs --strict`,
which exits 0.

**The door is open and should not be walked through yet — this is the note for
whoever does the autumn heuristic review.** `--strict` is now a real option for
the first time, so promoting this to a blocking gate is a decision somebody can
actually take rather than a paragraph in a header. Do not take it on the strength
of this fix alone. The measurement above says **208 of the 1,521 "strings" the
audit pulled were code rather than copy** — roughly one in seven — and although
the extractor fix removes the mis-pairing that caused the worst of them, nothing
here has established what the *remaining* rate is, because the line filter
(`/error|message|toast|showToast|placeholder|label|title:/i`), the HARD and SOFT
word lists and the `/[A-Za-z]{4,}/` guard were all deliberately left untouched.
A gate that fails a build on a heuristic with an unmeasured false-positive rate
is a gate somebody switches off within a week, and a gate that has been switched
off is worse than one that was never blocking. **Measure the rate first, then
decide.** That review is the real autumn item; this fix was the thing standing in
front of it.

**Fixed on 2026-08-23** by `platform-lead`, in exactly the two lines above.
Verified against the whole tree after landing, not before: HARD **1 → 0**, SOFT
**6 → 6** — the same six sites, strings complete rather than truncated. "This
server doesn" now reads "This server doesn't open an event stream. Send JSON-RPC
with POST."

**Covering test: none, and none proposed.** Said out loud because this file names
a test for everything else. There is no spec for this script and writing one
would mean testing a heuristic against itself; what makes the fix safe is the
before-and-after measurement across the real tree.

**Still open, and a better item than the fix was: the selection heuristic.** The
extractor is now correct; what it is pointed at is not. It still audits any
string on a line matching
`/error|message|toast|showToast|placeholder|label|title:/i`, which is how one in
seven became possible in the first place, and why two of the six standing SOFT
findings are the CSS-ish token `token-label` rather than anything a teacher will
ever read. **Do not make this blocking until that is looked at.** A gate that
fails a build on a heuristic with that hit rate is a gate somebody turns off
within a week — which is how it ends up under `|| true` again, with a better
excuse than last time. Autumn.

**It was going to wait, and then it did not.** The deferral reasoning was that
`scripts/` is on the "select everything" list in `select-suites.mjs`, so touching
this file makes a PR run every blocking suite — a full battery for a report-only
fix, three days before a freeze. That was the right trade **while it was true**.
It stopped being true the same evening: `scripts/` was already dirty from the F44
runbook work, so the full-battery cost the deferral was protecting against was
already sunk, and the lead reversed the call. `platform-lead` landed the two
lines the same evening.

Worth keeping rather than tidying away, because the reasoning was sound and the
answer still changed. A deferral justified by a cost is only good until somebody
else has already paid the cost, and nobody re-checks that unless the two people
are talking.

## F53 · Four committed files that nothing has ever run · Low → Three deleted, one open

Found on 2026-08-23 by `teacher-lead`, while grepping for something else. Nothing
was broken by any of them; that is the point of the entry.

Four files carry a ` 2` before their extension — the shape a Finder or editor
"duplicate" produces — and all four were committed:

| File | State |
| --- | --- |
| `tests/e2e/admin.spec 2.ts` | **Deleted** |
| `tests/e2e/class-import.spec 2.ts` | **Deleted** |
| `tests/battery/security/class-import.spec 2.ts` | **Deleted** |
| `prisma/migrations/20260817140000_ops_mail_status/migration 2.sql` | **Still there** — see below |

**None of them has ever run.** Neither Playwright config sets `testMatch`, so the
default `**/*.@(spec|test).?(c|m)[jt]s?(x)` applies, and a filename ending
`2.ts` rather than `.spec.ts` cannot match it. Prisma applies the file named
`migration.sql` in each timestamped folder and no other.

**Why it is worth an entry rather than a quiet tidy-up.**
`tests/battery/security/class-import.spec 2.ts` sat in the directory of a
**blocking** gate. Anyone auditing what the security battery covers — which is
exactly what a school's due-diligence questionnaire prompts, and the reason this
file exists — finds a spec there and reasonably assumes it runs. It never did.
That is the same shape as **F18**, **F37**, **F52** and **F44**: a signal that
reads as covered while nothing stands behind it. It is the first instance of that
shape found here by accident rather than by looking.

No incident is claimed. Nothing has yet been misled by these files as far as
anybody knows; the risk is standing rather than realised, and it is strong enough
without embellishment.

**The migration artefact is the consequential one, and it is left alone
deliberately.** `migration 2.sql` is an *older draft* of the `ops_mail_status`
migration, differing in two column names:

| Draft (` 2.sql`) | Applied (`migration.sql`) |
| --- | --- |
| `note` | `outcomeDetail` |
| `template` | `templateKey` |

`template` is precisely the name `prisma/schema.prisma` rejects, in its own
words, because *"`template` is a RELATION to ActivityTemplate elsewhere in this
schema, and the blindness gate derives its child-relation denylist from relation
names: an operator file mentioning `template` is refused"*. So the stray is the
pre-fix draft of a decision the ops gate depends on, sitting one rename away from
being live.

**Verified applied-correct rather than assumed**: the development database's
`MailCounter` table is `PRIMARY KEY ("day", "templateKey", "outcome",
"statusClass")`. The right file was applied and the draft never was.

It is **not deleted** because `prisma/` is inside the 27 August schema freeze and
the deletion authorised tonight was scoped to the three spec files. Removing a
tracked file from a migrations directory is a change to migration history, and
that is the owner's call rather than an agent's, freeze or no freeze.

**How the three were verified harmless before deletion**, recorded so nobody has
to redo it if another of these turns up:

- `tests/e2e/class-import.spec 2.ts` was **byte-identical** to its counterpart.
- `tests/battery/security/class-import.spec 2.ts` held one test its counterpart
  lacks — *"an imported class shows as a count in the console, never as
  children's names"* — and that test **does exist in a collected file**, at
  `tests/e2e/admin.spec.ts:150`. No coverage was lost.
- `tests/e2e/admin.spec 2.ts` was a stale copy carrying the brittle
  `getByText("Teaching assistant")).toHaveCount(2)` assertion that F47's copy
  change exposed and which has since been rewritten to count staff rather than
  words. A rename, or a loosened `testMatch`, would have resurrected a test that
  fails for a correct change.

**The general lesson, which outlives the files.** A duplication artefact is
invisible to every gate in this repository: it typechecks (it is valid code), it
passes the static audits (it is never imported), and it never runs (the glob
excludes it). Nothing in CI has an opinion about a file that nothing references.
The only thing that finds one is a person looking at a directory listing.

---

## F54 · The same misread quote, in a second scanner · Medium → Fixed

Found on 2026-08-24 by `platform-lead` (this session), from `npm run check`
rejecting a **clean** fixture in the ops blindness gate's own self-test:

```
good-ops-establishment-count.txt: clean fixture was flagged: OPS-IMPORT-ALLOWLIST
  (imports the package " },\n    orderBy: [{ startedAt: ")
```

There is no such import. The file contained `where: { job: "gias:import" }`.

**It is F52's second half, in a different scanner.** The bare side-effect import
pattern in `importSpecsOf` was:

```js
/\bimport\s*["']([^"']+)["']/g
```

`\s*` permits **zero** characters, so the word `import` at the end of the string
literal `"gias:import"` matched, the literal's **closing** quote was taken as an
opening one, and the capture ran to the next quote in the file — auditing the
code in between as though it were a module specifier. F52's finding was a
closing quote mistaken for an opening one in `error-string-audit.mjs`. This is
the same mistake, in `check-ops-blindness.mjs`, found the same week.

**Two in one repository is a pattern rather than a coincidence**, which is the
reason this is logged rather than fixed quietly.

**Fixed** by anchoring the pattern to a statement position instead of a word
boundary:

```js
/(?:^|[;{}])\s*import\s*["']([^"']+)["']/gm
```

Checked in the direction that matters before it landed: `import"./x"` with no
space still matches, `import "a"; import "b";` on one line still yields both, and
across 348 files in `src/` plus the whole fixture corpus the new pattern gains
**zero** specifiers and loses only false positives — ten of them comment prose
like ``// deliberately free of `import "server-only"` ``, which the old pattern
had been reading as real imports all along.

**Two fixtures came with the fix**, and the first one exists because of a gap
worth naming. Fifty-eight fixtures already contain `import "server-only";`, so
the bare form was exercised constantly — but `server-only` is **allowlisted**, so
every one of them passes whether the scanner reads the import or not. **None of
them would have noticed if the narrowing had gone too far.**
`bad-bare-side-effect-import.txt` is the only fixture in the corpus where a bare
import must be *refused*, and it is therefore the only one that proves the true
positive still fires. `good-string-literal-ending-in-import.txt` pins the false
positive independently, so the regression stays covered even if the fixture that
found it is later reworded.

### A product constant was bent to fit the tool, before the tool was fixed

Worth its own line, because it is the part that would have outlived the bug. The
first response was to rename the `JobRun.job` key from `gias:import` to
`register:refresh` **to avoid the scanner's fault**, with a comment above it
warning the next person not to use a name ending in "import". That is a defect
migrating out of a tool and into the product's vocabulary, where nothing will
ever flag it and where the warning would have stayed true-looking and false for
as long as anyone read it.

The constant kept its new name — `register:refresh` is the better name on its
merits, since it says what the job does to the register rather than where the
rows came from — but **the comment was rewritten to record the constraint as
lifted rather than live**, with the fix dated and the fixtures named. A stale
warning about a fixed bug is its own small trap.

### How far the pattern goes, measured

Only scanners that **extract arbitrary string contents** can have this fault; one
that merely tests for presence cannot. Two scripts in this repository extract
quote-delimited content with an unconstrained character class, and **both had
it**: `check-ops-blindness.mjs` (ten such captures) and `error-string-audit.mjs`
(two, F52). Two of two.

Everything else is immune by construction rather than by care:

- `audit-static.mjs`, the blocking gate for raw queries and
  `dangerouslySetInnerHTML`, **captures nothing** — it tests for presence.
- `audit-motion.mjs`, `check-r2-tripwire.mjs` and `check-font-independence.mjs`
  likewise.
- `select-suites.mjs:76` does read quoted values out of the blindness gate's
  allowlist, but with a **constrained** class (`[A-Za-z0-9/_-]`) rather than
  `[^"']`, so a misread quote cannot swallow arbitrary content — it simply fails
  to match, and the selector's response to a list it cannot read is to select
  everything.

**The rule for the next scanner:** if a pattern captures `[^"']+` between quotes,
it can be entered at a closing quote. Anchor it to where the construct can
legally begin, constrain the character class to the vocabulary you actually
expect, or both.

---

## F54, second pass, 2026-08-24: the rest of the family, and the near-miss

The first fix took only the bare-import pattern, because that was the one that
turned the tree red. **The `from` family had the same fault and nobody had looked
at it**, found by the team lead testing rather than reading:

```
export const note = "a phrase ending in from";
const path = "@/lib/ops/session";
  captured specifier: ";\nconst path = "
```

A string ending in the word `from` puts a closing quote exactly where
`\bfrom\s*["']` expects an opening one. **Latent rather than live** — measured
through the gate's own `stripComments` across 506 files, the old patterns
produced exactly one bogus capture on real code, a template literal in a spec
file that is not an ops file. It fires on shapes this tree does not yet contain,
which is not a safeguard.

**Three assumptions were wrong on the way to the fix, and all three fell to
measurement rather than argument.**

*Anchoring the keyword does not transfer.* The bare-import fix anchors `import`
to a statement position; useless here, because in `export const note = "…from"`
the keyword is **innocent and already at statement position**. What goes wrong is
`[\s\S]*?` scanning past the statement into a string. Different defect, and it
needed the other remedy: constrain the class.

*Excluding the newline is not enough.* The obvious minimum, `[^"'\n]`, kills the
two-line repro and not the fault — the same shape fits on one line:
`export const note = "ending in from"; const p = "@/lib/x";`. A fix measured
against the shape of one test case rather than against the defect.

*And there were five patterns, not four.* `typeRe` was declared **outside** the
array the other four live in, which is exactly why the first sweep missed it. The
patterns are now all built from one shared `SPEC` constant, `typeRe` included, so
a sixth cannot quietly use a different class. "The one declared somewhere else"
is how the next incomplete sweep happens.

### The near-miss, which is the part worth reading

The first candidate class was `[A-Za-z0-9@._~/$-]`. It has no colon, so it
**stops capturing `node:fs`, `node:fs/promises` and `node:crypto`** — 108 real
specifiers across the tree.

That is not a stricter gate. It is **no gate**: `OPS-FILESYSTEM` fires on
`FS_IMPORT_SPECS.includes(spec)`, so a specifier that is never captured is a rule
that never runs. Not a rejected import — no import at all, and nothing goes red.
The check standing between an operator file and the volume holding every child's
photograph, drawing and voice note (**SAFEGUARDING rule 7**) would have gone
silent, inside a change whose entire justification was making the scanner
stricter. **A tightening that disables a safeguarding gate is the worst shape
available**, and the only reason it was caught is that the candidate was run
against 506 files instead of being reasoned about.

The corrected class is `[A-Za-z0-9@._~/:$-]`: all 238 real specifiers accepted,
only the template-literal artefact rejected. **Measured again after the change
across all eight patterns: 0 specifiers gained, 4 lost — the artefact and the
three decoys inside the new fixtures themselves.** `node:fs` is still captured in
31 files and `node:fs/promises` in 6.

`bad-ops-node-fs-still-caught.txt` exists so this cannot happen twice. It is a
**guard on the change rather than a test of the filesystem rule**, and its header
says so, because the next person narrowing that class needs it to go red rather
than to find a comment and believe it. The general form: **when you tighten what
a scanner accepts, ask what downstream rule consumes the captured value, and ship
a fixture asserting the strictest thing the class must still admit.**

### Also landed in the same pass

- `*/` added to the bare-import anchor as an **alternation, not a class member**.
  A bare `/` would have made the second slash of a `//` comment a valid prefix,
  re-admitting `// import "server-only" is deliberately absent` as a real import
  — one of the ten prose false positives the anchoring existed to remove.
  Narrowing and widening in the same character is how a fix undoes itself.
- `)` deliberately **not** added: `if (a) import "x";` is not valid JavaScript, an
  `ImportDeclaration` being legal only at module-item position, so there is no
  case to catch and a string containing `) import "` is likelier than a real one.
- Four fixtures: the block-comment form, the `from` fault in both directions, and
  the `node:fs` guard. Corpus is now 86 violating and 29 clean.
- **`prisma generate` once before the lanes** in `scripts/run-suites.mjs`, and a
  `db push` in `tests/battery/global-setup.ts`. The runner pushes each lane's own
  shard database and deliberately never touches `prisma/dev.db`, so a developer
  running a single spec directly got a database a schema behind and a seed that
  failed on a missing table. Both failures read as a broken branch and neither is
  one.

---

## F55 · A search box that returns the whole table · Medium → Fixed, with a gate

Found on 2026-08-24 by `platform-lead` while building the establishment search,
and confirmed by the team lead's sweep of every other call site.

**Prisma's `contains`, `startsWith` and `endsWith` compile to SQL `LIKE`, and
Prisma does not escape LIKE's own metacharacters in the value.** A query of `%`
reaches the database as `LIKE '%%'` and matches every row; `_` matches any single
character.

Measured against SQLite on the development database, not reasoned about:

| Query | Rows returned |
| --- | --- |
| `db.student.findMany({ where: { name: { contains: "%" } } })` | **35 of 35** |
| the same with `"_"` | **35 of 35** |
| `db.establishment.findMany({ where: { name: { contains: "%" } } })` | **all 20,296** |

### The part that makes it a finding rather than a footnote

**Nothing in this codebase was exploitable, and none of it was safe by design.**
Every existing LIKE is protected by something that has nothing to do with LIKE:

- **`src/app/uploads/[...path]/route.ts`** — eighteen of them, on the authorising
  media route. Its `SAFE_NAME` pattern blocks `%` but **permits `_`**, because
  real filenames contain one. It is saved by the second control: every
  `canAccess` branch is already scoped to the requester (the F17 fix), so a
  wildcard can only broaden matching *within rows that caller may already read*,
  and the file read then 404s identically.
- **`src/lib/api/activities.ts:161`** — the connector's activity search, and the
  one place a caller's string reaches `contains` unmodified. Scoped by
  `teacherId` with a bounded `take`, so a `%` returns that teacher's own
  templates — which they can already list with no search at all. No privilege
  gain.

So the property that held was **ownership scoping** (SAFEGUARDING rule 4), which
is the right control and was doing work it was never designed to do. That is
fine until a query has no owner to scope to.

**The establishment register is the first public, unscoped search StoryJar has
ever had, and it will not be the last.** It is reachable before any account
exists, over a table that belongs to nobody, so there is no `teacherId` to fall
back on. This is exactly where the latent defect becomes a live one.

### Fixed, and then made hard to reintroduce

The search strips its input to an allow-list of letters, digits, spaces,
apostrophes, hyphens, ampersands and full stops, which removes `%`, `_` and the
backslash at once (`planSearch` in `src/lib/establishmentSearch.ts`). Asserted in
`npm run check` and in `tests/battery/security/establishment-search.spec.ts`, and
the assertions were proved load-bearing by weakening the strip and watching seven
of them fail.

**Stripping rather than escaping is deliberate and worth recording.** SQL escapes
LIKE with a trailing `ESCAPE '\'` clause, and Prisma's `contains` gives no way to
emit one — so `\%` would be searched for literally, which is a different bug
wearing a fix's clothes. Dropping the characters is the option that exists, and
for a search box it is also the better one: a teacher typing `%` into a school
name means nothing by it.

### The gate: `scripts/check-like-wildcards.mjs`

Added to `npm run check` (0.4s; the whole static loop is 2.7s). **It does not do
taint analysis and does not pretend to.** Whether a value is user-supplied is a
question about every caller a function has ever had, and no regex answers it.

So the burden is inverted: rather than proving a value is dangerous, **the call
site must show that it is safe**, by being a shape the gate can read where the
query is written — a string literal, a `likeSafe(...)` call
(`src/lib/likeSafe.ts`), a template literal whose every interpolation is one of
those, or a TypeScript type position. Everything else fails.

One consequence is deliberate and will annoy somebody: **sanitising into a
variable one line above the query is refused**, even though it is safe. The gate
cannot follow a value across a statement, and neither can a reviewer skimming the
query. The fix is to move the call, not to widen the rule
(`bad-sanitiser-in-the-wrong-place.txt` pins this).

Exceptions live **in the gate script**, not in a magic comment, for the reason
`audit-static.mjs` keeps its allowlist there: silencing a gate should be a diff a
reviewer sees, not something added by whoever is trying to get a build green.
They are keyed on **file and exact expression**, so a different expression in an
allowlisted file still fails. Both entries are **printed on every successful
run** — including the `api/activities.ts` one, which says in its own text that it
is *not* sanitised and names the follow-up, because a residual that scrolls past
twice a minute is a residual somebody eventually fixes.

**Nine fixtures, and the corpus was rebuilt once because it was not proving what
it claimed.** Seven mutations were run against the gate; six were caught and one
was not:

- Dropping `endsWith` from the operator list **passed**, because a single fixture
  named `startsWith` and `endsWith` together and still fired on the first. Split
  into one fixture per operator, and `// @expect: <operator>` added so the
  declared operator must be the one that fires — "something fired" is not proof
  that the right thing fired.
- Weakening the sanitiser check to a substring test also **passed**, until
  `bad-sanitiser-name-in-a-variable.txt` was added: a variable somebody called
  `likeSafeQuery` is not a sanitised value, and the gate must not be fooled by a
  reassuring name.

Both are the same lesson as F53's four files nothing ran and F54's fifty-eight
fixtures that could not fail: **a canary that cannot fail is a decoration.** The
current corpus catches all seven mutations.

### One thing found on the way, not fixed here

`scripts/audit-static.mjs`'s allowlist comment says a second `dangerouslySetInnerHTML`
in an already-allowlisted file "still fails the gate". It would not: the lookup is
`DSIH_ALLOWLIST.find((a) => a.file === rel)`, which matches any line in that file.
Both allowlisted files hold exactly one use today, so tightening the key to
file-and-line would pass as-is. Reported rather than changed, because that gate is
not this change's to edit and a cold battery was running.

`check-ops-blindness.mjs`'s `stripComments` has no regex-literal handling, so a
regex containing an odd number of quote characters — `/^"([^"\\]|\\.)*"$/` has
three — desynchronises its string tracking and every comment after it in that file
is missed. It gets away with it because it only reads application code under the
ops roots. `check-like-wildcards.mjs` reads `scripts/`, where a gate script is
mostly regexes, so it handles the case; the implementation is there to copy if
the older gate ever needs it.

---

## F56 · The lane path and the direct path are two different environments · Medium → Open

Found 2026-08-24, and only because it happened **twice in one evening in two
unrelated ways**. Either one alone reads as a bug. Together they are a property
of the arrangement.

`scripts/run-suites.mjs` gives every (suite, shard) job its own port, its own
dev server, its own `dev-shard-N.db` and its own build output, and runs three
lanes at once. That is the isolation CI gets from three runners, on one machine,
and it is a good design — `AGENTS.md` explains it and the numbers behind it are
real. **What it also is, and what nothing says out loud, is a second environment
that the documented pre-merge command does not use.**

### The two divergences

**Setup.** Bringing the database up to the committed schema happens in three
independent places:

- `scripts/run-suites.mjs:56` — `prepareLane()`, per lane, into that lane's own
  shard database, and **deliberately never** `prisma/dev.db`, because that is
  the database somebody's own `npm run dev` is pointed at;
- `tests/battery/global-setup.ts:36` — added earlier the same day, for a person
  running one battery spec directly;
- `tests/global-setup.ts` — which had **none at all** until it was found for the
  third time that evening, and which is what plain `npm run test:e2e` and
  therefore `npm run test:gate` run.

So on any branch adding a column, the lanes were green and `test:gate` died on
the seed with a message about a missing column — which reads as a broken branch
rather than a stale database. **Each of the three sites was fixed by whoever was
standing on that path**, none of them looked for the other two, and the third
was found by an agent hitting it cold on a `Teacher.urn` change.

**Timing.** `tests/e2e/school-picker.spec.ts`'s "moving on with a search in
flight is not an error" passed in lanes and failed on the direct path, **the
same way every time, warm server or cold**. Not a flake: the test's outcome
turned on whether a 250ms debounced search returned before a Playwright click
completed, and the two paths differ in port, dist directory, database and
compile order — so they sit on opposite sides of that boundary. The underlying
product defect was real (an in-flow listbox moving the Continue button out from
under a `mousedown`, so no `click` event fired at all), and **the lane path
could not see it.**

**Re-measured 25 Aug 2026: that instance no longer reproduces.** The product
defect was fixed with the school picker itself, and `school-picker.spec.ts` now
passes **10/10 on the direct path**, cold, the in-flight test among them (3.0s).
So the example above is history rather than a live repro — which changes the
evidence and not the finding. What made it worth writing down was never that one
test: it was that a real defect sat on one side of a boundary the two paths
straddle, and **nothing about the boundary has moved.** The next defect that
lands on the lane side will be just as invisible, and there is now no failing
test pointing at the seam.

### Why this is a finding rather than two fixes

The setup half is closed at all three sites, so the remaining risk is not "the
push is missing". It is the shape:

**Three independent entry points that must each remember the same setup step is
a design fault, not three oversights.** Nothing enforces that a new entry point
does the setup, nothing compares the two environments, and the failure mode in
both classes is the worst-tasting one available — **green where you look, red
where you merge**. `AGENTS.md` names `npm run test:changed` before a push and
`npm run test:gate` before a merge; `test:gate` is the direct path, and it is
the path that had neither the setup nor the timing that the lanes had.

A test that passes in lanes and fails directly is worse than one that fails
everywhere, because the second is a bug and the first is a false negative on the
documented pre-merge command.

### What would close it

Not proposed as a decision, because this is deferred and the shape of the fix is
the owner's call:

- **One place that prepares a database**, called by all three entry points, so a
  fourth cannot be added without it. This is the same collapse `audit-motion.mjs`
  already made for the reduced-motion guard — seven scattered `@media` blocks
  became one catch-all — and for the same reason: a rule that depends on the
  next author remembering is not a rule.
- **Or** make the direct path *be* a lane of one, so there is one environment
  with a parameter rather than two environments that drift.

Either removes the class. Narrowing each site as it is found does not, which is
what this evening demonstrated three times.

### What the 25 Aug 2026 port guard did and did not touch

`scripts/run-suites.mjs` now binds every lane port before it generates, pushes
or seeds, and refuses to start if one is taken; each lane's database is removed
and recreated at the start of a run rather than only at the end. **That is a
different fault**, found while chasing five canvas timeouts that turned out to
be a machine 9.4 GB into a 10 GB swap file. It is recorded here so nobody reads
the commit and assumes this finding went with it:

- **Closed by it:** the stale-database class above, *for the lane path only* — an
  interrupted run can no longer leave a shard database whose schema belongs to
  another branch. And a lane can no longer silently adopt somebody else's dev
  server while seeding a database it is not reading, which was a second, unlogged
  way for the two paths to disagree.
- **Untouched by it:** both stated closure criteria. There are still **three**
  independent places that bring a database up to the schema, nothing prevents a
  fourth arriving without one, and the direct path is still not a lane. The
  guard makes the lane path more honest about what it is running; it does not
  make the two paths one environment.

Checked rather than recalled: the three sites were re-read on 25 Aug 2026 and are
`scripts/run-suites.mjs` (`prepareLane`, an argv array so it does not grep like
the other two), `tests/global-setup.ts:22` and `tests/battery/global-setup.ts:36`.

### Not fixed here

Deferred past the freeze of 2026-08-24. The exception that evening was the
school-identity work and this is not it; the harness is shared infrastructure
and touching it during a commit is how a narrow exception stops being narrow.
Written now rather than later so it can be stated precisely while the three
sites and the two failures are still checkable — every file and line above was
read to write this, not recalled.


## F57 · The register's refresh could not run where the database is · Medium → Mitigated, not closed

Found 25 August 2026, the only way this class ever is: somebody ran the
documented command against production for the first time.

`scripts/gias-import.ts` refreshes the establishment register — every open
primary school in England, ~20,300 rows, the list behind the school picker on
teacher signup. Its own header gives the production procedure:

```
railway ssh
npm run gias:import
```

That command cannot work in that place. Inside the container it dies at the
first line:

```
[gias-import] reading https://get-information-schools.service.gov.uk/Downloads
[gias-import] failed: the GIAS Downloads page answered 403. Nothing was changed.
```

The same command, same user-agent, from a laptop minutes either side: 200, and a
complete import. **The DfE blocks the datacentre range.** So the documented
procedure worked in the one place the database is not, and failed in the one
place it is.

### Why it was invisible

Nothing here was wrong in a way any gate could see. The script is correct, its
tests pass, `--dry-run` works, and the whole thing had been exercised locally
more than once. The failure lives entirely in the difference between two
networks, and **the only instrument that can read that difference is a person
running the command in the second one**.

This is the third instance of the same class:

- **F44** — every database command in the operator recovery runbook said
  `railway run`, which runs on your own Mac where `/data/prod.db` does not
  exist. The only documented way back into the service.
- **F31** — its stated mitigation was "run the sync by hand", which was the
  command F44 fixed, so the fallback it rested on was unavailable for its whole
  life.
- **F57** — this one.

Each was a capability that existed on paper, was reviewed, was written down, and
had never been run. **A procedure nobody has executed is a hypothesis.** The
remedy in every case was not a test; it was somebody doing it once.

### The seam that fixed it

The import makes two fetches to **two different hosts**, and only one of them
teaches it anything:

1. `get-information-schools.service.gov.uk/Downloads` — read *solely* to learn
   what date the latest extract carries. **Blocked.**
2. `ea-edubase-api-prod.azurewebsites.net/…/edubasealldata<date>.csv` — the
   61.6 MB file itself, its URL built from that date by `extractUrl()`.
   **Reachable from the container**, confirmed 25 August 2026.

So the container could always fetch the data. It could not discover the date.
`--extract-date YYYY-MM-DD` lets the operator read the date off the Downloads
page in their own browser and state it.

That is **not** the guessing `resolveExtractDate` refuses to do — nothing is
inferred from a pattern, a person has read the real page — and every guard is
downstream of it either way: a date that never existed 404s on the download, and
a truncated or renamed file still meets `MINIMUM_PLAUSIBLE_ROWS` and the
register is not replaced. Verified the `JobRun` row records `source 20260825`
identically whether the date was scraped or stated, so `/ops/health` still shows
the true age of the register rather than the "not recorded" that `--file` has to
say.

Production was imported the same day: 52,484 rows read, 20,295 kept.

### What is NOT closed

**The register can only be refreshed by a person with a browser and a laptop.**
There is no path to automating it while the DfE blocks the datacentre — a
scheduled job inside the container cannot learn the date, and there is no job
runner here anyway (F43). So the register goes stale by default, and staleness
is the standing risk this entry keeps open. Schools open, close and merge
constantly; a school that opened last term is one a teacher types by hand.

That is survivable because free text is a first-class route in the picker, and
because `/ops/health` shows the age rather than hiding it — the tile now carries
the whole procedure, so the operator reading "last refreshed 4 months ago" has
the command in front of them. It is survivable, not fixed.

If it ever needs to be automatic, the options are a mirror of the extract on a
host we control, or asking the DfE to allow the range. Both are decisions rather
than changes, and neither is needed before launch.

### Established, 25 August 2026: it had never been populated at all

The question was whether production had a register before that day. It did not.

Production's `JobRun` table holds 8 rows. Exactly one is a `register:refresh`,
and it is that morning's: `2026-08-25T06:48:36Z`, 20,295 rows, `source
20260825`. A `JobRun` row is written on every successful import, so no earlier
row means no earlier import — and the only other thing in the repository that
writes `Establishment` is `prisma/seed-test.ts`, which seeds 32 fixtures and is
never run against production. Both writers were checked rather than recalled:
`establishment.createMany` appears in exactly those two files.

**So the school picker on live teacher signup had nothing in it, from the day
the feature shipped until that morning.** No teacher was blocked — free text is
a first-class route in the picker and the fallback worked exactly as designed —
but no URN was captured for anyone who signed up in that window, which is the
whole point of the register and the thing `docs/school-identity.md` depends on.

This is what makes the F44 class worth a name rather than three separate fixes.
The register was designed, built, reviewed, given a search with bounds, given a
gate of its own in `npm run check`, given a status tile on `/ops/health`, tested
against two seeded schools, and deployed — and it was **inert in production the
entire time**, because the one step that puts data in it had never been run
there. Every gate in this repository was green over an empty table. Nothing here
tests that a thing was *done*, only that it *works*, and those are different
claims.

Worth asking separately, and not asked here because it needs a look at real
accounts rather than a schema: whether any teacher actually signed up in that
window, and so whether any real school is now recorded by name with no URN
against it.
