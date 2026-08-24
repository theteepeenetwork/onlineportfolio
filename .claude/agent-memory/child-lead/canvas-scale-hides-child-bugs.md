---
name: canvas-scale-hides-child-bugs
description: The a11y gate sweeps the canvas at 1024x768 where its scale is ~1, so any child-facing bug that depends on the canvas scale is invisible to it — measure at 768x1024 instead
metadata:
  type: project
---

Anything inside the drawing canvas is laid out in **logical model units** (the
model is 1000×700) and painted through `transform: scale(scale)`, where
`scale = displayW / 1000`. So a size written in that coordinate space reaches a
child's finger as `size · scale`, not as the number in the code.

The blocking a11y sweeps (`tests/battery/a11y/child-touch-targets.spec.ts`) run
at **1024×768**, where the canvas fits at scale ≈ 1.02. Every scale-dependent
bug inside the canvas therefore passes the gate that exists to catch it. The
device that finds them is the **768×1024 classroom tablet in portrait**
(scale ≈ 0.77) — which is what the child personas actually use
(`tests/battery/personas/team.ts`).

That is how quiz answers shipped at 57 real pixels against a 64px floor with a
green gate and a comment in the code claiming the floor was enforced.

**Why:** a page list is only as good as the pages on it (F37's lesson), and a
viewport list is only as good as the viewports on it. The same blindness put
the `/family` phone overflow into production: `tests/battery/ux/responsive.spec.ts`
already tested `/family`, but its narrowest viewport was 768.

**How to apply:** when touching anything a child taps *inside the canvas*,
assert its **real** `boundingBox()` at 768×1024, not its styled size — and prove
the assertion fails without the fix before believing it. When a floor has to be
met in logical units, it is `floor / scale`, and the container usually then has
to grow rather than clip. See [[verify-a-gate-by-breaking-it]].
