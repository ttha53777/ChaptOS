-- AlterTable
ALTER TABLE "PartyEvent" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ALTER COLUMN "doorRevenue" SET DEFAULT 0,
ALTER COLUMN "attendance" SET DEFAULT 0,
ALTER COLUMN "notes" SET DEFAULT '';
