import "server-only";
import { db } from "@/lib/db";
import { parseQuizPayload, quizImagePaths, readQuiz, type QuizPayload } from "@/lib/quiz";
import { jsonArray } from "@/lib/activities";
import { buildPagePaths } from "./blankPage";
import { layoutQuiz, type ApiQuestion } from "./quizLayout";
import { ActivityInputError } from "./errors";
import type { ApiTeacher } from "./tokens";

// Re-exported so callers need one import for the operations and the refusal.
export { ActivityInputError };

// Everything the connector can do, and nothing else.
//
// This module queries exactly two models: ActivityTemplate and Folder. It does
// not import Class, Student, JournalItem, Draft, Assignment or the media route,
// and no route above it can reach them either — the connector's whole
// permission model is the list of queries written here. See the comment block
// in prisma/schema.prisma for why the list is this short.
//
// Every query is scoped `teacherId: teacher.id` IN THE WHERE CLAUSE, never
// checked afterwards (SAFEGUARDING rule 4). A template id belonging to another
// teacher matches nothing and comes back as "not found", which is also rule 8:
// the refusal does not reveal that the row exists.

// The maximum a single call may create. Not a safeguarding limit — a bound on
// how much one mistaken tool call can put in a teacher's library before they
// notice.
export const MAX_PAGES = 30;

export type ActivitySummary = {
  id: string;
  title: string;
  instructions: string | null;
  tags: string[];
  folderId: string | null;
  folderName: string | null;
  pages: number;
  questionCount: number;
  liveRuns: number;
  createdAt: string;
  // Relative on purpose: only the caller knows the public origin. The MCP layer
  // turns this into a link a teacher can click.
  path: string;
};

export type ActivityDetail = ActivitySummary & {
  questions: ApiQuestion[];
  // True when at least one answer is a picture rather than words. The connector
  // cannot express a picture, so it refuses to rewrite a quiz that uses them.
  usesAnswerPictures: boolean;
};

export type ActivityInput = {
  title?: unknown;
  instructions?: unknown;
  tags?: unknown;
  folderId?: unknown;
  questions?: unknown;
  pages?: unknown;
};


function summaryOf(row: {
  id: string;
  title: string;
  instructions: string | null;
  tagsJson: string | null;
  folderId: string | null;
  folder: { name: string } | null;
  templatePathsJson: string | null;
  quizJson: string | null;
  createdAt: Date;
  _count: { assignments: number };
}): ActivitySummary {
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    tags: jsonArray(row.tagsJson),
    folderId: row.folderId,
    folderName: row.folder?.name ?? null,
    pages: jsonArray(row.templatePathsJson).length,
    questionCount: readQuiz(row.quizJson).questions.length,
    liveRuns: row._count.assignments,
    createdAt: row.createdAt.toISOString(),
    path: `/teacher/activities/${row.id}`,
  };
}

const SUMMARY_SELECT = {
  id: true,
  title: true,
  instructions: true,
  tagsJson: true,
  folderId: true,
  folder: { select: { name: true } },
  templatePathsJson: true,
  quizJson: true,
  createdAt: true,
  // How many classes are working on this activity right now. Read so the
  // connector can SAY so — see updateActivity, which deliberately leaves those
  // runs alone.
  _count: { select: { assignments: { where: { status: "LIVE" } } } },
} as const;

export async function listActivities(
  teacher: ApiTeacher,
  opts: { search?: string; limit?: number } = {},
): Promise<ActivitySummary[]> {
  const search = typeof opts.search === "string" ? opts.search.trim() : "";
  const take = Math.min(Math.max(Number(opts.limit) || 25, 1), 100);
  const rows = await db.activityTemplate.findMany({
    where: {
      teacherId: teacher.id,
      archived: false,
      ...(search ? { title: { contains: search } } : {}),
    },
    select: SUMMARY_SELECT,
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(summaryOf);
}

export async function getActivity(teacher: ApiTeacher, id: unknown): Promise<ActivityDetail | null> {
  if (typeof id !== "string" || !id) return null;
  const row = await db.activityTemplate.findFirst({
    where: { id, teacherId: teacher.id },
    select: SUMMARY_SELECT,
  });
  if (!row) return null;

  // Back out to the shape the API speaks: option ids and box geometry are this
  // module's business, not the caller's, so they are not sent.
  const quiz = readQuiz(row.quizJson);
  const questions: ApiQuestion[] = quiz.questions.map((q) => ({
    prompt: q.prompt,
    // An answer can be a PICTURE the teacher chose, which has no text to send.
    // It is labelled rather than flattened to its words, so a caller cannot mistake
    // a placeholder for the answer and write it back as one — see usesAnswerPictures
    // below, which refuses that rewrite outright.
    options: q.options.map((o) => o.text ?? "(a picture)"),
    correct: Math.max(0, q.options.findIndex((o) => o.id === q.correctOptionId)),
    page: q.pageIndex + 1,
  }));

  return { ...summaryOf(row), questions, usesAnswerPictures: quizImagePaths(quiz).length > 0 };
}

export async function listFolders(teacher: ApiTeacher): Promise<{ id: string; name: string }[]> {
  return db.folder.findMany({
    where: { teacherId: teacher.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

function readTitle(value: unknown): string {
  const title = String(value ?? "").trim();
  if (!title) throw new ActivityInputError("The activity needs a title.");
  if (title.length > 120) throw new ActivityInputError("That title is too long (at most 120 characters).");
  return title;
}

function readTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return list.map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 12);
}

async function readFolderId(teacher: ApiTeacher, value: unknown): Promise<string | null> {
  if (value == null || value === "") return null;
  const id = String(value);
  const folder = await db.folder.findFirst({ where: { id, teacherId: teacher.id }, select: { id: true } });
  if (!folder) throw new ActivityInputError("That folder isn't one of yours. Use list_folders to see the folders you have.");
  return folder.id;
}

function readPages(value: unknown): number | null {
  if (value == null) return null;
  const pages = Number(value);
  if (!Number.isInteger(pages) || pages < 1) throw new ActivityInputError("`pages` has to be a whole number of at least 1.");
  if (pages > MAX_PAGES) throw new ActivityInputError(`An activity can have at most ${MAX_PAGES} pages.`);
  return pages;
}

// parseQuizPayload is the same validator createTemplate uses. Running it on our
// own output is not belt and braces for its own sake: it is what keeps "what the
// API writes" and "what the canvas will accept" the same thing, so a change to
// one can never quietly diverge from the other. Its refusals are already written
// for a teacher; they are re-thrown as ActivityInputError so the layer above has
// exactly one class to recognise and everything else stays a fault.
function serialiseQuiz(quiz: QuizPayload): string | null {
  if (!quiz.questions.length) return null;
  try {
    return JSON.stringify(parseQuizPayload(JSON.stringify(quiz)));
  } catch (err) {
    throw new ActivityInputError(err instanceof Error ? err.message : "That quiz couldn't be saved.");
  }
}

export async function createActivity(teacher: ApiTeacher, input: ActivityInput): Promise<ActivitySummary> {
  const title = readTitle(input.title);
  const instructions = String(input.instructions ?? "").trim() || null;
  const tags = readTags(input.tags);
  const folderId = await readFolderId(teacher, input.folderId);
  const asked = readPages(input.pages);

  const { quiz, pageCount } = layoutQuiz(input.questions ?? [], asked ?? 1);
  if (pageCount > MAX_PAGES) throw new ActivityInputError(`An activity can have at most ${MAX_PAGES} pages.`);
  const quizJson = serialiseQuiz(quiz);

  const created = await db.activityTemplate.create({
    data: {
      title,
      instructions,
      tagsJson: tags.length ? JSON.stringify(tags) : null,
      folderId,
      teacherId: teacher.id,
      templatePathsJson: JSON.stringify(await buildPagePaths(pageCount)),
      quizJson,
      // No picture. The card's picture is drawn BY the canvas, with the question
      // boxes on it, and nothing on the server can draw one. templateThumb()
      // already returns null for a template that carries questions and no
      // picture, and the library shows its designed card instead of a blank
      // white rectangle — so the honest thing here is to leave it unset and let
      // the first save in the builder fill it in.
      previewPathsJson: null,
    },
    select: SUMMARY_SELECT,
  });
  return summaryOf(created);
}

export async function updateActivity(teacher: ApiTeacher, id: unknown, input: ActivityInput): Promise<ActivitySummary | null> {
  if (typeof id !== "string" || !id) return null;
  const existing = await db.activityTemplate.findFirst({
    where: { id, teacherId: teacher.id, archived: false },
    select: { id: true, templatePathsJson: true, quizJson: true },
  });
  if (!existing) return null;

  // A teacher can make an answer a PICTURE — a photograph of a leaf, one of four
  // shapes — and the connector has no way to say "this picture". Sending
  // `questions` replaces every question, so a round trip through here would
  // quietly turn those pictures into the words used to stand in for them, and
  // the teacher would find a picture quiz that had become a text one.
  //
  // So it is refused, in a sentence that says where to do it instead. Everything
  // else about such an activity — its title, instructions, tags, folder — is
  // still editable, because none of that touches the answers.
  if (input.questions !== undefined && quizImagePaths(readQuiz(existing.quizJson)).length > 0) {
    throw new ActivityInputError(
      "Some answers in this activity are pictures, and rewriting the questions here would replace them with words. Change the title, instructions or tags if you like, and edit the questions in StoryJar.",
    );
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = readTitle(input.title);
  if (input.instructions !== undefined) data.instructions = String(input.instructions ?? "").trim() || null;
  if (input.tags !== undefined) {
    const tags = readTags(input.tags);
    data.tagsJson = tags.length ? JSON.stringify(tags) : null;
  }
  if (input.folderId !== undefined) data.folderId = await readFolderId(teacher, input.folderId);

  const asked = readPages(input.pages);
  const currentPages = jsonArray(existing.templatePathsJson);

  if (input.questions !== undefined) {
    const { quiz, pageCount } = layoutQuiz(input.questions, asked ?? currentPages.length);
    if (pageCount > MAX_PAGES) throw new ActivityInputError(`An activity can have at most ${MAX_PAGES} pages.`);
    data.quizJson = serialiseQuiz(quiz);
    data.templatePathsJson = JSON.stringify(await buildPagePaths(pageCount, currentPages));
    // The stored picture was drawn from the questions that were there a moment
    // ago. Keeping it would show a teacher the old quiz on the library card.
    data.previewPathsJson = null;
  } else if (asked !== null && asked !== currentPages.length) {
    data.templatePathsJson = JSON.stringify(await buildPagePaths(asked, currentPages));
    data.previewPathsJson = null;
  }

  const updated = await db.activityTemplate.update({ where: { id: existing.id }, data, select: SUMMARY_SELECT });

  // Note what is deliberately NOT here: the push onto LIVE runs that
  // updateTemplate() in src/app/actions/activities.ts performs. A teacher
  // editing in the canvas is looking at the thing they are changing; a model
  // rewriting an activity is not, and a class that is mid-way through a quiz
  // should not have the questions change underneath them because a chat window
  // said so. The runs keep the snapshot they were set with, and the caller is
  // told how many there are so it can say so.
  return summaryOf(updated);
}
