-- A picture of the template, for showing a teacher.
--
-- `templatePathsJson` is the background the editor is handed back, so it leaves
-- out the movable pieces (they would appear twice) and never carries the
-- question boxes (they stay structured). A template built from those alone
-- therefore saved a blank white page as its card. This column holds the picture.
ALTER TABLE "ActivityTemplate" ADD COLUMN "previewPathsJson" TEXT;
