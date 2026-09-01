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
`tests/battery/security/join-school-plan-needs-an-invitation.spec.ts`; the same
spec records the captured `useActionState` POST wire format (`0` =
`[{},"$K1"]`, fields under a `_1_` prefix) for driving a real action POST.

See [[feedback-comments-are-the-record]] — the same lesson: check a claim's
facts before repeating it in a comment.
