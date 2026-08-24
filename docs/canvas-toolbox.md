# Canvas toolbox expansion

Planned 19 August 2026, not yet built. This is the design record for turning the
`DrawingCanvas` shape toolbox into kits (shapes, maths, later diagrams and
writing). It supersedes an earlier draft that added one `ShapeKind` per shape.
Read it before touching shapes, presets or the ＋ fan.

## Decisions settled with the owner

1. **Geometry is parameterised, not kind-per-shape.** `grid` (cols by rows) and
   `pie` / `ring` (parts) collapse base-10 blocks, ten frames, hundred squares,
   Carroll diagrams, arrays, fraction bars and fraction circles into a handful
   of kinds plus palette presets. Nine new kinds in total: `grid`, `pie`,
   `ring`, `cube`, `line`, `arrow`, `arrow-jump`, `brace`, plus `thought` later.
   The alternative grew `SHAPE_KINDS` past 25 and made every new denominator a
   code change.
2. **The teacher toolbox is identical on every teacher canvas**, whatever age
   group the class is. The teacher builds the activity with the frames; the
   child does not add them. So gating is child-side only, and `ALL_KITS` is
   passed unconditionally on all five teacher surfaces.
3. **EYFS children get no maths or counting kit.** Their ＋ fan stays byte
   identical to today. Ten frames and dot patterns do belong in Reception, but
   as teacher apparatus. The rule lives in `kitsForChild(mode)` in
   `src/lib/ageMode.ts`.
4. **Gating controls what the palette offers, never what renders.** A KS2
   template full of hundred flats assigned to a Reception class must draw and
   flatten correctly for that child. Given decision 2 this is the common case
   rather than an edge case, so it gets its own e2e test.
5. **Four primitives ship alongside the kit:** duplicate (`＋1` on the object
   toolbar), a `line` shape kind, a reserved-and-rendered `rot` field with no
   UI, and a 10-unit snap on shape drags.
6. **Design for four kits, build two.** Shapes and Maths now; Diagrams (Venn,
   Carroll, cycle arrows) and Writing (thought bubble, connectors) later as
   presets over the same geometry. If a later kit needs new geometry, the
   parameterisation was too narrow.

## Constraints found by reading the code

- **One path string cannot carry two stroke weights.** Both renderers stroke the
  whole path at `o.strokeWidth`, so a hundred flat's internal grid draws as
  heavy as its outline. The fix is `shapeParts()` returning
  `{d, role: "outline" | "detail"}[]`, with detail stroked at about 0.4x and
  never filled.
- **Aspect lock must be per-object (`lockAspect`), not per-kind.** A counter is
  an `ellipse` plus preset text, and `ellipse` must stay freely resizable for
  the plain Circle. The same applies to `grid`: a hundred flat locks, a fraction
  bar must not.
- **There is no line primitive at all**, only the freehand pen. This is a bigger
  gap than rings. Angle is the problem: resize has one bottom-right handle and
  only grows width and height positively. The chosen answer is a
  corner-to-corner path plus a `flip` boolean.
- `fitTextToBox` touches `document`, so it must not move into the new pure
  `canvasShapes.ts` (server actions import `canvasObjects.ts`).
- `shapeInnerBox` and `shapePath` switch exhaustively on kind, so a new kind is
  a compile error until it is handled. Keep that.
- No Prisma migration is needed: `objectsJson` is `String?` on all three tables.

## Compatibility: a one-way door

An older client coerces unknown kinds to `"rect"` and drops unknown fields, so a
rollback loses new shapes on the **next save**, not on read. That argues for
landing the kit after the 1 to 2 September launch rather than in the fortnight
before it.

## Phasing

1. Refactor, `shapeParts`, and a kit registry with one kit. Zero user-visible
   change, and `tests/e2e/shapes.spec.ts` passing unedited is the proof. Could
   land pre-launch.
2. Line, arrow, duplicate, snap, and the reserved `rot`. Independent of any kit.
3. The maths kit itself, including a flyout design pass. About 30 presets at
   64px does not fit the 1024x768 child viewport at `left-52`; tabs are
   recommended. Post-launch.
4. The Diagrams and Writing kits.

## Open questions

Counter label sizing (fixed or auto-fit); two-colour counters red and yellow or
red and blue; fraction denominators as 12 buttons or a `parts` stepper; a
vector-kind resize option; flyout tabs or a bottom sheet; money as a later image
kit.

## Related

Rotation and snap behaviour is [`rotation-findings.md`](./rotation-findings.md).
Canvas-wide touch-target debt is logged in `FINDINGS.md` rather than fixed by
weakening `tests/battery/a11y/child-touch-targets.spec.ts`.
