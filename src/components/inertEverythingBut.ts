// Make every element outside `keep` inert: at each level from `keep` up to
// <body>, every sibling of the path. The ancestors themselves stay live, or the
// overlay would be inert too. Returns the undo, which touches only what this
// made inert, so an element that was already inert for its own reasons stays so.
//
// For the full-screen overlays a teacher puts on the classroom board. Opaque
// stops the eye reading the dashboard round the edges; it does not stop Tab, or
// a screen reader on the projecting laptop, walking straight past the overlay's
// buttons onto the pupil names underneath. This does.
export function inertEverythingBut(keep: HTMLElement | null): () => void {
  const made: HTMLElement[] = [];
  for (let node = keep; node && node !== document.body; node = node.parentElement) {
    const parent = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      sibling.inert = true;
      made.push(sibling);
    }
  }
  return () => {
    for (const el of made) el.inert = false;
  };
}
