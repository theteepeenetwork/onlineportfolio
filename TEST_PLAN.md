# Storyjar — Test Battery Plan (Phase 1: Audit & Proposal)

> Status: **awaiting your review.** Nothing in the battery is implemented yet. This
> document maps what the app actually is, inventories what testing exists, and
> proposes the battery adapted to the real code. Provisional defects found while
> reading are listed at the end — they are **candidates**, not yet reproduced.

---

## 1. Application surface

### 1.1 Stack as built (vs. as described)

| Area | Brief says | Actually in the repo | Consequence for testing |
| --- | --- | --- | --- |
| DB | Postgres (EU) | **SQLite** (`file:./dev.db`), Prisma 6 | Raw-query/injection audit still applies; some Postgres-specific tests (e.g. RLS) N/A locally |
| Media | Moving to Cloudflare R2 (private bucket) | **Local disk** at `.media/`, served via authorising route | R2-specific tests (bucket ACL, signed URLs) are **forward-looking** — see §5 |
| Sessions | Externalised | **DB-backed** `Session` rows + cookie | Test the store we have; "external store unavailable" maps to "DB unavailable" |
| Framework | Node.js | **Next.js 16** (App Router, Server Actions), React 19 | State changes are Server Actions / route handlers, not a REST API — shapes the CSRF/access tests |
| Ages | 4–11 | SAFEGUARDING.md + schema say **3–7** | Discrepancy — see open question Q1 |

### 1.2 Routes (pages)

- **Public:** `/`, `/login/teacher`, `/login/student`, `/signup/teacher`, `/signup/teacher/welcome`, `/family`, `/legal/*` (11 pages)
- **Teacher (auth = TEACHER):** `/teacher`, `/teacher/queue`, `/teacher/class`, `/teacher/calendar`, `/teacher/activities` (+ `/new`, `/[id]`), `/teacher/students/[studentId]` (+ `/new`)
- **Student (auth = STUDENT):** `/student`, `/student/new`, `/student/popped`, `/student/activities` (+ `/[id]`)
- **Admin (auth = TEACHER + role ADMIN):** `/admin`
- **Family (auth = PARENT):** `/family` (ParentHome)

### 1.3 Route handlers & entry points (non-page)

- `GET /uploads/[...path]` — **the authorising media route** (highest-value target)
- `GET /family/enter?token=…` — parent magic-link consumption (sets session cookie)

### 1.4 Server Actions (all state changes)

| File | Actions | Auth boundary |
| --- | --- | --- |
| `actions/auth.ts` | `createTeacherAccount`, `teacherLogin`, `studentLogin`, `logout` | public → creates session |
| `actions/journal.ts` | `createJournalItem`, `approveItem`, `returnItem`, `deleteItem` | TEACHER/STUDENT; ownership via `ownedItem()` |
| `actions/admin.ts` | `inviteStaff`, `setStaffRole`, `assignClassToStaff`, `resendInvite`, `removeStaff` | `requireAdmin()` + `schoolId` scoping |
| `actions/classes.ts` | `createClass`, `deleteClass` | TEACHER; `teacherId` scoping + typed-name confirm |
| `actions/roster.ts` | roster/pupil management | TEACHER (to verify) |
| `actions/activities.ts` | templates + assignments | TEACHER (to verify) |
| `actions/family.ts` | `requestMagicLink`, `signInWithFamilyCode`, `parentLogout` | public → parent session |

### 1.5 Auth & access-control model (the thing under test)

- **Sessions:** `getCurrentUser()` (teacher/student) and `getCurrentParent()` resolve a single cookie `portfolio_session` → `Session` row. Cookie is `httpOnly`, `sameSite=lax`, `expires` 30d. **No `secure` flag set explicitly** (see finding F7).
- **Tenant seams:** `School → Teacher → Class → Student → JournalItem`. The security-critical invariant (SAFEGUARDING rules 4–7): **every child-data query is scoped by `teacherId` / `classId` / parent-link.** Admins are *not* all-seeing.
- **Media authorisation** (`/uploads` `canAccess()`): item → owning teacher, the student themselves, or a linked parent (APPROVED only). Teacher-authored backgrounds scoped to owner. Deny-by-default → 404.

### 1.6 File-upload paths

- Photo upload (`savePhoto`) — allow-list MIME map (png/jpeg/webp/gif), 15 MB cap.
- Camera / drawing data-URLs (`saveImageDataUrl`, `saveImagePages`) — regex-gated `data:image/...`.
- Stored under private `.media/`, random 12-byte filename, served only via `/uploads`.

---

## 2. Existing tests & tooling — inventory

**Present:**
- Playwright E2E (17 specs) covering core *functional* flows: auth, account/signup, journal approve flow, activities/templates, canvas objects/shapes/text/layers, calendar, family, legal, landing, class-delete, roster, **and one security spec** (`media-access.spec.ts` — tenant isolation on the media route + path traversal).
- `global-setup.ts` reseeds SQLite to a known demo state (`FORCE_SEED=1`) before the suite.
- Security headers + CSP defined in `next.config.ts`.
- Audit log model + `recordAudit()` wired into approve/return/delete/admin actions.
- `bcrypt` password hashing; deny-by-default patterns throughout.

**Missing (the gaps this battery fills):**
- ❌ No CI at all — `.github/` has only a PR template. No gating on anything.
- ❌ No accessibility testing (no axe-core), despite WCAG 2.2 AA being a **hard safeguarding requirement** (rule 18).
- ❌ No performance budgets (no Lighthouse CI).
- ❌ No dependency scanning (`npm audit`) or lockfile-integrity gate.
- ❌ No dedicated security suite: no auth/session hardening tests, no CSRF/XSS tests, no rate-limiting/enumeration tests, no header-assertion tests.
- ❌ No data-protection assertions (no-PII-in-logs, deletion cascade + media erasure, export).
- ❌ No responsive/device projects (iPad viewport is the classroom reality).
- ❌ No error-message audit.
- ❌ **No second school in seed data** → cross-tenant (School A vs School B) isolation cannot currently be tested; only class-to-class within one school. (See §4 seed work.)

---

## 3. Proposed battery

Legend: ✅ build now · 🟡 build now, forward-looking (feature not yet in code) · ⏸ blocked/needs decision · ➕ addition not in your brief.

### A. Security

| # | Test | Plan | Notes |
| --- | --- | --- | --- |
| A1 | **Tenant isolation** (highest priority) | Playwright API-level suite: for every action/route taking an ID, drive it as School-B admin/teacher and assert deny (no read/write/enumerate) of School-A pupils/journals/media. Extend `media-access` pattern to `/uploads`, `deleteItem`, `approveItem`, admin actions, family route. | ✅ Needs a 2nd school in seed. |
| A2 | **Auth & sessions** | Session fixation (token rotates on login), logout invalidation (row deleted + cookie cleared), cookie flags, expiry honoured (`expiresAt < now` → null), behaviour when session store (DB) unreachable → deny. | ✅ |
| A3 | **studentLogin boundary** ➕ | Prove/verify whether a raw `studentId` POST (no class-code) can mint a student session — see finding **F1**. | ✅ |
| A4 | **File uploads** | MIME/extension allow-list, 15 MB cap, reject SVG-with-script, polyglot, oversized; confirm data-URL regex can't be bypassed; served only via `/uploads` with `nosniff` + `private, no-store`. | ✅ (SVG served by `/uploads` MIME map — see **F5**) |
| A5 | **R2 private-bucket + signed URLs** | Assert objects never publicly readable; media only via short-lived signed URLs scoped to authorised users. | 🟡 R2 not yet in code. Build as a **skipped, ready spec** + a checklist gate that fails CI if R2 lands without it. |
| A6 | **Injection & input** | Prisma raw-query audit (grep gate for `$queryRaw`/`$executeRaw` unsafe use); XSS across every field rendering a pupil name / journal text / caption / teacher note; `dangerouslySetInnerHTML` grep gate. | ✅ |
| A7 | **CSRF** | State changes are Server Actions / same-origin POSTs. Test cross-origin POST is rejected; assert `form-action 'self'`, `SameSite` cookie. | ✅ |
| A8 | **Headers & transport** | Assert CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy on representative routes; **fail suite on regression**. | ✅ |
| A9 | **Dependencies** | `npm audit --audit-level=high` gated in CI; `npm ci` lockfile-integrity check. | ✅ |
| A10 | **Rate limiting & enumeration** | Login brute force, magic-link/family-code abuse, class-code + pupil/class ID enumeration. | ⏸ **No rate limiting exists** (F2). Tests will document current behaviour and fail against the intended limit — needs decision on whether to add limiting or mark as accepted-risk findings. |
| A11 | **Data protection** | No child data in logs; no PII in URLs/analytics (there are no analytics — assert none added); deletion cascade + **media-file erasure** (rule 9); data export works. | ✅ (export & per-item media erasure — see **F3**, **F4**) |

### B. Usability & UX

| # | Test | Plan | Notes |
| --- | --- | --- | --- |
| B1 | **Accessibility** | axe-core scan on every page, gated at WCAG 2.2 AA; keyboard-only nav for core flows; check ≥64px child touch targets (rule 18, stricter than the brief's 44px). | ✅ |
| B2 | **Core task flows** | Playwright: teacher login → capture photo → tag pupil(s) → publish, assert step count ≤ N + no dead ends; admin: add teacher, add class, bulk-import pupils. | ✅ (extends existing specs) |
| B3 | **Interruption resilience** | Half-finished upload/form survives tab close/reopen + flaky connection without data loss. | ✅ (will surface whether any draft-persistence exists) |
| B4 | **Responsive & device** | Playwright projects: iPad viewport + low-end laptop; assert no horizontal scroll, touch targets ≥44px on core flows. | ✅ |
| B5 | **Performance budgets** | Lighthouse CI on journal feed + upload pages: LCP < 2.5s throttled, image-payload cap. | ✅ |
| B6 | **Error-message audit** | Script collects every user-facing error string; flags jargon ("500", "Prisma", "payload"). | ✅ |

### C. Manual usability protocol

- Printable moderated-testing kit (1 page/task): task scripts for the flows above, think-aloud protocol, SUS questionnaire, results template with severity ratings. **Document, not code.** ✅

### Phase 3 wiring

- npm scripts: `test:security`, `test:a11y`, `test:e2e`, `test:perf`, `test:battery`.
- GitHub Actions running the battery on PRs; **security + a11y gates block merge**.
- `FINDINGS.md` (severity, repro, covering test).
- Update `CLAUDE.md`/`AGENTS.md` with the battery conventions.

---

## 4. Seed / fixtures work (prerequisite for A1)

Current seed = **one** school (St Bede's) with an admin (`teacher@school.uk`), Miss Malik, a TA, an invited teacher, and classes Sunflower/Ladybird/Butterflies, plus one parent (`FAM123`). This proves *class-to-class within one school* but **not cross-tenant**.

Proposal: a **dedicated `prisma/seed-test.ts`** (fictional data only) that adds a **second school** ("Oakfield Primary") with its own admin, teacher, class, pupils, journal items and parent — giving clean School-A vs School-B fixtures for A1 without touching the demo seed the app ships with. Never runs against prod (guarded like the existing seed).

---

## 5. Provisional findings (candidates — to be reproduced & logged in FINDINGS.md)

> These were spotted while reading. They are **not yet confirmed** with a failing
> test, and I have **not changed any app code.** Severities are proposed.

- **F1 · High · Student session from raw `studentId`.** `studentLogin` (`actions/auth.ts:123`) takes `studentId` from FormData and mints a session with no server-side check that the requester entered that student's class code. The class-code gate is only a page-render step; a crafted POST could impersonate any pupil whose id is known/guessed (ids are cuids — not trivially guessable, but the trust boundary is client-side). *Test: A3.*
- **F2 · High · No rate limiting anywhere.** `teacherLogin`, `signInWithFamilyCode`, `requestMagicLink`, and the class-code lookup have no throttling → brute force + enumeration. *Test: A10.*
- **F3 · High · `deleteItem` may orphan media on disk.** `deleteItem` (`actions/journal.ts:181`) deletes the row but does **not** call `deleteMediaFiles`, unlike `deleteClass`. If so, a deleted moment's photo persists in `.media/` — a rule-9 (right-to-erasure) gap. *Test: A11. To confirm.*
- **F4 · Medium · No data-export path found.** The brief and DPIA need pupil/account export; no export action is visible. *Test: A11 (may become a gap-to-build, not a bug).*
- **F5 · Medium · SVG is served by the media route.** `/uploads` MIME map includes `svg → image/svg+xml`; upload allow-list excludes SVG, but the route will serve one if present. With `nosniff` + CSP this is largely mitigated, but SVG-with-script handling deserves an explicit test. *Test: A4.*
- **F6 · Low/Info · Magic-link email enumeration.** `requestMagicLink` returns a distinct "we couldn't find a family" message, revealing whether an email is on file. *Test: A10.*
- **F7 · Low/Info · Session cookie has no explicit `secure` flag.** Relies on HSTS + HTTPS-only deploy; worth asserting `secure` in production. *Test: A2.*
- **F8 · Info · `.env` and root `dev.db` are git-tracked.** `.env` holds only the SQLite path (no secret, by design). Root `dev.db` is tracked (only `/prisma/dev.db` is git-ignored) — fine for fictional seed data, risky as a pattern if real data ever lands there. *Documented, not a functional test.*

---

## 6. Decisions (resolved 2026-07-12)

1. **Age range → 4–11 (brief governs).** SAFEGUARDING.md/schema 3–7 mismatch logged as a doc inconsistency to reconcile; touch targets asserted at ≥44px (brief), noting rule 18's stricter ≥64px.
2. **Rate limiting (F2) → findings only.** Tests assert the intended limit and currently **fail** (documenting the gap). No app-code change without a separate ask.
3. **R2 (A5) → skipped-ready + CI tripwire.** Specs written now as skipped; a CI check fails if R2 code lands without them enabled.
4. **`test:perf` → non-blocking on PRs** (report-only), blocking security + a11y gates only. (Assumed default; say if you want perf blocking too.)
5. **Confirmed Critical/High → findings only.** Machinery + FINDINGS.md with repro; ask before touching any app code.
