---
name: feedback-tightening-a-scanner-fails-open
description: Narrowing what a scanner accepts can silently disable a downstream check that consumes the captured value — always run the candidate against the whole tree first
metadata:
  type: feedback
---

When tightening what a scanner captures, run the candidate against every file in
the tree and diff the captured set against the current one **before** proposing
it. Losing a capture is not a stricter gate; it can be no gate at all.

**Why:** in `check-ops-blindness.mjs`, `OPS-FILESYSTEM` fires via
`FS_IMPORT_SPECS.includes(spec)` — it consumes the *captured specifier*. A
candidate accept-class of `[A-Za-z0-9@._~/$-]` looked like a tightening and
rejected `node:fs`, `node:fs/promises` and `node:crypto` because of the colon.
The result would not have been a rejected import; it would have been **no
specifier at all**, so the rule stopping ops code reaching children's media
(SAFEGUARDING rule 7) would have stopped firing with nothing going red. The lead
called it the worst shape available: a change whose whole justification was
strictness, silently disabling a safeguarding gate. Caught by measurement, not by
reasoning. Correct class: `[A-Za-z0-9@._~/:$-]`.

**How to apply:** for any scanner change, ask what downstream rules consume the
captured value, then ship a fixture asserting the strictest thing the class must
still admit — a guard *on* the change rather than part of it. Prefer one
unnecessary character in an accept-class over a second omission of that shape.
Related: [[feedback-verify-without-the-battery]] for the habit, and
[[feedback-dont-close-the-half-that-asks]] for the other judgement the lead has
validated.
