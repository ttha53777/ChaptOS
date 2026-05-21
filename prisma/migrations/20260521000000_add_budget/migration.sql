-- CreateTable
CREATE TABLE "Budget" (
    "id" SERIAL NOT NULL,
    "semester" TEXT NOT NULL,
    "carryoverBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" SERIAL NOT NULL,
    "budgetId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Budget_semester_key" ON "Budget"("semester");

-- CreateIndex
CREATE INDEX "BudgetAllocation_budgetId_idx" ON "BudgetAllocation"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_budgetId_category_key" ON "BudgetAllocation"("budgetId", "category");

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
