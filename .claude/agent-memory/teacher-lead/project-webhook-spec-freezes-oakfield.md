---
name: project-webhook-spec-freezes-oakfield
description: stripe-webhook.spec.ts leaves School B (Oakfield) FROZEN, so later specs in its shard fail as read-only — found 2026-09-02, not yet fixed
metadata:
  type: project
---

`tests/battery/security/stripe-webhook.spec.ts` uses **School B's seeded
subscription** as its fixture (`resetSchoolBSub`, which attaches
`sub_test_billing` / `cus_test_billing`). It resets it to ACTIVE *before* each
test and never restores it after the file, so it finishes with **Oakfield
FROZEN**. Verified 2026-09-02 by running that spec alone and querying the row.

**Why it matters:** any spec that sorts after it in the same shard and signs in
as an Oakfield teacher gets a read-only account, and its assertions fail for a
reason that has nothing to do with what it tests. On 2026-09-02 that was
`uploads.spec.ts`'s two rejection tests — the write gate refused the upload, so
the MIME refusal never rendered. Whether they collide depends on the 3-way
shard split, so **adding any spec anywhere can make this appear or disappear**,
and it looks like the new spec's fault.

**How to apply:** if a security spec fails as read-only or "plan has paused",
read `test-results/<test>/test-failed-1.png` first (the banner names it), then
check Oakfield's subscription status before reading any test code. Do not
"re-run and believe the second answer" — this survives re-runs and is not the
lane-race class. The fix belongs to whoever owns the webhook spec: give it a
school it creates itself, as `class-code-rotation.spec.ts` does, or restore
School B in an `afterAll`. Reported to the lead 2026-09-02; check whether it has
landed before re-diagnosing.

See [[project-shared-tree-git.md]] — report the fix for another agent's file
rather than making it.
