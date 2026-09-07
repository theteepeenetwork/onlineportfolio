import "server-only";
import { saveImageDataUrl, saveSizedImage, sizeFromPath } from "@/lib/media";
import { PngError, cropPng, pngSize, type Region } from "./png";
import { MAX_LABEL_LEN } from "@/lib/canvasObjects";
import { ActivityInputError } from "./errors";
import { asList, asRecord, checkKeys, describe } from "./shapes";

// Taking a picture from the connector and putting it on a page.
//
// WHY BASE64 AND NOT A URL. The obvious convenience is to accept an https URL
// and fetch it. This does not, and the reason is worth writing down so nobody
// adds it as a one-liner: fetching a caller-supplied URL from inside StoryJar is
// server-side request forgery. A token holder could point it at cloud metadata,
// at the database host, at anything reachable from the container that is not
// reachable from the internet — and read the result back through the error
// message. Making that safe needs an https-only rule, a private-address
// blocklist evaluated AFTER DNS resolution, no redirects, a size cap and a
// timeout, and every one of those has to be right.
//
// Base64 costs the caller nothing and needs none of it: an agent that has just
// cropped a page out of a PDF is holding bytes, not a hosted URL, which is the
// case the connector was actually asked for. If a hosted URL is ever wanted it
// is its own piece of work, with the list above done properly.
//
// Everything below reuses saveImageDataUrl, which already refuses anything that
// is not PNG / JPEG / WebP and writes into the private media directory served
// only through the authorising /uploads route (SAFEGUARDING rule 7).

// One picture. Deliberately smaller than media.ts's 15 MB ceiling: that number
// is sized for a photograph a child took on a classroom iPad, and this is a
// cropped worksheet extract.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Everything one activity may carry. The media volume is 5 GB, holds every
// child's photograph, and its backups go back six days — so the thing to bound
// is not one oversized file but a loop that writes a hundred reasonable ones.
export const MAX_ACTIVITY_IMAGE_BYTES = 10 * 1024 * 1024;

// A stored picture. `width`/`height` are the picture's own pixel size, when we
// were able to measure it (PNG, or a region this module cropped itself). They
// are what stops the page layout from stretching a picture into the shape of
// the box it happens to be putting it in — see quizLayout's fitPicture.
export type PersistedImage = { src: string; alt: string; width?: number; height?: number };

// A spend counter for a single call. Passed down through page content, question
// images and answer images so the cap is on the ACTIVITY, not on each picture
// in isolation.
export class ImageBudget {
  private spent = 0;
  constructor(private readonly cap: number = MAX_ACTIVITY_IMAGE_BYTES) {}

  take(bytes: number): void {
    if (bytes > MAX_IMAGE_BYTES) {
      throw new ActivityInputError(
        `That picture is ${mb(bytes)} MB. The biggest a single picture can be is ${mb(MAX_IMAGE_BYTES)} MB — crop it, or save it at a lower quality.`,
      );
    }
    if (this.spent + bytes > this.cap) {
      throw new ActivityInputError(
        `That would take the pictures in this activity past ${mb(this.cap)} MB, which is the most one activity can hold. Use fewer pictures, or upload one once with upload_asset and point several questions at it.`,
      );
    }
    this.spent += bytes;
  }

  get used(): number {
    return this.spent;
  }
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

// How many bytes a data URL's base64 payload actually decodes to, without
// decoding it. Checked BEFORE the buffer is allocated, so an oversized picture
// is refused rather than briefly held in memory.
function base64Bytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

// A PNG's pixel size without decoding the picture. The header is the first 33
// bytes, so only the first 64 base64 characters are decoded — measuring a 2 MB
// page costs a few dozen bytes of work. Anything that is not a PNG returns null
// and is placed the way it always was.
function sizeOfDataUrl(dataUrl: string): { width: number; height: number } | null {
  if (!/^data:image\/png;base64,/i.test(dataUrl)) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  return pngSize(Buffer.from(dataUrl.slice(comma + 1, comma + 65), "base64"));
}

function readAlt(value: unknown, where: string): string {
  const alt = String(value ?? "").trim();
  if (!alt) {
    throw new ActivityInputError(
      `${where} needs "alt" — a few words saying what the picture shows, for a child who cannot see it.`,
    );
  }
  return alt.slice(0, MAX_LABEL_LEN);
}

// The bytes of a picture, checked. Shared by persistImage and persistAsset so a
// caller gets the same sentence back whichever door they came through.
function readSource(value: unknown, where: string, orAssetId: boolean): string {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) {
    throw new ActivityInputError(
      orAssetId
        ? `${where} needs either "source" (the picture itself) or "asset_id" (one you uploaded already).`
        : `${where} needs "source" — the picture itself, as a data:image URL.`,
    );
  }
  if (/^https?:/i.test(source)) {
    throw new ActivityInputError(
      `${where} gave a web address. StoryJar does not fetch pictures from the web — send the picture itself as a data:image URL, which is what you have if you just made or cropped it.`,
    );
  }
  if (!source.startsWith("data:image")) {
    throw new ActivityInputError(`${where} isn't a picture. Send a data:image URL — PNG, JPEG or WebP.`);
  }
  return source;
}

// Turn one image input into something storable. Accepts either freshly-supplied
// bytes (`source`, a data:image URL) or an id from upload_asset (`asset_id`, an
// /uploads path already written by this teacher). An asset id costs nothing
// against the budget — that is the point of it.
// The whole of a picture's shape. Read out by name whenever a caller sends
// something else, because "url" and "src" and "data" are all reasonable guesses
// and every one of them used to be accepted-then-ignored.
export const IMAGE_FIELDS = ["source", "asset_id", "alt"] as const;

export async function persistImage(value: unknown, where: string, budget: ImageBudget): Promise<PersistedImage> {
  const input = asRecord(value, where);
  checkKeys(input, IMAGE_FIELDS, where);

  const assetId = typeof input.asset_id === "string" ? input.asset_id.trim() : "";
  if (assetId) {
    // Alt is asked for when somebody supplies a PICTURE, because that is the one
    // moment they have the words for it. It is not demanded when they merely
    // point at a picture that is already stored — a caller reading an activity
    // and writing it back must not be blocked because a picture placed in the
    // canvas years ago never had any. Refusing there would make
    // read-modify-write impossible and protect nobody.
    const existingAlt = String(input.alt ?? "").trim().slice(0, MAX_LABEL_LEN);
    // Only ever a path this API handed out. Anything else is either a mistake or
    // an attempt to point a page at a file belonging to somebody else — and
    // /uploads would refuse to serve it anyway, so the picture would simply be
    // broken. Refusing here says why.
    if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(assetId)) {
      throw new ActivityInputError(`${where} has an asset_id that isn't one of ours. Use the id upload_asset gave you.`);
    }
    return { src: assetId, alt: existingAlt, ...(sizeFromPath(assetId) ?? {}) };
  }

  const alt = readAlt(input.alt, where);

  const source = readSource(input.source, where, true);

  budget.take(base64Bytes(source));
  const size = sizeOfDataUrl(source);
  try {
    return { src: await saveImageDataUrl(source, size ?? undefined), alt, ...(size ?? {}) };
  } catch (err) {
    // saveImageDataUrl's own refusals are already written for a person ("That
    // file type isn't supported…"), so they are passed through rather than
    // replaced with something vaguer.
    throw new ActivityInputError(err instanceof Error ? err.message : `${where} couldn't be saved.`);
  }
}


// ---------------------------------------------------------------------------
// Storing a worksheet, and cutting it up
// ---------------------------------------------------------------------------
//
// The job this exists for: a teacher shows Claude an A4 worksheet with four
// number-bond models on it and asks for a four-page activity. Claude can see
// which quarter of the page each model is in. It generally CANNOT produce four
// cropped PNGs — an MCP client is a conversation, not an image editor — and
// sending the whole page four times would spend four times the budget to put
// the same picture behind four questions.
//
// So the page is sent ONCE and the parts are NAMED, as fractions of the page.
// The cutting happens here, on bytes the caller has just handed over in this
// same call. Nothing is read back off the disk to do it, which matters: an
// asset id is not proof of ownership (see persistImage), so a crop that re-read
// a stored file on a caller's say-so would be a way to lift a picture out of
// another teacher's library. Cropping only what was just uploaded closes that
// off by construction rather than by a check somebody could later remove.

export const ASSET_FIELDS = ["source", "alt", "regions"] as const;
export const REGION_FIELDS = ["x", "y", "w", "h", "alt"] as const;

// One page cut into at most this many parts. Not a safeguarding limit — a bound
// on how many files one call can write, and comfortably above MAX_PAGES.
export const MAX_REGIONS = 30;

function fraction(value: unknown, name: string, where: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new ActivityInputError(
      `${where} needs \`${name}\` to be a fraction of the whole picture, between 0 and 1. I received ${describe(value)}. ` +
        `The top-left quarter of a page is x: 0, y: 0, w: 0.5, h: 0.5.`,
    );
  }
  return n;
}

// Store one uploaded picture, or — when `regions` is given — the named parts of
// it. Always returns a list, so the caller has one shape to report.
export async function persistAsset(value: unknown): Promise<PersistedImage[]> {
  const input = asRecord(value, "The picture");
  checkKeys(input, ASSET_FIELDS, "The picture");

  const alt = readAlt(input.alt, "The picture");
  const source = readSource(input.source, "The picture", false);

  // One budget for the call. The bytes are charged ONCE, on the way in —
  // cutting a page into six parts is six files but it is not six uploads, and
  // charging per region would make splitting a worksheet cost more than
  // sending it whole, which is exactly backwards.
  const budget = new ImageBudget(MAX_IMAGE_BYTES);
  budget.take(base64Bytes(source));

  if (input.regions === undefined) {
    const size = sizeOfDataUrl(source);
    return [{ src: await saveImageDataUrl(source, size ?? undefined), alt, ...(size ?? {}) }];
  }

  const list = asList(input.regions, "regions", "one entry per part of the picture you want");
  if (!list.length) {
    throw new ActivityInputError(
      "`regions` was empty. Leave it out altogether to store the picture whole, or name the parts you want as fractions of it.",
    );
  }
  if (list.length > MAX_REGIONS) {
    throw new ActivityInputError(`A picture can be cut into at most ${MAX_REGIONS} parts; that asked for ${list.length}.`);
  }
  if (!/^data:image\/png;base64,/i.test(source)) {
    throw new ActivityInputError(
      "Only a PNG can be cut into regions. Send the page as a PNG — which is what a rasterised PDF page already is — or leave `regions` out and store it whole.",
    );
  }

  const bytes = Buffer.from(source.slice(source.indexOf(",") + 1), "base64");
  const stored: PersistedImage[] = [];
  for (const [i, raw] of list.entries()) {
    const where = `Region ${i + 1}`;
    const entry = asRecord(raw, where);
    checkKeys(entry, REGION_FIELDS, where);
    const region: Region = {
      x: fraction(entry.x, "x", where),
      y: fraction(entry.y, "y", where),
      w: fraction(entry.w, "w", where),
      h: fraction(entry.h, "h", where),
    };
    if (region.w === 0 || region.h === 0) {
      throw new ActivityInputError(`${where} has no size — \`w\` and \`h\` are how WIDE and how TALL the part is, as fractions of the whole picture.`);
    }
    const regionAlt = readAlt(entry.alt, where);
    try {
      const { png, width, height } = cropPng(bytes, region, where);
      stored.push({ src: await saveSizedImage(png, "png", { width, height }), alt: regionAlt, width, height });
    } catch (err) {
      // A PngError is about the picture the caller sent, so it is theirs to
      // read. Anything else is a fault and is left to the layer above.
      if (err instanceof PngError) throw new ActivityInputError(`${where} couldn't be cut out: ${err.message}.`);
      throw err;
    }
  }
  return stored;
}
