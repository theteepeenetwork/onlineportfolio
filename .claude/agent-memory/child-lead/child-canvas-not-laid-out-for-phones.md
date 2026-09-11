---
name: child-canvas-not-laid-out-for-phones
description: At 390px portrait the child's canvas stage collapses under the header and a canvas control cannot be pressed; test a full-screen overlay by opening it on a tablet, then narrowing the window
metadata:
  type: project
---

Seen 2026-09-10 writing the leaving-card test for web links: at 390x844 the
student activity page puts "Back to my jar" and "Pop in my jar" over a stage
about 180px wide, and a click on a link chip is intercepted by the header.
Children's devices are tablets (the e2e default is 1194x834, the smallest is
768x1024 portrait), so this is a layout the product has not targeted, not a
regression — but it was never logged as a finding either.

**Why:** a reviewer asking "does the card work on a 390px phone?" is asking
about the card, and the card is `fixed inset-0`, laid out against the window.

**How to apply:** for any full-screen overlay on the child canvas (leaving
card, camera, prompts), open it at the default tablet size, then
`page.setViewportSize({ width: 390, height: 844 })` and assert. Do not blame
the overlay for the canvas underneath. If phone support for children is ever
asked for, that is its own piece of work. See [[canvas-scale-hides-child-bugs]].
