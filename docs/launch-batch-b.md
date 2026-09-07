# Wave 2, Batch B

Written 22 August 2026, to start when Batch A has landed and the gates are green.
Evidence is `docs/launch-triage.md`. Scope rules are `docs/launch-runway.md`.

Batch A is the small and dangerous set: the child URL crash, the rotate-code
surfacing, the assign-panel preselect, the export move, the admin empty state,
F31 then F30, and F32. Batch B is everything that needs a schema change, a
safeguarding sign-off, or a decision that Batch A is still gathering.

## The calendar this fits into

| When | What |
| --- | --- |
| Sat 22 to Sun 23 Aug | Batch A |
| Mon 24 to Thu 27 Aug | Batch B |
| **Thu 27 Aug, end of day** | **Freeze on anything touching children's data, the canvas, or the schema** |
| Fri 28 Aug | Freeze on everything else. Full battery, `npm run test:changed -- --all` |
| Sat 29 to Mon 31 Aug | Manual walkthrough on real devices, landing page, pilot outreach. No code |
| Tue 1 Sept | Founding member cutoff |

The freeze is the point. An unproven change on launch day costs more than the
feature it carried. If Batch B is not done by Thursday, the remainder moves to
the autumn term rather than into the freeze.

## Railway variables: one deploy, three values

Every one of these is Mark's hands, and each triggers a redeploy on its own, so
set all three together.

| Variable | Value | What stays broken without it |
| --- | --- | --- |
| `OPS_ENABLED` | exactly `1` | `/ops` 404s to everyone including Mark. No operator console on launch day, and the persona operator journeys cannot run |
| `MAIL_HMAC_KEY` | a 32+ byte random secret | Suppression checking is off. `/ops/mail` reads "not monitored", and `npm run db:seed:test` refuses |
| `MAIL_SUPPRESSION_SYNC` | exactly `1` | The F31 scheduler refuses to run anywhere, so `/ops/mail` says "Never" and the F30 verdict banner has no data |

The exact-`1` convention is deliberate and matches `OPS_ENABLED`: `true`, `yes`
and `TRUE` are all refused, so a typo fails closed rather than half-enabling a
thing. This pairing is also recorded in F43's deployment note, so the runbook and
the findings file can be checked against each other.

Verify after the redeploy:

```
curl -s -o /dev/null -w "%{http_code}" https://storyjar.co.uk/ops/sign-in   # expect 200
```

Then work steps 3 to 8 of the operator runbook in `docs/launch-triage.md`
(prepare materials, `railway ssh` and then
`npx tsx scripts/seed-operator.ts <email>` at the container prompt, sign in and
enrol TOTP, ten recovery codes onto paper, verify each screen). It is `ssh` and
not `run` because the database is a file on the volume and only exists inside
the container: see F44.

## What Batch B builds

### 1. Rotation, then snap

**Blocked on** the child-lead rotation investigation from Batch A.

Mark's own testing: position snap is fine and stays on. Rotation was the limiting
one, and a long line felt like 45 degree jumps although `ROTATE_STEP` is 15 at
`DrawingCanvas.tsx:197`. The working hypothesis is that rotation is judged by how
far the far end of an object travels rather than by degrees, so a flat angular
step is comfortable on a counter and unusable on a long line.

That makes the leads' Wave 1 agreement wrong in one respect: `snapEnabled` must
not couple position and rotation. Whatever the investigation returns, the shape
of the work is:

- Rotation gets its own answer, either a step that scales with object length, a
  finer step for line-like objects, or a modifier key for free rotation. Cheapest
  honest option wins.
- Position snap keeps `SNAP_UNITS = 10` (`DrawingCanvas.tsx:167`) unconditional
  unless the investigation says otherwise.
- If a teacher-facing control is still wanted after the rotation fix, it is
  `snapEnabled Boolean @default(true)` on `ActivityTemplate`, snapshotted to
  `Assignment` at assign time, as the leads designed. Roughly 3 to 4 hours
  teacher side, 3 hours child side, and the migration gates both.

**Decision Mark owes before this starts:** does the rotation fix alone solve it,
making the toggle unnecessary before launch? If yes, this item shrinks from 7
hours to about 2 and the schema change leaves the fortnight entirely. Prefer that.

### 2. Per-child export for a subject access request

`teacher-lead`, with `safeguarding-reviewer` sign-off. Touches a named child.

The class export already exists at `src/app/teacher/export/[classId]/route.ts`,
schema `storyjar-class-export-v1`, JSON attachment. It carries class metadata,
per-pupil first name and `createdAt`, and each pupil's moments including type,
caption, text, status, activity title, skills, media **paths** and timestamps,
across all statuses including PENDING and RETURNED. It omits media bytes,
assignment config, and family access data.

Two versions:

- **Paths only, about 2 hours.** Same shape as the class export, scoped to one
  child. Answers "what do you hold about my child" in a defensible form.
- **With media bytes, 6 to 8 hours.** Streaming zip. Crosses Rule 9 territory and
  is the one a parent actually wants.

**Recommendation: build the paths-only version now** and write the media route
into the Promises tab as a manual process with a stated timescale. A DSAR
answered by hand within the statutory window is compliant. A half-built streaming
zip shipped on 27 August is not.

School-wide export stays cut. It is 6 to 10 hours and no pilot school will ask
for it in September.

### 3. The child accessibility set

`child-lead`. None of it touches auth or child data, so no sign-off needed.

| Item | Evidence | Hours |
| --- | --- | --- |
| Quiz answers render at 190x57, under the 64px child floor | SAFEGUARDING rule 18. "One/Two/Three" for a four-year-old | 1 to 2 |
| EYFS quiz question is never read aloud | In the register built for children who cannot read, the question is the one silent thing. `lib/readAloud.ts` already exists, wire it in | 2 to 3 |
| Plain-text capture loses typed text on reload | Canvas has IndexedDB autosave from F34, the words `<textarea>` has none | 2 to 3 |
| `/family` overflows 345px on a 390px phone | `FamilySignIn.tsx`, CSS only. This is the screen every parent meets first | 1 |
| Caption input is placeholder-only, no label | `StudentCapture.tsx` around line 79, silent to a screen reader | 0.5 |

The read-aloud item is the one with product weight rather than compliance weight.
An EYFS child who cannot hear the question cannot do the activity, and EYFS is
the register that differentiates StoryJar.

### 4. The teacher finishing set

`teacher-lead`.

| Item | Evidence | Hours |
| --- | --- | --- |
| Warn when editing an activity a class is working on right now | "Nothing here tells me whether editing this changes the version the class is working on RIGHT NOW, or only future ones. That is the only thing I need to know before I touch it" | 1 to 2 |
| Seven teacher and admin controls under the touch floor | One fix in `TeacherShell.tsx` plus the nav | 2 to 3 |
| Whether a teaching assistant can tell what she may do | `staffRole` exists, the Guide tab does not enumerate it. Investigate first | 1, plus 1 to 2 if it is surfacing |
| Email health badge in the Admin Billing tab | Depends on Batch A F30 landing first. The school business manager is the person parents ring | 1 to 2 |
| September rollover written into the Guide tab as a manual path | The build is deferred. A school in September still needs an answer | 1 |

### 5. Deliberately not built

Recorded so the decision is visible rather than forgotten.

- **Account closure with deletion.** Blocked on F26 and F27, then 6 to 10 hours
  with sign-off. Autumn term.
- **School-wide export.** 6 to 10 hours. Autumn term.
- **September rollover automation.** The largest single thing the testers found,
  two to three days. Autumn term, with the manual path documented now.
- **Canvas kit phases 2 to 4.** An older client coerces unknown shape kinds to
  `rect` and drops unknown fields, so a rollback loses new shapes on the next
  save. A one-way door does not get opened in launch fortnight.
- **F26, F27, F28, F40.** Logged, not launch-critical.

## What deferring costs, and who pays it

Three of the five deferred items are things a school can legitimately ask for
from day one: get our data out, close our account and delete it, answer a subject
access request. Deferring the **user interface** is a reasonable engineering
decision. Deferring the **capability** is not, because the right exists whether or
not the button does.

So the deferral has a condition attached, and it is Mark's to discharge as DPO,
not an agent's:

- The Promises tab and the published policies must state the manual route and a
  timescale for each of the three.
- The operator handbook must carry the steps, because Mark is the one who will
  action them.
- The wording must not promise a feature. It promises a response.

If that writing does not happen, the deferral turns a UX gap into a compliance
gap, which is a much worse trade.

## Carried forward from Batch A

Verified against the tree on 23 August. Batch A landed nine of its twelve items
and `npm run check` is green, including the ops blindness self-test. Two items
were assigned and did not arrive, and one new item came out of the work.

**Status, 23 August: Batch A cleanup is closed.** The full battery runs cold and
green, 666 passed and 0 failed in 5.4 minutes. Two problems surfaced during the
cleanup and both are resolved: the AssignSheet spec bill (Option A, no
preselection, class-selection step added to the callers) and F43, an in-app
scheduler that called the live Mailjet account from every dev server because it
gated on credentials rather than environment. C1 and C2 below are still open and
still come first.

### C1. The rotation investigation was never written down

Item 3 of Batch A asked `child-lead` to investigate why a long line feels like
45 degree jumps when `ROTATE_STEP` is 15, read only, and report. No report
exists in `docs/`, and the finding did not reach any file. If it was answered in
the session transcript it is effectively lost.

**This gates Batch B item 1.** Nothing about snap or rotation can start until
the question is answered. Redo it first, and require the answer as a file this
time rather than a message.

### C2. The child is still stranded on the activity response screen

Item 2 asked `child-lead` to audit `ActivityResponseForm` for the missing escape
route and fix it. `ActivityResponseForm.tsx` is unmodified, and neither
`activities/[id]/page.tsx` nor `student/layout.tsx` renders a link back to the
jar. Only `popped/page.tsx`, `StudentCapture.tsx`, `activities/page.tsx` and the
new `not-found.tsx` carry one.

The new `not-found.tsx` boundary is good work but it catches a different case: a
bad URL, not a child stuck inside a form that is working correctly. The persona
complaint, "After tapping around I have ended up somewhere with no way back to
my jar", lands on exactly the screen that still has no way back. **1 to 2 hours,
and it is the highest-harm item left on the child surface.**

### C3. A live screen still tells the old backup story

`src/app/ops/health/page.tsx:275` says "RETENTION.md describes a 35-day rolling
backup cycle to schools". `RETENTION.md` no longer says that. The real schedule
is 6 days daily, 1 month weekly, 3 months monthly. **15 minutes.**

### C4. Mark's own check, not an agent's

The corrected retention schedule changed more than a number. The erasure window
moved from "about one month" to "up to about 3 months", because the monthly
backup tier holds a record longer than the old text allowed for. That is a
change to what a school is told about how long deletion takes.

Nothing under `src/app/legal` states a figure, so the published pages are not
wrong. But `src/app/admin/Promises.tsx` is school-facing and should be read
against the new schedule, and the erasure runbook in the operator handbook needs
to account for the three-month tail. **Mark's call as DPO, not a code change.**

### One note on the gate widening

`@/lib/mailHmac` was added to the ops import allowlist so the in-app scheduler
could HMAC addresses without a non-ops file importing from `@/lib/ops/`. It was
done properly: the widening landed in the same commit as the code it permits,
with a comment naming the rule, a near-miss fixture proving the true positive
still fires, a clean-shape fixture, and `select-suites.mjs` updated so the two
lists still match. The self-test passes.

One correction: the comment calls it "the fifth entry". It is the sixth. Worth
fixing, because this is the comment a future reader trusts when deciding whether
a seventh is justified.

## The Batch B prompt

Paste this once Batch A has landed and `npm run test:changed -- --all` is green.
Replace the bracketed line with the rotation decision.

```
Wave 2, Batch B. Read docs/launch-batch-b.md and docs/launch-triage.md first.

Freeze is Thursday 27 August end of day for anything touching children's data,
the canvas, or the schema. Anything not landed by then moves to the autumn term.
Tell me on Wednesday if you are going to miss it. Do not rush a schema change
into the last afternoon.

Two items from Batch A were assigned and did not arrive. They come first.

Spawn child-lead, teacher-lead and platform-lead. ops-lead is not needed.

child-lead, in this order:
  C2 FIRST. The child is still stranded on the activity response screen.
     ActivityResponseForm.tsx is unmodified and neither the page nor the layout
     renders a link back to the jar. The not-found boundary you built catches a
     bad URL, not a child stuck in a form that is working. Fix it, and add a
     spec so it stays fixed.
  C1 SECOND, read only, and WRITE IT TO A FILE at docs/rotation-findings.md.
     Why does rotating a long line feel like 45 degree jumps when ROTATE_STEP is
     15 at DrawingCanvas.tsx:197? My hypothesis: rotation is judged by how far
     the far end of an object travels, not by degrees, so a flat step is fine on
     a counter and unusable on a long line. Say whether that holds, and give me
     options with hours. Do not write canvas code yet. Stop and report.
  Then the accessibility set: quiz answer touch targets, EYFS read-aloud on the
  quiz question, text loss on reload, /family phone overflow, caption label.

teacher-lead:
  The per-child export, paths only, no media bytes. Route it through
  safeguarding-reviewer before it lands, it touches a named child.
  Then C3: src/app/ops/health/page.tsx:275 still says RETENTION.md describes a
  35-day rolling cycle. It does not any more. Fix the sentence.
  Then the edit-while-live warning, the teacher nav touch targets, the TA role
  investigation, and the September rollover manual path in the Guide tab.

platform-lead:
  Fix the "fifth entry" comment in check-ops-blindness.mjs, it is the sixth.
  Then the email health data the Admin Billing badge needs.
  Then support whoever is blocked. Keep the gates green.

Nobody builds account closure, school-wide export, rollover automation, or any
canvas kit work. Nobody touches rotation or snap until I have read C1 and told
you what to do. If you think one of those is needed, tell me, do not start it.

Report as each item lands.
```
