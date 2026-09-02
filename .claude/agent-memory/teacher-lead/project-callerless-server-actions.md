---
name: project-callerless-server-actions
description: A caller-less exported server action is NOT a live endpoint on Next 16 — verified 2026-09-01; three repo docs assert the opposite
metadata:
  type: project
---

On Next 16.3.1 an exported `"use server"` function that **no client component
imports** is given **no action id at all**, in dev and in `next build`. There is
nothing for `Next-Action` to name, so it cannot be dispatched. Verified
2026-09-01 by reading `server-reference-manifest.json` (global and per-route)
before and after temporarily wiring `joinSchoolPlan` into `BillingPanel.tsx`:
absent, then present. Ids also differ between dev and prod, so they are not
"stable" either.

**Why:** three documents state the opposite as settled fact and were used to
justify urgency — `docs/dpo-decisions.md` (1 Sep 2026), `docs/paid-tier-plan.md`
§6, and the phase-1 plan's §1.7 all say a server action with no caller is "still
a live POST endpoint with a stable action id". The founder owns those files; the
correction was reported, not edited in.

**How to apply:** shutting a caller-less action is still right — it becomes live
the instant a screen imports it — but argue it as *do it while there is nothing
to get wrong*, never as *there is a live hole today*. If a brief rests on
endpoint reachability, check the manifest before agreeing. The assertion, with a
positive control, lives in
`tests/battery/security/join-school-plan-needs-an-invitation.spec.ts`.

**To dispatch a real action POST in a test, send it FROM THE PAGE.** The wire
format that spec records is right — field `0` = `[{},"$K1"]`, form fields under
a `_1_` prefix — but Playwright's `page.request.post({multipart})` produces a
body Next accepts, dispatches, and hands to the action with an **empty
FormData**, in any part order, with or without the `$ACTION_*` parts. Verified
2026-09-02. Every refusal then looks right for the wrong reason ("please choose
a plan" instead of "only a school admin"). Use
`page.evaluate(() => fetch(location.pathname, {method:"POST", headers:{"Next-Action":id}, body: fd}))`,
which uses the browser's own encoder and cookies and is a truer model of a
tampered client. That spec's `page.request.post` branch has never executed (the
action it targets has no id), so it will post nothing the day phase 2 wires
`joinSchoolPlan` to a screen. Working version:
`tests/battery/security/school-purchase-guard.spec.ts`.

See [[feedback-comments-are-the-record]] — the same lesson: check a claim's
facts before repeating it in a comment.
