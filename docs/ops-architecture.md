# ops-architecture: decisions, dated

**What this is.** The platform operator programme is governed by a stack of
documents: `SAFEGUARDING.md` and `RETENTION.md` first, then the owner
amendments, then the team handbook, then the six role briefs. This file sits at
level 2 with the amendments: **an owner decision recorded here, with a date,
outranks the handbook and every brief.**

It exists because until now the decisions made during this programme lived only
in code comments and pull request descriptions, which is not a place a future
reader will look and not a place a school's data protection lead could be shown.

**How to read the status column.**

- **OWNER** means the owner was asked and answered. That answer is binding.
- **DEFAULT APPLIED** means the handbook published a default for an unanswered
  decision and the work proceeded on it. It is **not** owner-confirmed, and it
  is listed here so it can be overturned cheaply rather than discovered later.
- **OPEN** means the work is blocked or proceeding without it, as noted.

---

## Decisions taken

| Date | Ref | Decision | Status |
| --- | --- | --- | --- |
| 2026-08-16 | G1 | Build the whole programme now rather than holding PR1 to PR8 until mid-September. The dependency order in G2 still binds. | OWNER (amendment G1) |
| 2026-08-16 | Wave 0 | `main` was red after PR #112 merged, because a conflict resolution dropped three imports. Fixed forward in PR #113 rather than reverting #112, on the grounds that the feature was sound and only the merge was damaged. | OWNER |
| 2026-08-16 | Wave 1 | Read role brief 05 (SRE) first, per the handbook's own handoff order. | OWNER |
| 2026-08-17 | D7 (build) | Counters-only implemented. Three tables, none holding a recipient or a domain. Two of brief 05's field names changed and both were the blindness gate's doing: `MailCounter.template` became `templateKey` because `template` is a relation to `ActivityTemplate`, and `JobRun.note` became `outcomeDetail` because the gate refuses a column whose name ends in "note". `bytes` was dropped: there is no backup job to fill it. | Implementation, PR5 |
| 2026-08-17 | PR5 gate | Three widenings, no strictening, applied by the tech lead rather than the author. `JobRun` and `MailCounter` classified OPS_OWNED; `MailSuppression` LOOKUP_ONLY, chosen because that class refuses `findMany`, and `findMany` here is a register of locked-out families. `@/lib/mailStatus` added to the import allowlist. The vocabulary was first written at `src/lib/ops/mail.ts`, the name R1 suggests, and the gate refused it: a file that imports an ops module is walked as ops code, so the mailer importing it dragged `mailer.ts` and `mailCounters.ts` into the operator scan. Moving it out and buying one allowlist entry is the smaller change and the better architecture. | Implementation, PR5 |
| 2026-08-17 | PR6 health pane | The pane renders what it can work out from inside the process and says "Not monitored" for the rest: five of seven tiles are dark and each says why. R19 is honoured by never calling /api/health. Reading the startup check's real verdict would need one entry on the gate's import allowlist for a pure verdict store; PR6 proved both directions and reported it rather than taking it, and the tech lead declined it, because a dark tile that explains itself is better than more code and a wider gate. PR6 also refused a third option it could have taken silently, interposing a pass-through module so the health checker never appears in the import walk, on the grounds that passing a gate by arranging the import graph is laundering. | Implementation, PR6 |
| 2026-08-17 | D4 | TOTP uses the `otplib` library rather than a hand-rolled RFC 6238 implementation. Vetted before adoption: 13.4.1, MIT, maintained, crypto plugins are `@noble` and `@scure`. `npm audit --omit=dev` reports 0 vulnerabilities with it installed. | OWNER |
| 2026-08-17 | R11 vs C2 | **An operator may NOT see how many children a parent has.** Amendment C2 permits a bare count and outranks handbook R11, which bans it. The owner was asked directly and chose the stricter rule. The blindness gate enforces R11 and its failure message explains why. Relaxing it later is one line plus a fixture. | OWNER |
| 2026-08-17 | D5 | **School deletion does not exist in v1.** The handbook default, chosen. It is gated on R12 regardless: no deletion before a rehearsed restore. | OWNER, took the default |
| 2026-08-17 | D13 | **No external uptime monitor.** The gap is recorded rather than closed. Consequence, accepted: five of seven tiles on the health pane read "not monitored", and if the service stops answering at 4am the first to know is a teacher at 8:40. It also leaves PR5's mail alerting (F30) with nowhere to send an alert. | OWNER, took the default |
| 2026-08-17 | D8 | **`error-string-audit.mjs` stays advisory repo-wide**, strict over the ops tree only. No definition of done may cite it as a gate outside ops. | OWNER, took the default |
| 2026-08-17 | D10 | **Rule 20 is not merged.** No wording is added to `SAFEGUARDING.md` without explicit approval, which includes the narrower rule 6a that amendment D3 asked for. The proposal stays a proposal. | OWNER, took the default |
| 2026-08-17 | Registry | **`OPS_BILLING_FREEZE_RUN` is NOT added.** The operations registry stays closed at two entries. PR6 raised it as a candidate and the reasoning against is its own: without a job record nothing can show that the job ran, so the health tile stays dark whether or not the button exists. | OWNER, took the default |
| 2026-08-17 | **D2** | **ANSWERED AND EXECUTED BY THE OWNER.** Railway upgraded to Pro; daily and weekly volume backups are switched on. Amendment B1's premise (Pro-only) turned out to be right about the plan even though Railway's public documentation states no restriction. **RPO and RTO: nightly, back within a day.** Worst case is 24 hours of children's work lost and a school offline for most of a school day, accepted knowingly for a ten-school pilot. OPS-0b is unblocked. **R12 is NOT yet satisfied**: a restore still has to be rehearsed before deletion (PR8) can ship. | OWNER |
| 2026-08-17 | **D3** | **A platform action IS visible in the affected school's own audit feed, action only, WITHOUT the operator's free-text reason.** The school sees that Storyjar rotated a family code, when, and for which pupil. The reason stays internal because it may name a child (the accepted D9 residual) and teachers should not be shown unvetted text about other families. | OWNER |
| 2026-08-17 | D9 | **`correctAdultEmail` does not exist.** An operator cannot change an adult's email address. Changing a teacher's address is a route into their account: change it, trigger a reset, become that teacher, reach that class's children. Every step is a legitimate operation, so no gate can catch the sequence. Support answer: the teacher changes it themselves, or a school admin re-invites them. | OWNER |
| 2026-08-17 | D6 | **Manual payment recording is dropped from v1.** A manual override that the next Stripe webhook silently reverts is worse than no control, because someone will trust it. Billing screens are read-only with a link out to Stripe, which is where the truth lives. | OWNER |
| 2026-08-17 | Wave 5 | Proceed on the handbook defaults for the remaining wave 5 decisions rather than pausing. D7 therefore stands at counters only for mail. | OWNER |
| 2026-08-17 | D6 (build) | Implementing D6: billing is its own screen at `/ops/billing`, separate from `/ops/schools`, and the blindness gate was widened by exactly one allowlist entry, `@/lib/stripeMode`. Two schools of thought were weighed and both are recorded because a reader will ask. **Separate screen** because `/ops/schools` is asserted to link nowhere at all, and that property is worth more than avoiding one extra route: putting the Stripe link there would have meant weakening an existing blocking assertion. **`@/lib/stripeMode` rather than `@/lib/stripe`** because the obvious import builds the Stripe SDK client from the secret key, which would put `getStripe()` one keystroke from every operator screen; the new module holds two functions over one environment variable and returns only booleans, so the secret stays outside the ops path. The widening is bounded and carries three fixtures proving the near misses still fail. | Implementation, PR3 |
| 2026-08-16 | R1 | Code namespace is `ops`, never `admin`, because `src/app/admin/` is already the school console. The public URL is a separate question (D1). | Handbook ruling, not disputed |
| 2026-08-17 | PR4 registry | **The operation registry is closed, and adding a row is four edits.** `src/lib/ops/registry.ts` holds the list; `src/lib/ops/operations.ts` is the only module under the ops roots permitted to write anything that is not the operator's own record, enforced by the new gate rule OPS-MUTATION-MODULE; `tests/battery/security/ops-operations.spec.ts` carries the same ids as a literal list, so the battery goes red in both directions if they disagree; and the table below has to say so too. None of that decides anything on the owner's behalf. It makes adding an operation a visible act in a diff rather than a function somebody wrote. | Implementation, PR4 |
| 2026-08-17 | PR4 scope | **Rotating a class code was asked for and is NOT built.** Rotation itself is fine; picking a class is not. Nothing in the operator area can see a class, deliberately: `Class` is aggregate-only and `classId` is refused as an identifier anywhere under the ops roots, because a per-class figure in a class of one names that child. Offering this operation would mean putting a list of class names and class ids on an operator screen, which is a widening of what the operator can **see** rather than of a call shape, in order to duplicate a button the teacher already has on their own class page. The blind alternatives are worse: every class code at a school, keyed on the school id, takes a whole school's children offline over one leaked code; every class code belonging to one teacher cannot be written at all, because the column is unique and one `updateMany` cannot give each class a different value. **The gap this leaves, for the backlog:** a class code belonging to a teacher who has left cannot be rotated by anybody, because `rotateClassCode` is scoped to the acting teacher. That is a missing capability in the **school** console, where an admin can hold it against a class in their own school. | Implementation, PR4 |
| 2026-08-17 | PR4 gate | Three widenings and one strictening, all in the same commit as the code they permit, each with fixtures. Strictening: **OPS-MUTATION-MODULE**, which refuses a Prisma write anywhere under the ops roots except the operations module (before this, `School` and `Teacher` could be updated from any ops file, so the registry was a convention). Widenings: `src/lib/ops/operations.ts` as the fourth module permitted to import the Prisma client; `@/lib/familyCodeMint` on the import allowlist, being the pure minting half split out of `@/lib/familyCode` so ops does not drag the database-coupled half into its import walk; and **OPS-ROTATION-WRITE**, one permitted write shape on somebody else's record, `data: { familyCode: makeFamilyCode() }` in the operations module only, with the value minted inline so no name holds it and no line can return it. A bound value fails, the same identifier in a `select:` fails, the same shape in another file fails, and `data: { email: … }` fails, which is what keeps D9 structural. | Implementation, PR4 |

## Defaults applied without an owner answer

These are proceeding on the handbook's published default. Each is cheap to
overturn today and progressively less cheap later.

| Ref | Default applied | Where it shows up |
| --- | --- | --- |
| D1 | URL prefix `/ops`. | Every route under `src/app/ops/`. |
| D11 | One operator account. The `OWNER` / `OPERATOR` split is modelled on the row so "last owner protected" is expressible, but nothing creates a second account and no action exercises the split. | `Operator.role` in the schema. |
| ~~D3~~ | **Moved to the Open table on 2026-08-17.** The first platform mutation landed in PR4, so "not yet reached" stopped being true and no default has been applied. See D3 below. | Previously read: not yet reached, becomes live at the first PR that carries a mutation. |

## D3 is answered but not yet buildable, and that is worth reading

The owner's answer on 2026-08-17 was: yes, a platform action appears in the
affected school's own audit feed, action only, without the operator's free-text
reason. Implementing it for the one operation that exists (rotate a family code)
runs straight into the owner's OTHER answer, from the same day.

`AuditLog` is indexed on `schoolId`, and that field is what puts a row in a
school's feed. `Parent` has no `schoolId`. The only path from a parent to a
school is `Parent -> children -> class -> teacher -> schoolId`, which is exactly
the parent-to-child linkage ruling R11 forbids and the blindness gate refuses as
`OPS-PARENT-CHILD-LINK`. The owner was asked about R11 directly and chose to
keep it refused, against the letter of amendment C2.

Moving the lookup into a helper does not avoid it: PR5 established that any
module the ops tree imports is walked and scanned as ops code, so the traversal
would fail in the helper instead.

**The proposal, needing an owner decision before it is built.** Permit the
traversal in exactly one place, `src/lib/ops/audit.ts`, in exactly one shape,
where its result is written into an audit row and never returned to the caller.
The argument for it: a school's own transparency record is not the operator
seeing anything, and the operator screen would still be unable to display a
school, a class or a child. The argument against: it puts the banned traversal
inside ops code for the first time, and the thing standing between it and an
operator screen becomes a gate rule rather than the absence of any code that
can do it.

If that is too much, the honest alternatives are to drop D3 for this operation
and say so to schools, or to add `schoolId` to `Parent`, which is worse because
it makes the linkage permanent in the data model rather than momentary in one
function.

## Open, and what each one blocks

| Ref | Question | Blocks |
| --- | --- | --- |
| ~~D2~~ | **Answered 2026-08-17, see the decisions table above.** Original framing kept for the record: Railway's documentation states **no plan restriction** on volume backups and prices them by usage, so the "$15 uplift" premise of amendment B1 is doubtful. It also states retention of 6 days daily / 1 month weekly / 3 months monthly, none of which is the 35 days `RETENTION.md` promises; that line needs correcting whichever option wins. Two further facts push toward an off-provider copy: wiping a volume deletes all its backups, and a backup can only be restored into the same project and environment. See `docs/ops-backup-options.md` section 6a. What remains is a thirty-second dashboard check and the RPO/RTO numbers. | **Original entry follows.** |
| **D2 (original)** | **Backups.** Which option, and the RPO and RTO numbers. Options are costed in `docs/ops-backup-options.md`. **The first step is not a choice but a fact**: confirm in the Railway dashboard whether volume backups are available on the current plan. Amendment B1 says Pro only; Railway's public documentation says no plan restriction and never mentions point in time recovery. | **OPS-0b entirely.** Through R12, all deletion work (PR8). And the pilot: `RETENTION.md` line 63 promises schools a 35 day backup cycle that does not exist. |
| **D3** | **Are platform actions visible in the affected school's own audit feed. Live as of 2026-08-17, and unanswered.** PR4 shipped the first thing a platform operator can do to a school's data: issuing a new family code. **It was built WITHOUT the school-visible row**, rather than on the handbook's published default of "yes", because this is one of the decisions section 7 reserves to the owner and the honest thing is to leave it visibly undone rather than guess. State the cost plainly: today a school's own audit feed shows nothing when Storyjar rotates one of their family codes. The teacher sees a different code on the pupil's page and no record of why, and the operator screen tells the operator, in words, that they have to ring the school. **If the answer is yes**, the change is small and lands in one place: the same transaction in `src/lib/ops/operations.ts` also writes one `AuditLog` row with `actorType: "PLATFORM"` through the single write-only helper in `src/lib/ops/audit.ts`, which the blindness gate already permits (`db.auditLog.create`, that file only). What needs deciding with it: whether the operator's free-text reason is copied into a feed teachers read, given a reason may name a child, or whether the school-visible row says only that a code was re-issued by Storyjar and when. | Nothing is blocked. One operation is shipping without a school-visible record, and every further mutation adds to that. |
| D5 | Does school deletion exist in v1 at all. | PR8. Gated on D2 regardless, per R12. |
| D7 | Per-recipient mail failure detail. | PR5's storage model. Default is counters only. |
| D8 | Promote `error-string-audit.mjs` to blocking repo-wide. | Nothing. Scoped-strict on ops is the default. |
| D9 (part) | One residual remains open even though the email half is now answered: **a free-text reason box may name a child, and no gate can catch it.** PR2 shipped that box. Recorded as an accepted residual in `docs/DPIA.md` R15. | Nothing. Accepted in writing. |
| D10 | Rule 20 wording for `SAFEGUARDING.md`, including the section 7 limitation sentence. | Nothing technical. Not merged without approval. |
| D12 | Pay for a non-production Railway environment. | The restore drill, and therefore R12 and PR8. Also the unproved half of `docs/ops-recovery.md`. |
| D13 | External uptime monitor. | Nothing. Gap recorded in the runbook. |
| D14 | Succession and sealed credentials. One person holds every credential today. | Must be answered before the pilot. |
| D15 | Sending domain or provider, and whether one-click `List-Unsubscribe` can be disabled on the transactional stream. | Notification work, which is not in this programme. Escalate as a launch blocker if it cannot be disabled. |
| C2 wording | Whether the proposed `SAFEGUARDING.md` rule 6a should be narrowed as amendment D3 suggests, so it does not forbid a one-way digest before that is built. | Rule 20 numbering, and any future notification work. |

Also owner-only, from brief 06: the written definition of exactly which adult
data the operator may see. Handbook R11 is the proposed answer and the 2026-08-17
decision above confirms its strictest reading for parents. The teacher side has
not been separately confirmed.

## The operation registry

Everything a Storyjar operator can DO, as opposed to see. The list is closed:
adding a row needs the owner, and the four edits it takes are described at the
top of `src/lib/ops/registry.ts`. A blocking test asserts that this table and
the code hold the same ids, so an operation cannot exist in one and not the
other.

Every row, without exception: a stated reason of at least twelve characters
stored word for word, a confirm step that says what will happen before it
happens, and the change and its audit row written in one database transaction,
so a record that cannot be written means an operation that does not happen.

| Operation | Since | What it does | What the operator sees |
| --- | --- | --- | --- |
| `OPS_FAMILY_CODE_ROTATED` | PR4, 2026-08-17 | Issues a new family code for one family space, retiring the old one. A revocation: it takes access away and hands nothing over. Reachable only from a parent record already found by typing that adult's whole email address. | **Neither code, ever** (owner amendment C1). The new one is minted inline and never held in a variable, so nothing can return it; the school sees it on that child's page. The audit row records that a code was re-issued, never the code. |
| `OPS_PARENT_EMAIL_REVEALED` | PR4, 2026-08-17 | Shows one parent's email address in full, which is masked everywhere else (owner amendment C4). Changes nothing. Exists for the call where a school reports a parent receiving nothing and the stored address has to be compared with what they read out. | The address, once, on that screen. The address and the reason are both written to the operator audit trail. |

Refused by name, so that an absence is not mistaken for an oversight:
impersonation in any spelling, session minting, password or PIN setting, any
change to an adult's email address (D9), any deletion (R12), any export, and
rotating a class code (see the PR4 scope row above).

## Dashboard actions only the owner can take

Not decisions, but they are blocking or nearly so, and no agent can do them.

- **Confirm the backup position** in the Railway dashboard (see D2).
- **"Wait for CI"**: exists as a Railway service setting and has no API key, so
  it cannot be set from `railway.json`. Verified against Railway's own schema.
- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** is unset. Harmless on one instance,
  mandatory the moment there are two, and changing it later invalidates
  in-flight actions. Set it once and record it in the secrets inventory.
- **Baseline the production database.** The first deploy after PR #115 runs
  `prisma migrate deploy` against a database that has tables and no migration
  history. The start script handles this itself, but only after proving the live
  schema is exactly what `0_init` describes; on any difference it refuses and
  fails the boot, and the previous deployment keeps serving. That refusal is the
  guard working, not a broken deploy.

---

*Started 2026-08-17, at the end of Wave 3, because PR1 landed with two owner
decisions recorded nowhere but a code comment. Add a dated row here whenever an
answer arrives, and do not let a decision live only in a pull request.*
