# FINDINGS — Storyjar QA battery

Defects and gaps found while building the test battery, and how each was
resolved. Data-protection failures are treated as critical/high per the brief
(UK GDPR, ICO Children's Code).

> **Baseline note.** Assessed against the repo HEAD at the time of writing.
> During this work the branch advanced (PRs #28/#29): PR #28 added `RETENTION.md`,
> tightened SAFEGUARDING rule 9, and fixed the media-erasure gap on single-moment
> delete (`deleteItem`). Findings reflect that state — F3 was narrowed to
> `removeStudent`, which this work then fixed too.

**Status: F1–F15 addressed; F16 and F17 open.** Fixes were applied after explicit sign-off
(the Phase-1 plan was "findings only"; the user then asked to fix them). Every
fix is covered by a test that now passes.

> **F15–F17 were found later**, while working through the July 2026 intuitiveness
> audit — not during the original battery work. F15 is fixed. **F16 is open**,
> scheduled with the class-code rotation release. **F17 is open**: routed around
> rather than fixed, because the fix loosens a deny-by-default branch and needs
> safeguarding review — see its section below.

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
| F11 | High | A11y | App-wide WCAG 2.2 AA colour-contrast + colour-only links | **Substantially fixed** (baseline reduced) | `a11y/axe.spec.ts` |
| F12 | Low | Resilience | Reload discarded the add-child draft & lost your place | **Fixed** | `ux/interruption.spec.ts` |
| F13 | Low | Responsive | Landing scrolled horizontally at iPad-portrait | **Fixed** | `ux/responsive.spec.ts` |
| F14 | Low | Touch target | Approval-queue buttons < 44px on tablet | **Fixed** | `ux/responsive.spec.ts` |
| F15 | Critical | AuthZ | `createJournalItem` trusted a client `studentId` — a teacher could publish into another school's pupil's journal, past the approval queue | **Fixed** | `security/f15-cross-tenant-journal-write.spec.ts` |
| F16 | High | Rate-limit / Enumeration | Class-code lookup is unthrottled, and a hit discloses the class name + every pupil's first name | **Open** | — (scheduled with SJ-02) |
| F17 | Medium | AuthZ / robustness | `/uploads` authorises **path-first**: it decides on the first journal item matching a media path and never falls through to the template branch. Two records sharing a path therefore mis-authorise each other. | **Open** (routed around, not fixed) | `findings/uploads-path-collision.spec.ts` |

---

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

## F16 · Class-code lookup: unthrottled, and discloses the roster — High → Open

**Is:** `/login/student?code=…` (`src/app/login/student/page.tsx`) validates the
class code with a direct Prisma lookup **in the page render** — a plain GET with
no rate limiting. `src/lib/rateLimit.ts` is wired into `teacherLogin` and the
family/magic-link actions only; F2 never covered this path. A hit returns the
class name **and every pupil's first name** in it.

**Severity reasoning:** the code alphabet is 31 chars at length 6 (≈887M), so
blind brute force is impractical — this is grinding, not instant. But it is
unbounded, unlogged, and the response is the roster itself.

**The trap for whoever fixes it:** a school is one NAT IP. The existing limiter
is 5 failures / 15 min **per IP** — thirty children mistyping twice would lock
out the whole school. This path needs a miss-only counter with a classroom-safe
threshold (~40–60/15min), and *the test proving honest classrooms aren't locked
out matters more than the one proving the throttle works.*

**Scheduled:** with the SJ-02 sign-in rework, which rewrites this same file.
Note the child-facing PIN planned for KS2 does **not** answer this — the roster
is disclosed before any PIN is reached.

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

**Fix:** `ClassManager` persists the open class + add-child draft to
`sessionStorage` (transient) and restores them **only on a reload** (Navigation
Timing `type === "reload"`), so normal navigation still lands on the grid.
**Guards:** `ux/interruption.spec.ts` — a half-typed name survives a reload.

## F13 · Landing horizontal scroll at iPad-portrait — Low → Fixed

**Fix:** the "How it works" grid uses `repeat(3, minmax(0,1fr))` + `overflow-x:
clip` so cards shrink instead of overflowing at 768px. **Guards:**
`ux/responsive.spec.ts`.

## F14 · Approval-queue touch targets — Low → Fixed

**Fix:** queue action buttons given `minHeight: 44`. **Guards:**
`ux/responsive.spec.ts`.

---

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
