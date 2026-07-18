# F17 — `/uploads` authorises path‑first — for safeguarding review

> **Status:** open, logged **Medium**, *routed around* (a fixture that triggered
> it was removed). **Not an active hole** — see “Is anyone at risk today?”. The
> fix **loosens a deny‑by‑default authorisation branch**, so per `SAFEGUARDING.md`
> it needs sign‑off before it ships. This document is that sign‑off request:
> the finding, the options, and the decisions needed. **No code is changed by
> this PR** — it is the proposal only.

Audience: whoever signs off safeguarding changes (owner + a technical reviewer).
The plain‑English summary is first; the code detail follows.

---

## In one paragraph

Children’s photos and drawings aren’t public files — every request for one goes
through a gate (`/uploads/.../route.ts` → `canAccess`) that serves the bytes only
to someone allowed to see that child’s work. The gate checks three kinds of owner
in turn: a child’s own work, a private draft, then a teacher’s activity material.
The bug: **as soon as it finds a match in the *first* kind, it stops and answers
from that record alone** — it never checks the other two. So if one image file is
ever pointed at by two different records, one of them is judged by the *other’s*
owner. Today no two records ever share a file (every upload gets a random name),
so nobody is mis‑served. But the day a feature makes two records share a file, the
gate can hand the wrong person the wrong answer.

---

## Where it is

`src/app/uploads/[...path]/route.ts`, `canAccess()`. Step 1 (a child’s journal
item) short‑circuits:

```ts
const item = await db.journalItem.findFirst({
  where: { OR: [{ mediaPath: urlPath }, { mediaPathsJson: { contains: urlPath } }] },
  select: { studentId: true, status: true, class: { select: { teacherId: true } } },
});
if (item) {
  if (user?.role === "TEACHER") return item.class.teacherId === user.teacher.id;
  if (user?.role === "STUDENT") return item.studentId === user.student.id;
  if (parent) return item.status === "APPROVED" && parent.children.some((c) => c.id === item.studentId);
  return false;               // ← never falls through to drafts / activity material
}
```

`findFirst` returns **one** row (DB order, effectively arbitrary), the branch
decides on it, and `return`s. Steps 2 (drafts) and 3 (teacher activity material)
are never reached for a path that any journal item happens to mention.

## Is anyone at risk today? No.

- **Production can’t collide.** Uploads mint a random filename per file
  (`src/lib/media.ts`: `randomBytes(12).toString("hex")`), so two records never
  point at the same path. The one collision we ever saw was a **test fixture**
  that reused a single SVG as both a template background *and* five children’s
  response media; it has been split (`prisma/seed-test.ts`).
- **When it did bite, it bit safe** — as a *denial*: a child set an activity
  got a 404 for the worksheet they were meant to draw on (an invisible empty
  box), because the shared path matched a child’s item first and the template
  branch was never reached. Annoying, not a disclosure.

So this is a **latent robustness/correctness bug**, not a live breach. It is
worth fixing because the “one file, one record” assumption is invisible and easy
for a future feature to break.

## What could go wrong if a path is ever shared

The moment any feature makes two records reference one file — dedupe‑by‑hash,
“reuse this picture”, media copied when an activity is built from a child’s
work, etc. — path‑first can fail in **both** directions:

1. **False denial (annoyance).** A teacher who owns the *template* that uses a
   file, but not the *journal item* that also uses it, is judged by the journal
   item → `false` → 404 for their own material. This is the case we saw.
2. **Wrong disclosure (the safety case).** Suppose one file is referenced by
   child A’s *approved* item and by child B’s item. A parent of A asks for it.
   `findFirst` may return A’s row (their child, approved) → **granted** — and the
   parent is served bytes that are *also* child B’s. If those bytes are only ever
   “the same shared image” this is harmless; if a future feature ever lets a
   file be genuinely shared across children, path‑first turns that into
   cross‑child disclosure. **Deny‑by‑default is supposed to prevent exactly
   this**, and the short‑circuit is what defeats it.

Direction (2) is why this is a safeguarding change and not a bug‑fix to wave
through.

---

## Options

### A — Ask “is there a record I own that references this file?”, per branch, and grant if any (recommended)

Instead of *“find the first item, then check if I own it”*, scope ownership
**into** each query — *“find an item referencing this path **that I own***” — and
fall through to the next branch when there’s no match. Grant if any branch
entitles the requester.

```ts
async function canAccess(urlPath: string): Promise<boolean> {
  const user = await getCurrentUser();
  const parent = user ? null : await getCurrentParent();
  if (!user && !parent) return false;

  // A file may be referenced by more than one record. Grant if the requester is
  // entitled by ANY of them; never let the first matching record decide for the
  // others. Each check below only matches records the requester legitimately
  // owns/links to, so OR-ing them stays deny-by-default (rule 8).
  if (await ownsJournalItemFor(urlPath, user, parent)) return true;
  if (user && (await ownsDraftFor(urlPath, user))) return true;
  if (await ownsActivityMaterialFor(urlPath, user)) return true;
  return false;
}
```

e.g. the journal‑item check becomes ownership‑scoped and can’t be fooled by a
sibling row:

```ts
// TEACHER: an item for THIS teacher's class that references the path
await db.journalItem.findFirst({ where: { class: { teacherId }, OR: [pathMatch] } });
// STUDENT: an item of THEIR OWN that references the path
await db.journalItem.findFirst({ where: { studentId, OR: [pathMatch] } });
// PARENT: an APPROVED item of one of THEIR children
await db.journalItem.findFirst({ where: { status: "APPROVED", studentId: { in: childIds }, OR: [pathMatch] } });
```

- **Fixes both directions.** Each branch grants only on a record the requester
  actually owns/links to, so a colliding stranger’s row can no longer decide —
  neither to wrongly deny (1) nor to wrongly grant (2).
- **Stays deny‑by‑default.** No branch grants on someone else’s record. Serving
  the bytes when you’re entitled via *some* record is the correct semantic for a
  shared file — you’re served bytes you have a legitimate claim to, not another
  child’s private work.
- Slightly more DB work (up to three scoped look‑ups instead of one), all
  indexed point look‑ups; negligible.

### B — Minimal: fall through on *deny* only

Keep step 1 as‑is, but where it currently `return false`, continue to steps 2–3
instead. Smallest possible diff; fixes the **denial** case (1). It still lets the
first journal item *decide grants*, so it does **not** cleanly close the parent
cross‑child case (2). Cheaper to review, weaker guarantee.

### C — Forbid path sharing at the source (defence in depth)

Leave `canAccess` and instead guarantee the precondition: assert/enforce that no
two records ever share a media path (a write‑time check or a test over the seed +
a static guard). Doesn’t fix the gate’s latent bug, but removes the trigger.
Best **combined with A**, not instead of it.

**Recommendation: A**, plus **C** as a cheap belt‑and‑braces test. A is the
correct authorisation model; C makes the invariant explicit so a future feature
that breaks it fails loudly.

---

## If A is approved — what the fix PR would carry

Per `AGENTS.md` (“fixing a logged finding → move its repro from `findings/` into
the matching **blocking** suite, and delete the finding from `FINDINGS.md`”):

- Rewrite `canAccess` as Option A (fall‑through OR, ownership scoped into each
  query).
- **Move** `tests/battery/findings/uploads-path-collision.spec.ts` into the
  blocking `security` suite, re‑pointed at the *intended* behaviour, and add:
  - a **positive collision** test: seed one file referenced by two owners; each
    owner is served (200), every non‑owner is denied (404);
  - **cross‑tenant** tests (School B can’t reach School A’s media via a collision);
  - the existing “child can load their set activity’s background” stays green.
- Answer the per‑PR safeguarding checklist (`SAFEGUARDING.md`) in the PR body.
- Remove the F17 row from `FINDINGS.md`.

## Safeguarding checklist touchpoints

- **Rule 4 / 7** (media authorised like any other record; children’s files never
  public): the fix keeps every grant tied to a record the requester owns.
- **Rule 8** (deny by default): preserved — no branch grants on a foreign record;
  the default remains 404, and it still never reveals whether a file exists.
- No new data category, no new third party, no child‑credential surface.

---

## Decisions needed from the reviewer

1. **Approve Option A** (scope ownership into each branch; grant if any) as the
   authorisation model? — or prefer **B** (minimal, denial‑only) or hold?
2. **Add Option C** as well (an explicit “no two records share a media path”
   guard/test)?
3. Confirm the fix PR must land the **blocking** collision + cross‑tenant tests
   before merge (per `AGENTS.md`), i.e. no “fix now, test later”.

Once 1–3 are answered I’ll open the fix PR against that decision.
