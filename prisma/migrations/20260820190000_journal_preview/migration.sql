-- The picture of a handed-in page, as it looked to the child.
--
-- `mediaPathsJson` is the work of record and deliberately carries no question
-- boxes (they are never flattened, so a published drawing stays a drawing).
-- That left a teacher reviewing a quiz page looking at a blank white rectangle.
-- This column holds the same pages WITH the questions drawn on, written only
-- when there is a quiz, and read only where someone is looking rather than
-- editing.
ALTER TABLE "JournalItem" ADD COLUMN "previewPathsJson" TEXT;
