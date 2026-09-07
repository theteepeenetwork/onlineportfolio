import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentParent } from "@/lib/parentAuth";
import { MEDIA_DIR, SHARED_MEDIA_DIR, SHARED_UPLOADS_PREFIX, isSharedMediaPath } from "@/lib/mediaPath";

// Authorising media route. Children's photos and drawings are NOT public files
// (SAFEGUARDING.md rules 4 & 7). Every request for /uploads/<file> is resolved
// to the record(s) that reference it and served only if the signed-in requester
// is allowed to see that child's work — otherwise it 404s (deny by default,
// without revealing whether the file exists).

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  // Voice notes (AUDIO items) — audio-only, stored via saveAudio().
  webm: "audio/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
};

// A filename we are willing to serve: a single path segment of safe characters
// with a known image OR audio extension. Anything else (slashes, "..", odd
// extensions) is rejected before we touch the filesystem. Access is decided by
// canAccess() below, which is media-type-agnostic — an audio journal item is
// scoped exactly like a photo (its child, that child's teacher, and the linked
// parent for approved items only).
const SAFE_NAME = /^[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg|webm|ogg|m4a|mp3)$/;

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;

  // Two shapes, and only two. Ordinary media is one flat segment; StoryJar's own
  // library media is exactly ["shared", <file>].
  //
  // The shape decides the DIRECTORY, and that is the whole point of the second
  // segment. A shared path is only ever resolved inside SHARED_MEDIA_DIR and an
  // ordinary one only ever inside MEDIA_DIR, so the looser authorisation below
  // can never reach a teacher's upload: nothing a teacher can do puts a file in
  // the shared directory.
  const shared = parts?.length === 2 && parts[0] === "shared";
  const name = parts?.length === 1 ? parts[0] : shared ? parts[1] : "";
  if (!name || !SAFE_NAME.test(name)) return notFound();

  const urlPath = shared ? `${SHARED_UPLOADS_PREFIX}${name}` : `/uploads/${name}`;
  if (!(await canAccess(urlPath))) return notFound();

  // Resolve inside the directory this shape belongs to, and double-check we
  // never escaped it.
  const root = path.resolve(shared ? SHARED_MEDIA_DIR : MEDIA_DIR);
  const file = path.resolve(root, name);
  if (file !== path.join(root, name) || !file.startsWith(root + path.sep)) return notFound();

  try {
    const [data, info] = await Promise.all([readFile(file), stat(file)]);
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        // Never store a child's image in a shared/CDN cache.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Defence in depth (FINDINGS F5): if a served file is ever an SVG,
        // sandbox it and forbid any script/resource loads so it can't execute
        // when opened directly. Uploads already reject SVG; this closes the gap
        // for any legacy/placeholder SVG the route might still serve.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return notFound();
  }
}

// The access decision. Returns true only if the current requester is entitled to
// see this media path. Deny by default.
//
// A media file may be referenced by more than one record. We must never let the
// FIRST matching record decide for the others (FINDINGS F17): a shared path
// would then authorise one owner against another — a false denial at best, a
// cross-child disclosure at worst. So every check below is scoped to the
// REQUESTER — "is there a record *I* own that references this path?" — and we
// grant if ANY branch says yes, falling through otherwise. Because each branch
// only ever matches the requester's own records, OR-ing them stays
// deny-by-default (rule 8): no branch can grant on someone else's record, and a
// miss still 404s without revealing whether the file exists.
async function canAccess(urlPath: string): Promise<boolean> {
  const user = await getCurrentUser(); // TEACHER | STUDENT | null
  const parent = user ? null : await getCurrentParent(); // only check parent if not a teacher/student
  if (!user && !parent) return false; // never serve to the unauthenticated

  // 0) StoryJar's OWN library media, the one widening on this route.
  //
  // A shared path is readable by any signed-in TEACHER, including one who has
  // not added the activity, because they have to be able to see what they are
  // considering. It contains no child data and no personal data of any kind.
  //
  // Three things keep this narrow, and all three matter:
  //   - it is scoped to the RESOURCE, not to the path. The file must actually be
  //     referenced by a PUBLISHED shared activity. A path that merely looks
  //     shared, or one belonging to a draft activity nobody has published, is
  //     refused exactly as before.
  //   - it grants to teachers only. Never a parent, never a child, never the
  //     unauthenticated. A child never needs it: adding an activity COPIES the
  //     files into the teacher's own media, so what a class sees is the
  //     teacher's copy, authorised by the ordinary rules below.
  //   - it returns early rather than joining the OR chain, so a shared path can
  //     never be answered by a query written for children's work.
  if (isSharedMediaPath(urlPath)) {
    if (user?.role !== "TEACHER") return false;
    const published = await db.sharedActivity.findFirst({
      where: {
        published: true,
        OR: [
          { templatePathsJson: { contains: urlPath } },
          { quizJson: { contains: urlPath } },
          { objectsJson: { contains: urlPath } },
        ],
      },
      select: { id: true },
    });
    return !!published;
  }

  // The picture of a quiz page (`previewPathsJson`) is authorised by exactly the
  // same clause as the work it is a picture of — same owner, same class, same
  // APPROVED gate for a parent. It is the same child's content in a second
  // shape, so it must never be reachable on easier terms than the original.
  const pathMatch = {
    OR: [
      { mediaPath: urlPath },
      { mediaPathsJson: { contains: urlPath } },
      { previewPathsJson: { contains: urlPath } },
    ],
  };

  // 1) A child's journal item (a photo/drawing/response) the requester is
  //    entitled to — the most sensitive case, scoped straight into the query so
  //    a colliding stranger's row can never decide.
  if (user?.role === "TEACHER") {
    const mine = await db.journalItem.findFirst({
      where: { AND: [pathMatch, { class: { teacherId: user.teacher.id } }] },
      select: { id: true },
    });
    if (mine) return true;
  } else if (user?.role === "STUDENT") {
    const mine = await db.journalItem.findFirst({
      where: { AND: [pathMatch, { studentId: user.student.id }] },
      select: { id: true },
    });
    if (mine) return true;
  } else if (parent) {
    // Parents see only APPROVED work of their own children — and nothing else on
    // this route (never a draft, never teacher activity material).
    const childIds = parent.children.map((c) => c.id);
    const theirs = await db.journalItem.findFirst({
      where: { AND: [pathMatch, { status: "APPROVED", studentId: { in: childIds } }] },
      select: { id: true },
    });
    return !!theirs;
  }

  // 2) The requester's OWN cross-device DRAFT page (Stage 2). A child's
  //    unsubmitted draft is their private unfinished work — visible to that child
  //    only, never to a parent, another child, another tenant, or their teacher.
  if (user?.role === "TEACHER") {
    const mine = await db.draft.findFirst({
      where: { AND: [{ pagesJson: { contains: urlPath } }, { teacherId: user.teacher.id }] },
      select: { id: true },
    });
    if (mine) return true;
  } else if (user?.role === "STUDENT") {
    const mine = await db.draft.findFirst({
      where: { AND: [{ pagesJson: { contains: urlPath } }, { studentId: user.student.id }] },
      select: { id: true },
    });
    if (mine) return true;
  }

  // 3) Otherwise it may be a teacher-authored activity background (template pages
  //    or a frozen assignment snapshot), a quiz answer-option picture (which
  //    lives in quizJson / quizSnapshotJson), or a movable-object picture (which
  //    lives in objectsJson / objectsSnapshotJson). All are teacher-authored
  //    content — parents never see any of them.
  if (user?.role === "TEACHER") {
    const owned = await db.activityTemplate.findFirst({
      where: {
        teacherId: user.teacher.id,
        OR: [
          { templatePathsJson: { contains: urlPath } },
          // The picture of the page, shown on the library card. Authorised the
          // same way and by the same owner as the background it was made from —
          // a file this route does not recognise is a file it will not serve,
          // which is how a saved thumbnail came out as a broken image.
          { previewPathsJson: { contains: urlPath } },
          { quizJson: { contains: urlPath } },
          { objectsJson: { contains: urlPath } },
        ],
      },
      select: { id: true },
    });
    if (owned) return true;
    const assigned = await db.assignment.findFirst({
      where: {
        // The class as well as the template (F66). This branch serves the
        // teacher's OWN authored backgrounds and quiz images out of a run's
        // snapshot, so it was never a route to a child's work — the seventh and
        // mildest site on F66's list, included so the rule has no exceptions to
        // argue about later. It costs an author nothing: the branch above
        // already serves the same images out of the template they still own.
        class: { teacherId: user.teacher.id },
        template: { teacherId: user.teacher.id },
        OR: [
          { templateSnapshotJson: { contains: urlPath } },
          { previewSnapshotJson: { contains: urlPath } },
          { quizSnapshotJson: { contains: urlPath } },
          { objectsSnapshotJson: { contains: urlPath } },
        ],
      },
      select: { id: true },
    });
    return !!assigned;
  }
  if (user?.role === "STUDENT") {
    // A child may load the background, the quiz option pictures AND the movable-
    // object pictures of an activity they have been set.
    const assigned = await db.assignment.findFirst({
      where: {
        class: { students: { some: { id: user.student.id } } },
        AND: [
          {
            OR: [
              { templateSnapshotJson: { contains: urlPath } },
              // The picture of the activity, shown on a child's "to do" card.
              // Same owner, same run, same gate as the background it was made
              // from — a file this route does not recognise is served to
              // nobody, which is how a stored picture arrives broken.
              { previewSnapshotJson: { contains: urlPath } },
              { quizSnapshotJson: { contains: urlPath } },
              { objectsSnapshotJson: { contains: urlPath } },
            ],
          },
          { OR: [{ wholeClass: true }, { students: { some: { studentId: user.student.id } } }] },
        ],
      },
      select: { id: true },
    });
    return !!assigned;
  }

  return false;
}
