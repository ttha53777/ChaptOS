ALTER TABLE "OperationalEvent"
  ADD COLUMN "deliveryPending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryAvailableAt" TIMESTAMP(3),
  ADD COLUMN "deliveryLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "deliveryActorName" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3);
CREATE INDEX "OperationalEvent_deliveryPending_deliveryAvailableAt_idx"
  ON "OperationalEvent" ("deliveryPending", "deliveryAvailableAt");
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_deliveryAttempts_check" CHECK ("deliveryAttempts" >= 0);
