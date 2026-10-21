-- The org's dashboard arrangement: card order + column, hidden widgets, and the
-- headline numbers. One per org, arranged by an admin, seen by every member.
-- Null = never customized (renders the default). Shape: lib/dashboard-layout.ts.
--
-- Additive and nullable: older builds never select it.

-- AlterTable
ALTER TABLE "OrganizationConfig" ADD COLUMN "dashboardLayout" JSONB;
