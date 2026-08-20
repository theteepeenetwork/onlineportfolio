// Turning the questions Claude writes into the quiz payload the canvas renders.
//
// No `server-only` here: this is pure arithmetic and validation with no database
// and no Node built-ins, so the API routes, the MCP endpoint and the tests can
// all import it (mirrors quiz.ts and canvasObjects.ts).
//
// The shape Claude sends is deliberately not the shape the canvas stores. A
// model should not be asked to place a box at x=520, y=360 on a 1000×700 canvas
// it cannot see — it would guess, questions would overlap, and a teacher would
// open a mess. So the API takes a question and a page number, and this module
// decides where it goes.

import {
  MAX_OPTION_TEXT_LEN,
  MAX_PROMPT_LEN,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  QUIZ_H,
  QUIZ_W,
  type QuizPayload,
  type QuizQuestion,
} from "@/lib/quiz";
import { ActivityInputError } from "./errors";

// What the API accepts for one question.
export type ApiQuestion = {
  prompt: string;
  options: string[];
  // Zero-based index into `options`. Named `correct` rather than
  // `correctOptionId` because the caller never sees the ids — this module mints
  // them — and an index into a list it just wrote is the thing it can get right.
  correct: number;
  // One-based, to match "page 3 of 4" as a teacher and a model both say it.
  // Omitted means "put it wherever it lands", which is what produces a
  // multi-page quiz from a flat list of questions.
  page?: number;
};

// Four boxes to a page, in a 2 × 2 grid. Wider and shorter than the editor's
// default box because a question written as a sentence needs the width more
// than it needs the height, and four is what fits before a child aged seven has
// to hunt for the next one.
export const QUESTIONS_PER_PAGE = 4;
const BOX_W = 440;
const BOX_H = 300;
const COL_X = [40, QUIZ_W - 40 - BOX_W]; //  40 and 520
const ROW_Y = [40, QUIZ_H - 40 - BOX_H]; //  40 and 360

function slotFor(indexOnPage: number): { x: number; y: number } {
  // Beyond the fourth box the grid repeats, nudged down and right so an
  // overflowing page is visibly overlapping rather than invisibly stacked. It
  // should not happen — layoutQuiz paginates before it gets here — but a caller
  // that pins five questions to one page gets something a teacher can see and
  // fix, not four questions and a hidden fifth.
  const cycle = indexOnPage % QUESTIONS_PER_PAGE;
  const overflow = Math.floor(indexOnPage / QUESTIONS_PER_PAGE) * 24;
  return {
    x: Math.min(COL_X[cycle % 2] + overflow, QUIZ_W - BOX_W),
    y: Math.min(ROW_Y[Math.floor(cycle / 2)] + overflow, QUIZ_H - BOX_H),
  };
}

export type LayoutResult = { quiz: QuizPayload; pageCount: number };

// Validate, paginate and place. Throws ActivityInputError on anything
// structurally wrong — the message goes back to Claude, which relays it — and
// otherwise returns a payload parseQuizPayload will accept unchanged.
export function layoutQuiz(input: unknown, minPages = 1): LayoutResult {
  const raw = Array.isArray(input) ? input : [];
  if (raw.length > MAX_QUESTIONS) {
    throw new ActivityInputError(`A quiz can have at most ${MAX_QUESTIONS} questions; that one had ${raw.length}.`);
  }

  // First pass: validate, and work out which page each question belongs on.
  // A question with an explicit `page` keeps it. The rest are dealt out four to
  // a page, starting after the last page anybody asked for by name, so pinned
  // and unpinned questions in the same call cannot land on top of each other.
  const checked = raw.map((q, i) => checkQuestion(q, i));
  const pinnedMax = checked.reduce((max, q) => (q.page ? Math.max(max, q.page) : max), 0);

  let floating = 0;
  const placed = checked.map((q) => {
    if (q.page) return { ...q, pageIndex: q.page - 1 };
    const pageIndex = pinnedMax + Math.floor(floating / QUESTIONS_PER_PAGE);
    floating++;
    return { ...q, pageIndex };
  });

  // Second pass: position each question within its page.
  const seenOnPage = new Map<number, number>();
  const questions: QuizQuestion[] = placed.map((q, i) => {
    const n = seenOnPage.get(q.pageIndex) ?? 0;
    seenOnPage.set(q.pageIndex, n + 1);
    const { x, y } = slotFor(n);
    return {
      id: `q${i + 1}`,
      pageIndex: q.pageIndex,
      x,
      y,
      w: BOX_W,
      h: BOX_H,
      prompt: q.prompt,
      options: q.options.map((text, oi) => ({ id: `opt${oi}`, text })),
      correctOptionId: `opt${q.correct}`,
    };
  });

  const highestPage = questions.reduce((max, q) => Math.max(max, q.pageIndex + 1), 0);
  return { quiz: { questions }, pageCount: Math.max(minPages, highestPage, 1) };
}

function checkQuestion(value: unknown, i: number): { prompt: string; options: string[]; correct: number; page?: number } {
  const at = `Question ${i + 1}`;
  const src = (value ?? {}) as Record<string, unknown>;

  const prompt = String(src.prompt ?? "").trim();
  if (!prompt) throw new ActivityInputError(`${at} needs a question to ask.`);
  if (prompt.length > MAX_PROMPT_LEN) throw new ActivityInputError(`${at} is too long (at most ${MAX_PROMPT_LEN} characters).`);

  const options = (Array.isArray(src.options) ? src.options : []).map((o) => String(o ?? "").trim());
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    throw new ActivityInputError(`${at} needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} answers to choose from.`);
  }
  if (options.some((o) => !o)) throw new ActivityInputError(`${at} has an empty answer. Every answer needs some words.`);
  if (options.some((o) => o.length > MAX_OPTION_TEXT_LEN)) {
    throw new ActivityInputError(`${at} has an answer that is too long (at most ${MAX_OPTION_TEXT_LEN} characters).`);
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    throw new ActivityInputError(`${at} has the same answer twice.`);
  }

  const correct = Number(src.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
    throw new ActivityInputError(`${at} needs "correct" to be the position of the right answer, counting from 0 (so 0 to ${options.length - 1}).`);
  }

  const page = src.page == null ? undefined : Number(src.page);
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
    throw new ActivityInputError(`${at} has a page number of "${String(src.page)}". Pages are counted from 1.`);
  }

  return { prompt, options, correct, page };
}
