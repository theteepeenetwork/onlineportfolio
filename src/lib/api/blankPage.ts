import "server-only";
import { deflateSync } from "node:zlib";
import { saveImageDataUrl } from "@/lib/media";
import { chunk } from "./png";

// A blank page for an activity built through the API.
//
// WHY THIS EXISTS AT ALL. A template's page count is the length of
// `templatePathsJson` — the canvas hydrates one page per background image (see
// DrawingCanvas). A quiz question carries its own `pageIndex`, so a four-page
// quiz with one background page has three pages of questions no child can ever
// reach. "Multi-page" therefore means "N real background images", and a quiz
// Claude wrote from scratch has no worksheet scan to use for them.
//
// So we draw the plain white page the canvas would have started with. No new
// dependency: a PNG of one flat colour is four chunks and a deflate stream, and
// node ships both zlib and the arithmetic. The chunk writer itself lives in
// png.ts, which also reads them — one copy, so the two cannot drift.

// Canvas model space. Matches QUIZ_W / QUIZ_H in src/lib/quiz.ts and the W × H
// the drawing canvas uses; a background of another size is stretched to it.
const W = 1000;
const H = 700;

// One 1000×700 white PNG, built once per process. Every blank page in the
// product is the same image, so there is nothing to vary and no reason to
// rebuild two million bytes of scanline per request.
let cached: string | null = null;

function whitePageDataUrl(): string {
  if (cached) return cached;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  // 10, 11, 12 stay 0: deflate compression, adaptive filtering, no interlace.

  // Raw scanlines: a filter byte (0 = None) then three bytes per pixel. Fill
  // with 0xff throughout and then zero the filter byte of each row — white
  // pixels and no filtering.
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H, 0xff);
  for (let y = 0; y < H; y++) raw[y * stride] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  cached = `data:image/png;base64,${png.toString("base64")}`;
  return cached;
}

// Save one blank page and return its /uploads path.
export async function saveBlankPage(): Promise<string> {
  return saveImageDataUrl(whitePageDataUrl());
}

// The background paths for a template of `count` pages, keeping the first
// `existing.length` unchanged and filling the rest with blank pages.
//
// EVERY PAGE GETS ITS OWN FILE, even though every blank page is byte-identical
// and one path repeated would render the same. The rest of the product treats a
// page path as the identity of that page — createTemplate and updateTemplate
// always write one file per page, and the surfaces that list pages key on the
// path. Repeating a path saved a couple of kilobytes and gave React two children
// with the same key on the activity's own page, which is the kind of saving that
// costs more than it saves. The files are ~3 KB each (2 MB of scanline, all one
// colour, is what deflate is for).
export async function buildPagePaths(count: number, existing: string[] = []): Promise<string[]> {
  const kept = existing.slice(0, count);
  const blanks = await Promise.all(Array.from({ length: Math.max(0, count - kept.length) }, () => saveBlankPage()));
  return [...kept, ...blanks];
}
