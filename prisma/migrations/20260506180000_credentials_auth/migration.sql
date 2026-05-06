-- Email/password auth flows alongside the existing Google OAuth.
-- See src/lib/passwords.ts and src/app/api/auth/{signup,verify-email,
-- forgot-password,reset-password}/route.ts.

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

CREATE TABLE "AuthToken" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "token"     TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "purpose"   TEXT NOT NULL,
  "expires"   TIMESTAMP(3) NOT NULL,
  "consumed"  BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "AuthToken_token_key" ON "AuthToken"("token");
CREATE INDEX "AuthToken_email_idx" ON "AuthToken"("email");
CREATE INDEX "AuthToken_purpose_email_idx" ON "AuthToken"("purpose", "email");
