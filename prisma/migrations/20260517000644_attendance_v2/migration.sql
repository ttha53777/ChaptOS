-- CreateTable
CREATE TABLE "Semester" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" SERIAL NOT NULL,
    "calendarEventId" INTEGER NOT NULL,
    "brotherId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "attended" BOOLEAN NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceExcuse" (
    "id" SERIAL NOT NULL,
    "calendarEventId" INTEGER NOT NULL,
    "brotherId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRetroactive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AttendanceExcuse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Semester_label_key" ON "Semester"("label");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_calendarEventId_brotherId_key" ON "AttendanceRecord"("calendarEventId", "brotherId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceExcuse_calendarEventId_brotherId_key" ON "AttendanceExcuse"("calendarEventId", "brotherId");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_brotherId_fkey" FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceExcuse" ADD CONSTRAINT "AttendanceExcuse_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceExcuse" ADD CONSTRAINT "AttendanceExcuse_brotherId_fkey" FOREIGN KEY ("brotherId") REFERENCES "Brother"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceExcuse" ADD CONSTRAINT "AttendanceExcuse_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
