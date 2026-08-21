import "server-only";
import { saveImageDataUrl } from "@/lib/media";
import { MAX_LABEL_LEN } from "@/lib/canvasObjects";
import { ActivityInputError } from "./errors";

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

export type PersistedImage = { src: string; alt: string };

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

function readAlt(value: unknown, where: string): string {
  const alt = String(value ?? "").trim();
  if (!alt) {
    throw new ActivityInputError(
      `${where} needs "alt" — a few words saying what the picture shows, for a child who cannot see it.`,
    );
  }
  return alt.slice(0, MAX_LABEL_LEN);
}

// Turn one image input into something storable. Accepts either freshly-supplied
// bytes (`source`, a data:image URL) or an id from upload_asset (`asset_id`, an
// /uploads path already written by this teacher). An asset id costs nothing
// against the budget — that is the point of it.
export async function persistImage(value: unknown, where: string, budget: ImageBudget): Promise<PersistedImage> {
  const input = (value ?? {}) as Record<string, unknown>;

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
    return { src: assetId, alt: existingAlt };
  }

  const alt = readAlt(input.alt, where);

  const source = typeof input.source === "string" ? input.source.trim() : "";
  if (!source) {
    throw new ActivityInputError(`${where} needs either "source" (the picture itself) or "asset_id" (one you uploaded already).`);
  }
  if (/^https?:/i.test(source)) {
    throw new ActivityInputError(
      `${where} gave a web address. StoryJar does not fetch pictures from the web — send the picture itself as a data:image URL, which is what you have if you just made or cropped it.`,
    );
  }
  if (!source.startsWith("data:image")) {
    throw new ActivityInputError(`${where} isn't a picture. Send a data:image URL — PNG, JPEG or WebP.`);
  }

  budget.take(base64Bytes(source));
  try {
    return { src: await saveImageDataUrl(source), alt };
  } catch (err) {
    // saveImageDataUrl's own refusals are already written for a person ("That
    // file type isn't supported…"), so they are passed through rather than
    // replaced with something vaguer.
    throw new ActivityInputError(err instanceof Error ? err.message : `${where} couldn't be saved.`);
  }
}
