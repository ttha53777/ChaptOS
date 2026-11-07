-- Ask Chapt file attachments: the extracted text / sheets of a file a member
-- attached to one conversation. The original bytes are never stored.
--
-- Additive: one new table, nothing existing is touched.
--
-- Access: an org-scoped tenant table, isolated from day one by org_isolation
-- (no permissive policy). Per-owner privacy is enforced in the app layer
-- (ctx.db.chatAttachment.forOwner) on top of that. figurints_app gets the
-- table and its sequence; the Supabase Data API roles get nothing.
--
-- Rollback: DROP TABLE "ChatAttachment";

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "threadId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "unitCount" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB,
    "digest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id"),
    -- AttachmentKind (lib/state/attachment-kind.ts)
    CONSTRAINT chat_attachment_kind CHECK ("kind" IN ('pdf', 'docx', 'xlsx', 'csv', 'txt'))
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachment_publicId_key" ON "ChatAttachment"("publicId");

-- CreateIndex
CREATE INDEX "ChatAttachment_organizationId_ownerId_threadId_idx" ON "ChatAttachment"("organizationId", "ownerId", "threadId");

-- CreateIndex
CREATE INDEX "ChatAttachment_organizationId_ownerId_createdAt_idx" ON "ChatAttachment"("organizationId", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAttachment_expiresAt_idx" ON "ChatAttachment"("expiresAt");

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Brother"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No permissive policy: isolated from day one.
ALTER TABLE "ChatAttachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "ChatAttachment" USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::integer);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'figurints_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ChatAttachment" TO figurints_app;
    GRANT USAGE, SELECT ON SEQUENCE "ChatAttachment_id_seq" TO figurints_app;
  END IF;
END $$;

-- Belt and braces, as in 20261103000001_terms_acceptance.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role);
    EXECUTE format('REVOKE ALL ON "ChatAttachment" FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE "ChatAttachment_id_seq" FROM %I', api_role);
  END LOOP;
END $$;
