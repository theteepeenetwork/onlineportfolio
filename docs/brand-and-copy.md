# Brand and copy standards

Binding on anything published in StoryJar's name: the landing page, marketing
copy, social posts, school-facing emails, and product copy. Settled with the
owner between 15 and 19 August 2026.

## The name is StoryJar

Camel case, capital S and capital J. Never "Storyjar", never "STORYJAR". The
social accounts were registered as StoryJar and on 19 August 2026 the codebase
was converted to match, 410 occurrences across 113 files.

Lowercase `storyjar` stays correct in domains (`storyjar.co.uk`), import paths
(`src/components/storyjar/`), the npm package name, and social handles
(`storyjaredu`).

## The protected line

**"A learning journal that grows up with the child."** It is a product fact, the
three age modes EYFS, KS1 and KS2, rather than an adjective. Keep it intact.

## Say what StoryJar does, not what it avoids

Copy built on a competitor's deficiencies makes the rival the subject of the
sentence and puts StoryJar in a defensive posture.

Write every marketing line as a capability. "A home screen a three-year-old can
use" rather than "not just for older children". Avoid *without*, *no*, *never*,
*instead of* and *rather than* in public-facing copy, and check a draft for
those words before it goes out.

## Pricing claims must be checkable

StoryJar **does** have per-pupil pricing. The bands are set by pupil numbers
(£199 up to 105 pupils, £299 up to 210, £449 up to 420, £649 above that), so any
claim that pupil numbers do not affect price is false and checkable in one
click.

Never write "no per-pupil fees" or anything like it. The true and positive
version is that the band is set once at purchase and fixed for the year, and
every feature is in every band. Check pricing claims against
`src/lib/billing-plans.ts` and [`pricing-decisions.md`](./pricing-decisions.md)
before publishing. This matters more than usual, because StoryJar asks schools
to trust it with children's data and a checkable exaggeration is expensive.

Tapestry is banded across roughly 15 tiers, so it cannot be cited as evidence
that schools prefer flat pricing. Seesaw is the honest whole-school comparator.

## Price stays out of profile bios

Bios are about the product. Pricing belongs on the landing page and in the
pinned post, which are cheap to keep in sync.

## Punctuation

No em dashes in published copy. Use commas, colons, brackets or separate
sentences. Write number ranges as "£199 to £649" rather than with an en dash.
Existing repository prose is left as it is.
