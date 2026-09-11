// Where the picture of a question box puts things.
//
// The flattened preview of a quiz page (the queue's viewer, the board, the jar)
// is drawn on a canvas by `drawQuizForPreview` in DrawingCanvas.tsx. This is
// its arithmetic, pulled out so a test can check it without a browser: pure
// numbers in, rectangles out. It holds nothing secret and reads no environment,
// so it has no `server-only` and needs none. Text measuring stays with the
// caller, behind `fitPrompt`, because that needs a canvas.
//
// What it exists to get right: the outline is as tall as what is IN it. It was
// drawn at the stored `q.h`, which is the height of the TEACHER's card, written
// back from the editor — while the picture draws the child's rows, which are a
// finger's size and much taller. A two-answer question stored 104 tall drew its
// outline under the first answer and left "Eight" outside the box. The child's live card has always grown to fit (`minHeight:
// q.h`, then its content), and been pulled back onto the page when that ran it
// off the foot; this does the same, so the picture is a picture of that card.

export type Rect = { x: number; y: number; w: number; h: number };

export type QuizPreviewLayout<P> = {
  box: Rect & { r: number };
  prompt: P & { top: number };
  options: Rect[];
};

export function quizPreviewLayout<P extends { lines: readonly unknown[]; lineHeight: number }>(
  q: Rect & { options: readonly unknown[] },
  // The card's scale: 1 at its design width, smaller for a narrowed box.
  k: number,
  pageH: number,
  // Wraps the question to a width and says how it came out.
  fitPrompt: (maxW: number) => P,
): QuizPreviewLayout<P> {
  const px = (n: number) => n * k;
  const pad = px(14);
  const prompt = fitPrompt(q.w - pad * 2);
  // Offsets from the top of the card. An empty question still keeps its line.
  const promptTop = px(12);
  const optionsTop = promptTop + Math.max(prompt.lines.length, 1) * prompt.lineHeight + px(10);
  const gap = px(6);
  // A child's answer is a finger's size whatever the box was scaled to.
  const rowH = Math.max(px(64), 44);
  const n = q.options.length;
  const contentBottom = n ? optionsTop + n * rowH + (n - 1) * gap : optionsTop - px(10);
  // Never shorter than the box as laid out, and never shorter than its content.
  const h = Math.max(q.h, contentBottom + px(12));
  // A card that grew past the foot of the page is pulled back onto it.
  const y = Math.max(0, Math.min(q.y, pageH - h));
  return {
    box: { x: q.x, y, w: q.w, h, r: px(18) },
    prompt: { ...prompt, top: y + promptTop },
    options: q.options.map((_, i) => ({
      x: q.x + pad,
      y: y + optionsTop + i * (rowH + gap),
      w: q.w - pad * 2,
      h: rowH,
    })),
  };
}
