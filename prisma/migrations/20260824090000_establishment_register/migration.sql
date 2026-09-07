-- The establishment register: one row per open, primary-facing English school,
-- imported from the DfE's GIAS all-establishments CSV by scripts/gias-import.ts.
--
-- Public reference data about INSTITUTIONS. No person, no foreign key to one,
-- and no route from a row here back to a teacher, a parent or a child. There is
-- therefore no retention clock on it (RETENTION.md) and no sub-processor to
-- declare (docs/DPIA.md): the CSV is imported by hand, never called at runtime.
--
-- Six columns and no seventh, on purpose. See the comment in schema.prisma.
--
-- The URN is the primary key rather than a cuid: the row IS the establishment,
-- and a surrogate key would let one school in twice under two ids. That is also
-- what makes the import safely re-runnable.

CREATE TABLE "Establishment" (
    "urn" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "localAuthority" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "town" TEXT NOT NULL
);

-- Prefix search runs over these two and nothing else.
CREATE INDEX "Establishment_name_idx" ON "Establishment"("name");
CREATE INDEX "Establishment_postcode_idx" ON "Establishment"("postcode");
