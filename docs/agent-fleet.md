# The agent fleet

How to run several Claude Code sessions on this repo at once without them
standing on each other.

## Why this shape

The split below is not invented. It is the boundary the repository already
enforces. `scripts/check-ops-blindness.mjs` proves, deny-by-default on every PR,
that operator code cannot import the product a child or a teacher touches, and
`scripts/select-suites.mjs` reads that same allowlist to decide what a PR runs.
Two agents working either side of that line genuinely cannot break each other's
screens, which is exactly the property you want before you let them run in
parallel.

| Role | Owns | Blocking gates it lives with |
| --- | --- | --- |
| `ops-lead` | `src/app/ops`, `src/app/actions/ops`, `src/lib/ops`, `ops-*` specs | ops project, the five-module allowlist |
| `teacher-lead` | `src/app/teacher`, `src/app/admin`, billing and class actions | security, a11y, e2e, personas |
| `child-lead` | `src/app/student`, `src/app/family`, canvas, stickers, capture, age modes | a11y, personas, security |
| `platform-lead` | `prisma`, `scripts`, `.github`, configs, `db`/`auth`/`mailer` | everything, by design |
| `safeguarding-reviewer` | nothing. Read-only Rule 1 verdict | runs `check`, reads diffs |
| `battery-runner` | `FINDINGS.md` only | picks and reads the right suite |

The four leads own disjoint file sets. That is the whole trick: two teammates
editing one file is the failure mode that makes parallel agents worse than one.

## What is switched on

`.claude/settings.json` sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, so this
session can spawn teammates rather than only ephemeral subagents. It is still an
experimental feature. Setting the variable to `0` in a higher-precedence
settings file turns it back off without restarting.

`.claude/settings.local.json` (untracked) carries
`"crossSessionInbound": "accept"`, so a background session can take a message
from another session unattended instead of holding it for approval you are not
there to give.

`.claude/hooks/teammate-gate.sh` runs on `TeammateIdle` for the four leads. It
runs `npm run check` (about 2 seconds) and exits 2 when it is red, which feeds
the failure back and keeps the teammate working rather than letting it hand over
a broken tree. It deliberately does not run Playwright: those suites share one
SQLite database and take minutes, so suite selection stays with
`npm run test:changed`.

## Running it

Name the session, because names are the addresses other sessions use:

```bash
claude --name storyjar-lead
```

Spawn teammates in plain English. Name the agent type and Claude uses the
definition in `.claude/agents/`:

```
Spawn three teammates: ops-lead to finish the mail screens, child-lead to take
the canvas toolbox, and platform-lead to unpick the Mailjet MX problem.
Have each report to me when a task lands.
```

Then in the agent panel below the prompt: up and down arrows to select, Enter to
open a teammate's transcript and message it directly, `x` to stop one, Ctrl+T to
toggle the task list.

For work that should outlive the terminal, dispatch a background session
instead. Those run under a supervisor process, survive closing your shell, and
move themselves into their own git worktree under `.claude/worktrees/` before
editing anything:

```bash
claude --bg "As child-lead, build the parameterised shape kits for the canvas
toolbox. Run npm run check constantly and npm run test:a11y before you stop."

claude agents        # list, dispatch, attach
claude attach <id>
claude stop <id>
```

Pin a long-running background session with Ctrl+T in agent view. Idle sessions
are otherwise stopped after about an hour to free resources.

## Two habits worth keeping

**Review before landing, not after.** Anything touching authentication, access
control, the approval queue, children's data or uploaded media goes to
`safeguarding-reviewer` first. It is read-only and runs in plan mode, so it
cannot be talked into fixing what it found.

**Ask for a notice instead of polling.** "Tell me when the platform session
finishes what it is working on" subscribes for one idle notice. It costs the
watched session nothing and expires after 12 hours. Sending "are you done yet"
messages costs both sessions a turn each time.

## Where the limits are

- Teammates cannot spawn teammates. There is one team per session, the lead is
  fixed for the session's life, and `/resume` does not restore in-process
  teammates. Deeper hierarchies are built from independent named sessions wired
  together with `SendMessage`, not from one nested team.
- Teams do not form in headless `claude -p`. A named subagent there stays an
  ordinary subagent.
- Nothing restarts a dead session for you. That needs a shell script or a
  launchd job watching the process.
- Each teammate is a separate Claude instance with its own context window, so
  tokens scale linearly with fleet size. Three focused teammates beat five
  scattered ones. Start at three.

## The permission lists

`.claude/settings.json` also carries an allow list for the test commands, so a
teammate can run the battery without asking, and a deny list covering `.env`
reads, force pushes and database resets. Those three are the actions no agent
should ever take unattended in this repo: `.env` holds live third-party
credentials on every machine in the project (this is the root cause behind F43),
a force push on a public repo is unrecoverable, and a database reset destroys the
fixtures the gates depend on.

Widening the ops five-module import allowlist is never a local decision, because
`scripts/select-suites.mjs` narrows a PR's test selection on the same list.
`.claude/settings.local.json` is untracked but not gitignored.
