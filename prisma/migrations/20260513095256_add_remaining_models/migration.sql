-- CreateTable
CREATE TABLE "Deadline" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramTask" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "InstagramTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyEvent" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "doorRevenue" DOUBLE PRECISION NOT NULL,
    "attendance" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "PartyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT,
    "category" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL,
    "description" TEXT,
    "location" TEXT,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
