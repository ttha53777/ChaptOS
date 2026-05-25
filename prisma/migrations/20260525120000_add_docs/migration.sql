-- Docs: pinned external links shown on the /docs page.
-- Idempotent so partial application (or hand-application via Supabase SQL
-- editor) is safe to re-run.

CREATE TABLE IF NOT EXISTS "Doc" (
  "id"          SERIAL PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "description" TEXT,
  "ogImage"     TEXT,
  "ogTitle"     TEXT,
  "faviconUrl"  TEXT,
  "embedOk"     BOOLEAN,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" INTEGER
);

CREATE INDEX IF NOT EXISTS "Doc_createdAt_idx" ON "Doc"("createdAt");
