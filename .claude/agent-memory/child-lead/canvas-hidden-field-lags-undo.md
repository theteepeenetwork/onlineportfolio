---
name: canvas-hidden-field-lags-undo
description: DrawingCanvas writes the hidden pages field asynchronously after an undo/redo, so an e2e that reads it on the click reads the pre-undo value
metadata:
  type: feedback
---

An e2e that reads `input[name="drawingPages"]` (or any canvas hidden field)
straight after clicking Undo/Redo must wait for the value to settle — two
identical reads, and different from the value before the click. Do not read it
as soon as the object disappears from the DOM.

**Why:** `restore()` puts the objects back synchronously but repaints the stroke
layer by loading it as an image, and only writes the composite in the `.then()`.
So the DOM says the shape has gone while the hidden field still holds the
picture WITH the shape in it. A test written the obvious way fails with two
near-identical base64 blobs and reads exactly like a product bug. Decoding both
PNGs and counting non-white pixels is the fastest way to tell which of the two
you are actually looking at.

**How to apply:** in `tests/e2e/undo-stroke-layer.spec.ts` there is a `settled()`
helper doing this; copy it rather than re-deriving it. The same lag applies to
`duplicatePageAt` / `movePageTo` / `deletePageAt`, which call `syncHidden()`
straight after an async `loadPage()`. See [[verify-a-gate-by-breaking-it]].
