# Publishing to the StoryJar library

**Status: built, 1 September 2026.** Supersedes the note in
`docs/showcase-template-ideas.md` that says each chosen template "becomes an
entry in `content/shared-activities/index.json`". It still can. It no longer has
to.

---

## How to publish, in four steps

1. Open `/ops/academy` in the operator console. It lists every StoryJar Academy
   sign-in address and every class code. The password is not on it and never
   will be: it is in the password manager.
2. Sign in at `/login/teacher` as one of those accounts.
3. Build the activity on the real canvas, exactly as a teacher would. It is an
   ordinary template in an ordinary account until you say otherwise.
4. On the activity's page, open the **⋯** menu and choose **Publish to
   library**. It lands on the Publishing screen, **not yet visible to anybody**.
   Press **Make visible** when it is ready.

Withdraw from the same screen. Withdrawing hides it and stops its media being
served; it never touches a copy a teacher has already taken, because a copy is a
full copy, files included.

---

## Why the Academy and not an operator screen

This was the first question asked, and the answer is structural rather than a
preference.

`scripts/check-ops-blindness.mjs` scans by import graph: **any file under `src/`
that imports anything from `src/lib/ops/` is scanned as operator code.** A canvas
surface authenticated by `requireOperator()` would therefore be scanned, and
`DrawingCanvas.tsx` fails `OPS-MEDIA-ELEMENT` on `<img>`, `url()` and `data:`
before you reach the `ActivityTemplate` payload reads (`AGGREGATE_ONLY`, and
every `*Json` column is on `DENY_FIELDS`) or the filesystem writes
(`OPS-FILESYSTEM`). Building it there means four widenings of the most
protective gate in the repository, to move a job that has nothing to do with
schools or children's data into the one area built to be blind to both.

The alternative was already designed and half-built. PR #137 shipped
`School.canPublishToLibrary` and said so in its own commit message:

> one flag that will let its staff publish to the shared library from the real
> canvas rather than from an operator screen … No operator screen needs
> filesystem access, no ops import allowlist is widened, and ActivityTemplate
> stays count-only for ops.

Nothing read that flag until now. This is the second slice.

**The flag is not writable from any screen.** It is set by
`scripts/ops/seed-academy.mjs` or by a migration, and it is true for StoryJar
Academy and nowhere else. There is no sequence of clicks at a real school that
ends in publishing.

---

## What the operator console got instead

Two screens, both read-only, neither needing a gate widening.

| Screen | Reads | Why |
| --- | --- | --- |
| `/ops/academy` | **nothing at all** | The sign-in addresses and class codes, derived in `src/app/ops/academy/roster.ts` from the same scheme `seed-academy.mjs` uses. It could not query them if it wanted to: `Class` is `AGGREGATE_ONLY`, the class-code column is a denied credential identifier and `classId` is a child scope key. It does not need to — the Academy is fictional and StoryJar's own, so this is a reference card, not a report. |
| `/ops/library` | `SharedActivity`, projected | Title, slug, visibility, order, and a **count** of the copies relation. `SharedActivity` is `PLATFORM_CONTENT` in the gate — read-only — and the projection is the exact shape already certified by `tests/fixtures/ops-blindness/good-ops-shared-activity-count.txt`. It answers "is the library being used", which is a platform question with nowhere else to ask it. |

`/ops/library` has no controls of any kind, and a test asserts the count of
buttons and forms in its `<main>` is zero. Publishing is not an operator
operation and is deliberately not in the registry in `src/lib/ops/registry.ts`.

---

## The security assertion that changed, and the honest cost

`tests/battery/security/shared-activities.spec.ts` used to grep all of `src/`
and assert **zero** writes to `SharedActivity`. That is no longer true, and
pretending otherwise would be worse than saying so.

**Before:** nothing in the application can write this table. Publishing is a
script run against the repository, reviewable in a pull request.

**Now:** exactly one module can — `src/lib/libraryPublishing.ts` — and only on
behalf of a school whose `canPublishToLibrary` is set.

This is weaker than an absence, and the replacement is not a cleverer scan. It is
that the same spec now proves things at **runtime** that the old assertion could
never have written, because there was no action to point it at:

- the source scan is an allowlist of exactly one file, in both directions, so a
  second writer fails and so does that file losing its write;
- a second scan **derives** the writing functions from the source and asserts
  each calls `canPublish()` — derived, because the first version hard-coded two
  names while the module had three writers, so the third was asserted by nobody;
- `canPublish()` is called directly with every fixture school's teacher id,
  including one that names nobody, so a gate that stopped denying goes red;
- `publishRefusal()` is called directly with a real pupil's media path, a real
  pupil's draft path, and another teacher's template background — each refused —
  and with the publisher's own media as the control, which must NOT be refused;
- a School A teacher sees no publish control and gets a 404 from
  `/teacher/activities/library`, with the fixture's `canPublishToLibrary: false`
  asserted rather than assumed, and with the library's `{slug, published}` pairs
  snapshotted rather than its row count — the count would not have moved under
  the most damaging thing available here, which is flipping a withdrawn activity
  back to visible and re-opening its media;
- School B the same;
- and the positive control, written last on purpose: the flagged school
  publishes, the row appears with `published: false`, its media 404s for
  everybody until it is made visible, and 200s afterwards.

`prisma/seed-test.ts` gained **School D, StoryJar Studio**, the one fixture
school with the flag. Without it the refusals would be tests of an empty table.

### The mutation test, and what it changed

The first version of the replacement was green and worthless, and it is worth
writing down how that was discovered so the next person checks rather than
assumes.

Both gates originally lived inside `src/lib/libraryPublishing.ts`, which carries
`server-only`. With **all three `canPublish` calls disabled**, every runtime test
in `shared-activities.spec.ts` still passed. They were not passing because
anything was being stopped; they were passing because a Playwright spec cannot
craft a Server Action request at all. Next mints the action id at build time and
rejects a hand-built payload with a 500 before a line of application code runs —
verified, twice, including with the `$ACTION_ID_…` marker in the body exactly as
the browser sends it. So the assertions were measuring Next's deserialiser.

The fix follows a convention this repository already had. `src/lib/ops/enabled.ts`
and `src/lib/ops/dto.ts` deliberately omit `server-only` so a blocking spec can
import them and prove both branches in-process; the two gates now live in
`src/lib/libraryPermission.ts` on the same terms. The spec calls them with real
fixture teacher ids and real fixture media paths.

**Re-run the mutation test after touching any of this.** Break `canPublish` to
`return true` and blank the child-work branch of `publishRefusal`, and four tests
must go red — including both cross-tenant runtime tests. If they stay green, the
gate is not being tested, whatever the file says.

---

## Files

| File | Role |
| --- | --- |
| `src/lib/libraryPermission.ts` | **The two gates.** `canPublish` (may this school publish at all) and `publishRefusal` (is this activity made of things they own). No `server-only`, deliberately — see below. |
| `src/lib/libraryPublishing.ts` | The only writer under `src/`. `slugify`, `freeSlug`, `copyTemplateMediaForLibrary`, `publishTemplate`, `setPublished`, `updateLibraryActivity`. Every one of the three writers calls `canPublish` first. |
| `src/app/actions/library.ts` | The three form actions. Re-asks the permission question; a Server Action is a POST endpoint anybody can craft a request to. |
| `src/app/teacher/activities/library/` | The Publishing screen. 404 for anybody who cannot publish. |
| `src/app/ops/academy/`, `src/app/ops/library/` | The two read-only operator screens. |
| `src/lib/mediaPath.ts` | `ownMediaPathsIn`, the mirror of `sharedMediaPathsIn`. |
| `prisma/schema.prisma` | `ActivityTemplate.librarySlug`, unique and nullable. |

**`librarySlug` is on the teacher's table on purpose.** `SharedActivity`'s own
schema comment says it has no `teacherId` and no `folderId` and that "nothing in
this file should ever give it one"; a foreign key from it back to a template
would be a `teacherId` by proxy. Holding the pointer on this side keeps the
library row independent of the template that seeded it, so deleting that template
leaves the published activity — and every teacher's copy — untouched.

**Publishing refuses a template made of things the publisher does not own.**
`publishRefusal()` runs *before* any byte is copied, and refuses if the template
references a `JournalItem` at any status, a pupil's `Draft`, or another
teacher's template. Without it, a member of staff could read a pupil's photo path
off an `<img src>` in their own approval queue, drop it into a template, and
publish those bytes to every school — with nothing on the path consulting
`JournalItem.status`, so a PENDING item no adult had approved would go too. That
is the bypass `SAFEGUARDING.md` rule 3 forbids. The refusal is before the copy
because the copy is the disclosure, and because there is no one-click way to
remove a file from the shared directory afterwards.

**Publishing copies the bytes, not the path strings.** The exact mirror of
`copySharedMediaForTeacher`, and for the same reason running the other way: if it
copied strings, the library activity would depend on a file in the Academy
teacher's own media directory, and any future fix to FINDINGS **F27** — which
finally gives template media an erasure path — would blank the published activity
in every classroom that had added it. F27 is not fixed by this work and the
finding stays open.

---

## The manifest still works

`content/shared-activities/index.json` and
`scripts/ops/publish-shared-activities.mjs` are unchanged. They upsert on the
same `slug`, so the two roads do not fight: **the database is the truth and the
manifest is the baseline**, which is how a fresh environment gets filled and how
art ships with the repository. The script's idempotence test is untouched and
still passes.

Do not assume the repository mirrors production. It did before this change. It
does not now.

---

## Still open

- **A community hub is not enabled by any of this.** `SharedActivity.origin`
  holds one value. A hub where teachers submit their own templates needs a
  StoryJar-side review queue before anything is visible, takedown mechanics and
  its own DPIA — a teacher's template can carry a photograph of a child and no
  code can tell that from a file.
- **The volume may be empty even though it is configured correctly.**
  `SHARED_MEDIA_DIR` is set on the Railway service in both environments and
  points at `/data/media-shared` on the volume (PR #138, which moved library
  media off the container image). What that PR also says is that the volume is
  empty until `node scripts/ops/publish-shared-activities.mjs` has been run once
  against it. Check the one placeholder activity renders in production before
  assuming publishing works there; a missing background is that, not this.
- Rule 1 review: this touches access control and uploaded media, so it goes
  through the `SAFEGUARDING.md` checklist before it lands.
