# FINDINGS — Storyjar QA battery

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
0d). F20 is not fixable by an agent: it is owner decision D2, and it is the most
serious entry in this file.

**F23 and F24 were opened on 16 August 2026** by the QA half of PR0, doing to
the new ops blindness gate what handbook ruling R3 exists to make someone do:
the author of a gate is the worst person to certify it fires. F23 is the reason
that ruling is worth having.

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
| F11 | High | A11y | App-wide WCAG 2.2 AA colour-contrast + colour-only links | **Substantially fixed** (baseline reduced; ~19 adult-surface nodes left) | `a11y/axe.spec.ts` |
| F18 | High | A11y (child-facing) | Six of the eight avatar colours gave a child an unreadable initial on their own name card (1.8–2.5:1 vs a 4.5:1 floor) — **hidden by F11's `color-contrast` baseline**, so the name-picker scan passed throughout | **Fixed** | `a11y/avatar-contrast.spec.ts` |
| F12 | Low | Resilience | Reload discarded the add-child draft & lost your place | **Fixed** | `ux/interruption.spec.ts` |
| F13 | Low | Responsive | Landing scrolled horizontally at iPad-portrait | **Fixed** | `ux/responsive.spec.ts` |
| F14 | Low | Touch target | Approval-queue buttons < 44px on tablet | **Fixed** | `ux/responsive.spec.ts` |
| F15 | Critical | AuthZ | `createJournalItem` trusted a client `studentId` — a teacher could publish into another school's pupil's journal, past the approval queue | **Fixed** | `security/f15-cross-tenant-journal-write.spec.ts` |
| F16 | High | Rate-limit / Enumeration | Class-code lookup is unthrottled, and a hit discloses the class name + every pupil's first name | **Fixed** | `security/classcode-throttle.spec.ts` (+ `findings/classcode-throttle-grind.spec.ts`) |
| **F19** | **Critical** | **AuthN** | `requestMagicLink` returned the parent's single-use sign-in URL to the browser, rendered as "Open it now →", with no environment guard — so typing any parent's email into the PUBLIC family form handed over a working session for that family | **Fixed** | `security/f19-magic-link-never-on-screen.spec.ts` |
| F17 | Medium | AuthZ / robustness | `/uploads` authorised **path-first**: it decided on the first journal item matching a media path and never fell through to the draft/template branches, so two records sharing a path mis-authorised each other. Now scopes ownership into each branch and grants if any (Option A); the fixture no longer shares a path (Option C). | **Fixed** | `security/uploads-path-collision.spec.ts` |
| **F20** | **Critical** | **Availability / Claims** | There are no backups of the volume holding every child's photograph, drawing and voice note, and three documents schools read say there are | **Open, blocked on owner decision D2** | none possible; options in `docs/ops-backup-options.md` |
| F21 | Medium | Schema / deploy | Production applies schema changes with `prisma migrate deploy`; local setup and CI still use `prisma db push`, so a schema edit made the usual way ships without a migration | **Mitigated, not closed** | `security/migrations-match-schema.spec.ts` |
| F22 | Low | Log hygiene | The stdout static check scans `src/` only; scripts run against production with `railway run` are audited by hand | **Accepted** | `security/log-hygiene.spec.ts` (scope stated in its header) |
| F23 | High | Ops blindness gate | Twenty-nine of forty-two attempted evasions got past the gate as first written, including three that handed over password hashes and family codes through a *permitted* call on a *permitted* model | **Fixed** (28 closed, 1 accepted in F24) | `security/ops-blindness-gate.spec.ts` + the 69-file corpus behind `--self-test` |
| F24 | Info | Ops blindness gate | What the gate still cannot see: runtime-assembled identifiers, and `scripts/ops/` being deliberately out of scope | **Accepted** | scope stated in the gate header and in A15 |
| F25 | Low | Ops surface | With ops enabled, an unauthorised `/ops` 404 is about 1,700 bytes smaller than a genuine one, so the route's existence is inferable by size. Accepted: the body names nothing and the sign-in door is openly reachable anyway. | Accepted |
| F26 | Medium | Erasure | Deleting a `Teacher` row cascades their classes, pupils, moments, drafts and templates and erases **no** media files. Latent today (only never-activated staff are ever deleted), but it is the exact shape PR8's account deletion will reach for | **Open, logged not fixed** | none yet; must be written with the fix |
| F27 | Medium | Erasure / Claims | Teacher-authored **template** media (`templatePathsJson`, `quizJson` option pictures, `objectsJson` image srcs) has no erasure path at all: templates are only archived, never deleted. `RETENTION.md` says this media is "deleted with the template/account". `duplicateTemplate` also copies the path strings, so two templates share files on disk | **Open, logged not fixed** | none yet; must be written with the fix |
| F28 | Medium | Availability / build | The app fetches its two webfonts from Google at build and dev-server startup via `next/font/google`. A 404 or outage from `fonts.gstatic.com` fails the build, which took out a CI job on 2026-08-17 and would equally fail a production deploy. | Open |
| F29 | Low | Test timing | The template restore prompt waits on an IndexedDB purge, an IndexedDB read and a Server Action round trip before it can render. On a cold CI runner that exceeded the 10 second default assertion budget twice in one day while passing locally every time. The assertion now names the precondition and allows 30 seconds. | **Withdrawn: wrong diagnosis, superseded by F34 and F36** |
| F30 | Medium | Mail | Mail health is readable at /ops/mail and nothing announces a problem. No alert channel exists, and a MailCounter row is a UTC day so the finest window the data supports is a day, not the hour brief 05 asks for. | Open |
| F31 | Medium | Mail | The suppression sync has no schedule. Until it is scheduled, MailSuppression is a snapshot of whenever somebody last ran it by hand, and a parent who started bouncing this morning reads as not refused. | Open |
| F32 | Medium | Accessibility | In forced-colours mode the entire operator bar vanishes: the header paints background and text as inline colours, so a high-contrast operator loses all four nav links and the sign-out button on the one account that runs the service. Nothing in src/ handles forced-colors. | Open |
| F33 | Medium | Deploy | railway.json pinned the deprecated NIXPACKS builder while the live service runs RAILPACK, and configuration in code overrides the dashboard. The next deploy would have moved the builder backwards. | Fixed |
| **F34** | **High** | **Resilience / data loss** | Saved work was withheld from the person who made it. The restore prompt awaited the local draft and a cross-device server lookup **together**, and the lookup had no deadline, so a request that was accepted and never answered suppressed the prompt entirely, and a teacher's or a child's work sat safe in their own browser while they were told nothing. The same shape was found a second time on `loadImage`, where a stalled template background left a child on a permanent "Loading…" overlay. Both are now bounded. | **Fixed** | `e2e/drafts.spec.ts`: "the restore prompt still arrives when the cross-device lookup never answers" and "a stalled template background still lets a child draw and restore" |
| F35 | **High** | Data residency | Volume backups were switched on 2026-08-17, and Railway's own DPA says its primary processing is in the United States, with backups "across multiple sites and regions" and none named. A backup is a complete copy of every child's photograph, drawing and voice note, and SAFEGUARDING rule 10 commits Storyjar to UK or EU storage. The claim that backups stay in Amsterdam has been removed from RETENTION.md rather than repeated. | Open |
| F36 | **Medium** | Test correctness | Every post-reload click in `drafts.spec.ts` raced hydration. Playwright's actionability checks pass on server-rendered HTML, so the click landed before React attached its handler, was swallowed without error, and the test failed one line later on a missing canvas that looked like a product fault. **Measured on 2026-08-18: F36 caused the one-in-two CI flake.** With it fixed the prompt appears in 38ms and all 133 functional tests pass; without it `main` failed at 33.9s. Raised from Low because a fault that fails a blocking gate every other run, and was twice misdiagnosed as a product defect, is not a low-severity test nit. | **Fixed** | `e2e/helpers.ts` `clickHydrated`, used at both post-reload click sites |

---

## F20 · No backups exist, and the documents say otherwise · Critical → Open

Found while doing OPS-0a/0c/0d (SRE), 16 August 2026. **Not fixed, and not
fixable by an agent:** it is owner decision D2.

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
retention windows, and what each would oblige Storyjar to tell schools are
written up in [`docs/ops-backup-options.md`](./docs/ops-backup-options.md). No
plan was changed, no provider was added, no money was spent, and the backup line
in `RETENTION.md` was deliberately left exactly as it is: correcting it without
fixing it means telling schools their children's work has no disaster recovery,
and that sentence is the owner's to write.

**Blocks:** OPS-0b, and handbook R12, which holds school deletion out of v1 until
a backup exists and a restore has been rehearsed.

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
with no backups (F20).

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
Storyjar library activity shares no bytes with the original or with any other
teacher's copy. Had it been written the obvious way, every teacher's copy would
have depended on a file Storyjar owns, and withdrawing or replacing a library
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
store (Prisma table / Redis) behind the same interface if Storyjar scales out.
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

## F28 · The build depends on Google's font CDN being up · Medium → Open

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
## F32 · The operator loses the whole nav in forced colours · Medium → Open

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

## F36 · Every post-reload click raced hydration · Low → Fixed

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

## How the battery encodes fixed findings

- **F1, F3** repro tests were promoted from the findings project into the
  **blocking** `security` gate, so a regression re-breaks the build.
- **F2, F6** stay in the report-only `findings` project because they trip real
  15-minute rate-limit blocks in the shared dev server that would contaminate
  sibling tests in a gating run.
- **F11** keeps a *reduced* tracked baseline in the blocking `a11y` gate: new
  serious/critical violations block; the residual brand-badge contrast is
  counted and reported until the palette is finalised.
- Everything else is guarded by an ordinary passing test in its suite.
