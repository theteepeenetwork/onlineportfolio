# Launch runway: 22 August to 1 September 2026

Ten days. Written 22 Aug 2026. Supersedes `LAUNCH_PLAN.md`, which still carries
the wrong Tapestry claim and the retired flat pricing.

**Launch definition, settled with Mark:** soft launch. Founding teachers on the
free tier are the real target (the `foundingMember` stamp closes 1 Sept), and
the buy path must work if a school asks for it the same week.

## The evidence this plan is built on

Not opinion. Three sources already in the repo:

1. **`USER_TESTING.md`** — the last persona run: 11 testers, 28 journeys, 122
   findings, 0 blocker, 42 major. This is the class of children and the scores
   of teachers. It has already been done.
2. **`FINDINGS.md`** — the logged security and quality gaps. Open at time of
   writing: F28, F30, F31, F32, F35, F40.
3. The production environment facts recorded on 19 Aug: `OPS_ENABLED` and
   `MAIL_HMAC_KEY` unset, all four Stripe band prices now set but never
   exercised end to end.

Re-run `npm run test:personas` before acting on any of it, so the list is
current rather than three days old.

## Tier 0: the doors do not open without these

| # | Item | Evidence | Owner |
| --- | --- | --- | --- |
| 0.1 | `OPS_ENABLED=1` and `MAIL_HMAC_KEY` set in Railway production, operator account seeded | `/ops` 404s to everyone today, including Mark. `docs/TEST_LOGINS.md` §4 | `platform-lead` with Mark (needs Railway auth) |
| 0.2 | One real Stripe checkout, one band, end to end, then refunded | All four price IDs are set and none has been bought | `teacher-lead` + `platform-lead` |
| 0.3 | F35: backup evidence points at the United States | High, Open. UK children's data, and Mark is the DPO | `platform-lead`, `safeguarding-reviewer` signs off |
| 0.4 | F30 and F31: mail failures are silent and the suppression check is manual | The school business manager persona: "I cannot see anything about email from here. If sign-in letters to families are bouncing, I have no way of knowing, and I am the person parents will ring." | `platform-lead` + `ops-lead` |
| 0.5 | Policies out of "Draft, under review" | Compliance block, recorded 19 Aug | Mark |

Launch week is the week sign-in letters go to families. 0.4 is the difference
between finding out from a dashboard and finding out from an angry head teacher.

## Tier 1: the four things Mark named, ranked by what the testers said

| # | Item | What the evidence says | Owner |
| --- | --- | --- | --- |
| 1.1 | A reachable export: per child, per class, and something a school can leave with | A class export already exists at `src/app/teacher/export/[classId]/route.ts`. The tester found it "inside class settings, beside the button that permanently deletes the class". There is no per-child export and no subject-access route | `teacher-lead`, `safeguarding-reviewer` signs off |
| 1.2 | Teacher toggle for shape snap | `SNAP_UNITS = 10` is unconditional at `DrawingCanvas.tsx:5004`. Rotation snaps at 15°, also unconditional | `child-lead` owns the canvas, `teacher-lead` owns wherever the control lives. Agree the interface before either writes |
| 1.3 | Admin panel clarity | Seven tabs. "As the account holder I get an empty screen with no children on it and no explanation." Plus no email visibility, no way to close the account with deletion | `teacher-lead` |
| 1.4 | Child dead ends | Three routes leave a child on an error page with nothing to tap: `/ops`, `/student/activities/<bad-id>`, `/student/new/<nonsense>`. Plus "After tapping around I have ended up somewhere with no way back to my jar" | `child-lead` |
| 1.5 | The teacher's feedback is findable | Three testers, separately: "I cannot find what my teacher actually said." Feedback a child never reads is feedback that did not happen | `child-lead` |
| 1.6 | 16 controls under the 64px child target, and unlabelled controls | SAFEGUARDING rule 18. This is a safeguarding rule, not polish. Includes Undo, Redo, Clear page, Colour, Line thickness | `child-lead` |
| 1.7 | A leaked class code can be changed | `rotateClassCode()` already exists at `classes.ts:130`. The teacher tester reported "there is nothing here to change it" and thought deleting the class was the only option. Likely a surfacing job, not a build | `teacher-lead` |
| 1.8 | The assign panel preselects the wrong class | "The panel opened with Ducklings already chosen, not the class I was looking at, and Assign to whole class is one tap below it." Year 6 work to Reception in a single mis-tap | `teacher-lead` |

1.7 and 1.8 are small and dangerous, which is the best ratio on this list. Do
them first.

## Tier 2: deliberately after 1 September

- **Canvas kit phases 2 to 4.** An older client coerces unknown shape kinds to
  `rect` and drops unknown fields, so a rollback loses new shapes on the next
  save. That is a one-way door and it does not get opened in launch fortnight.
  See `project_canvas_toolbox` phasing.
- **The September class rollover.** The single largest thing the testers found
  ("There is nothing anywhere for the September job: moving each class up a year
  and handing it to its new teacher"). Too big for ten days. Write the manual
  path into the admin Guide tab so a school in September has an answer, and
  build it in the autumn term.
- **`LAUNCH_PLAN.md` rewrite.** Internal, and this file replaces it in practice.

## How the fleet runs it

Two waves, because the duplication question is a decision Mark makes, not one an
agent makes.

**Wave 1, read only.** Four leads map their own surface, mark every place two
routes reach the same content, and rank the persona findings on their patch
against the effort to fix them. Nothing is edited. Output is a decision sheet.

**Wave 2, build.** Mark picks from the sheet. The leads implement, the
`safeguarding-reviewer` signs off anything touching auth, access control, the
approval queue, children's data or media, and `battery-runner` keeps the gates
green.

The prompts for both waves are held with Mark rather than checked in, because
they name what he chose on the day.

## Action required: Railway support question (backup region — F35)

`RETENTION.md` open item, `launch-runway.md` tier 0.3, and SAFEGUARDING rule 10
all require the geographic location of Railway volume backups to be confirmed
before the privacy notice can say where backups are held. Railway's documentation
describes the backup schedule and pricing but does not state a region. This is a
question for Railway support.

**Send this verbatim to Railway support:**

---

Subject: Volume backup storage region — europe-west4 service

Hello,

We are running a service in the europe-west4 (Amsterdam) region on the Railway
Pro plan. We have volume backups enabled on that service and need to confirm
where the backup snapshots are physically stored for data protection purposes.

Specifically:

1. Are volume backup snapshots stored in the same geographic region as the
   volume itself (europe-west4 / EU)?
2. If not, which region or regions may they be stored in?
3. Is there a way to constrain backup storage to EU regions only?

We hold children's personal data and our Data Processing Agreement with schools
commits us to EU storage for all personal data, including backup copies. We
cannot make that statement in our privacy notice until we have a written
confirmation of where the backups sit.

Thank you.

---

**What to do with the answer:**

- If backups are confirmed EU-only: update `RETENTION.md` open item (remove the
  checkbox and record the date and the answer) and update `/legal/privacy` to
  name the region.
- If backups are NOT EU-only: this is a finding (F35 is already logged). Record
  the answer, do not update the privacy notice, and raise with `platform-lead`
  and `safeguarding-reviewer` before the pilot opens.
- Either way: record the Railway ticket or email reference alongside the answer
  so the basis for the claim is auditable.
