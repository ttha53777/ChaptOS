-- Nullable display metadata; existing org configuration RLS continues to apply.
ALTER TABLE "OrganizationConfig" ADD COLUMN IF NOT EXISTS "instagramHandle" TEXT;
