# School identity: the launch half

Scoped 24 August 2026. This does not restate
[`school-identity.md`](./school-identity.md); it says which parts of it are built
before the first teacher signs up, which wait, and what changed since it was
written. Read that document for the design. Read this one for the scope.

## What changed: production is empty

The plan's hardest open question was what to do about teachers already signed up
holding a free-text school name and no URN. It rejected a fuzzy name match as
"exactly the kind of quiet guess this plan exists to remove", and left the answer
undecided.

**There are no registered teachers. The question is an empty set.**

That inverts the timing argument. Every teacher who signs up without a URN
becomes a row needing exactly the backfill the plan refuses to do, so launching
without the picker means deliberately manufacturing the legacy problem the
document was written to prevent. Spin-out B has the same shape: the "teachers who
name your school" list is a fuzzy match on free text today and a clean join if
every teacher carries a URN from their first day.

This is the cheapest this work will ever be, and it gets more expensive with
every signup.

## The split

The plan's §2 is titled **"Signup stores the establishment, and creates nothing"**.
That is the seam. The picker records a URN on the `Teacher` row; the `School` row
still comes into existence only at purchase. The two halves were designed apart.

**Build now, steps 1 to 3.** The `Establishment` model, the hand-run GIAS import,
server-side search, and the signup type-ahead with its free-text fallback. The
deadline is the first teacher, not a date in the abstract.

**Build late September, steps 4 to 7.** `School.urn`, `verifiedAt`,
`claimedByTeacherId`, the claim transaction in the Stripe webhook, the
whole-school entry point, the invitation model, the free-rider list. This half is
about a school paying, nobody is paying yet, and it carries the heavier
safeguarding weight because it decides who becomes an admin (rule 5). It attaches
cleanly to teachers who by then already hold a URN.

Nobody buys until then, and that is fine: a school that wants to pay in September
is onboarded by hand, and the runbook for that is its own small job.

## Additions to the plan

Four things settled on 24 August that the plan does not carry.

**A read-only register tile in `/ops/health`.** Last refresh date, establishment
count, source file date. Ops reads freely, so this costs nothing and it means
staleness is visible rather than remembered. It is a read: no registry action, no
write surface, no widening of the blindness gate.

**The import stays a script, deliberately.** An upload screen inside `/ops` would
need a new registry action, a file upload into an area that has exactly two named
write actions, and the gate widened to permit a bulk write of twenty thousand
rows. R15 describes ops writes as named rows with a confirm step, a stated reason
and an audit row in the same transaction, and a bulk import fits none of that.
The same reasoning as F43: a person choosing to run something is a different
thing from a machine deciding to.

**`town`, falling back to `locality`.** GIAS populates `Town` far more reliably
than `Locality`. The picker shows the establishment name, then **town and
postcode** beneath it. Postcode is the field that does the disambiguating work,
and there are dozens of St Mary's Primary Schools.

*(Corrected 2026-08-24. This paragraph previously said the picker shows "street,
town and postcode". There is no street column: the field list two sections above
is six columns and street is not among them, so the sentence contradicted the
schema it sits beside. **Street is deliberately not being added** — town plus
postcode disambiguates, and two same-named schools in one town on different
streets is vanishingly rare. Recorded rather than quietly edited because the
alternative on the table was spending a freeze exception on a schema change to
make the data match a sentence, which is the wrong way round: the document was
wrong, not the build.)*

**Each option's accessible name is one string.** Two display lines are right
visually. A screen reader must hear "St Bede's Catholic Primary School, Mill
Lane, Lancaster, LA1 5QP" as a single coherent option label rather than four
fragments. This sits alongside the plan's existing a11y warning, which is the
real risk in step 3 and should be settled before anyone writes the component.

## Out of scope, explicitly

The `School` row, the claim, admin access, invitations, the free-rider list,
messaging, and any backfill of existing teachers (there are none). A teacher
picking their school sees nothing change: no admin, no colleagues, no new
capability. If that gap needs copy so it is not a support question in week two,
write the copy, do not build the feature.

## The freeze

The freeze of Thursday 27 August holds for everything else. This one feature gets
an extension, because a freeze protects a launch and shipping a data model known
to create a cleanup job is the larger risk. State the exception rather than
letting it blur: nothing else moves.

## Gates, unchanged from the plan

`school-identity.md` §"The gates this has to pass" is correct and is not repeated
here. The short version: `Establishment` classified `ADULT_READABLE` in the same
commit as the schema or `npm run check` goes red, one `RETENTION.md` row, one
DPIA line saying the CSV is imported rather than called, the safeguarding review
checklist worked through even though no constitutional amendment is needed, and
a `prisma/` change selects the full battery so budget the nine-minute run.

Open Government Licence v3.0 attribution belongs on the page that uses the data.
