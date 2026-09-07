// Reading and writing PNG bytes, with no dependency.
//
// WHY THIS EXISTS. A teacher hands Claude a worksheet — four number-bond models
// on one A4 page — and asks for it as a four-page activity. Claude can SEE the
// page, so it knows the top-left model is question 1. What it usually cannot do
// is cut the page up: an MCP client is a conversation, not an image editor, and
// most of them have no way to produce cropped bytes at all. So the cutting
// happens HERE: the caller sends the page once and names the regions of it, in
// fractions of the page, and the server does the cropping.
//
// WHY NOT A LIBRARY. `sharp` would do all of this and more, and it is a
// compiled native dependency on a Railway container that currently has none.
// The whole job here is: inflate, undo five filter functions, copy a rectangle,
// deflate. Node ships zlib and blankPage.ts already writes PNG chunks by hand,
// so the honest cost of doing it in-house is this file, and the honest cost of
// the alternative is a native build step in the deploy.
//
// PNG ONLY, deliberately. JPEG and WebP are still accepted as pictures — they
// just cannot be cropped, and the refusal says so. Hand-rolling a baseline JPEG
// decoder is a different order of work, and it is not needed: an agent that has
// just rasterised a PDF page is holding a PNG, because that is what every canvas
// `toDataURL` produces by default (see DrawingCanvas's own PDF import).
//
// No `server-only`: this is arithmetic over a Buffer with no database and no
// filesystem, so the API routes, the MCP endpoint and the tests can all import
// it (the same reason quizLayout.ts and canvasObjects.ts have none).

import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// A PNG is compressed, so its declared size and its decoded size are unrelated:
// a 40 KB file can claim 20000 × 20000 and cost 1.6 GB of RGBA to find out.
// Both are therefore bounded BEFORE anything is allocated. 30 megapixels is
// A4 at 600dpi and about three times what any rasteriser here produces.
const MAX_PIXELS = 30_000_000;
const MAX_INFLATED = 128 * 1024 * 1024;

// A raised PNG problem. Kept as a plain Error with a readable message: the API
// layer turns it into an ActivityInputError so the model is told what to fix,
// and this module stays importable without dragging that class in.
export class PngError extends Error {}

export type Rgba = { width: number; height: number; data: Buffer };

// ---------------------------------------------------------------------------
// Chunks
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Header = {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  interlace: number;
};

function readHeader(buf: Buffer): Header {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new PngError("that isn't a PNG");
  }
  // IHDR is required to be the first chunk, so its position is fixed: 8 bytes
  // of signature, 4 of length, 4 of type, then the 13 bytes of header.
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new PngError("that PNG's header is missing");
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) throw new PngError("that PNG has no size");
  if (width * height > MAX_PIXELS) {
    throw new PngError(`that PNG is ${width}×${height}, which is larger than this can open — save it at a smaller size`);
  }
  return {
    width,
    height,
    bitDepth: buf[24],
    colourType: buf[25],
    interlace: buf[28],
  };
}

// The size of a PNG without decoding a single pixel. Used to record what a
// stored picture actually measures, so the page layout can place it at its own
// shape instead of stretching it to the shape of the slot.
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  try {
    const { width, height } = readHeader(buf);
    return { width, height };
  } catch {
    return null;
  }
}

// Channels per pixel, by PNG colour type. Type 3 is palette: one index per
// pixel, expanded through PLTE below.
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(buf: Buffer): Rgba {
  const { width, height, bitDepth, colourType, interlace } = readHeader(buf);

  if (interlace !== 0) {
    throw new PngError("that PNG is interlaced, which this cannot read — save it without interlacing");
  }
  const channels = CHANNELS[colourType];
  if (!channels) throw new PngError(`that PNG uses a colour type this cannot read (${colourType})`);
  // Bit depths below 8 pack several pixels into a byte. They are legal, rare,
  // and never what a rasteriser writes; refusing them is one sentence, and
  // unpacking them would be a bit-reader nobody would exercise.
  if (bitDepth !== 8 && !(bitDepth === 16 && colourType !== 3)) {
    throw new PngError(`that PNG is ${bitDepth}-bit, which this cannot read — save it as an 8-bit PNG`);
  }

  // Walk the chunks. IDAT may be split into any number of pieces and they are
  // one continuous compressed stream, so they are concatenated before inflating.
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString("ascii");
    const body = buf.subarray(pos + 8, pos + 8 + length);
    if (type === "IDAT") idat.push(body);
    else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IEND") break;
    pos += 12 + length; // length + type + body + crc
  }
  if (!idat.length) throw new PngError("that PNG has no image data");
  if (colourType === 3 && !palette) throw new PngError("that PNG's colour table is missing");

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: MAX_INFLATED });
  } catch {
    throw new PngError("that PNG's image data could not be read");
  }

  const sampleBytes = bitDepth === 16 ? 2 : 1;
  const stride = width * channels * sampleBytes;
  const bpp = channels * sampleBytes;
  if (raw.length < (stride + 1) * height) throw new PngError("that PNG is incomplete");

  // Undo the per-scanline filters, in place, into a single buffer of samples.
  const lines = Buffer.alloc(stride * height);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read++];
    const src = raw.subarray(read, read + stride);
    read += stride;
    const cur = lines.subarray(y * stride, y * stride + stride);
    const prev = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      switch (filter) {
        case 0:
          break;
        case 1:
          v += a;
          break;
        case 2:
          v += b;
          break;
        case 3:
          v += (a + b) >> 1;
          break;
        case 4: {
          // Paeth: pick whichever neighbour the gradient predicts.
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new PngError("that PNG uses a filter this cannot read");
      }
      cur[i] = v & 0xff;
    }
  }

  // Expand whatever that was into straight RGBA.
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 16-bit samples are read at their high byte: this is a worksheet crop
      // heading for a screen, not a photographic pipeline.
      const s = y * stride + x * bpp;
      const o = (y * width + x) * 4;
      let r: number, g: number, b: number, a = 255;
      switch (colourType) {
        case 0:
          r = g = b = lines[s];
          break;
        case 2:
          r = lines[s];
          g = lines[s + sampleBytes];
          b = lines[s + 2 * sampleBytes];
          break;
        case 3: {
          const idx = lines[s];
          const p = idx * 3;
          if (p + 2 >= palette!.length) throw new PngError("that PNG's colour table is too short");
          r = palette![p];
          g = palette![p + 1];
          b = palette![p + 2];
          a = transparency && idx < transparency.length ? transparency[idx] : 255;
          break;
        }
        case 4:
          r = g = b = lines[s];
          a = lines[s + sampleBytes];
          break;
        default:
          r = lines[s];
          g = lines[s + sampleBytes];
          b = lines[s + 2 * sampleBytes];
          a = lines[s + 3 * sampleBytes];
      }
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }

  return { width, height, data };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

// Encode RGBA pixels as a PNG. A picture with no transparency in it is written
// as RGB — a worksheet crop is line art on white, where dropping a constant
// alpha channel is a quarter of the bytes for no visible difference.
export function encodePng({ width, height, data }: Rgba): Buffer {
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }

  const channels = opaque ? 3 : 4;
  const stride = width * channels + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    let o = y * stride;
    raw[o++] = 0; // filter 0 (None): deflate does the work
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      raw[o++] = data[s];
      raw[o++] = data[s + 1];
      raw[o++] = data[s + 2];
      if (!opaque) raw[o++] = data[s + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // 2 = truecolour, 6 = truecolour + alpha
  // 10, 11, 12 stay 0: deflate compression, adaptive filtering, no interlace.

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Cropping
// ---------------------------------------------------------------------------

// A rectangle as a FRACTION of the picture, not in pixels. The caller is a model
// looking at a page it cannot measure: "the top-left quarter" is something it
// can get right, and "x = 148px" is something it would guess. Fractions also
// survive the picture being sent at a different resolution than the one it was
// read at, which is the ordinary case when a PDF is rasterised.
export type Region = { x: number; y: number; w: number; h: number };

export function cropPng(source: Buffer, region: Region, where: string): { png: Buffer; width: number; height: number } {
  const image = decodePng(source);

  // Clamp to the page rather than refusing: a model asked for "the bottom half"
  // and wrote h: 0.55 from y: 0.5 has not made a mistake worth a round-trip.
  const left = Math.round(clamp(region.x) * image.width);
  const top = Math.round(clamp(region.y) * image.height);
  const width = Math.min(image.width - left, Math.max(1, Math.round(clamp(region.w) * image.width)));
  const height = Math.min(image.height - top, Math.max(1, Math.round(clamp(region.h) * image.height)));

  if (width < 1 || height < 1) {
    throw new PngError(
      `${where} is outside the picture. Give x, y, w and h as fractions of the whole picture, between 0 and 1 — so the top-left quarter is x: 0, y: 0, w: 0.5, h: 0.5.`,
    );
  }

  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * image.width + left) * 4;
    image.data.copy(data, y * width * 4, from, from + width * 4);
  }
  return { png: encodePng({ width, height, data }), width, height };
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}
