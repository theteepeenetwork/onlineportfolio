-- Publishing to StoryJar's shared library from inside the app.
--
-- One nullable column on the teacher's own table, holding the slug of the
-- library activity a template was published as. Null for every template at
-- every real school: only a school with `canPublishToLibrary` can reach the
-- action that writes it, and that flag is true for StoryJar Academy alone.
--
-- The pointer lives on this side rather than as a foreign key from
-- SharedActivity, which deliberately has no link to a teacher or a school. A
-- published activity therefore survives the deletion of the template it was
-- made from, exactly as a teacher's copy survives the deletion of the library
-- activity it came from.
ALTER TABLE "ActivityTemplate" ADD COLUMN "librarySlug" TEXT;

CREATE UNIQUE INDEX "ActivityTemplate_librarySlug_key" ON "ActivityTemplate"("librarySlug");
