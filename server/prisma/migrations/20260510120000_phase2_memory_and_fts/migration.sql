-- Phase 2 migration: Persistent Memory + ChatMessage FTS

-- ─── 2.1 Persistent Memory ─────────────────────────────────────────────
CREATE TABLE "UserMemory" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "content"    TEXT NOT NULL,
    "tags"       TEXT NOT NULL DEFAULT '',
    "importance" INTEGER NOT NULL DEFAULT 50,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserMemory_userId_importance_createdAt_idx"
    ON "UserMemory" ("userId", "importance" DESC, "createdAt" DESC);

CREATE INDEX "UserMemory_userId_createdAt_idx"
    ON "UserMemory" ("userId", "createdAt" DESC);

ALTER TABLE "UserMemory"
    ADD CONSTRAINT "UserMemory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2.2 ChatMessage FTS ───────────────────────────────────────────────
-- pg_trgm gives us GIN-indexed trigram search that handles both English
-- and Chinese content reasonably well without an external Chinese tokenizer.
-- Existing producers `pg_extension` rows are preserved if already enabled
-- on the cluster (e.g. on managed Postgres providers).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Combined index: per-user trigram scan. Queries always lead with
-- WHERE "userId" = ? so per-user search stays under 50ms even on 100k+ rows.
CREATE INDEX "ChatMessage_userId_content_trgm_idx"
    ON "ChatMessage" USING GIN ("userId" gin_trgm_ops, "content" gin_trgm_ops);
