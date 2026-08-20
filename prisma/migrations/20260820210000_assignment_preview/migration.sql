-- The picture of an activity, copied onto the run at assign time.
--
-- Mirrors `previewPathsJson` on ActivityTemplate, copied at assign time like
-- every other snapshot field so a run outlives the template it came from.
-- Without it, a child's "to do" card had no picture at all and fell back to a
-- striped placeholder while the teacher's library card showed the real thing.
ALTER TABLE "Assignment" ADD COLUMN "previewSnapshotJson" TEXT;
