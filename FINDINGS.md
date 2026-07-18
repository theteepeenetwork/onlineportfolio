# FINDINGS — Storyjar QA battery

Defects and gaps found while building the test battery, and how each was
resolved. Data-protection failures are treated as critical/high per the brief
(UK GDPR, ICO Children's Code).

> **Baseline note.** Assessed against the repo HEAD at the time of writing.
> During this work the branch advanced (PRs #28/#29): PR #28 added `RETENTION.md`,
> tightened SAFEGUARDING rule 9, and fixed the media-erasure gap on single-moment
> delete (`deleteItem`). Findings reflect that state — F3 was narrowed to
> `removeStudent`, which this work then fixed too.

**Status: all findings (F1–F18) addressed.** Fixes were applied after explicit sign-off
(the Phase-1 plan was "findings only"; the user then asked to fix them). Every
fix is covered by a test that now passes.

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
| F17 | Medium | AuthZ / robustness | `/uploads` authorised **path-first**: it decided on the first journal item matching a media path and never fell through to the draft/template branches, so two records sharing a path mis-authorised each other. Now scopes ownership into each branch and grants if any (Option A); the fixture no longer shares a path (Option C). | **Fixed** | `security/uploads-path-collision.spec.ts` |

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
