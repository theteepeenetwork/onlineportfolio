---
name: verify-a-gate-by-breaking-it
description: Before believing a new blocking-gate assertion, revert the fix and watch it fail — twice this caught assertions that were measuring the wrong thing
metadata:
  type: feedback
---

A new assertion in a blocking gate is worth nothing until it has been seen to
**fail without the fix**. Revert the one line (or `git show HEAD:<path>` into
place), run the single spec, restore.

**Why:** it has already paid for itself twice on this surface. The quiz
touch-target test printed `292x57` on the reverted code — the finding's own
number — which is what proved the diagnosis rather than merely agreeing with it.
The `/family` reflow test printed `345`, the exact figure in the triage note. An
assertion that passes both ways is measuring something else, and a green gate
that cannot go red is worse than no gate, because it is trusted.

The same run also caught a first attempt measuring the wrong box: a centred
`<p>` inside a wide click-through strip has a bounding box the full width of the
strip, so an overlap test against it fails on boxes that do not visually
overlap. Measure the **ink** with `document.createRange()` +
`selectNodeContents` when what matters is where the words are.

**How to apply:** any time a test is added alongside a fix, especially in the
security or a11y projects. It costs one extra single-file run.
Never leave the reverted state in the tree — restore in the same command.
See [[canvas-scale-hides-child-bugs]].
