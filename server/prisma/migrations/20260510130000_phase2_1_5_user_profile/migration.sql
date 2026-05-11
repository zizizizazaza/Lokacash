-- Phase 2.1.5 migration: UserProfile (implicit meta-level behavioral profile)

CREATE TABLE "UserProfile" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "longCount"       INTEGER NOT NULL DEFAULT 0,
    "shortCount"      INTEGER NOT NULL DEFAULT 0,
    "cryptoQueries"   INTEGER NOT NULL DEFAULT 0,
    "equityQueries"   INTEGER NOT NULL DEFAULT 0,
    "highRiskQueries" INTEGER NOT NULL DEFAULT 0,
    "lowRiskQueries"  INTEGER NOT NULL DEFAULT 0,
    "totalTurns"      INTEGER NOT NULL DEFAULT 0,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile" ("userId");
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile" ("userId");

ALTER TABLE "UserProfile"
    ADD CONSTRAINT "UserProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
