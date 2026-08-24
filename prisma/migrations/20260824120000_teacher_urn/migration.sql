-- The school a teacher picked from the register at signup.
--
-- Nullable, and null is the ordinary case rather than a gap: a teacher outside
-- England, or one whose school is missing from a hand-run snapshot, types the
-- name instead. It sits ALONGSIDE Teacher.schoolName and never replaces it.
--
-- No foreign key and no index, both deliberate. A relation would pull
-- Establishment into the ops blindness gate's relation-path logic for no gain,
-- and this is a recorded identifier rather than a live pointer: the register is
-- replaced wholesale on every import, so no part of a person's account may
-- depend on a row a refresh can delete. See the comment in schema.prisma.

-- DPIA: CONSIDERED AND NOT REQUIRED, recorded here rather than left as an
-- absence. This adds no new category of personal data. A URN identifies an
-- INSTITUTION, every character of it is already published by the DfE under the
-- Open Government Licence, and it says nothing about the teacher that the
-- free-text school name beside it did not already say less precisely. It adds no
-- sub-processor: the register was imported from a public CSV by hand, and
-- nothing about this teacher is sent anywhere. The register's own assessment is
-- docs/DPIA.md R18; RETENTION.md carries the line for this column, which is
-- deleted with the teacher by the existing cascade.

ALTER TABLE "Teacher" ADD COLUMN "urn" TEXT;
