-- CreateIndex
CREATE INDEX "AttendanceExcuse_brotherId_semesterId_idx" ON "AttendanceExcuse"("brotherId", "semesterId");

-- CreateIndex
CREATE INDEX "AttendanceExcuse_calendarEventId_semesterId_idx" ON "AttendanceExcuse"("calendarEventId", "semesterId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_brotherId_semesterId_idx" ON "AttendanceRecord"("brotherId", "semesterId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_calendarEventId_semesterId_idx" ON "AttendanceRecord"("calendarEventId", "semesterId");

-- CreateIndex
CREATE INDEX "Semester_isActive_idx" ON "Semester"("isActive");

-- CreateIndex
CREATE INDEX "Transaction_deletedAt_idx" ON "Transaction"("deletedAt");
