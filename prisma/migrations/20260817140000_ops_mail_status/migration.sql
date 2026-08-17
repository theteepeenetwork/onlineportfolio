-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "outcome" TEXT NOT NULL,
    "itemsAffected" INTEGER NOT NULL DEFAULT 0,
    "outcomeDetail" TEXT
);

-- CreateTable
CREATE TABLE "MailCounter" (
    "day" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "statusClass" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "templateKey", "outcome", "statusClass")
);

-- CreateTable
CREATE TABLE "MailSuppression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "addressHmac" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailSuppression_addressHmac_key" ON "MailSuppression"("addressHmac");

