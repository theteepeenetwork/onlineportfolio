-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'SCHOOL',
    "canPublishToLibrary" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_School" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "School";
DROP TABLE "School";
ALTER TABLE "new_School" RENAME TO "School";
CREATE TABLE "new_SharedActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "templatePathsJson" TEXT,
    "quizJson" TEXT,
    "objectsJson" TEXT,
    "tagsJson" TEXT,
    "ageMode" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'STORYJAR',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SharedActivity" ("ageMode", "createdAt", "id", "instructions", "objectsJson", "published", "quizJson", "slug", "sortOrder", "tagsJson", "templatePathsJson", "title", "updatedAt") SELECT "ageMode", "createdAt", "id", "instructions", "objectsJson", "published", "quizJson", "slug", "sortOrder", "tagsJson", "templatePathsJson", "title", "updatedAt" FROM "SharedActivity";
DROP TABLE "SharedActivity";
ALTER TABLE "new_SharedActivity" RENAME TO "SharedActivity";
CREATE UNIQUE INDEX "SharedActivity_slug_key" ON "SharedActivity"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

