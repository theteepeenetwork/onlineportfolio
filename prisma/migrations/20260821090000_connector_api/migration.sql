-- Connecting Claude to a teacher's activity library.
--
-- Three tables, all credential-bearing and all hashed at rest:
--   ApiToken     one bearer token, personal (Claude Code / Desktop) or issued
--                by the OAuth flow (claude.ai connector).
--   OAuthClient  a claude.ai connector that registered itself (RFC 7591).
--   OAuthGrant   one teacher's decision to let one client in, carrying the
--                single-use authorization code and then the refresh token.
--
-- None of them reference a class, a child or a journal item, and nothing in
-- src/lib/api/ queries those models — see the comment block in schema.prisma.

CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERSONAL',
    "teacherId" TEXT NOT NULL,
    "grantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    CONSTRAINT "ApiToken_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "OAuthGrant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ApiToken_keyHash_key" ON "ApiToken"("keyHash");
CREATE INDEX "ApiToken_teacherId_idx" ON "ApiToken"("teacherId");
CREATE INDEX "ApiToken_grantId_idx" ON "ApiToken"("grantId");

CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "redirectUrisJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OAuthGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeChallenge" TEXT,
    "codeExpiresAt" DATETIME,
    "codeUsedAt" DATETIME,
    "refreshHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OAuthGrant_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OAuthGrant_codeHash_key" ON "OAuthGrant"("codeHash");
CREATE UNIQUE INDEX "OAuthGrant_refreshHash_key" ON "OAuthGrant"("refreshHash");
CREATE INDEX "OAuthGrant_teacherId_idx" ON "OAuthGrant"("teacherId");
