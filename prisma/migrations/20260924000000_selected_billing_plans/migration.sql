ALTER TABLE "Subscription"
  ADD COLUMN "billingMode" TEXT NOT NULL DEFAULT 'automatic',
  ADD COLUMN "selectedPlan" TEXT,
  ADD COLUMN "scheduledPlan" TEXT,
  ADD COLUMN "planChangeAt" TIMESTAMP(3),
  ADD CONSTRAINT "Subscription_billingMode_check" CHECK ("billingMode" IN ('automatic', 'selected')),
  ADD CONSTRAINT "Subscription_selectedPlan_check" CHECK (
    ("billingMode" = 'automatic' AND "selectedPlan" IS NULL) OR
    ("billingMode" = 'selected' AND "selectedPlan" IS NOT NULL AND "selectedPlan" IN ('standard', 'pro'))
  ),
  ADD CONSTRAINT "Subscription_scheduledPlan_check" CHECK ("scheduledPlan" IS NULL OR "scheduledPlan" IN ('standard', 'pro'));
