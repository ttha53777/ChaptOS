-- Index the (organizationId, deletedAt) + date-ordered scan used by listTransactions
-- and /api/treasury (where { organizationId, deletedAt: null } orderBy { date: desc }).
-- `date` is a String ISO column, so lexical order is chronological.
--
-- NOTE: plain CREATE INDEX (Prisma default) takes a brief write lock. For a large
-- production Transaction table, run this as CREATE INDEX CONCURRENTLY outside a
-- transaction instead.
CREATE INDEX "Transaction_organizationId_deletedAt_date_idx" ON "Transaction"("organizationId", "deletedAt", "date");
