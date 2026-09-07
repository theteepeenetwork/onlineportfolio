---
name: ops-mail-window-filter-order
description: ops-mail.spec.ts's "window filter is a filter" assertion fails in any single-lane full security run; it is order-dependent and not yours
metadata:
  type: project
---

`tests/battery/security/ops-mail.spec.ts` → "the window filter is a filter, not
a total of the table" **fails whenever another mail-sending spec has run before
it in the same database**. Seen 2026-09-02 on a full single-lane
`--project=security` run (1 failed / 464 passed), and reproduced with just
`email-confirmation-before-buying.spec.ts` + `ops-mail.spec.ts`.

**Still true and re-confirmed 2026-09-02 (evening)**, on the phase-2 acceptance
branch: full single-lane security = 472 passed / 1 failed / 4 skipped / 3 did
not run, the one failure being this test; `ops-mail.spec.ts` alone straight
afterwards = **19/19 green**. The expected substring was `Attempted17` against a
page showing `Attempted13` for parent sign-in links. The "Invitation for a
teacher who already has an account" row was already present at `Attempted0`,
which is the direct evidence that a new template key is not what moves it.

**Why:** the test sums `MailCounter` for today across *all* templates and
asserts the rendered page contains `Attempted<sum>`. `/ops/mail` renders an
`Attempted` figure **per template**, never a window total. So the assertion only
holds when exactly one template has counters that day — true when ops-mail lands
in a shard on its own, false as soon as the email-confirm or password-reset
specs share its lane. The three tests after it in the same `serial` describe
then report "did not run", which looks like a bigger failure than it is.

**How to apply:** if you add a `MAIL_TEMPLATE_KEYS` entry or any new send path
and this test goes red, it is almost certainly not you — a template with zero
counters adds an `Attempted0` row and changes no sum. Confirm cheaply by
removing your key from `MAIL_TEMPLATE_KEYS` and re-running the pair; the
expected substring stays identical. Report it rather than fixing it: the
operator surface is `platform-lead`'s. Related: [[webhook-spec-freezes-oakfield]]
is the same class of problem — one spec's writes poisoning another's in a shared
shard.
