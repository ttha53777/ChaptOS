-- CreateTable
CREATE TABLE "Brother" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "attendance" DOUBLE PRECISION NOT NULL,
    "duesOwed" DOUBLE PRECISION NOT NULL,
    "gpa" DOUBLE PRECISION NOT NULL,
    "serviceHours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Brother_pkey" PRIMARY KEY ("id")
);
