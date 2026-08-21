// Turning what Claude writes into the payloads the canvas renders.
//
// No `server-only` here: this is pure arithmetic and validation with no database
// and no Node built-ins, so the API routes, the MCP endpoint and the tests can
// all import it (mirrors quiz.ts and canvasObjects.ts).
//
// The shape Claude sends is deliberately not the shape the canvas stores. A
// model should not be asked to place a box at x=520, y=360 on a 1000×700 canvas
// it cannot see — it would guess, boxes would overlap, and a teacher would open
// a mess. So the API takes questions, pictures and page content, and this module
// decides where each of them goes.

import {
  MAX_OPTION_TEXT_LEN,
  MAX_PROMPT_LEN,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  QUIZ_H,
  QUIZ_W,
  type QuizOption,
  type QuizPayload,
  type QuizQuestion,
} from "@/lib/quiz";
import { MAX_TEXT_LEN, type CanvasObj } from "@/lib/canvasObjects";
import { ActivityInputError } from "./errors";
import { asList, asRecord, checkKeys, describe } from "./shapes";

// An image that has already been stored — see src/lib/api/media.ts. By the time
// anything reaches this module the bytes are on disk and this is just a path.
export type ResolvedImage = { src: string; alt: string };

// One answer. Words, a picture, or both. The canvas has always been able to show
// a picture answer (QuizOption.imagePath); until now only the editor could make one.
export type ApiOption = { text?: string; image?: ResolvedImage };

// What an activity's answers look like when READ back. A stored picture is
// reported as the id that can be sent straight back, so read-then-write keeps
// the picture instead of flattening it to the words that stood in for it.
export type ReportedOption = { text?: string; image?: { asset_id: string; alt: string } };

export type ApiQuestion = {
  prompt: string;
  options: ApiOption[];
  // Zero-based index into `options`. Named `correct` rather than
  // `correctOptionId` because the caller never sees the ids — this module mints
  // them — and an index into a list it just wrote is the thing it can get right.
  correct: number;
  // One-based, to match "page 3 of 4" as a teacher and a model both say it.
  // Omitted means "put it wherever it lands", which is what produces a
  // multi-page quiz from a flat list of questions.
  page?: number;
  // A picture that belongs WITH the question — the extract a comprehension
  // question is asking about. It goes BESIDE the box, never behind it: the quiz
  // layer draws on top of the object layer, so a picture under a question box is
  // a picture nobody sees.
  image?: ResolvedImage;
};

// What a page carries besides its questions — the "read this, then answer" half
// of a worksheet. Text becomes locked text objects; a background becomes the
// page image itself.
export type ApiPageContent = { heading?: string; passage?: string; background?: ResolvedImage };

// ---------------------------------------------------------------------------
// The page, in the canvas's own units (QUIZ_W × QUIZ_H)
// ---------------------------------------------------------------------------
// A page is two ROWS. A row holds either two plain question boxes side by side,
// or one question with its picture — picture left, box right. A page carrying a
// heading or a passage gives its top row to that text and keeps one row for
// questions.
//
// A page is never mixed: plain questions and picture questions do not share one.
// A lone box beside a picture reads as a mistake, and this way the packing rule
// stays something a person can predict from the tool description.

const MARGIN = 40;
const ROW_H = 300;
const ROW_Y = [MARGIN, QUIZ_H - MARGIN - ROW_H]; // 40, 360
const COL_W = 440;
const COL_X = [MARGIN, QUIZ_W - MARGIN - COL_W]; // 40, 520

// A picture row.
const PIC_W = 400;
const PIC_BOX_X = MARGIN + PIC_W + 30; // 470
const PIC_BOX_W = QUIZ_W - MARGIN - PIC_BOX_X; // 490

// The text zone: the top row of a page that carries a heading or a passage.
const TEXT_X = MARGIN;
const HEADING_Y = 24;
const HEADING_FONT = 40;
const PASSAGE_Y = 92;
const PASSAGE_BOTTOM = QUIZ_H - MARGIN;

// The canvas renders text with `whitespace-pre` and splits on newlines: it
// honours the line breaks it is given and does not soft-wrap. Left alone, a
// passage becomes one very long line running off the side of the page — which is
// exactly what it did the first time this was tried. So the wrapping happens
// here, and the size is chosen to fit rather than assumed.
const PASSAGE_FONTS = [24, 22, 20, 18, 16, 14];
// Average advance width of a proportional face, as a fraction of the font size.
// Deliberately generous: a line that is slightly short looks fine, a line that
// overflows the page does not.
const CHAR_EM = 0.52;
const LINE_EM = 1.35;

// Wrap a passage to the page and pick a size it fits at. A reading page — a
// passage with no questions under it — gets the whole page; a page that also
// carries questions gets the top half.
function fitPassage(text: string, hasQuestions: boolean): { text: string; fontPx: number } {
  const width = QUIZ_W - MARGIN * 2;
  const height = (hasQuestions ? ROW_Y[1] - 20 : PASSAGE_BOTTOM) - PASSAGE_Y;
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  let chosen = PASSAGE_FONTS[PASSAGE_FONTS.length - 1];
  let wrapped = "";
  for (const fontPx of PASSAGE_FONTS) {
    const perLine = Math.max(20, Math.floor(width / (fontPx * CHAR_EM)));
    const lines = paragraphs.flatMap((p) => wrapWords(p, perLine));
    chosen = fontPx;
    wrapped = lines.join("\n");
    if (lines.length * fontPx * LINE_EM <= height) break;
  }
  return { text: wrapped, fontPx: chosen };
}

function wrapWords(paragraph: string, perLine: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of paragraph.split(/\s+/)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= perLine) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Every object this module places is marked, so an update can replace what the
// API put on a page while leaving alone whatever the teacher placed themselves.
// Without it, adding a question picture to an activity would silently delete the
// maths apparatus a teacher had arranged on it — the same class of loss as
// renaming an activity deleting its worksheet.
export const API_OBJ_PREFIX = "api-";

// How many plain questions fit on a page. Kept exported because the tool
// description quotes it.
export const QUESTIONS_PER_PAGE = 4;

function rowsFor(hasText: boolean): number[] {
  return hasText ? [ROW_Y[1]] : ROW_Y;
}

function capacity(hasText: boolean, withPicture: boolean): number {
  const rows = rowsFor(hasText).length;
  return withPicture ? rows : rows * 2;
}

export type LayoutResult = {
  quiz: QuizPayload;
  pageCount: number;
  // Objects to merge into the template's object layer, one array per page:
  // question pictures, headings and passages. All locked — they are the
  // worksheet, not something a child should be able to drag away.
  objects: CanvasObj[][];
};

// Validate, paginate and place. Throws ActivityInputError, listing everything
// wrong rather than only the first thing.
export function layoutQuiz(
  input: unknown,
  minPages = 1,
  pageContent: ApiPageContent[] = [],
): LayoutResult {
  const raw = Array.isArray(input) ? input : [];
  if (raw.length > MAX_QUESTIONS) {
    throw new ActivityInputError(`A quiz can have at most ${MAX_QUESTIONS} questions; that one had ${raw.length}.`);
  }

  // Check EVERY question before refusing any of them. This used to throw on the
  // first bad one, so a payload with three overlong prompts cost three
  // round-trips — the caller fixed one, resubmitted, and was told about the
  // next. A model drafting a quiz should be told everything that is wrong with
  // it once.
  const problems: string[] = [];
  const checked: Checked[] = [];
  raw.forEach((q, i) => {
    try {
      checked.push(checkQuestion(q, i));
    } catch (err) {
      problems.push(err instanceof Error ? err.message : `Question ${i + 1} isn't valid.`);
    }
  });
  if (problems.length) throw new ActivityInputError(problems.join("\n"));

  const hasText = (pageIndex: number): boolean => {
    const c = pageContent[pageIndex];
    return Boolean(c && (c.heading || c.passage));
  };

  // Pinned questions first: a page somebody named by hand is not negotiable.
  const perPage = new Map<number, Checked[]>();
  const floating: Checked[] = [];
  for (const q of checked) {
    if (q.page) {
      const list = perPage.get(q.page - 1) ?? [];
      list.push(q);
      perPage.set(q.page - 1, list);
    } else {
      floating.push(q);
    }
  }

  // Then deal the rest out, never mixing picture questions with plain ones on a
  // page and never past a page's capacity. Start after the last page anybody
  // asked for by name, so pinned and unpinned questions cannot land on top of
  // each other.
  let cursor = Math.max(pageContent.length, ...[...perPage.keys()].map((p) => p + 1), 0);
  const takes = (page: number, q: Checked): boolean => {
    const on = perPage.get(page) ?? [];
    if (on.length === 0) return true;
    const mixed = on.some((x) => Boolean(x.image)) !== Boolean(q.image);
    if (mixed) return false;
    return on.length < capacity(hasText(page), Boolean(q.image));
  };
  for (const q of floating) {
    while (!takes(cursor, q)) cursor++;
    perPage.set(cursor, [...(perPage.get(cursor) ?? []), q]);
  }

  // Place everything.
  const questions: QuizQuestion[] = [];
  const objects: CanvasObj[][] = [];
  let seq = 0;
  let objSeq = 0;

  const pageIndexes = new Set<number>([...perPage.keys(), ...pageContent.map((_, i) => i)]);
  const highest = pageIndexes.size ? Math.max(...pageIndexes) + 1 : 0;
  const pageCount = Math.max(minPages, highest, 1);

  for (let page = 0; page < pageCount; page++) {
    const onPage = perPage.get(page) ?? [];
    const content = pageContent[page];
    const rows = rowsFor(hasText(page));
    const pageObjects: CanvasObj[] = [];

    if (content?.heading) {
      pageObjects.push({
        id: `${API_OBJ_PREFIX}t${++objSeq}`,
        type: "text",
        text: content.heading,
        x: TEXT_X,
        y: HEADING_Y,
        fontPx: HEADING_FONT,
        color: "#1f2430",
        locked: true,
      });
    }
    if (content?.passage) {
      const fitted = fitPassage(content.passage, onPage.length > 0);
      pageObjects.push({
        id: `${API_OBJ_PREFIX}t${++objSeq}`,
        type: "text",
        text: fitted.text,
        x: TEXT_X,
        y: PASSAGE_Y,
        fontPx: fitted.fontPx,
        color: "#1f2430",
        locked: true,
      });
    }

    let plain = 0;
    let pictured = 0;
    for (const q of onPage) {
      const box = q.image ? pictureSlot(pictured, rows) : plainSlot(plain, rows);
      if (q.image) {
        pageObjects.push({
          id: `${API_OBJ_PREFIX}i${++objSeq}`,
          type: "image",
          src: q.image.src,
          alt: q.image.alt,
          x: MARGIN,
          y: box.y,
          w: PIC_W,
          h: ROW_H,
          aspect: PIC_W / ROW_H,
          locked: true,
        });
        pictured++;
      } else {
        plain++;
      }
      questions.push({
        id: `q${++seq}`,
        pageIndex: page,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        prompt: q.prompt,
        options: q.options.map((o, oi): QuizOption => ({
          id: `opt${oi}`,
          ...(o.text ? { text: o.text } : {}),
          ...(o.image ? { imagePath: o.image.src } : {}),
          ...(o.image?.alt ? { imageAlt: o.image.alt } : {}),
        })),
        correctOptionId: `opt${q.correct}`,
      });
    }

    objects.push(pageObjects);
  }

  return { quiz: { questions }, pageCount, objects };
}

// Where the nth plain question on a page sits: across, then down.
function plainSlot(n: number, rows: number[]): { x: number; y: number; w: number; h: number } {
  const row = rows[Math.min(Math.floor(n / 2), rows.length - 1)];
  return { x: COL_X[n % 2], y: row, w: COL_W, h: ROW_H };
}

// Where the nth picture question on a page sits — the box only; its picture is
// placed on the left of the same row by the caller.
function pictureSlot(n: number, rows: number[]): { x: number; y: number; w: number; h: number } {
  return { x: PIC_BOX_X, y: rows[Math.min(n, rows.length - 1)], w: PIC_BOX_W, h: ROW_H };
}

type Checked = { prompt: string; options: ApiOption[]; correct: number; page?: number; image?: ResolvedImage };

// Everything a question may carry. Named here rather than inline because it is
// also what an unknown-field refusal reads out to the caller — so a caller
// working from a stale tool list learns the real shape from the error.
export const QUESTION_FIELDS = ["prompt", "options", "correct", "page", "image"] as const;
export const OPTION_FIELDS = ["text", "image"] as const;

function checkQuestion(value: unknown, i: number): Checked {
  const at = `Question ${i + 1}`;
  const src = asRecord(value, at);
  checkKeys(src, QUESTION_FIELDS, at);

  const prompt = String(src.prompt ?? "").trim();
  if (!prompt) throw new ActivityInputError(`${at} needs a question to ask.`);
  // Deliberately unchanged and deliberately small. A prompt is a question, not a
  // passage; a body of text belongs in a page's `passage` or on the page as a
  // picture, where it renders as something a child can actually read.
  if (prompt.length > MAX_PROMPT_LEN) {
    throw new ActivityInputError(
      `${at} is too long (at most ${MAX_PROMPT_LEN} characters). If it needs to quote a passage, put the passage on the page instead and keep the question short.`,
    );
  }

  const rawOptions = src.options === undefined ? [] : asList(src.options, `${at}'s \`options\``, "one entry per answer");
  if (rawOptions.length < MIN_OPTIONS || rawOptions.length > MAX_OPTIONS) {
    throw new ActivityInputError(`${at} needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} answers to choose from.`);
  }

  const options: ApiOption[] = rawOptions.map((o, oi) => {
    // A plain string is still the ordinary case and stays the ordinary case.
    if (typeof o === "string" || typeof o === "number") {
      const text = String(o).trim();
      if (!text) throw new ActivityInputError(`${at} has an empty answer. Every answer needs some words or a picture.`);
      if (text.length > MAX_OPTION_TEXT_LEN) {
        throw new ActivityInputError(`${at} has an answer that is too long (at most ${MAX_OPTION_TEXT_LEN} characters).`);
      }
      return { text };
    }
    const obj = asRecord(o, `Answer ${oi + 1} of ${at.toLowerCase()}`);
    checkKeys(obj, OPTION_FIELDS, `Answer ${oi + 1} of ${at.toLowerCase()}`);
    const text = String(obj.text ?? "").trim();
    if (text.length > MAX_OPTION_TEXT_LEN) {
      throw new ActivityInputError(`${at} has an answer that is too long (at most ${MAX_OPTION_TEXT_LEN} characters).`);
    }
    const image = obj.image as ResolvedImage | undefined;
    if (!text && !image) {
      throw new ActivityInputError(`Answer ${oi + 1} of ${at.toLowerCase()} needs some words or a picture.`);
    }
    return { ...(text ? { text } : {}), ...(image ? { image } : {}) };
  });

  const seen = new Set(options.filter((o) => o.text).map((o) => o.text!.toLowerCase()));
  if (seen.size !== options.filter((o) => o.text).length) {
    throw new ActivityInputError(`${at} has the same answer twice.`);
  }

  const correct = Number(src.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
    throw new ActivityInputError(
      `${at} needs "correct" to be the position of the right answer, counting from 0 (so 0 to ${options.length - 1}).`,
    );
  }

  const page = src.page == null ? undefined : Number(src.page);
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
    throw new ActivityInputError(`${at} needs \`page\` to be a whole number counting from 1. I received ${describe(src.page)}.`);
  }

  return { prompt, options, correct, page, image: src.image as ResolvedImage | undefined };
}

// A passage is text on the page, not a question prompt, so it gets the canvas's
// standalone-text budget rather than the prompt's.
export function checkPassage(value: unknown, where: string): string {
  const text = String(value ?? "").trim();
  if (text.length > MAX_TEXT_LEN) {
    throw new ActivityInputError(`${where} is too long (at most ${MAX_TEXT_LEN} characters).`);
  }
  return text;
}

