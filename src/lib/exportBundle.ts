import { NextResponse } from "next/server";
import { readAnswers, readQuiz } from "@/lib/quiz";

// Shared assembly for StoryJar's data exports: the whole-class export
// (`/teacher/export/[classId]`, schema `storyjar-class-export-v1`) and the
// per-pupil subject-access export (`/teacher/export/pupil/[studentId]`, schema
// `storyjar-pupil-export-v1`).
//
// WHY THIS FILE EXISTS. Two exports that agree on the day they are written and
// drift afterwards is the failure mode: the school answers a parent from one
// and a regulator from the other, and the two disagree about what is held. One
// mapper means a field added to a child's work appears in both, or neither.
//
// THREE RULES THE MAPPER KEEPS, and the reasons, because a future edit here
// reaches a document that leaves the building:
//
//  1. **Media paths, never media bytes.** Every path below is served only by
//     the authorising /uploads route (SAFEGUARDING rule 7). A path in this file
//     is a *list* of what the school holds so that nothing is hidden from
//     someone asking for their data; it is not access to it. Bytes are a
//     separate, manual, identity-checked route.
//  2. **No credentials, ever.** A class code IS the access control for a pupil
//     sign-in (`studentLogin`, `src/app/actions/auth.ts:186`) and a family code
//     is the access control for a parent. Neither belongs in a file that is
//     handed to somebody. The class export may name the class code because it
//     goes to the teacher who owns that class and already has it on screen; the
//     per-pupil export must not, and that asymmetry is deliberate.
//  3. **Nothing that profiles a child.** `Student.jarSeenAt` is wayfinding, and
//     the schema forbids exporting, aggregating or reporting it (SAFEGUARDING
//     rule 11). It is absent from both exports on purpose. Do not add it, and
//     do not spread a whole `student` row into an export to save typing.
//
// WHAT IS INSIDE THE JSON COLUMNS, field by field, because four of the values
// below are parsed blobs and "it is a JSON column" is not a thing anybody can
// review. Every one of these was read against its writer and its type:
//
//   `mediaPathsJson`    string[] of "/uploads/<file>" paths. Nothing else.
//   `previewPathsJson`  the same, for the picture-of-the-page variants.
//   `stickersJson`      string[] of sticker KEYS from the fixed catalogue in
//                       src/lib/stickers.ts, written through
//                       sanitizeStickerKeys(). Never free text — that is the
//                       rule 2 guarantee, so the blob cannot carry a message.
//   `quizAnswersJson`   QuizAnswer[] = { questionId, selectedOptionId | null }.
//                       Opaque ids, which is why this export does NOT pass them
//                       through raw: "opt2" is not an answer to a subject access
//                       request, it is a token only StoryJar can read. They are
//                       resolved against the run's frozen quiz into the words the
//                       child was actually shown. See readableQuizAnswers below.

// What the mapper needs from a JournalItem row. Structural on purpose: if a
// route's `include` stops fetching `skills` or `assignment`, the call site
// fails to typecheck rather than quietly exporting a thinner record.
export type ExportableMoment = {
  type: string;
  caption: string | null;
  textContent: string | null;
  status: string;
  authorRole: string;
  mediaPath: string | null;
  mediaPathsJson: string | null;
  previewPathsJson: string | null;
  quizAnswersJson: string | null;
  quizScore: number | null;
  quizTotal: number | null;
  teacherNote: string | null;
  praiseNote: string | null;
  stickersJson: string | null;
  stickerReply: string | null;
  returnMode: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  skills: { name: string }[];
  // `quizSnapshotJson` is the run's FROZEN quiz. It is needed to turn the
  // child's stored option ids into readable words, and it is read from the run
  // rather than the template on purpose: the template may have been edited or
  // deleted since, and the answer has to be resolved against the paper the
  // child actually sat.
  assignment: { title: string; quizSnapshotJson: string | null } | null;
};

// One piece of a child's work, as the school holds it.
//
// Statuses are NOT filtered. PENDING work is work the school is holding and has
// not yet published; RETURNED work is work it holds together with a teacher's
// written note about it. Both are held, so both are disclosed — an export that
// showed only APPROVED moments would answer "what have you published" when the
// question asked was "what do you hold".
export function momentRecord(j: ExportableMoment) {
  return {
    type: j.type,
    caption: j.caption,
    text: j.textContent,
    status: j.status,
    // Who put this in the journal: the child, or the teacher on their behalf.
    authorRole: j.authorRole,
    activity: j.assignment?.title ?? null,
    skills: j.skills.map((sk) => sk.name),
    media: j.mediaPath,
    mediaPages: j.mediaPathsJson ? safeParse(j.mediaPathsJson) : undefined,
    // The picture of a quiz page, when one was stored. Listed because this is
    // the record of everything the school holds about this child: a media file
    // the export does not name is a file nobody asking for their data would
    // know to ask for.
    mediaPictures: j.previewPathsJson ? safeParse(j.previewPathsJson) : undefined,
    // The child's own answers, and the mark the app worked out at the time.
    // Theirs more plainly than anything else here.
    quizAnswers: readableQuizAnswers(j.quizAnswersJson, j.assignment?.quizSnapshotJson ?? null),
    quizScore: j.quizScore,
    quizTotal: j.quizTotal,
    // What an adult wrote about this piece of work. An opinion recorded about a
    // person is that person's data, so it is disclosed rather than summarised.
    teacherNote: j.teacherNote,
    praiseNote: j.praiseNote,
    stickers: j.stickersJson ? safeParse(j.stickersJson) : undefined,
    // "HEART" once the child sent one back; a fixed value, never free text.
    stickerReply: j.stickerReply,
    returnMode: j.returnMode,
    createdAt: j.createdAt,
    approvedAt: j.approvedAt,
  };
}

/**
 * A child's quiz answers, in words rather than in ids.
 *
 * The stored form is `{ questionId: "q1", selectedOptionId: "opt2" }`, which
 * satisfies nobody: a parent cannot read it and a regulator would call it a
 * disclosure in name only. An answer to a subject access request has to be
 * intelligible, so each row is resolved against the frozen quiz the child
 * actually sat and comes out as the question they were asked and the answer
 * they gave.
 *
 * What is deliberately NOT here is the answer key. `quizScore` already carries
 * the mark, `wasCorrect` already says how each answer was treated, and the full
 * set of right answers is the teacher's material rather than the child's data.
 *
 * Returns undefined when the moment is not a quiz response at all, so the key
 * simply does not appear rather than appearing empty.
 */
function readableQuizAnswers(answersJson: string | null, quizSnapshotJson: string | null) {
  const answers = readAnswers(answersJson);
  if (answers.length === 0) return undefined;

  const questions = new Map(readQuiz(quizSnapshotJson).questions.map((q) => [q.id, q]));

  return answers.map((a) => {
    const q = questions.get(a.questionId);
    const chosen = q?.options.find((o) => o.id === a.selectedOptionId) ?? null;
    return {
      // Null when the run this answer belongs to has gone — the answer is still
      // held, so it is still disclosed, and the honest thing is to say that the
      // question it went with can no longer be recovered.
      question: q?.prompt ?? null,
      // A picture answer has no text. `imageAlt` is what the picture shows, and
      // it is the only readable thing about it, so it is preferred over the
      // path — which would be a file reference, not an answer.
      answer: chosen ? (chosen.text ?? chosen.imageAlt ?? "A picture") : null,
      answered: a.selectedOptionId !== null,
      wasCorrect: q && a.selectedOptionId !== null ? a.selectedOptionId === q.correctOptionId : null,
    };
  });
}

// The `include` both exports use, kept here so the two cannot drift apart.
// Spelled out at each call site rather than shared as a const, because Prisma
// infers the result type from the literal.
export type MomentInclude = {
  skills: { select: { name: true } };
  assignment: { select: { title: true; quizSnapshotJson: true } };
};

export function slugify(s: string, fallback: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;
}

// A JSON attachment nothing is allowed to cache. `private, no-store` is the
// load-bearing header: this file is a child's record, and a shared-device
// school is the normal case rather than the exception.
export function jsonAttachment(data: unknown, filename: string): NextResponse {
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
