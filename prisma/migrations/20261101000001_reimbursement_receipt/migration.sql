-- The receipt a member attached to a reimbursement request: an object path in the
-- private `receipts` Storage bucket (supabase/storage-receipts.sql), never a URL.
-- Served only through GET /api/reimbursements/[id]/receipt as a short-lived signed link.
ALTER TABLE "Reimbursement" ADD COLUMN "receiptPath" TEXT;
