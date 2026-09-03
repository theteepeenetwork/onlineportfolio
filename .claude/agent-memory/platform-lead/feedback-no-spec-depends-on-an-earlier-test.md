---
name: feedback-no-spec-depends-on-an-earlier-test
description: A Playwright test that leans on an earlier test's side effects reports the wrong thing on red runs, because a failed test discards the worker and re-runs beforeAll
metadata:
  type: feedback
---

**Never write a spec whose meaning depends on state an earlier test in the same
file left behind.** Give each test its own subject, even when that means
creating and deleting a throwaway row twice.

**Why:** Playwright discards the worker process after a failed test and starts a
fresh one, which runs `afterAll` and then `beforeAll` again. Measured on
2026-09-01 while proving `removed-staff-keep-a-free-plan.spec.ts` fails without
its fix: test 1 detached a teacher, test 2 swept the table for teachers with no
school and no subscription. Green, both ran in one worker and the sweep had a
real subject. Red, the worker was replaced, `beforeAll` put the teacher back in
their school, and the sweep failed with "needs at least one schoolless teacher"
— a second, invented failure pointing away from the one real one. On the day a
gate goes red that is the difference between a diagnosis and a wild goose chase.

**How to apply:** an invariant sweep brings its own canary — create the bad
state, assert the query SEES it (the positive control this repo's security specs
open with), fix the state, then sweep for real, and delete the canary in a
`finally`. The same rule kills the temptation to assert non-vacuity by counting
rows an earlier test produced. See
[[feedback-verify-without-the-battery]].
