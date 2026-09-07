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

## The school register carries somebody else's licence

The school picker on signup is built on the Department for Education's **Get
Information about Schools** data, which is published under the **Open Government
Licence v3.0**. That licence requires attribution, and attribution belongs on
**the page that uses the data** — the signup page with the picker on it — not
buried in a footer on a page nobody reading the school names will visit, and not
on an operator screen no member of the public can see.

Use this wording, exactly, so there is one version of it:

> School information from Get Information about Schools, © Crown copyright,
> licensed under the [Open Government Licence
> v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

The string and the licence URL are exported from `src/lib/establishmentRegister.ts`
as `GIAS_ATTRIBUTION` and `GIAS_ATTRIBUTION_LICENCE_URL`. Import them rather than
retyping the sentence; a licence notice that exists in two places is a licence
notice that will one day disagree with itself.

Three points of detail, because each has a wrong version that looks fine:

- **"© Crown copyright" is part of the notice, not decoration.** OGL v3.0
  attribution names the source and the copyright holder, and the DfE's data is
  Crown copyright.
- **The licence link is a link.** It is how a reader checks the terms, so it goes
  out as an anchor to the National Archives URL above, not as plain text.
- **It sits near the picker, in ordinary body text.** It is not a legal
  disclaimer to be shrunk to eight point: this page is read by a teacher on a
  school laptop, and everything else on it obeys the type-size rules in this
  document. The attribution does too.

It says nothing about a teacher's data and must not be written as though it
does. StoryJar sends nothing to the DfE — the extract is downloaded and imported
by hand — so this line credits a source, and it is not a privacy statement.
