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
| 2026-08-17 | D4 | TOTP uses the `otplib` library rather than a hand-rolled RFC 6238 implementation. Vetted before adoption: 13.4.1, MIT, maintained, crypto plugins are `@noble` and `@scure`. `npm audit --omit=dev` reports 0 vulnerabilities with it installed. | OWNER |
| 2026-08-17 | R11 vs C2 | **An operator may NOT see how many children a parent has.** Amendment C2 permits a bare count and outranks handbook R11, which bans it. The owner was asked directly and chose the stricter rule. The blindness gate enforces R11 and its failure message explains why. Relaxing it later is one line plus a fixture. | OWNER |
| 2026-08-17 | D9 | **`correctAdultEmail` does not exist.** An operator cannot change an adult's email address. Changing a teacher's address is a route into their account: change it, trigger a reset, become that teacher, reach that class's children. Every step is a legitimate operation, so no gate can catch the sequence. Support answer: the teacher changes it themselves, or a school admin re-invites them. | OWNER |
| 2026-08-17 | D6 | **Manual payment recording is dropped from v1.** A manual override that the next Stripe webhook silently reverts is worse than no control, because someone will trust it. Billing screens are read-only with a link out to Stripe, which is where the truth lives. | OWNER |
| 2026-08-17 | Wave 5 | Proceed on the handbook defaults for the remaining wave 5 decisions rather than pausing. D7 therefore stands at counters only for mail. | OWNER |
| 2026-08-17 | D6 (build) | Implementing D6: billing is its own screen at `/ops/billing`, separate from `/ops/schools`, and the blindness gate was widened by exactly one allowlist entry, `@/lib/stripeMode`. Two schools of thought were weighed and both are recorded because a reader will ask. **Separate screen** because `/ops/schools` is asserted to link nowhere at all, and that property is worth more than avoiding one extra route: putting the Stripe link there would have meant weakening an existing blocking assertion. **`@/lib/stripeMode` rather than `@/lib/stripe`** because the obvious import builds the Stripe SDK client from the secret key, which would put `getStripe()` one keystroke from every operator screen; the new module holds two functions over one environment variable and returns only booleans, so the secret stays outside the ops path. The widening is bounded and carries three fixtures proving the near misses still fail. | Implementation, PR3 |
| 2026-08-16 | R1 | Code namespace is `ops`, never `admin`, because `src/app/admin/` is already the school console. The public URL is a separate question (D1). | Handbook ruling, not disputed |

## Defaults applied without an owner answer

These are proceeding on the handbook's published default. Each is cheap to
overturn today and progressively less cheap later.

| Ref | Default applied | Where it shows up |
| --- | --- | --- |
| D1 | URL prefix `/ops`. | Every route under `src/app/ops/`. |
| D11 | One operator account. The `OWNER` / `OPERATOR` split is modelled on the row so "last owner protected" is expressible, but nothing creates a second account and no action exercises the split. | `Operator.role` in the schema. |
| D3 | Not yet reached. Platform actions are not yet visible in a school's own audit feed, because no platform action exists yet. | **Not PR3 after all.** This row said "becomes live at PR3", written when PR3 was expected to record payments. Decision D6 dropped that, so PR3 shipped read-only and created no platform action at all: nothing it does could appear in a school's audit feed, because it does nothing. D3 becomes live at the first PR that carries a mutation. |

## Open, and what each one blocks

| Ref | Question | Blocks |
| --- | --- | --- |
| **D2** | **Backups. Materially narrowed on 2026-08-17:** Railway's documentation states **no plan restriction** on volume backups and prices them by usage, so the "$15 uplift" premise of amendment B1 is doubtful. It also states retention of 6 days daily / 1 month weekly / 3 months monthly, none of which is the 35 days `RETENTION.md` promises; that line needs correcting whichever option wins. Two further facts push toward an off-provider copy: wiping a volume deletes all its backups, and a backup can only be restored into the same project and environment. See `docs/ops-backup-options.md` section 6a. What remains is a thirty-second dashboard check and the RPO/RTO numbers. | **Original entry follows.** |
| **D2 (original)** | **Backups.** Which option, and the RPO and RTO numbers. Options are costed in `docs/ops-backup-options.md`. **The first step is not a choice but a fact**: confirm in the Railway dashboard whether volume backups are available on the current plan. Amendment B1 says Pro only; Railway's public documentation says no plan restriction and never mentions point in time recovery. | **OPS-0b entirely.** Through R12, all deletion work (PR8). And the pilot: `RETENTION.md` line 63 promises schools a 35 day backup cycle that does not exist. |
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
