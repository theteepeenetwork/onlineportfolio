import "server-only";
import { db } from "@/lib/db";
import { parseQuizPayload, quizImagePaths, readQuiz, type QuizPayload } from "@/lib/quiz";
import { jsonArray } from "@/lib/activities";
import { buildPagePaths } from "./blankPage";
import {
  API_OBJ_PREFIX,
  checkPassage,
  layoutQuiz,
  type ApiPageContent,
  type ApiQuestion,
  type ReportedOption,
  QUESTION_FIELDS,
} from "./quizLayout";
import { ImageBudget, persistImage } from "./media";
import { normalizeTemplateObjects, type CanvasObj } from "@/lib/canvasObjects";
import { ActivityInputError } from "./errors";
import { asList, asRecord, checkKeys, describe } from "./shapes";
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
  // How many pictures the activity actually ended up holding. Reported on every
  // write, not just on a read, because it is the cheapest possible answer to
  // "did my picture arrive?" — the question that cost a teacher a morning when
  // the only way to find out was to open the canvas and look.
  pictures: number;
  liveRuns: number;
  createdAt: string;
  // Relative on purpose: only the caller knows the public origin. The MCP layer
  // turns this into a link a teacher can click.
  path: string;
};

// A question as reported back, which differs from one being written only in how
// a picture is named: `asset_id` out, `source` or `asset_id` in.
export type ReportedQuestion = Omit<ApiQuestion, "options" | "image"> & {
  options: ReportedOption[];
  image?: { asset_id: string; alt: string };
};

export type ActivityDetail = ActivitySummary & {
  questions: ReportedQuestion[];
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
  archived?: unknown;
  pageContent?: unknown;
};


// Every picture on the activity: the ones placed in the object layer (question
// extracts, page images) and the ones used as answers. Page backgrounds are not
// counted — a blank page has one and it is not a picture anybody put there.
// Neither is a photo frame: it is the space for a picture a child has not
// taken yet, so it costs nothing against the picture budget.
function countPictures(objectsJson: string | null, quizJson: string | null): number {
  let count = 0;
  try {
    const { pages } = normalizeTemplateObjects(objectsJson ? JSON.parse(objectsJson) : null);
    for (const page of pages) count += page.filter((o) => o.type === "image").length;
  } catch {
    // A malformed object layer is not worth failing a read over; it renders as
    // nothing on the canvas too.
  }
  count += quizImagePaths(readQuiz(quizJson)).length;
  return count;
}

function summaryOf(row: {
  id: string;
  title: string;
  instructions: string | null;
  tagsJson: string | null;
  folderId: string | null;
  folder: { name: string } | null;
  templatePathsJson: string | null;
  quizJson: string | null;
  objectsJson: string | null;
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
    pictures: countPictures(row.objectsJson, row.quizJson),
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
  objectsJson: true,
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
  const questions: ReportedQuestion[] = quiz.questions.map((q) => ({
    prompt: q.prompt,
    // An answer can be a picture. It is reported AS a picture, carrying the id
    // that can be sent straight back — so reading an activity and writing it
    // again keeps the pictures instead of flattening them to the words that
    // stood in for them.
    options: q.options.map((o) => ({
      ...(o.text ? { text: o.text } : {}),
      ...(o.imagePath ? { image: { asset_id: o.imagePath, alt: o.imageAlt ?? "" } } : {}),
    })),
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

// What to do, in a sentence or two. It is read aloud to younger children and it
// renders as the SUBTITLE on a child's activity screen, so it is not a place for
// a passage — a whole comprehension story once ended up here, as a subtitle,
// because it was the only long-text field the API had. Now that a page can carry
// a passage of its own, this is held to what it has always claimed to be.
export const MAX_INSTRUCTIONS_LEN = 500;

function readInstructions(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > MAX_INSTRUCTIONS_LEN) {
    throw new ActivityInputError(
      `The instructions are too long (at most ${MAX_INSTRUCTIONS_LEN} characters). They are read aloud to a child and shown under the title — if you meant to include a passage for them to read, put it in page_content instead.`,
    );
  }
  return text;
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

// What each page carries besides its questions. Indexed from 0, so entry 0 is
// page 1. Pictures are stored as they are read, against the call's budget.
export const PAGE_CONTENT_FIELDS = ["heading", "passage", "image"] as const;

async function readPageContent(value: unknown, budget: ImageBudget): Promise<ApiPageContent[]> {
  if (value == null) return [];
  const list = asList(value, "page_content", "one entry per page, page 1 first");
  if (list.length > MAX_PAGES) throw new ActivityInputError(`An activity can have at most ${MAX_PAGES} pages.`);

  const out: ApiPageContent[] = [];
  for (const [i, raw] of list.entries()) {
    const where = `Page ${i + 1}`;
    // An empty entry is how a caller says "nothing extra on this page" while
    // still lining up the pages after it, so {} is allowed — null is not.
    const entry = raw == null ? {} : asRecord(raw, where);
    checkKeys(entry, PAGE_CONTENT_FIELDS, where);
    const heading = String(entry.heading ?? "").trim();
    const passage = checkPassage(entry.passage, `${where}'s \`passage\``);
    const background = entry.image ? await persistImage(entry.image, `${where}'s \`image\``, budget) : undefined;
    out.push({
      ...(heading ? { heading } : {}),
      ...(passage ? { passage } : {}),
      ...(background ? { background } : {}),
    });
  }
  return out;
}

// Store every picture a question carries — its own, and any on its answers —
// before the layout runs, so the layout only ever deals with paths.
async function readQuestions(value: unknown, budget: ImageBudget): Promise<unknown[]> {
  if (value == null) return [];
  const list = asList(value, "questions", "one entry per question");
  const out: unknown[] = [];
  for (const [i, raw] of list.entries()) {
    const where = `Question ${i + 1}`;
    const q = asRecord(raw, where);
    // Checked here as well as in checkQuestion, because this runs FIRST and
    // this is the pass that writes files. A question with a misspelt field
    // should be refused before any of its pictures are on disk.
    checkKeys(q, QUESTION_FIELDS, where);
    const image = q.image ? await persistImage(q.image, `${where}'s \`image\``, budget) : undefined;
    const rawOptions = q.options === undefined ? [] : asList(q.options, `${where}'s \`options\``, "one entry per answer");
    const options: unknown[] = [];
    for (const [oi, o] of rawOptions.entries()) {
      if (o && typeof o === "object" && (o as Record<string, unknown>).image) {
        const opt = o as Record<string, unknown>;
        options.push({
          ...(opt.text ? { text: opt.text } : {}),
          image: await persistImage(opt.image, `Answer ${oi + 1} of ${where.toLowerCase()}'s \`image\``, budget),
        });
      } else {
        options.push(o);
      }
    }
    out.push({ ...q, options, ...(image ? { image } : {}) });
  }
  return out;
}

// Merge what the layout placed with whatever the teacher placed themselves.
// Only objects this API created are replaced (see API_OBJ_PREFIX) — a teacher's
// own apparatus on the same page survives untouched.
function mergeObjects(existingJson: string | null, placed: CanvasObj[][], pageCount: number): string | null {
  const existing = normalizeTemplateObjects(existingJson ? JSON.parse(existingJson) : null).pages;
  const pages: CanvasObj[][] = [];
  for (let i = 0; i < pageCount; i++) {
    const theirs = (existing[i] ?? []).filter((o) => !o.id.startsWith(API_OBJ_PREFIX));
    pages.push([...theirs, ...(placed[i] ?? [])]);
  }
  return pages.some((p) => p.length) ? JSON.stringify(pages) : null;
}

// The background for each page: the caller's picture where they gave one, the
// page already there where they did not. buildPagePaths fills any remainder with
// blanks, so a page always has a background and a question is never stranded on
// a page that does not exist.
function backgroundsOf(pageContent: ApiPageContent[], pageCount: number, current: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const supplied = pageContent[i]?.background?.src;
    const existing = current[i];
    if (supplied) out.push(supplied);
    else if (existing) out.push(existing);
    else break; // buildPagePaths blanks the rest; it cannot leave a hole mid-list
  }
  return out;
}

// The questions already on an activity, in the API's own shape, so a caller can
// change a page's passage without having to resend every question to keep them.
function questionsOf(quizJson: string | null): unknown[] {
  return readQuiz(quizJson).questions.map((q) => ({
    prompt: q.prompt,
    options: q.options.map((o) => ({
      ...(o.text ? { text: o.text } : {}),
      ...(o.imagePath ? { image: { asset_id: o.imagePath, alt: o.imageAlt ?? "" } } : {}),
    })),
    correct: Math.max(0, q.options.findIndex((o) => o.id === q.correctOptionId)),
    page: q.pageIndex + 1,
  }));
}

function readPages(value: unknown): number | null {
  if (value == null) return null;
  const pages = Number(value);
  if (!Number.isInteger(pages) || pages < 1) {
    throw new ActivityInputError(
      `\`pages\` has to be a whole number of at least 1 — it is how MANY pages, not what is on them. I received ${describe(value)}. To say what a page carries, use \`page_content\`: a list with one entry per page, each {heading?, passage?, image?}.`,
    );
  }
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
  const instructions = readInstructions(input.instructions);
  const tags = readTags(input.tags);
  const folderId = await readFolderId(teacher, input.folderId);
  const asked = readPages(input.pages);

  // One budget for the whole call: the cap is on the activity, not on each
  // picture in isolation.
  const budget = new ImageBudget();
  const pageContent = await readPageContent(input.pageContent, budget);
  const questions = await readQuestions(input.questions, budget);

  const { quiz, pageCount, objects } = layoutQuiz(questions, Math.max(asked ?? 1, pageContent.length), pageContent);
  if (pageCount > MAX_PAGES) throw new ActivityInputError(`An activity can have at most ${MAX_PAGES} pages.`);
  const quizJson = serialiseQuiz(quiz);

  const created = await db.activityTemplate.create({
    data: {
      title,
      instructions,
      tagsJson: tags.length ? JSON.stringify(tags) : null,
      folderId,
      teacherId: teacher.id,
      templatePathsJson: JSON.stringify(await buildPagePaths(pageCount, backgroundsOf(pageContent, pageCount))),
      quizJson,
      objectsJson: mergeObjects(null, objects, pageCount),
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
  // Archived rows are reachable here on purpose, so an activity can be brought
  // back. listActivities still hides them; this is the one door in.
  const existing = await db.activityTemplate.findFirst({
    where: { id, teacherId: teacher.id },
    select: { id: true, templatePathsJson: true, quizJson: true, objectsJson: true },
  });
  if (!existing) return null;


  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = readTitle(input.title);
  if (input.instructions !== undefined) data.instructions = readInstructions(input.instructions);
  if (input.tags !== undefined) {
    const tags = readTags(input.tags);
    data.tagsJson = tags.length ? JSON.stringify(tags) : null;
  }
  if (input.folderId !== undefined) data.folderId = await readFolderId(teacher, input.folderId);
  // Archiving, not deleting. It is what the product already means by "take this
  // out of my library": the row and its media stay, and any run that was set
  // from it keeps working (see the column comment in schema.prisma). It gives an
  // agent a way to clear up a probe or a mistake without a destructive verb
  // existing on this surface at all.
  if (input.archived !== undefined) data.archived = Boolean(input.archived);

  const asked = readPages(input.pages);
  const currentPages = jsonArray(existing.templatePathsJson);

  if (input.questions !== undefined || input.pageContent !== undefined) {
    const budget = new ImageBudget();
    const pageContent = await readPageContent(input.pageContent, budget);
    // `questions` omitted on a page-content-only edit means "keep the ones that
    // are there", so they are read back out of the stored quiz.
    const questions =
      input.questions !== undefined ? await readQuestions(input.questions, budget) : questionsOf(existing.quizJson);

    const { quiz, pageCount, objects } = layoutQuiz(
      questions,
      Math.max(asked ?? currentPages.length, pageContent.length),
      pageContent,
    );
    if (pageCount > MAX_PAGES) throw new ActivityInputError(`An activity can have at most ${MAX_PAGES} pages.`);
    data.quizJson = serialiseQuiz(quiz);
    data.templatePathsJson = JSON.stringify(
      await buildPagePaths(pageCount, backgroundsOf(pageContent, pageCount, currentPages)),
    );
    data.objectsJson = mergeObjects(existing.objectsJson, objects, pageCount);
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
