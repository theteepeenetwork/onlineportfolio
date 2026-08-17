# Storyjar — Test Battery Plan

> **Status: implemented (Phases 2 & 3 built and passing).** This began as the
> Phase 1 audit/proposal; the battery below is now built under `tests/battery/`,
> wired into npm scripts and CI (`.github/workflows/battery.yml`), with defects
> logged in [`FINDINGS.md`](./FINDINGS.md). The §5 "provisional findings" have
> been reproduced (or reclassified) and now live in FINDINGS.md — read that for
> the authoritative, current list.
>
> **Re-baseline note:** while building, the branch advanced (PRs #28, #29
> merged): `RETENTION.md` was added, SAFEGUARDING rule 9 tightened, and the
> **`deleteItem` media-erasure gap was fixed upstream**. Findings were
> re-checked against that HEAD — F3 is now narrowed to `removeStudent`, and a
> regression guard protects the `deleteItem` fix. Decisions in §6 stand.

---

## 1. Application surface

### 1.1 Stack as built (vs. as described)

| Area | Brief says | Actually in the repo | Consequence for testing |
| --- | --- | --- | --- |
| DB | Postgres (EU) | **SQLite** (`file:./dev.db`), Prisma 6 | Raw-query/injection audit still applies; some Postgres-specific tests (e.g. RLS) N/A locally |
| Media | Moving to Cloudflare R2 (private bucket) | **Local disk** at `.media/`, served via authorising route | R2-specific tests (bucket ACL, signed URLs) are **forward-looking** — see §5 |
| Sessions | Externalised | **DB-backed** `Session` rows + cookie | Test the store we have; "external store unavailable" maps to "DB unavailable" |
| Framework | Node.js | **Next.js 16** (App Router, Server Actions), React 19 | State changes are Server Actions / route handlers, not a REST API — shapes the CSRF/access tests |
| Ages | 3–11 | **3–11** everywhere (resolved 2026-07-15) | Was 4–11 (brief) vs 3–7 (docs); widened to 3–11 so no year group is orphaned |

### 1.2 Routes (pages)

- **Public:** `/`, `/login/teacher`, `/login/student`, `/signup/teacher`, `/signup/teacher/welcome`, `/family`, `/legal/*` (11 pages)
- **Teacher (auth = TEACHER):** `/teacher`, `/teacher/queue`, `/teacher/class`, `/teacher/calendar`, `/teacher/activities` (+ `/new`, `/[id]`), `/teacher/students/[studentId]` (+ `/new`, `/letter`)
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
| `actions/family.ts` | `addChildWithFamilyCode`, `saveFamilyDetails` | PARENT; self only (`getCurrentParent()`), code entry throttled on the shared `family:` key |
| `actions/familyAccess.ts` | `createFamilyCode`, `rotateFamilyCode`, `removeFamilyAccess` | TEACHER; every one scoped through a pupil in the acting teacher's own classes (`ownPupil()`), then the family scoped through that pupil |

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
| A12 | **Email templates** | Assert on the rendered output of `magicLinkEmail` and `staffInviteEmail`: no `<img>` anywhere (an image is how open tracking works), no URL other than the one passed in, no `<style>` or `<link>`, the plain-text part carries the link, the school name is escaped, and nothing but those parameters reaches the output. Blocking. `scripts/verify-mail.ts` covers the other half, which no test can see: what the provider does to the message on its way out. | ✅ Templates moved to `src/lib/emailTemplates.ts` (no `server-only`) so the gate can read them. |
| A13 | **Family access** (added 2026-08-16, when a teacher could first set it up) | `family-access-cross-tenant.spec.ts`: one test per action (create / view / rotate / remove), each a cross-tenant negative **paired with a positive control on the same actor and resource**, plus code scoping to the linked child only (including against a classmate), rotation taking effect at once, removal ending a live session, the last-link cascade asserted rows-are-gone, and the nullable-unique email traps. `family-code-throttle.spec.ts`: a correct code clears the counter (so typos never lock a family out) and both code boxes share one budget. | ✅ Blocking. Each negative was watched failing against a deliberately broken ownership check. Numbered A13, not A12: PR #111 and PR #112 both claimed A12 and the merge kept only one of them. |
| A14 | **Typecheck** | `npx tsc --noEmit`, first step of the static gates and of `test:security`, so a type error stops the run before four suites spend ten minutes failing for one reason. Added after a conflict resolution silently dropped three imports from a server action and reached `main`: every runtime gate went red, none of them said why, and `tsc` names it in a second. | ✅ Blocking. |
| A15 | **Ops blindness gate fires** (added 2026-08-16, PR0. Handbook ruling R3: "Security implements and owns it; QA owns the fixture corpus, `--self-test`, and the red-build drill... The author of a gate is the worst person to certify it fires." **Numbering note:** A15 is taken by this row on instruction. A17's note below records A15 and A16 as reserved for the operation-registry meta-test and mail-token containment; those two now need fresh numbers, and the next free pair is **A21 and A22**. Recorded here rather than left implicit, because two suites sharing a number has already cost this file once) | Two layers. **Per rule:** `tests/fixtures/ops-blindness/` holds 69 single-file canaries, `bad-*` declaring the rule id it must fire and `good-*` required to pass clean, checked by `node scripts/check-ops-blindness.mjs --self-test`. **Whole gate:** `ops-blindness-gate.spec.ts` covers the three things the gate's own header names as unprovable from a single-file corpus, each against a throwaway tree under the OS temp directory so a mutated schema never touches the repository: the **transitive import walk** (a child-data read three hops from an ops action fails and the chain is printed; the same chain with no ops link is a negative control that passes; the walk still stops at `src/lib/db.ts`), the **zero-scanned-files anti-rot assertion** (an ops root that exists and holds no code fails, one populated root does not excuse an empty sibling, absence of all roots is the clean pre-PR1 state), and **schema drift in both directions** (a new unclassified model, a renamed model failing as stale *and* unknown at once, a renamed denied field, a new credential-shaped column, a model classified twice, a pending entry going live). It also asserts `--self-test` is honest: it fails on a missing corpus, an empty one, an all-violating one, an all-clean one, a fixture declaring the wrong rule, a missing `@expect`, a missing `@path`, a "clean" fixture that violates, a misnamed file, and a drifted schema. Finally a **mutation test** removes each rule the corpus declares, one at a time, from a throwaway copy of the gate and requires the self-test to go red every time, which is the only way to know a fixture proves the rule it claims rather than tripping some other rule on the way past. | ✅ Blocking (`security` project + both static steps in `static-security`). Forty-two evasions were written against the gate before a single fixture was added; twenty-nine got through, and twenty-eight of those are now a rule and a canary. See **F23** and **F24**. |
| A17 | **Public healthcheck** (added 2026-08-16, OPS-0a. Numbering starts at A17, not A15: the ops programme had reserved A15 for the operation-registry meta-test and A16 for mail-token containment, and two suites sharing a number has cost this file once already. **A15 was subsequently taken by the blindness-gate row above; see its numbering note**) | `health-endpoint.spec.ts`: `/api/health` returns the exact bytes `{"ok":true}`, carries no version, commit, timestamp, count, environment value, child name, class code, family code or address, does not vary between calls, is never cached or indexed, and its media probe file cannot be fetched through `/uploads`. Paired with a positive control on the same resource, because a route that has stopped existing passes every negative on its own. | ✅ Blocking. Watched failing before the route existed: five of seven red, and the two that were green were the negatives, which is the point of the control. |
| A18 | **Seed refuses in production** (added 2026-08-16, OPS-0c) | `seed-refuses-in-production.spec.ts`: `prisma/seed.ts` and `prisma/seed-test.ts` both exit non-zero, print a refusal and touch neither database nor disk when `NODE_ENV=production`, with `FORCE_SEED=1` unable to override. Control: the same script with `NODE_ENV=development` gets past the guard, proving the refusal is caused by the environment and not by a broken script. Each run points `DATABASE_URL` and `MEDIA_DIR` at a throwaway directory, so a future regression damages scratch space rather than the fixtures. | ✅ Blocking. |
| A19 | **Log hygiene** (added 2026-08-16, OPS-0d) | `log-hygiene.spec.ts`: `errorLabel()` in `src/lib/safeLog.ts` returns the error class and machine code and never the message, proven against one case per banned category (child name, address, magic token, family code, class code, PIN hash, media path), and a static scan asserts no `console.*` call under `src/` hands over a caught error object, an address or a credential. Covers `src/` only; scripts run against production were audited by hand. | ✅ Blocking. |
| A20 | **Migrations match the schema** (added 2026-08-16, OPS-0c) | `migrations-match-schema.spec.ts`: `prisma migrate diff --from-migrations --to-schema-datamodel` reports no difference, so a schema edit committed without its migration is a red build rather than a production deploy that applies nothing and boots against last week's tables. Control: the same comparison against a deliberately drifted copy of the schema must report a difference. | ✅ Blocking. Watched failing with a model appended to `schema.prisma`. |
| A21 | **Operator identity, TOTP and sessions** (added 2026-08-17, PR1. Numbered A21 because A15 to A20 are taken; see the numbering note on A15) | `ops-auth.spec.ts`, twenty tests, every negative paired with a positive control on the same URL with a different session, because for the operator area the pairing axis is role rather than tenant and a 404 proves nothing on a route that has stopped existing. Covers: the console is 404 to a stranger and 200 to the operator; a teacher session is 404 there while their own console still works; neither identity system can read the other's cookie, asserted in both directions with a working control for each; the cookie is httpOnly, SameSite=Strict and Path `/`, and the `__Host-` prefix and Secure imply each other in both directions with the checker itself proved to fire; a correct password alone reaches nothing; the session value rotates when the code is accepted and only its SHA-256 is ever stored; a code cannot be used twice and an earlier step inside the window is refused, with a fresh code as the control; five wrong passwords lock the account **on the row**, the lock refuses a correct password from a different source, and the message never says "locked"; one sentence covers an unknown address, a wrong password and a wrong code; the throttle is checked before any bcrypt work; disabling the operator kills every session on the next request; a recovery code works exactly once; enrolment happens behind the password and is confirmed with a real code; `OPS_ENABLED` is off unless it is exactly `"1"` and both guards check it first; no test-only bypass exists anywhere under the ops roots; nothing anywhere links to the area and there is no robots.txt or sitemap to name it; responses carry `X-Robots-Tag: noindex, nofollow, noarchive` and are uncacheable; a sign-in is audited and no audit row holds a credential. **How it signs in:** a real password and a real TOTP code computed from the seeded secret with the same library the server verifies against. There is no bypass to use (ruling R6), and one of the tests asserts none has appeared. **What it does not prove end to end:** the kill switch in the OFF position at HTTP level, because the switch is read from the server's environment and a running dev server's environment cannot be changed from a test. It is proved in three parts instead: the predicate both ways, a source assertion that both guards consult it as their first statement, and the gate rule that every ops entry point begins with one of the two guards. Stated here rather than left as an impression. | ✅ Blocking. Watched failing: eight of twenty red on the first run against the finished code, including two real defects (the 404 body leaked the page title "Operations" through Next's metadata, and a disabled operator's other sessions survived). |
| A22 | **Operator door accessibility** (added 2026-08-17, PR1, ruling R15) | `ops-auth-a11y.spec.ts` in the blocking `a11y` project, against an **empty** axe baseline: no rule is excluded and no impact level is forgiven, which is the difference between these screens and `axe.spec.ts`'s two tracked F11 rules. `BASELINE_RULES` is not touched. Scans the password stage, the code stage, the code stage **with the error showing** (an alert nobody can read is the one that matters), the enrolment screen and the console. Also: the code field carries `autocomplete="one-time-code"`, is not `autocomplete="off"`, has no paste handler, and takes a **real** clipboard paste driven through the browser rather than a synthetic event (a synthetic ClipboardEvent is untrusted and would pass against a field that blocks paste); the error is `role="alert"`, sets `aria-invalid`, and is referenced by `aria-describedby` rather than being colour alone; both time limits (a 30-second code, a 10-minute sign-in step) and both session caps (30 minutes idle, 8 hours absolute) are stated on screen before they bite, which is what WCAG 2.2.1 asks of a limit that is essential and therefore not extendable; and the whole door, sign-in to sign-out, is completable with the keyboard alone. | ✅ Blocking. |

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

> **Update:** after the battery was built, all logged findings (F1–F14) were
> **fixed** (with the app owner's go-ahead) and are now covered by passing tests
> — see [`FINDINGS.md`](./FINDINGS.md). F1/F3 repro tests were promoted into the
> blocking security gate; F11 contrast is substantially reduced with a small
> tracked baseline remaining for the design owner.

## 6. Decisions (resolved 2026-07-12)

1. **Age range → 3–11 (resolved 2026-07-15).** The brief said 4–11, SAFEGUARDING/schema said 3–7. Neither was adopted as-is: 4–11 would have orphaned Nursery, and the July 2026 intuitiveness audit's proposed 5–11 would also have orphaned Reception — both are year groups the signup form already offers. **3–11 widens the ceiling without dropping anyone.** Touch targets are still asserted at ≥44px, noting rule 18's stricter ≥64px — a gap worth closing now the range reaches Year 6.
2. **Rate limiting (F2) → findings only.** Tests assert the intended limit and currently **fail** (documenting the gap). No app-code change without a separate ask.
3. **R2 (A5) → skipped-ready + CI tripwire.** Specs written now as skipped; a CI check fails if R2 code lands without them enabled.
4. **`test:perf` → non-blocking on PRs** (report-only), blocking security + a11y gates only. (Assumed default; say if you want perf blocking too.)
5. **Confirmed Critical/High → findings only.** Machinery + FINDINGS.md with repro; ask before touching any app code.
