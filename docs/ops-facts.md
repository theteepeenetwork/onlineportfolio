# ops-facts: the platform operator briefs, checked against the repository

**What this is.** The platform operator programme (the "ops" or platform admin
area) is described by a set of briefs written on the morning of 16 August 2026,
plus a team handbook and a set of owner amendments. Those documents name a great
many things in this repository: files, functions, npm scripts, CI jobs, Prisma
models and fields, environment variables, test specs. The repository moved
several times on 16 August. This document is PR-1 of the programme, and it does
one job: it takes every factual claim those documents make about the repository
and records whether the claim is true right now.

**Verified against commit `c4665c9`** ("Restore three imports a bad merge
dropped, and gate against the next one (#113)"), the tip of `main` on
16 August 2026, with a clean working tree. Both of that day's later merges are
included: PR #112 (family access) and PR #113 (merge repair plus a new typecheck
gate).

**Sources checked.**

| Short name | File |
| --- | --- |
| Amendments | `briefs/00-OWNER-AMENDMENTS.md` |
| Handbook | `briefs/00-team-handbook.md` |
| Brief 01 | `briefs/01-tech-lead.md` |
| Brief 05 | `briefs/05-sre-observability.md` (repository claims only, spot checked) |

**How to read a verdict.**

- **CONFIRMED**: the thing exists with the name and shape claimed.
- **WRONG**: the thing exists but not as described. The real name or shape is
  given.
- **ABSENT**: the thing does not exist in the repository at this commit. No
  near miss has been substituted, and nothing has been created to make a claim
  true. Many ABSENT rows are simply work the programme has not done yet; that is
  noted where it matters.

**A standing warning.** Nothing in this document was taken from a brief. Every
row was checked by opening the file or running a read only command. Later waves
should treat the briefs as intent and this document as fact, and should re-check
anything dated after 16 August 2026.

---

## 1. Namespace and route layout

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 1.1 | `/admin` is the school staff console: a teacher whose staff role is ADMIN manages their own school's staff, classes and audit trail | Brief 01 §1, Handbook §0 | CONFIRMED | `src/app/admin/page.tsx` redirects unless `user.teacher.staffRole === "ADMIN"`, then loads that one school's staff, classes and audit entries |
| 1.2 | `src/app/admin/page.tsx` and `src/app/admin/AdminConsole.tsx` exist | Handbook §0 | CONFIRMED | Both present; they are the only two files under `src/app/admin/` |
| 1.3 | `src/app/actions/admin.ts` exists and is the school console's server actions | Handbook §0 | CONFIRMED | Exports `inviteStaff`, `setStaffRole`, `assignClassToStaff`, `resendInvite`, `removeStaff` |
| 1.4 | `/admin` is covered by tenant-isolation specs in the security battery | Brief 01 §1 | CONFIRMED | `tests/battery/security/tenant-isolation.spec.ts` navigates `/admin` at lines 312 and 323 and drives School A's admin against School B resources. Also exercised by `tests/e2e/admin.spec.ts`, `tests/battery/a11y/axe.spec.ts` and `tests/battery/ux/core-flows.spec.ts` |
| 1.5 | The word "admin" and the `/admin` namespace are already taken, so the ops code namespace must be `ops` (handbook ruling R1) | Handbook §0, R1 | CONFIRMED as to the premise | The premise is true. The ruling itself is a decision, not a fact to verify |
| 1.6 | `src/app/ops/**` | Handbook R1, Brief 01 §2 | ABSENT | No `src/app/ops` directory |
| 1.7 | `src/app/actions/ops/**` | Handbook R1, Brief 01 §2 | ABSENT | No such directory |
| 1.8 | `src/lib/ops/**`, containing `session.ts`, `reads.ts`, `dto.ts`, `operations.ts`, `audit.ts`, `stripeLinks.ts`, `mail.ts` | Handbook R1, Brief 01 §2 | ABSENT | No `src/lib/ops` directory and none of the seven files |
| 1.9 | `scripts/ops/` for interim one-off operator scripts | Handbook §5, Brief 01 §8 | ABSENT | No such directory |
| 1.10 | `src/middleware.ts`, referenced for host gating under option C | Brief 01 §1, Brief 05 §"no middleware" | ABSENT | There is no middleware file anywhere under `src/`. Brief 05 states this correctly; Brief 01 assumes middleware is available for host gating and should not |
| 1.11 | `src/lib/teacherNav.ts` is the kind of path an agent will fail to find, the real file being `src/lib/nav/teacher.ts` | Handbook §8, Brief 01 §0 | The example is inverted | `src/lib/teacherNav.ts` **exists** and exports `teacherNav(pending)`. `src/lib/nav/teacher.ts` is ABSENT. Both documents use this pair as a hypothetical, so no action follows, but do not go looking for `src/lib/nav/teacher.ts` |
| 1.12 | `robots.txt` and a sitemap, which ops routes must be absent from | Handbook §6 item 7, R18 | ABSENT | `public/` holds only five unused SVG files. There is no `robots.txt`, no `sitemap.xml`, and no `robots.ts` or `sitemap.ts` route in `src/app/`. The definition-of-done line asks for absence from files that do not exist |
| 1.13 | `src/app/uploads/[...path]/route.ts` is the authorising media route | Brief 05 | CONFIRMED | Exact path present. Media directory constants are `MEDIA_DIR` and `UPLOADS_PREFIX` (`= "/uploads/"`), both exported from `src/lib/mediaPath.ts` |
| 1.14 | `src/app/api/stripe/webhook/route.ts` | Brief 05 | CONFIRMED | Present |
| 1.15 | `src/app/api/health/route.ts` | Brief 05, Handbook OPS-0a | ABSENT at `c4665c9` | Not in the commit. `src/app/api/` contains only `apple-pay-domain-association`, `drafts` and `stripe/webhook`. This is OPS-0a's work, and an untracked version of it appeared in the working tree while this pass was running. Treat it as unlanded until it merges |
| 1.16 | Env var `OPS_ENABLED`, the kill switch | Handbook R1, R17 | ABSENT | Not referenced anywhere in `src`, `scripts`, `prisma`, `next.config.ts` or the workflow |

---

## 2. Scripts, npm chains and gates

### 2.1 Everything under `scripts/`

The complete contents of `scripts/` at this commit, which is nine files:

| File | Exists | What it is |
| --- | --- | --- |
| `scripts/audit-static.mjs` | yes | Static security gate: unsafe raw Prisma queries, `dangerouslySetInnerHTML`, and a control-byte check. Scans `src/` for the first two and `src/` plus `scripts/` for the third. Exits 1 on violation |
| `scripts/audit-motion.mjs` | yes | Reduced-motion gate for SAFEGUARDING rule 18. Exits 1 on violation |
| `scripts/check-r2-tripwire.mjs` | yes | Fails the build if R2 code or config lands in `src/` while `tests/battery/security/r2-signed-urls.spec.ts` is still skipped. Scans `src/` only |
| `scripts/error-string-audit.mjs` | yes | Jargon audit over user-facing strings in `src/`. Report-only by default, `--strict` makes it exit 1 |
| `scripts/freeze-expired.mjs` | yes | Trial-expiry freeze job. Idempotent via a guarded `updateMany` with `status: { not: "FROZEN" }`, writes a SYSTEM audit row |
| `scripts/mail-events.mjs` | yes | Prints what Mailjet recorded about recent sends |
| `scripts/verify-mail.ts` | yes | Sends a real template with a fake token so the delivered raw source can be inspected |
| `scripts/fix-demo-parent-address.mjs` | yes | One-off repair script, not named in any brief |
| `scripts/railway-start.sh` | yes | Railway start command. See section 6 |

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 2.1a | `scripts/audit-motion.mjs` exists and is blocking; brief 04's claim that it may not exist is wrong | Handbook §0 | CONFIRMED | Present, and it is a step of both `test:security` and the `static-security` CI job |
| 2.1b | The R2 tripwire scans only `src/`, so a backup script placed under `scripts/` will not trip it | Brief 01 §9 | CONFIRMED | `const SRC = path.join(process.cwd(), "src")` and the walk starts there. The trap Brief 01 warns about is real and its stated workaround is correct |
| 2.1c | `scripts/error-string-audit.mjs` accepts `--paths` so it can be run strict over the ops tree | Handbook R14 | ABSENT | The script accepts `--strict` only, and hardcodes `src/`. R14 describes this as work to add, so this is a to-do, not a mistake. Later waves must not assume `--paths` exists |
| 2.1d | `scripts/check-ops-blindness.mjs` | Handbook R1, R2 | ABSENT | PR0's deliverable |
| 2.1e | `scripts/check-admin-blindness.mjs` | Brief 01 §7, §12 | ABSENT | Superseded by R2's naming ruling in any case |
| 2.1f | `scripts/check-admin-scope.mjs`, `scripts/check-admin-childdata-tripwire.mjs` | Handbook R2 (quoting briefs 02 and 06) | ABSENT | Both are rejected names |
| 2.1g | `scripts/check-mail-body-tripwire.mjs` | Handbook R9 | ABSENT | Not built |
| 2.1h | A gate modelled on "the existing R2 tripwire script: same header comment style, same directory-walk shape" | Brief 01 §7 | CONFIRMED as a model | `check-r2-tripwire.mjs` does have a shebang, a block header explaining why it exists, a `walk(dir)` recursion and a single `process.exit(1)`. `audit-static.mjs` and `audit-motion.mjs` follow the same shape. There is a working template to copy |
| 2.1i | The existing gates assert a non-zero scanned-file count | Brief 01 §6 item 7 (as a requirement) | ABSENT today | None of the three existing gates prints or asserts a scanned-file count. `audit-static.mjs` has a comment describing the class of bug this prevents, at line 24, but no assertion. The anti-rot check is genuinely new work |

### 2.2 npm scripts in `package.json`

Verbatim from `package.json` at this commit.

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 2.2a | `test:security` is `audit-static.mjs && audit-motion.mjs && check-r2-tripwire.mjs && audit:prod && playwright --project=security`, being **four** static steps | Handbook §0 | WRONG, now stale | There are **five** steps before Playwright, because PR #113 added a typecheck. The chain is: `npm run typecheck && node scripts/audit-static.mjs && node scripts/audit-motion.mjs && node scripts/check-r2-tripwire.mjs && npm run audit:prod && playwright test -c playwright.battery.config.ts --project=security`. The four the handbook names are all present and in that order; typecheck is new and runs first |
| 2.2b | `test:battery` runs the whole battery | Handbook §6 item 1 | CONFIRMED, with the exact shape worth knowing | `test:battery` is exactly `npm run test:security && npm run test:a11y && npm run test:ux && npm run test:e2e`. Four links. It does **not** include `test:security:findings`, `test:perf` or `audit:errors` |
| 2.2c | `scripts/error-string-audit.mjs` is absent from `test:battery` | Handbook §0, Amendment E1, Brief 05 | CONFIRMED | The npm script `audit:errors` exists (`node scripts/error-string-audit.mjs`) but is not referenced by `test:battery` or by `test:security` |
| 2.2d | `audit:prod` is a real npm script in the chain | Handbook §0 | CONFIRMED | `audit:prod` is `npm audit --omit=dev --audit-level=high` |
| 2.2e | `typecheck` exists as an npm script | Brief 05, implied by PR #113 | CONFIRMED | `typecheck` is `tsc --noEmit` |
| 2.2f | `billing:freeze` can be triggered as a named job | Handbook R13 | CONFIRMED | `billing:freeze` is `node scripts/freeze-expired.mjs`. R13's further claim that the underlying freeze is idempotent and uses a guarded `updateMany` is also true: `src/lib/billing.ts` line 92 filters `status: { not: "FROZEN" }` |
| 2.2g | `test:e2e`, `test:a11y`, `test:ux`, `test:perf` exist | Handbook §"Commands" in AGENTS.md, briefs generally | CONFIRMED | All four present. `test:perf` is `lhci autorun \|\| true`, so it can never fail a chain |
| 2.2h | Playwright battery project names are `security`, `security-findings`, `a11y`, `ux` | Implied throughout | CONFIRMED | Exactly those four in `playwright.battery.config.ts`. The original functional suite runs from `playwright.config.ts` via `test:e2e` |

---

## 3. Continuous integration

The only workflow file is `.github/workflows/battery.yml`. There is no other
workflow.

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 3.1 | The workflow runs `static-security`, `security`, `a11y` and `e2e` as blocking jobs | Brief 05, Handbook R14 (which names `static-security`) | CONFIRMED as job ids | Those four job ids exist. A fifth job, `report-only`, carries `continue-on-error: true` |
| 3.2 | The report-only work is three jobs called `ux`, `findings` and `perf` | Brief 05 line 25 phrasing, Handbook §5 | WRONG | They are three **steps** inside one job whose id is `report-only` and whose display name is "UX / findings / perf (report-only)". A later wave wiring a required-check list by job id must use `report-only`, not `ux`/`findings`/`perf` |
| 3.3 | `scripts/error-string-audit.mjs` runs in CI as `node scripts/error-string-audit.mjs \|\| true` | Handbook §0, Amendment E1 | CONFIRMED | Verbatim, as the last step of `static-security`, labelled "Error-string audit (report-only)" |
| 3.4 | Typecheck runs first in `static-security` | Implied by PR #113 | CONFIRMED | The step is `npx tsc --noEmit`, and it is the first step after `npm ci`, with a comment explaining that it exists because a bad merge on 16 August 2026 dropped three imports and no runtime gate said why |
| 3.5 | "Blocking" is enforced by the workflow | Handbook throughout | Needs care | Blocking is a **convention** here, expressed in the file's header comment and by the absence of `continue-on-error` on four jobs. There is no branch-protection or required-checks configuration in the repository. Whether GitHub actually blocks a merge is a repository setting, not a repository fact, and is outside what this pass can verify |
| 3.6 | A bare branch push triggers nothing; a draft PR triggers the workflow | Handbook §4 | CONFIRMED by configuration | Triggers are `pull_request` (no `types:` filter, so the default opened/synchronize/reopened, which draft PRs do fire) and `push` restricted to `branches: [main]`. A push to a non-main branch with no PR runs nothing |
| 3.7 | Every job runs `npx prisma db push` before its suite | not claimed, recorded because it matters | fact | `security`, `a11y`, `e2e` and `report-only` each run `npx prisma db push` against `DATABASE_URL: "file:./dev.db"`. There is no `prisma migrate` step anywhere in CI |

---

## 4. Data model (`prisma/schema.prisma`)

The datasource is `sqlite`, url `env("DATABASE_URL")`. There is **no
`prisma/migrations/` directory**: the schema is applied with `db push`
everywhere, in CI and in `scripts/railway-start.sh`. The file header states
that SQLite has no native enums, so every "type", "status" and "role" field is a
plain `String` with its allowed values in a comment. That matters for several
claims below.

Models present, in file order: `Teacher`, `School`, `Subscription`,
`BillingEvent`, `Folder`, `Class`, `Student`, `Parent`, `MagicToken`,
`JournalItem`, `ActivityTemplate`, `Assignment`, `Draft`, `AssignmentStudent`,
`Skill`, `Session`, `AuditLog`. Sixteen models plus `Skill`.

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 4.1 | `Parent.name` and `Parent.email` are now optional | Amendment A3 | CONFIRMED | The full model is: `id`, `name String?`, `email String? @unique`, `familyCode String @unique`, `createdAt`, `children Student[] @relation("ParentChildren")`, `sessions Session[]`, `magicTokens MagicToken[]`. Nine fields. There is no school or class relation on a parent, and no name or address a teacher could have typed |
| 4.2 | A parent implicitly reaches child data, so a parent screen is child-adjacent | Amendment C2, Handbook R11 | CONFIRMED as to the shape | `Parent.children` is a direct many-to-many to `Student`. Any parent record read carries the linkage one hop away |
| 4.3 | `Parent` carries a `linkedChildCount` field | Handbook R11 (attributing it to brief 03) | ABSENT as a field | It would be a computed DTO value, not a column. Nothing in the schema counts children on a parent |
| 4.4 | The session table carries a role enum of TEACHER, STUDENT, PARENT with nullable foreign keys | Brief 01 §4 | CONFIRMED in substance, WRONG in one word | `Session.role` is a `String`, not an enum, with the comment `// TEACHER \| STUDENT \| PARENT`. Nullable FKs `teacherId`, `studentId`, `parentId` all present. Adding a fourth value costs no migration, which slightly weakens Brief 01's "adding it is a schema change" argument, though its conclusion (keep operators out of this table) is unaffected |
| 4.5 | The current-user helper returns a teacher or student session | Brief 01 §4 | CONFIRMED | `getCurrentUser()` in `src/lib/auth.ts` returns `CurrentUser = TeacherSession \| StudentSession \| null`. Parents are resolved separately by `getCurrentParent()` in `src/lib/parentAuth.ts` |
| 4.6 | The parent session uses its own cookie | not claimed, recorded because it contradicts an assumption | fact | `src/lib/parentAuth.ts` imports `COOKIE_NAME` from `src/lib/auth.ts`. Teachers, students **and parents** all share the single cookie `portfolio_session`. Any rule phrased as "the teacher cookie constant" is really "the one session cookie constant" |
| 4.7 | The audit model has an actor type field | Brief 01 §5 | CONFIRMED | `AuditLog.actorType String` |
| 4.8 | `recordAudit`'s `actorType` is the union `TEACHER \| ADMIN \| PLATFORM \| SYSTEM` after the change | Handbook R4 | WRONG as to the current set | The schema comment reads `// TEACHER \| ADMIN \| SYSTEM \| PARENT`. `PARENT` is a live value (a parent linking a second child, or adding their own email). R4's proposed union silently drops it. The corrected target union is `TEACHER \| ADMIN \| SYSTEM \| PARENT \| PLATFORM` |
| 4.9 | `PLATFORM` is already a permitted `actorType` value | Brief 01 §5 asks this to be verified | ABSENT | Not in the comment and not written by any call site. Since the column is a `String`, adding it costs no migration, only a comment change |
| 4.10 | The audit model has a school id column to hang a row on | Brief 01 §5 asks this to be verified | CONFIRMED | `AuditLog.schoolId String?`, indexed as `@@index([schoolId, at])` |
| 4.11 | `recordAudit` throws on failure, so an audit failure fails the operation | Handbook R5 (as a target) | Currently the opposite | `src/lib/audit.ts` wraps the create in `try/catch` and logs, with the comment that auditing must never break the user's action. R5 requires the reverse for ops. That is a deliberate change to a shared helper and will affect existing call sites |
| 4.12 | Models `Operator`, `OperatorSession`, `OpsAuditLog` | Handbook R1, R4 | ABSENT | None exist |
| 4.13 | Model `PlatformAuditLog` | Handbook R4 (rejected alternative) | ABSENT | Does not exist |
| 4.14 | Models `JobRun`, `MailCounter`, `MailSuppression` | Handbook R9, Brief 05 | ABSENT | None exist |
| 4.15 | The DTO allowlist starts with "school id, school name, school region, school created date" | Brief 01 §3 | WRONG on one field | `model School` has exactly four columns and two relations: `id`, `name`, `createdAt`, `staff`, `subscription`. There is **no region field on School**. The nearest thing is `Teacher.country` (England / Scotland / Wales / NI / Elsewhere), which is a teacher attribute captured at signup, not a school one |
| 4.16 | The DTO allowlist includes "teacher staff role" | Brief 01 §3 | CONFIRMED but under a different name | The database column is `Teacher.role` (`ADMIN \| TEACHER \| TA`). The session type exposes it as `staffRole`. A gate matching field names must know both spellings |
| 4.17 | The DTO allowlist includes teacher account status and invite state | Brief 01 §3 | CONFIRMED, and they are one field | `Teacher.status` is `ACTIVE \| INVITED`. There is no separate invite-state column |
| 4.18 | Subscription carries the billing fields ops needs: registration type, payment status, Stripe customer id, trial end | Brief 01 §5 | CONFIRMED, with the real names | `Subscription` has `kind` (`FREE \| SCHOOL`), `status` (`TRIAL \| ACTIVE \| PAST_DUE \| FROZEN`), `stripeCustomerId`, `stripeSubscriptionId`, `trialEndsAt`, `frozenAt`, `currentPeriodEnd`, `createdAt`, `updatedAt`, and exactly one of `teacherId` / `schoolId`. "Registration type" is `kind` |
| 4.19 | `bandForPupils` exists for the server-side price band | Handbook R10 | CONFIRMED | `src/lib/billing-plans.ts` line 60. Also exports `SCHOOL_BANDS`, `bandFor`, `PLAN_LABELS`, `PLAN_PRICE_ENV` and `priceIdFor` |
| 4.20 | The `jarSeenAt` comment in `schema.prisma` refuses per-child metrics | Amendment C3 | CONFIRMED | `Student.jarSeenAt DateTime?`, with a comment saying it is wayfinding, never a measure of how often a child uses Storyjar, never to be aggregated, reported, exported or shown to a parent. `RETENTION.md` carries a matching, longer row |
| 4.21 | `deleteAccount` is the school-deletion entry point, to be kept out of v1 | Handbook R12 | ABSENT | No symbol named `deleteAccount`, `deleteSchool` or `closeAccount` exists anywhere in `src`, `scripts` or `tests`. There is no school-deletion path today, in either direction. `src/app/actions/account.ts` exports only `updateProfile`, `updateEmail` and `changePassword` |
| 4.22 | `src/lib/erasure.ts`, the target of the PR7 refactor | Handbook §5 PR7, Brief 01 | WAS ABSENT, **now exists (PR7)** | Erasure logic used to live in `src/lib/media.ts` (`deleteMediaFiles`) with the gather-then-delete sequence copied into `src/lib/drafts.ts`, `src/app/actions/roster.ts`, `src/app/actions/classes.ts` and `src/app/actions/journal.ts`. PR7 pulled it into `src/lib/erasure.ts`, which now exports `eraseClass`, `eraseStudent`, `eraseJournalItem`, `eraseJournalItemMedia`, `eraseDrafts`, `deleteOrphanedParents` and the path helpers. `deleteMediaFiles` stays in `media.ts` as the file-system primitive |
| 4.23 | `signInWithFamilyCode` takes a family code, finds the parent and creates a parent session | Amendment C1 | CONFIRMED | `src/app/actions/family.ts` line 98 |
| 4.24 | `requestMagicLink` discards the send result to preserve F6 neutrality | Amendment D2 | CONFIRMED as to the function | `src/app/actions/family.ts` line 36. F6 in `FINDINGS.md` is indeed "Magic-link enumeration", marked Fixed |
| 4.25 | `allowCodeLookup` already exists as the better throttling pattern | Amendment F1 | CONFIRMED | `src/lib/rateLimit.ts` line 102, with `CODE_MAX_MISSES = 50` per 15-minute window, described in the source as a classroom-sized ceiling. Used by `src/lib/classCodeLookup.ts` |
| 4.26 | The family-code throttle blocks a source IP for 15 minutes after five failures | Amendment F1 | CONFIRMED | `src/lib/rateLimit.ts`: `MAX_FAILS = 5`, `WINDOW_MS = 15 * 60 * 1000`, `BLOCK_MS = 15 * 60 * 1000`, keyed via `clientIp()`. `src/app/actions/family.ts` imports `isRateLimited`, `recordFailure`, `clearFailures`, `clientIp` |
| 4.27 | `deleteOrphanedParents()` enforces the last-link cascade on all three paths | `RETENTION.md`, relied on by Amendment A3 | CONFIRMED | Was defined in `src/lib/familyLinks.ts`; **moved to `src/lib/erasure.ts` by PR7** (same name, same behaviour, `familyLinks.ts` deleted). Called from `eraseStudent()` and `eraseClass()` in that module, and directly from `src/app/actions/familyAccess.ts` |
| 4.28 | Family access is built (PR #112) | Amendment A3 | CONFIRMED | `src/app/actions/familyAccess.ts` exports `createFamilyCode`, `rotateFamilyCode`, `removeFamilyAccess`. `src/app/actions/family.ts` exports `requestMagicLink`, `signInWithFamilyCode`, `addChildWithFamilyCode`, `saveFamilyDetails`, `parentLogout`. Screens at `src/app/family/` |
| 4.29 | `requireOperator()` and `requirePlatformAdmin()` | Brief 01 §4, Handbook R6 | ABSENT | Neither symbol exists anywhere. `requirePlatformAdmin()` is rejected by R6 in any case |
| 4.30 | The teacher session constructor and cookie constant the gate must ban | Brief 01 §4, Handbook R7 | CONFIRMED, with real names | `src/lib/auth.ts` exports `COOKIE_NAME = "portfolio_session"`, `createSession()`, `getCurrentUser()`, `destroySession()`, and the types `TeacherSession`, `StudentSession`, `CurrentUser`. `SESSION_DAYS = 30`, which matches Brief 01's "the 30 days teachers get" |

---

## 5. Mail

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 5.1 | `src/lib/mailer.ts` is **Brevo**, not Mailjet | Handbook §0, Brief 05 §"current provider" | WRONG | It is **Mailjet (Sinch)**. The file posts to `https://api.mailjet.com/v3.1/send` and carries a long header explaining why Brevo was dropped. Amendment A1 is correct and the handbook is not |
| 5.2 | Env vars are `BREVO_API_KEY` etc. | Brief 05 | WRONG | The credentials are `MAILJET_API_KEY` and `MAILJET_SECRET_KEY`, combined into a basic-auth pair. `BREVO_API_KEY` appears nowhere in the repository |
| 5.3 | The code sets `TrackOpens` / `TrackClicks` to `disabled` plus `X-MJ-TrackOpen` / `X-MJ-TrackClick` headers | Amendment A1 | CONFIRMED | `src/lib/mailer.ts` lines 126 to 130, exactly those four |
| 5.4 | `src/lib/emails.ts` no longer exists | Amendment A2 | CONFIRMED | ABSENT. Its replacement is `src/lib/emailTemplates.ts` |
| 5.5 | `src/lib/emailTemplates.ts` exists and is deliberately free of `server-only` | Amendment A2 | CONFIRMED | The file has no `import "server-only"`. Its header explains the decision and states what would reverse it. It exports `magicLinkEmail(url)` and `staffInviteEmail(...)`, two templates |
| 5.6 | A blocking spec asserts the templates contain no `<img>` and no external URL | Amendment A2 | CONFIRMED | `tests/battery/security/email-templates.spec.ts`, inside the blocking `security` project |
| 5.7 | `scripts/verify-mail.ts` can import the templates | Amendment A2 | CONFIRMED as to the path | The script is `.ts` and runs under `tsx`. Note that the header comment inside `emailTemplates.ts` refers to its predecessor as `scripts/verify-mail.mjs`; the file on disk is and always is `scripts/verify-mail.ts` |
| 5.8 | Mail failures log the recipient's domain plus provider status, never the address | Brief 05 | CONFIRMED | Stated in the `mailer.ts` header and consistent with the code. Brief 05's judgement that domain logging is borderline is an opinion, not a fact to check |
| 5.9 | The `MailResult` type exists as the seam to build alerting behind | Brief 05 | CONFIRMED | `export type MailResult = { ok: true } \| { ok: false; reason: string }` at `src/lib/mailer.ts` line 81, returned by `sendMail()` |
| 5.10 | The sending domain default is `mail.storyjar.co.uk` | Brief 05 | CONFIRMED | `senderEmail()` defaults to `hello@mail.storyjar.co.uk`, overridable by `EMAIL_FROM_ADDRESS`. Also `EMAIL_FROM_NAME` (default "Storyjar") and `EMAIL_REPLY_TO` (default `hello@storyjar.co.uk`) |
| 5.11 | Mailjet is listed as the sub-processor on the public legal pages | Amendment A4 context, `RETENTION.md` | CONFIRMED | `src/app/legal/sub-processors/page.tsx` names "Mailjet (Sinch)". `src/app/legal/data-processing/page.tsx` also mentions it. `docs/DPIA.md` risk R14 was rewritten for Mailjet on 2026-08-16 |

---

## 6. Deployment and environment

Verified against `git show HEAD:<path>` as instructed, because another agent is
working on these files.

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 6.1 | `railway.json` pins `builder: NIXPACKS`, `startCommand: bash scripts/railway-start.sh`, `restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 5`, and has no `healthcheckPath` key | Brief 05, Brief 01 §0 | CONFIRMED | All four present, and there is no `healthcheckPath` and no `healthcheckTimeout` at HEAD |
| 6.2 | `scripts/railway-start.sh` runs `prisma db push` and swallows a seed failure with `\|\| echo` | Brief 05, Handbook OPS-0c | CONFIRMED | At HEAD it runs `npx prisma db push --skip-generate --accept-data-loss`, then `npx tsx prisma/seed.ts \|\| echo "[start] seed step skipped/failed, continuing to serve"`, then `exec npx next start`. Note the `--accept-data-loss` flag, which Brief 05 does not mention and which is at least as sharp as the swallow |
| 6.3 | The volume is mounted at `/data`, holding the SQLite file and the media | Brief 01 §9, Brief 05 | CONFIRMED as documented in the repo | `railway-start.sh` says the database is `file:/data/prod.db` set in the Railway env, and media lives in `MEDIA_DIR` defaulting to `/data/media`. The Railway-side facts (5 GB, no backups, Hobby plan) are dashboard facts and outside this pass |
| 6.4 | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is unset | Brief 01 §0, §9 | ABSENT from the repository | The name appears nowhere in `src`, `scripts`, `prisma`, `next.config.ts` or the workflow. Whether it is set as a Railway variable cannot be checked from here |
| 6.5 | There is no route-level global rate limiter, only an in-process `Map` applied by auth callers | Brief 05 | CONFIRMED | `src/lib/rateLimit.ts` is a module-level `Map` with two independent stores (failure counting and code-lookup budgeting), plus `clientIp()` and `RATE_LIMITED_MESSAGE`. Nothing applies it globally |
| 6.6 | Security headers are applied to every response | implied by SAFEGUARDING rule 14 | CONFIRMED | `next.config.ts` `headers()` returns one entry, `source: "/:path*"`, with a CSP and the rest. There is no `X-Robots-Tag` in that set today, which the ops definition of done will need to add per-route |
| 6.7 | Environment variables referenced by application code | not claimed as a list | fact | The complete set read from `process.env` in `src`, `scripts` and `prisma` is: `APP_URL`, `DATABASE_URL` (via the Prisma datasource only), `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `FORCE_SEED`, `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MEDIA_DIR`, `NODE_ENV`, `PORT`, `STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four indexed Stripe price ids `STRIPE_PRICE_SCHOOL_SMALL`, `STRIPE_PRICE_SCHOOL_1FE`, `STRIPE_PRICE_SCHOOL_2FE`, `STRIPE_PRICE_SCHOOL_LARGE` |
| 6.8 | `otplib` or `otpauth` is a new dependency to flag to the owner | Brief 01 §4, Handbook D4 | CONFIRMED as absent | Neither is in `package.json`. `bcryptjs ^3.0.3` **is** present, so Brief 01's "reuse the existing bcrypt dependency" holds. `qrcode ^1.5.4` is also already present, which matters for TOTP enrolment |
| 6.9 | `SKIP_TOTP` as an environment-conditional bypass | Handbook R6 | ABSENT | No such flag exists. R6 forbids introducing one |

---

## 7. Tests, fixtures and spec identifiers

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 7.1 | `prisma/seed-test.ts` seeds two schools, A (St Bede's) and B (Oakfield) | `AGENTS.md`, relied on by the handbook's fixture reasoning | WRONG | It seeds **three**. School A is St Bede's (from the base seed), School B is Oakfield Primary, and School C is **Larchwood Primary**, a deliberately FROZEN account used to prove that `requireWritableAccount()` blocks every mutation while viewing and downloading stay open. Its admin is `teacher@larchwood.sch.uk` and its class code is `ARCH22`. `AGENTS.md` line 42 is stale |
| 7.2 | Spec ids A12, A13, A14 are free for the ops programme to use | Handbook §5 table (A12 auth specs, A13 credential containment, A14 no-child-data crawl) | WRONG, all three are taken | In `TEST_PLAN.md`: **A12 is Email templates**, **A13 is Family access**, **A14 is Typecheck**. A13's own note says it was numbered A13 rather than A12 precisely because PR #111 and PR #112 both claimed A12 and the merge kept one. The next free identifier is **A15**. The handbook's A15 and A16 references are also therefore off by the same shift |
| 7.3 | `tests/fixtures/ops-blindness/` holds the canary corpus | Brief 01 §6 item 8, Handbook R2 | ABSENT | `tests/fixtures/` exists and contains three files: `script.svg`, `tiny.png`, `worksheet.pdf`. There is no `ops-blindness` subdirectory |
| 7.4 | An existing pupil-removal media spec to model the deletion spec on | Brief 01 §5 | CONFIRMED | `tests/battery/security/f3-pupil-removal-erases-media.spec.ts` |
| 7.5 | `tests/battery/security/family-access-cross-tenant.spec.ts` asserts the last-link cascade rows-are-gone | `RETENTION.md`, Amendment A3 context | CONFIRMED | Present in the blocking security project. `family-code-throttle.spec.ts` is also present |
| 7.6 | `tests/battery/security/health-endpoint.spec.ts` | Brief 05, Handbook R19 | ABSENT at `c4665c9` | Not in the commit. As with row 1.15, an untracked version appeared in the working tree during this pass. Unlanded until it merges |
| 7.7 | `BASELINE_RULES` in `tests/battery/a11y/axe.spec.ts`, to be emptied when the contrast debt closes | `AGENTS.md`, Handbook R15 | CONFIRMED | Line 24: `const BASELINE_RULES = new Set(["color-contrast", "link-in-text-block"])`. Note it holds **two** rules, not only contrast |
| 7.8 | `assertStrictNoViolations` with an empty baseline for ops routes | Handbook R15 | ABSENT | No such helper exists anywhere in `tests/`. It is new work |
| 7.9 | F6 is magic-link enumeration and F11 is the a11y contrast debt | Amendment D2, `AGENTS.md` | CONFIRMED | `FINDINGS.md`: F6 "Magic-link enumeration, Low, Fixed"; F11 "WCAG 2.2 AA colour-contrast, High, Substantially fixed". Findings run F1 to F19 |
| 7.10 | The findings project is report-only and contains repro tests that fail on purpose | `AGENTS.md`, Handbook | CONFIRMED, and it is now small | `tests/battery/findings/` holds only two specs: `classcode-throttle-grind.spec.ts` and `rate-limit-enumeration.spec.ts`. Most findings have been fixed and promoted |
| 7.11 | `tests/battery/security/r2-signed-urls.spec.ts` exists as a skipped, ready spec | Brief 01 §9 | CONFIRMED | Present, and it is what the R2 tripwire guards |

---

## 8. Documents and policy

| # | Claim | Source | Verdict | Detail |
| --- | --- | --- | --- | --- |
| 8.1 | `SAFEGUARDING.md` rules run 1 to 19, so rule 20 is the next free number | Handbook §0, Amendment E2 | CONFIRMED | Numbered items 1 to 19 under headings A to I. Rule 20 is free |
| 8.2 | Rule 11 is "Every third party is listed and assessed" and closes with "children must never be profiled" in the context of analytics and profiling third parties | Handbook §0 | CONFIRMED, verbatim | Rule 11 requires each sub-processor to be named, DPA'd, UK/EU-hosted and safeguarding-assessed, then adds that there are to be no analytics, advertising or behavioural-profiling third parties, "ever", because the product promises no trackers and children must never be profiled |
| 8.3 | The numbering has drifted from a comment in `schema.prisma`, which cites rule 11 for profiling "where rule 11 is about third parties" | Amendment E2 | DISAGREEMENT, recorded not resolved | Both readings are defensible and this document does not get to settle it. Rule 11 is titled "Every third party is listed and assessed" and its profiling clause sits inside that scope, which is E2's point and the handbook's. It also ends with the flat sentence "children must never be profiled", which is what the `jarSeenAt` comment leans on. **The amendment outranks this document**, so treat E2's instruction as binding: quote the rule text, never the number alone, and cite rules 4, 5 and 11 together for the aggregate bans. Worth raising with the owner as a wording fix to rule 11 itself, since one sentence is doing two jobs |
| 8.4 | Rule 5 is "Admins are not all-seeing" | Handbook §0 implied, Brief 01 §3 | CONFIRMED | Rule 5 says a school admin manages staff, class assignment and billing, and must not see a child's work unless they personally teach that class, and that no admin path may read children's journal items school-wide |
| 8.5 | Rule 4 is server-enforced need-to-know scoping | Brief 01 §3 | CONFIRMED | Every query returning child data must be scoped by `teacherId` / `classId` / parent-to-child link |
| 8.6 | Rule 9 requires real deletion, rows and files | Brief 01 §5 | CONFIRMED | And it makes `RETENTION.md` part of the constitution |
| 8.7 | Rule 16 requires safeguarding-relevant actions to be audited | Brief 01 §4 | CONFIRMED |  |
| 8.8 | Rule 18 is accessibility, WCAG 2.2 AA, with no internal-tools exemption | Brief 01 §10, Amendment context | CONFIRMED as to the rule. The "no exemption" reading is an inference, since the rule simply does not carve one out |
| 8.9 | `RETENTION.md` **line 59** promises a 35-day rolling backup cycle | Handbook §0 | WRONG line number, right content | The backups row is **line 63**. Line 59 is the Sessions row. The text is exactly as quoted in Amendment B1: a 35-day rolling cycle, deletions propagating out of all backups within one cycle, backups staying in the EU region (Amsterdam). The claim is live and untrue, and this document does not touch it, per amendment G3 |
| 8.10 | `COMPETITIVE_POSITIONING.md` records "Two-way parent messaging / DMs" as REJECT on positioning grounds | Amendment D1 | CONFIRMED | Line 23 of the feature table, verdict "REJECT, positioning" |
| 8.11 | The pilot one-pager promises no parent messaging | Amendment D1 | ABSENT as a document | No one-pager exists. `LAUNCH_PLAN.md` line 134 lists writing one as a to-do. The promise itself does exist, in `COMPETITIVE_POSITIONING.md`'s teacher-facing script: parents see approved work and can send a heart, they cannot start a chat |
| 8.12 | `docs/ops-architecture.md` records owner decisions with dates | Handbook §1 item 2, R20, Brief 01 §11 | ABSENT | Not created. Note that the authority order places this file second, above the handbook, so the programme currently has no place where an owner decision outranks a brief |
| 8.13 | `docs/ops-scope-inventory.md`, `docs/ops-README.md`, `docs/ops-recovery.md` | Handbook R20 | ABSENT | None created |
| 8.14 | `docs/runbook.md` and `docs/RESTORE-DRILL.md` | Handbook R20, Brief 05 | ABSENT | Neither created |
| 8.15 | `docs/ops-facts.md` | Handbook R20, Brief 01 §7 | This document. It did not exist before |
| 8.16 | `docs/DPIA.md`, `TEST_PLAN.md`, `TESTING.md`, `FINDINGS.md`, `AGENTS.md`, `RETENTION.md`, `SAFEGUARDING.md`, `COMPETITIVE_POSITIONING.md` all exist | various | CONFIRMED | All present at the repository root except `DPIA.md`, which is at `docs/DPIA.md`. `docs/` also holds `AGE_MODE_COPY.md`, `MANUAL_USABILITY_KIT.md`, `billing-safeguarding-review.md`, `dpo-decisions.md`, `policy-readiness.md`, `pricing-decisions.md` and a `prompts/` directory |
| 8.17 | `/legal/privacy` and `/legal/data-processing` pages exist | Brief 05 | CONFIRMED | Both present, alongside `/legal/sub-processors` |

---

## 9. The list later waves must not trust

Everything below turned out WRONG or ABSENT. This is the single place to look
before acting on a brief.

### 9.1 Wrong: the document says something and the repository says otherwise

1. **The mailer is Mailjet, not Brevo.** The **handbook's own section 0** states
   Brevo as a verified fact, and Brief 05 repeats it with the env var
   `BREVO_API_KEY`. Both are stale. `src/lib/mailer.ts` posts to Mailjet's Send
   API v3.1 using `MAILJET_API_KEY` and `MAILJET_SECRET_KEY`. Amendment A1 is
   the correct account. (Rows 5.1, 5.2)
2. **`test:security` now has five steps before Playwright, not four.** PR #113
   prepended `npm run typecheck`. The handbook's enumeration is incomplete.
   (Row 2.2a)
3. **The CI report-only work is one job, not three.** There is no `ux`,
   `findings` or `perf` job. There is a single job `report-only` with three
   steps. (Row 3.2)
4. **Spec identifiers A12, A13 and A14 are already used** by Email templates,
   Family access and Typecheck respectively. The handbook's phase table assigns
   all three to new ops suites. The next free identifier is A15. (Row 7.2)
5. **`prisma/seed-test.ts` seeds three schools, not two.** School C is
   Larchwood Primary, a FROZEN account. `AGENTS.md` line 42 is stale, and any
   fixture reasoning that assumes exactly two tenants is wrong. (Row 7.1)
6. **`School` has no `region` field.** Brief 01's DTO allowlist opens with
   "school region". The model has `id`, `name`, `createdAt` and two relations.
   The only geography anywhere near it is `Teacher.country`. (Row 4.15)
7. **`RETENTION.md`'s backup promise is on line 63, not line 59.** The content
   is exactly as quoted and is exactly as untrue. Only the citation is wrong,
   but a later agent editing by line number would damage the Sessions row.
   (Row 8.9)
8. **`recordAudit`'s actor union in R4 drops `PARENT`.** The live set is
   `TEACHER | ADMIN | SYSTEM | PARENT`. Adopting R4's four-value union verbatim
   would delete a value that call sites already write. (Row 4.8)
9. **`Session.role` is a `String`, not a Prisma enum.** Brief 01 calls it an
   enum and rests part of its argument on the cost of adding a value. There is
   no such cost under SQLite here. The conclusion still stands on its other
   grounds. (Row 4.4)
10. **The one session cookie is shared by teachers, students and parents.**
    `COOKIE_NAME = "portfolio_session"` in `src/lib/auth.ts`, imported by
    `src/lib/parentAuth.ts`. Gate rules phrased around "the teacher cookie
    constant" are really about the only cookie constant there is. (Row 4.6)
11. **`recordAudit` swallows failures today.** R5 requires the opposite for ops.
    That is a change to a shared helper with existing callers, not a property
    the code already has. (Row 4.11)
12. **Rule 11 is doing two jobs in one sentence, and that is worth the owner's
    attention.** Not listed as a document error, because this pass does not get
    to overrule an amendment: E2 is authority level 2 and its instruction stands
    (quote the rule text, never the number alone). Recorded here because the
    ambiguity is real and a later wave will hit it again. (Row 8.3)

Two things in the source documents look like errors and are not, listed so
nobody "fixes" them:

- **`src/lib/teacherNav.ts` is a hypothetical, not a claim.** Handbook section 8
  and Brief 01 section 0 both use it to illustrate the failure mode of writing
  code against an unverified name. The file happens to exist at exactly that
  path; `src/lib/nav/teacher.ts` is the invented one. No action follows.
  (Row 1.11)

### 9.2 Absent: named in a document, does not exist in the repository

Nothing below has been created by this pass, and no near miss has been
substituted for any of it.

**Ops code and gates, none of which exist yet.** `src/app/ops/`,
`src/app/actions/ops/`, `src/lib/ops/` and all seven modules named for it,
`scripts/ops/`, `scripts/check-ops-blindness.mjs`,
`scripts/check-admin-blindness.mjs`, `scripts/check-admin-scope.mjs`,
`scripts/check-admin-childdata-tripwire.mjs`,
`scripts/check-mail-body-tripwire.mjs`, `tests/fixtures/ops-blindness/`,
`requireOperator()`, `requirePlatformAdmin()`, env `OPS_ENABLED`.

**Models.** `Operator`, `OperatorSession`, `OpsAuditLog`, `PlatformAuditLog`,
`JobRun`, `MailCounter`, `MailSuppression`. Also `actorType: "PLATFORM"` is not
yet a value any code writes.

**Infrastructure and SRE surface, being built by another agent.**
`src/app/api/health/route.ts`, `tests/battery/security/health-endpoint.spec.ts`,
`healthcheckPath` and `healthcheckTimeout` in `railway.json`,
`prisma/migrations/` (the project uses `db push` everywhere, in CI and at boot).

**Documents.** `docs/ops-architecture.md`, `docs/ops-scope-inventory.md`,
`docs/ops-README.md`, `docs/ops-recovery.md`, `docs/runbook.md`,
`docs/RESTORE-DRILL.md`, and the pilot one-pager.

**Application symbols a brief treats as existing.** `deleteAccount` (and any
school-deletion path at all: there is none, in either direction),
`src/lib/erasure.ts`, `src/lib/emails.ts` (correctly reported as removed by
Amendment A2), `src/middleware.ts`, `assertStrictNoViolations`, a `--paths`
option on `scripts/error-string-audit.mjs`, a scanned-file-count assertion in
any existing gate, `robots.txt` or any sitemap, `otplib` or `otpauth`,
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` anywhere in the code, `SKIP_TOTP`.

### 9.3 Confirmed, and worth restating because a brief doubted it

- `scripts/audit-motion.mjs` exists and is blocking in both `test:security` and
  the `static-security` CI job.
- `scripts/error-string-audit.mjs` blocks nothing: `|| true` in CI, absent from
  `test:battery`. Amendment E1 is correct, and no definition of done may cite it
  as enforced until that changes.
- `/admin` is a live, tested, tenant-scoped school console, so the namespace
  collision Brief 01 §1 describes is real.
- Family access is built exactly as Amendment A3 describes, and `Parent.name`
  and `Parent.email` are both optional.
- The R2 tripwire scans `src/` only, so a backup script under `scripts/` will
  not trip it. Brief 01 §9's trap and its workaround are both accurate.
- A bare push to a non-main branch triggers no CI; a draft pull request does.

---

## 9.4 Read from the live Railway service on 2026-08-17

Checked against the running production service (project "Story Jar", service
`onlineportfolio`, environment `production`) rather than from a brief. These
supersede the corresponding rows above and the brief 01 "VERIFIED" list, which
was accurate when written and has since moved.

| Claim | Source | Verdict | Truth |
| --- | --- | --- | --- |
| "Wait for CI" exists as a toggle but cannot be set from code; there is no CI key in the deploy config | Brief 01, and PR1's own report | **WRONG** | It is in the API, just not under `deploy`. The live config carries `source.checkSuites: false`. It is off today, and it is settable. |
| Builder is Nixpacks, marked deprecated, plan a move after the pilot | Brief 01 VERIFIED list | **WRONG** | The builder is **RAILPACK** with build environment V3. The Nixpacks migration is already done and needs no PR. |
| `healthcheckPath` is empty | Brief 01 VERIFIED list | **STILL TRUE, and worth knowing why** | OPS-0a added it to `railway.json`, but the live service config still shows no `healthcheckPath`, because `railway.json` is applied at deploy time and there has been no deploy since. It goes live on the next deploy, which is the same deploy that runs the migration baseline. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is unset | Brief 01 VERIFIED list | CONFIRMED | Absent from the service's variable list. |
| Region EU West Amsterdam, 1 replica, volume at /data | Brief 01 VERIFIED list | CONFIRMED | `europe-west4-drams3a`, `numReplicas: 1`, volume mounted at `/data`. |
| Volume backups and PITR are Pro-plan only | Amendment B1 | **DOUBTFUL** | Railway's backups documentation states no plan restriction and prices backups by usage. The Pro-only mention is a different feature (pre-update backups on image auto-updates). PITR is not mentioned for volumes at all. See `docs/ops-backup-options.md` section 6a. A dashboard check still outranks this. |

## 10. What this pass could not check

- **Railway dashboard facts.** Healthcheck path, plan tier, backups and PITR
  availability, volume size, replica count, region, the Wait for CI toggle,
  Under Attack Mode, CDN settings. Brief 01 §0 marks these VERIFIED against the
  dashboard on 16 August 2026 and they are outside a working-tree pass. Whether
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is set as a Railway variable is in this
  category too.
- **Whether GitHub actually blocks a merge on a red job.** The workflow declares
  four jobs without `continue-on-error`, which is the repository's expression of
  "blocking", but required-checks and branch-protection settings live in GitHub,
  not in this tree.
- **Provider-side behaviour**: Mailjet's account-level tracking switches, its
  `List-Unsubscribe` handling, and its retention of message bodies. `RETENTION.md`
  and `docs/DPIA.md` already record these as unconfirmed in writing.
- **Anything that required running the battery, the dev server, or a reseed.**
  This pass was read-only by instruction, so every "green" or "passes" claim in
  the briefs is unverified here. Amendment G5 requires `main` to be green before
  the programme starts, and that check still needs doing by someone able to run
  the suites.
