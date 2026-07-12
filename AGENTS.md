# Rule 1: safeguarding comes first

Storyjar holds the work of children aged 3–7. **Before changing anything that
touches authentication, access control, the approval queue, children's data, or
uploaded media, read [`SAFEGUARDING.md`](./SAFEGUARDING.md) and follow it.** Its
rules override convenience, speed and every other consideration. When a choice is
unclear, take the more protective option. Every PR touching those areas must work
through the safeguarding review checklist in that document.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# The QA battery — keep it green

This repo has a standing UX / security / accessibility test battery. It is the
executable form of `SAFEGUARDING.md`. **If you change auth, access control, the
approval queue, children's data, uploads, headers, or any user-facing copy, run
the battery and keep the gates green.** Plan & findings live in
[`TEST_PLAN.md`](./TEST_PLAN.md) and [`FINDINGS.md`](./FINDINGS.md).

**Layout**
- `tests/battery/security/` — tenant isolation, auth/sessions, uploads, CSRF,
  headers, injection/XSS, data-protection. **Blocking gate.**
- `tests/battery/a11y/` — axe-core (WCAG 2.2 AA baseline) + keyboard nav.
  **Blocking gate.**
- `tests/battery/ux/` — core-flow step budgets, interruption, responsive.
  Report-only.
- `tests/battery/findings/` — repro tests for **known, logged gaps** (see
  `FINDINGS.md`). They assert the *intended* secure behaviour and **fail on
  purpose** until fixed. Report-only.
- `tests/e2e/` — the original functional suite. Blocking gate.
- `scripts/audit-static.mjs` (raw-query / `dangerouslySetInnerHTML` gate),
  `scripts/check-r2-tripwire.mjs` (R2 migration guard),
  `scripts/error-string-audit.mjs` (jargon in user copy).
- Fixtures: `prisma/seed-test.ts` seeds **two schools** (A = St Bede's demo,
  B = Oakfield) so cross-tenant isolation is testable.

**Commands** — `npm run test:battery` (all), or `test:security` / `test:a11y` /
`test:ux` / `test:e2e` / `test:perf`. CI: `.github/workflows/battery.yml`.

**Conventions when adding tests**
- New endpoint/action taking an id → add a cross-tenant isolation test (School B
  must never reach School A) before it ships.
- Fixing a logged finding → move its repro from `findings/` into the matching
  blocking suite (so it stays fixed), and delete the finding from `FINDINGS.md`.
- Closing the a11y contrast debt (F11) → empty `BASELINE_RULES` in
  `a11y/axe.spec.ts` to make the gate strict.
- Never weaken a gate to make it pass. Fix the app or log a finding.
