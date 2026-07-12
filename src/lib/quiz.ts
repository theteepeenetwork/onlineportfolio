// Shared quiz types + helpers for the activity template editor.
//
// A quiz is a set of floating multiple-choice question boxes placed on the
// canvas. It can span several pages (not necessarily consecutive), so each
// question carries its own `pageIndex`. Question boxes are NEVER flattened into
// the page PNG — they live in this structured payload so they stay interactive
// for the child and reviewable for the teacher.
//
// No `server-only` here: this module is imported by both the client canvas
// (authoring / answering) and the server actions (validating / scoring). Keep
// it free of any DB or Node-only imports.

// Canvas model space (matches DrawingCanvas W×H); question boxes are positioned
// in these units and scaled for display, so they're resolution-independent.
export const QUIZ_W = 1000;
export const QUIZ_H = 700;

// Guardrails (hand-rolled validation — there is no zod in this repo).
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_QUESTIONS = 50;
export const MAX_PROMPT_LEN = 300;
export const MAX_OPTION_TEXT_LEN = 120;
export const MAX_OPTION_IMAGES = 40; // total across the whole quiz, to bound upload abuse

export type QuizOption = {
  id: string; // stable within its question, e.g. "opt0"
  text?: string; // teacher text; rendered as a React text node (auto-escaped)
  imagePath?: string; // "/uploads/<file>" at rest; a data:image URL only transiently while authoring
};

export type QuizQuestion = {
  id: string;
  pageIndex: number; // which canvas page this box lives on (need NOT be consecutive)
  x: number;
  y: number;
  w: number;
  h: number; // QUIZ_W×QUIZ_H model space
  prompt: string;
  options: QuizOption[]; // MIN_OPTIONS..MAX_OPTIONS
  correctOptionId: string; // must equal one of options[].id
};

export type QuizPayload = { questions: QuizQuestion[] };

// A child's answer to one question. `selectedOptionId` is null when unanswered.
export type QuizAnswer = { questionId: string; selectedOptionId: string | null };

// Tolerant reader for rendering / scoring: never throws, returns an empty quiz
// on any problem. Use this when a bad payload should degrade gracefully (child
// runtime, teacher review) rather than error.
export function readQuiz(raw: string | null | undefined): QuizPayload {
  if (!raw) return { questions: [] };
  try {
    return parseQuizPayload(raw);
  } catch {
    return { questions: [] };
  }
}

// Is this a value we're willing to persist as an option image? Either a
// data:image URL (freshly authored, rewritten to a path by the action) or an
// already-saved /uploads path. Anything else is rejected to stop path-shaped
// junk being stored and later fed to the media route.
export function isAllowedImagePath(v: unknown): v is string {
  return typeof v === "string" && (v.startsWith("data:image") || v.startsWith("/uploads/"));
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Strict-but-forgiving validator: coerces/clamps geometry, trims text, and
// THROWS a teacher-friendly Error on anything structurally wrong (too few
// options, no correct answer, empty option, etc.). Used by createTemplate,
// which surfaces the message. Returns a normalised payload.
export function parseQuizPayload(raw: string): QuizPayload {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : { questions: [] };
  } catch {
    throw new Error("The quiz couldn't be read. Please try again.");
  }

  const rawQuestions = (data as { questions?: unknown })?.questions;
  if (rawQuestions == null) return { questions: [] };
  if (!Array.isArray(rawQuestions)) throw new Error("The quiz is in an unexpected format.");
  if (rawQuestions.length > MAX_QUESTIONS) {
    throw new Error(`A quiz can have at most ${MAX_QUESTIONS} questions.`);
  }

  let imageCount = 0;
  const questions: QuizQuestion[] = rawQuestions.map((q, qi) => {
    const src = (q ?? {}) as Record<string, unknown>;
    const id = typeof src.id === "string" && src.id.trim() ? src.id : `q${qi}`;

    const prompt = String(src.prompt ?? "").trim();
    if (!prompt) throw new Error(`Question ${qi + 1} needs a question to ask.`);
    if (prompt.length > MAX_PROMPT_LEN) throw new Error(`Question ${qi + 1} is too long.`);

    const rawOptions = Array.isArray(src.options) ? src.options : [];
    if (rawOptions.length < MIN_OPTIONS || rawOptions.length > MAX_OPTIONS) {
      throw new Error(`Question ${qi + 1} needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} answers.`);
    }

    const seen = new Set<string>();
    const options: QuizOption[] = rawOptions.map((o, oi) => {
      const os = (o ?? {}) as Record<string, unknown>;
      const oid = typeof os.id === "string" && os.id.trim() ? os.id : `opt${oi}`;
      if (seen.has(oid)) throw new Error(`Question ${qi + 1} has a repeated answer.`);
      seen.add(oid);

      const text = String(os.text ?? "").trim();
      if (text.length > MAX_OPTION_TEXT_LEN) throw new Error(`An answer in question ${qi + 1} is too long.`);
      const image = isAllowedImagePath(os.imagePath) ? (os.imagePath as string) : undefined;
      if (!text && !image) throw new Error(`Every answer in question ${qi + 1} needs a word or a picture.`);
      if (image) imageCount++;

      const opt: QuizOption = { id: oid };
      if (text) opt.text = text;
      if (image) opt.imagePath = image;
      return opt;
    });

    const correctOptionId = String(src.correctOptionId ?? "");
    if (!options.some((o) => o.id === correctOptionId)) {
      throw new Error(`Please mark the correct answer for question ${qi + 1}.`);
    }

    return {
      id,
      pageIndex: Math.max(0, Math.trunc(num(src.pageIndex))),
      x: clamp(num(src.x), 0, QUIZ_W),
      y: clamp(num(src.y), 0, QUIZ_H),
      w: clamp(num(src.w, 320), 40, QUIZ_W),
      h: clamp(num(src.h, 240), 40, QUIZ_H),
      prompt,
      options,
      correctOptionId,
    };
  });

  if (imageCount > MAX_OPTION_IMAGES) {
    throw new Error(`A quiz can use at most ${MAX_OPTION_IMAGES} answer pictures.`);
  }

  return { questions };
}

// Tolerant reader for a child's raw submitted answers (the hidden-input JSON).
// Never throws; keeps only well-shaped entries.
export function readAnswers(raw: string | null | undefined): QuizAnswer[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.questionId === "string")
      .map((x) => ({
        questionId: x.questionId as string,
        selectedOptionId: typeof x.selectedOptionId === "string" ? x.selectedOptionId : null,
      }));
  } catch {
    return [];
  }
}

// Normalise a child's raw answers against the quiz snapshot: exactly one answer
// per question, in question order, with any selection that isn't a real option
// of that question discarded (→ null). This is the trusted, junk-free form to
// store and score.
export function sanitizeAnswers(quiz: QuizPayload, answers: QuizAnswer[]): QuizAnswer[] {
  const byQuestion = new Map<string, string | null>();
  for (const a of answers ?? []) {
    if (a && typeof a.questionId === "string") {
      byQuestion.set(a.questionId, typeof a.selectedOptionId === "string" ? a.selectedOptionId : null);
    }
  }
  return quiz.questions.map((q) => {
    const picked = byQuestion.get(q.id) ?? null;
    const valid = picked != null && q.options.some((o) => o.id === picked);
    return { questionId: q.id, selectedOptionId: valid ? picked : null };
  });
}

// Server-side scoring: number correct out of total. Pure; never leaks
// per-question correctness to the caller (the caller decides what to store).
export function scoreQuiz(quiz: QuizPayload, answers: QuizAnswer[]): { score: number; total: number } {
  const clean = sanitizeAnswers(quiz, answers);
  const byQuestion = new Map(clean.map((a) => [a.questionId, a.selectedOptionId]));
  let score = 0;
  for (const q of quiz.questions) {
    if (byQuestion.get(q.id) === q.correctOptionId) score++;
  }
  return { score, total: quiz.questions.length };
}

// Collect the /uploads paths referenced by a quiz's option images (for media
// authorisation and deletion). Ignores transient data: URLs.
export function quizImagePaths(quiz: QuizPayload): string[] {
  const paths: string[] = [];
  for (const q of quiz.questions) {
    for (const o of q.options) {
      if (o.imagePath && o.imagePath.startsWith("/uploads/")) paths.push(o.imagePath);
    }
  }
  return paths;
}
