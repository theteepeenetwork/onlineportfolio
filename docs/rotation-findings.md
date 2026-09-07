# Why rotating a long line feels like 45° jumps

Read-only investigation, 23 August 2026, `child-lead`. No canvas code was
changed. This is Batch B item C1 and it gates Batch B item 1 (rotation, then
snap) — `docs/launch-batch-b.md` §1.

---

## The answer, first

**The hypothesis holds.** Rotation is judged by how far the far end of a thing
travels, not by how many degrees it turned, and a flat 15° step is comfortable on
a counter and unusable on a long line.

Two corrections to the arithmetic, neither of which changes the conclusion:

1. Rotation is about the object's **centre** (`transformOrigin: "50% 50%"`,
   `DrawingCanvas.tsx:5199` and `:5695`), not about one end. So a 15° step moves
   each end by `L·sin(7.5°)` = **0.13 × the length**, not `0.26 ×`. On the 420-unit
   Line preset that is 55 model units per end, not 105.
2. The comparison object is bigger than the note assumed. A maths counter is
   **120 units** across (`canvasShapes.ts:1116`), not 20, so it moves 16 units a
   step, not 5.

The ratio between them — a long line's ends jump ~3.5× as far as a counter's per
step, and ~5.5% of the page width each time — is what the report is about, and
it survives both corrections.

**"45 degrees" is not literal.** It is the endpoint distance read back as an
angle, and the number is almost exactly right: a 15° step on the Line preset
moves its ends as far as a **54°** step on a maths counter, or a 45° step on a
144-unit object — which is the size of most things on this canvas. Nothing in the
code fires three steps per gesture and nothing quantises twice. Working below.

---

## What the code actually does

There are exactly two rotate paths and they are the same code twice:

| | Shape / image / text object | Quiz-object |
|---|---|---|
| grab | `DrawingCanvas.tsx:5018` | `:5600` |
| move | `:5066` | `:5634` |
| step applied | `:5072` | `:5638` |

Both do this, and only this:

```ts
// at pointerdown
base = atan2(pointerY - cy, pointerX - cx)   // cx,cy = the object's centre
startRot = rot                                // whatever it was already
// on every pointermove
deg     = startRot + (atan2(...) - base) · 180/π
snapped = Math.round(deg / ROTATE_STEP) * ROTATE_STEP
onChange(o.id, { rot: ((snapped % 360) + 360) % 360 })
```

`ROTATE_STEP = 15` (`:197`) is the only rotation constant in the codebase, it is
applied unconditionally at both sites, and there is no other way to turn
anything — no menu item, no keyboard path, no per-shape override.

Four properties of that code matter to the question:

- **The step is applied to an absolute angle, not to an accumulated delta.**
  `startRot` is captured once at pointerdown and never re-read during the drag,
  and the pointer angle is measured fresh each move. Rounding error cannot
  accumulate across a gesture.
- **The visual feedback during the drag is the snapped value.** `onChange` writes
  `rot` straight into state (`updateObject`, `:2400`) and the DOM transform
  follows immediately. There is no free-while-dragging, snap-on-release
  behaviour — which is the one thing that genuinely would feel like a much
  bigger jump than 15°.
- **Nothing quantises a second time.** The only other place `rot` is touched is
  `normaliseRotation` (`src/lib/canvasObjects.ts:224`), which rounds to whole
  degrees and wraps to 0–359. 15 is already a whole number, so it is a no-op
  here. (It does mean any future step must be an **integer** — see the options.)
- **The centre is measured correctly.** `getBoundingClientRect()` on a rotated
  element returns the axis-aligned box of the transform, whose centre is the
  same point the transform turns about, and the corner handles are absolutely
  positioned children so they do not widen it.

## The hypothesis, with the working

Each end of an object sits `L/2` from the centre, so one step of θ moves it along
a chord of `2·(L/2)·sin(θ/2)` = `L·sin(θ/2)`. At θ = 15°, that is `0.1305 · L`.

Model space is 1000 × 700 units, so "% of page" below is of the page's width. `L`
is the distance across the object through its centre — the box's diagonal for a
rectangle or a line (whose far point is a corner), the diameter for a circle.

| Object, at the size it is placed at | L (tip to tip) | End moves, per 15° step | % of page |
|---|---|---|---|
| Maths counter (`ellipse`, 120×120) | 120 (its diameter) | 16 units | 1.6% |
| Default shape (320×220) | 388 | 51 units | 5.1% |
| **Line preset (420×4)** | **420** | **55 units** | **5.5%** |
| Arrow preset (360×4) | 360 | 47 units | 4.7% |
| Number line (700×130) | 712 | 93 units | **9.3%** |

The child is not aiming the object at itself. They are aiming it at something
else on the page — a target, a worksheet rule, another shape. **The error that
matters is absolute, measured against the page, and it scales with length.** On a
counter the smallest available correction is 16 units and invisible. On the Line
preset it is 55, and half of that (28 units) is the *best* a child can do: the
nearest stop can always be up to half a step away from where they meant to point.
On the maths kit's number line it is 93 units, or a tenth of the page.

That is the whole finding. Everything below is ruling out the alternatives.

### Why it is worse for a line than the table suggests

A line's box **is** the line — the stroke runs corner to corner — so resizing it
locks its aspect ratio on purpose (`DrawingCanvas.tsx:5098-5130`), and the shapes
kit says so in as many words: *"Vector kinds arrive as a wide, shallow box…
Rotate for any other angle"* (`canvasShapes.ts:1038`).

So for a line the 15° step is not a grid that fine-tuning sits on top of. **It is
the entire vocabulary of angles.** A line has 12 possible headings in the whole
product (24 stops, and a line at θ and θ+180 look identical); an arrow has 24.
There is no way, anywhere, to draw a line at 20°. A child drawing the hands of a
clock, a roof, a rocket's flight path or a ray of sun is choosing from twelve.

## Is "45 degrees" literal?

No, and I can rule out each way it could have been.

- **Is `ROTATE_STEP` the constant in play on that path?** Yes. Two rotate sites,
  both `ROTATE_STEP`, no overrides, no other rotation entry point.
- **Do three steps fire per gesture?** No. Because the object only turns when the
  pointer crosses a 7.5° threshold *around the object's centre*, the finger has
  to travel further, not less, on a big object: at the end of a 420-unit line the
  handle is ~210 units from the centre, so one step costs ~55 units of finger
  travel and three steps in one `pointermove` would need ~165 units — about
  165 px — inside a single frame. That is a flick, not aiming, and the object
  would still be following the finger while it happened.
- **Is it pointer jitter at the handle?** No, and it points the other way. A few
  pixels of touch jitter at a handle 210 units from the centre is under 2°; the
  same jitter on a 120-unit counter, where the handle is 60 units out, is 5°.
  Small objects are the twitchy ones. Large ones are steady and coarse.
- **Is it double quantisation, or snap-on-commit?** No. One `Math.round` per
  move, applied to an absolute angle, written to the DOM immediately (evidence
  above).

**So where does 45 come from?** From the endpoint distance. Solve
`L·sin(θ/2) = 55` — the travel of the Line preset at 15° — for other objects:

- on a 120-unit counter, θ = **54°**
- on a 144-unit object, θ = **45°**
- on the 320×220 default shape, θ = 16°

A user whose sense of "one step" was formed on ordinary mid-size objects, then
handed a 420-unit line, sees its ends move as far as a 45–54° turn of the things
they were used to. The report is accurate; it is describing a distance in the
only unit the control offers, which is degrees.

## Options

None of these needs a schema change. All are canvas-side only.

### A. Scale the step to the object's length *(recommended)*

Replace the constant at the two call sites with a step chosen from a ladder,
using the length already measured at pointerdown:

| Object length L (model units) | Step | End moves per step |
|---|---|---|
| ≤ 100 | 15° | ≤ 13 |
| ≤ 300 | 5° | ≤ 13 |
| ≤ 500 | 3° | ≤ 13 |
| > 500 | 1° | ≤ 6 at L = 712 |

Every rung is an **integer** that divides both 45 and 90, so 0°, 30°, 45° and 90°
remain exactly reachable on every object — the reason 15° was chosen in the first
place (`:197`) is preserved, not traded away. Integer matters:
`normaliseRotation` rounds to whole degrees on save, so a 7.5° rung would not
survive a reload.

The Line preset lands on 3°: the ends move 11 units instead of 55, and there are
120 headings instead of 12.

- **Cost: 2–3h.** A `rotateStepFor(lengthInUnits)` helper in `canvasShapes.ts`
  with its own test, two call sites changed, an e2e that rotates a line and a
  counter and asserts each lands on its own ladder rung.
- **Breaks: nothing I can find.** `rot` is already stored as any integer 0–359
  and both renderers already draw arbitrary angles. Existing saved work is
  untouched; a 15° rotation stays 15°.
- **Risk:** a child who *wants* 90° on a long line now needs a longer sweep to
  get there. The sweep distance is the same (angle per finger-mm is unchanged);
  it is the number of visible steps on the way that goes up, which is the point.

### B. A finer flat step for line-like objects only

`isVectorKind(shape) ? 5 : 15`.

- **Cost: 1–2h**, the cheapest thing that would close the report.
- **Breaks: nothing.**
- **Why not:** it fixes the shape that was complained about and leaves the ones
  that are worse. The number line (93 units a step) is not a vector kind; nor is
  an imported photo, nor a 320×220 rectangle at 51. Length is the variable that
  actually predicts the problem, and A costs an hour more than B to use it.

### C. Soft ("magnetic") snap — free rotation that pulls to 15°

Rotate freely, but jump to the nearest multiple of 15° when within ~3° of it.

- **Cost: 3–4h** including the tuning that decides whether it feels right.
- **Risk, and it is the reason I am not recommending it:** it makes "exactly 90°"
  a thing a child achieves *by being near it* rather than by the control landing
  there. With a finger on a tablet that is a meaningfully worse guarantee than
  a hard stop, and squareness is the property the current step exists to protect.
  Not a change to make in the week before a launch with no time to watch children
  use it.

### D. A modifier key for free rotation

- **Cost: ~1h.**
- **Reject.** The people who have this problem are children on tablets. There is
  no modifier key. It would fix the complaint only for whoever is testing on a
  laptop.

### E. Turn buttons in the floating object toolbar *(worth doing anyway)*

Two 64px buttons — turn left, turn right — one `ROTATE_STEP` per tap, next to the
controls already in `ObjectToolbar` (`:4344`).

This does not solve the aiming problem on its own, and it should not be sold as
if it does. It is here because of something I found while reading, now logged as **F50**:
**the rotate handle cannot be operated by a keyboard at all** — nor can the
resize handle beside it, which has the same shape. It is a `<div role="button">`
with `onPointerDown`/`Move`/`Up`, no `onKeyDown` and no `tabIndex`
(`DrawingCanvas.tsx:5467-5481`). Announced as a button, reachable by no key.
That is a WCAG 2.2 **2.1.1 Keyboard** failure on a control that exists and is
labelled, and it is not caught today because the element is not in the tab order,
so nothing tabs to it to fail. Turn buttons close it, because a real `<button>`
in the toolbar is keyboard-operable for free.

- **Cost: 1–2h**, plus an a11y assertion. Logged as F50 in `FINDINGS.md`,
  including the reason no gate caught it: without `tabIndex` the element is not
  in the tab order, so a keyboard walk never reaches it to fail, and
  `role="button"` alone breaks no axe rule. The gate is blind *because* the
  control is unreachable.
- Pairs well with A: A gives a fine step for aiming, E gives an exact,
  repeatable, keyboard-reachable step for squaring things up.

## Recommendation

**A, at 2–3h. Add E if there is room, for 4h total.**

A is the smallest change that addresses the thing that is actually wrong — the
step is flat and the error is not — without giving up the guarantee the flat step
was protecting. E is independently justified by the keyboard gap and I would log
it as a finding whether or not it is built this fortnight.

## Does the rotation fix alone remove the need for `snapEnabled`?

**Yes, on the evidence — and that is the honest answer, not the convenient one.**

The Wave 1 agreement coupled position snap and rotation snap into one
teacher-facing `snapEnabled` toggle (`docs/launch-triage.md`, cross-cutting
notes). Two things it assumed have since been tested:

- **Position snap is fine and stays.** `SNAP_UNITS = 10` (`:167`) is 1% of the
  page, about 4px on a classroom iPad, and it is only applied to shapes — photos
  and text boxes are already left alone (`:5061`). Mark's own testing says it is
  not the problem.
- **Rotation was the limiting one.** With option A a 420-unit line aims to within
  ~5 units at its end, which is finer than a child can aim with a finger, and a
  700-unit number line to within ~3. There is nothing left for a teacher to
  switch off.

So the `snapEnabled Boolean` on `ActivityTemplate` + `Assignment`, its migration,
the builder checkbox and the assign-time snapshot can all leave the fortnight.
That is ~7h of work and the only schema change in Batch B's child/teacher scope.

**The one residual, so it is a decision and not an omission.** A teacher who wants
a genuinely free, artistic canvas — no grid at all — still cannot have one, and
free drawing (`StudentDrawCapture`) still snaps placed shapes to the 10-unit grid.
That was going to be handled by passing `snapEnabled={false}`. It is a real gap.
It is also a 1% grid on a surface where nothing has to line up with anything, and
nobody has reported it. If it turns out to matter, the fix is a canvas prop with
no schema behind it, which is a smaller thing to build in the autumn than a
migration is to run in launch week.

---

## The decision, 23 August 2026

Mark read this file and ruled. Recorded here so it reads as a decision rather
than as work that quietly did not happen.

**Built: A and E, both.** The step ladder, and turn/resize as real buttons.
E was not optional in the end, and the reason is worth keeping: the rotate handle
being operable by no key is a **WCAG 2.2 AA failure on a child-facing control**,
which makes it a blocking gate and rule 18, not an ergonomic nicety. It is logged
as **F50**, and it turned out to cover **two** controls — the resize handle
beside it has the identical shape.

**Not built: the `snapEnabled` teacher toggle. Ruled out on the evidence above.**
Position snap (`SNAP_UNITS = 10`) is 1% of the page and applies to shapes only;
Mark's own testing says it is fine and it stays unconditional. Rotation was the
limiting one, and the ladder answers it — a 420-unit line now aims to within
about 5 units at its end, which is finer than a child can aim with a finger. With
rotation fixed there is nothing left for a teacher to switch off, so the schema
change, the migration, the builder checkbox and the assign-time snapshot all
leave the fortnight. That is roughly 7 hours of work and the only schema change
in Batch B's child and teacher scope.

**The residual stays named, because an omission that is written down is a
decision and one that is not is a bug found in the autumn by a teacher.** A
teacher who wants a genuinely free, artistic canvas — no grid at all — still
cannot have one, and free drawing still snaps placed shapes to the 10-unit grid.
That was what `snapEnabled={false}` would have handled. Nobody has reported it;
10 units is 1% of the page on a surface where nothing has to line up with
anything. If it turns out to matter, the fix is a canvas prop with no schema
behind it, which is a smaller thing to build in the autumn than a migration is to
run in launch week.

**What landed, and where**

| | Where |
| --- | --- |
| The ladder | `rotateStepFor()` in `src/lib/canvasObjects.ts`, beside `normaliseRotation` — which is what makes the integer rule load-bearing rather than tidy |
| Applied to a drag | `DrawingCanvas.tsx`, both rotate handlers (a shape or picture, and a text box) |
| Keyboard on the handles | `ObjectCorners` — `tabIndex` and arrow keys, stepping by the object's own ladder step, so a keyboard reaches every position a pointer can |
| Buttons | `ObjectToolbar` — Turn left / Turn right at the coarse `ROTATE_STEP` (15°), Make it smaller / bigger |
| Tests | `tests/e2e/rotation.spec.ts` |

The two granularities are deliberate. The buttons stay at 15° because they are
the control for squaring something up, and asking a child to press one thirty
times to reach a right angle on a long line would be its own bad screen. The
handle carries the fine step. Because every rung divides 45 and 90, a press and a
drag land on the same angles rather than on two grids that disagree.

---

## Ruled out, recorded so nobody re-checks it

- No accumulated-angle drift: `startRot` is fixed for the gesture.
- No double quantisation: one `Math.round` per move; `normaliseRotation`
  (`canvasObjects.ts:224`) rounds to whole degrees only.
- No snap-on-commit: the drag shows the snapped value live.
- No second rotation constant, and no second rotate entry point.
- The ±π wrap in `atan2` shifts `deg` by exactly 360°, which the modulo on the
  next line removes. It is not a jump.
- Rotation is available to a **child**, not only a teacher: `objCapabilities`
  (`:4299`) gives `editable: true` on any object a child placed themselves, so
  this is a child-surface problem and not only a builder one.
