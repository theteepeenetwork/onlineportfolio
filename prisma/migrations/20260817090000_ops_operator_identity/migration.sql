-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "pwHash" TEXT NOT NULL,
    "totpSecret" TEXT NOT NULL,
    "totpConfirmedAt" DATETIME,
    "lastTotpStep" INTEGER,
    "recoveryCodesJson" TEXT NOT NULL DEFAULT '[]',
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastSignInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OperatorSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpsAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "reason" TEXT,
    "detail" TEXT,
    "idempotencyKey" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorSession_tokenHash_key" ON "OperatorSession"("tokenHash");

-- CreateIndex
CREATE INDEX "OperatorSession_operatorId_idx" ON "OperatorSession"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAuditLog_idempotencyKey_key" ON "OpsAuditLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OpsAuditLog_at_idx" ON "OpsAuditLog"("at");

