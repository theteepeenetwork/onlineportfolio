# platform-lead memory

- [Verify without the battery](feedback-verify-without-the-battery.md) — multi-lead sessions forbid Playwright; exercise pure logic under tsx instead
- [MailCounter cannot be per-school](project-mailcounter-cannot-be-per-school.md) — a per-school mail figure is a safeguarding change (F6), not a schema tweak
- [Don't close the half that asks](feedback-dont-close-the-half-that-asks.md) — part-fixed findings keep the split status; facts are mine to correct, status is the owner's
- [Route conflicting assignments](feedback-route-conflicting-assignments.md) — peer assigns what the lead forbade: ask the lead, tell the peer you're blocked, never quietly comply
- [Measure the artifact](feedback-measure-the-artifact.md) — fetch and count the real file before building a filter a plan describes in prose
- [Prisma LIKE wildcards](project-prisma-like-wildcards.md) — contains/startsWith don't escape `%`/`_`; safe only via ownership scoping, so public searches must strip input
- [Tightening a scanner fails open](feedback-tightening-a-scanner-fails-open.md) — a lost capture disables the rule that consumes it; measure the candidate across the tree first
- [Ask before new scope](feedback-ask-before-new-scope.md) — in a freeze, ask first; if forced, announce precisely enough to be refused. A documented gap is fine; a false claim is not
- [No formatters in a shared tree](feedback-no-formatters-in-a-shared-tree.md) — `prisma format` churns other people's uncommitted work; prove it clean with `git diff -w --stat`
- [Shared dev.db](project-shared-dev-db.md) — no migration history, and another agent may reseed it mid-task; verify migrations on a copy
- [Address the agent who briefed you](feedback-address-the-agent-who-briefed-you.md) — the sender, not whoever the brief talks about; a wrong guess interrupts two sessions
- [No spec depends on an earlier test](feedback-no-spec-depends-on-an-earlier-test.md) — a failed test discards the worker and re-runs beforeAll; invariant sweeps bring their own canary
- [Forge by tampering, not by posting](feedback-forge-by-tampering-not-by-posting.md) — a hand-built POST cannot reach a server action; rewrite a rendered form's hidden id, and aim the control forgery somewhere allowed
- [A green run is not a run](feedback-a-green-run-is-not-a-run.md) — count what RAN; an env-guarded skip reports green while proving nothing
