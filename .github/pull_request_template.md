<!--
Rule 1: safeguarding comes first. See SAFEGUARDING.md.
Keep the checklist below. Delete a line only if it is genuinely not applicable
(and say why).
-->

## What & why

<!-- What does this change do, and why? -->

## Safeguarding & security review

Required for any change touching auth, access scoping, the approval queue,
children's data, uploaded media, or third parties. (See `SAFEGUARDING.md`.)

- [ ] Child data from new/changed queries stays scoped by ownership
      (`teacherId` / `classId` / parent link), enforced **server-side**.
- [ ] No child content can reach anyone before **teacher approval**.
- [ ] No new personal-data field unless truly necessary (data minimisation).
- [ ] Uploaded media stays **access-controlled** (no public/guessable URLs).
- [ ] No personal data stored or sent **outside the UK/EU**.
- [ ] Any new third party/sub-processor is listed, DPA'd, UK/EU, no profiling.
- [ ] On error/uncertainty it **denies and leaks nothing**.
- [ ] Deletion still removes **rows and files**.
- [ ] Security headers / cookie flags / input handling unchanged or improved.
- [ ] Accessibility floor still met (WCAG 2.2 AA, child target sizes, reduced motion).

## Verification

<!-- How was this checked? Tests, in-browser, etc. -->
