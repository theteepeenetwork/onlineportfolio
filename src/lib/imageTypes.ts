// The image types that can be STORED as they arrive.
//
// Client-safe on purpose: the file picker, the import and the server writer all
// have to agree about this list, and when they did not the result was a picker
// that accepted an AVIF and a save that rejected it several steps later with
// "That image couldn't be read." A teacher had already chosen the file, watched
// it land on the canvas, and arranged it before being told.
//
// Anything outside this list is not refused — it is re-encoded to PNG on the
// way in (see the import in DrawingCanvas), which is what makes the picker's
// `image/*` an honest offer.
export const STORABLE_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isStorableImageType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    STORABLE_IMAGE_TYPES,
    type.split(";")[0].trim().toLowerCase(),
  );
}
