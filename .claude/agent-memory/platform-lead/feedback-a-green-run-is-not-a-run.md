---
name: feedback-a-green-run-is-not-a-run
description: after turning a gate on, count the tests that RAN — an env-guarded test.skip stays true and reports green while proving nothing
metadata:
  type: feedback
---

**When a task is "turn this spec on", the deliverable is a passing count, not a
green exit code. Read the skip line before believing the run.**

**Why:** on 2026-09-02, `stripe-webhook.spec.ts` had a describe-level
`test.skip` on two environment variables. Setting them in
`playwright.battery.config.ts`'s `webServer.env` configured the **server** —
which is where the route verifies signatures — and not the Playwright **worker**,
which is where the skip is evaluated and where the spec signs its payloads. The
security project came back 261 passed / 0 failed with the spec still entirely
skipped. Exit code 0, gate green, nothing proved. `ops-billing.spec.ts` had
already recorded the same trap in a comment ("this process's environment, which
is a different environment and would quietly disagree") — the precedent was in
the repo and I did not look for it first.

**How to apply:** after enabling anything, run that spec ALONE and read the
per-test lines, not the summary. A guard whose condition nothing can falsify is
a guard that hides a suite: prefer deleting it over leaving it permanently
true. Then mutate the source — comment out the call site the new tests are
supposed to cover — and confirm the tests go red for the right reason. Two of
mine did, which is the only evidence that a 24ms passing test is doing work.
Same family as [[feedback-tightening-a-scanner-fails-open]].
