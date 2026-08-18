-- CreateTable
CREATE TABLE "SharedActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "templatePathsJson" TEXT,
    "quizJson" TEXT,
    "objectsJson" TEXT,
    "tagsJson" TEXT,
    "ageMode" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "templatePathsJson" TEXT,
    "quizJson" TEXT,
    "objectsJson" TEXT,
    "tagsJson" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "teacherId" TEXT NOT NULL,
    "folderId" TEXT,
    "sourceSharedActivityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityTemplate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityTemplate_sourceSharedActivityId_fkey" FOREIGN KEY ("sourceSharedActivityId") REFERENCES "SharedActivity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ActivityTemplate" ("archived", "createdAt", "folderId", "id", "instructions", "objectsJson", "quizJson", "tagsJson", "teacherId", "templatePathsJson", "title") SELECT "archived", "createdAt", "folderId", "id", "instructions", "objectsJson", "quizJson", "tagsJson", "teacherId", "templatePathsJson", "title" FROM "ActivityTemplate";
DROP TABLE "ActivityTemplate";
ALTER TABLE "new_ActivityTemplate" RENAME TO "ActivityTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SharedActivity_slug_key" ON "SharedActivity"("slug");

