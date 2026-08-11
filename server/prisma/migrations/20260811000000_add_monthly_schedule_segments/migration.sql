-- CreateTable
CREATE TABLE "EmployeeMonthlyScheduleDay" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isWorkday" BOOLEAN NOT NULL,
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "payrollLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeMonthlyScheduleDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeScheduleSegment" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "scheduleDayId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "EmployeeScheduleSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAttendanceSegment" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAttendanceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeMonthlyScheduleDay_employeeId_date_key" ON "EmployeeMonthlyScheduleDay"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeMonthlyScheduleDay_id_frontendUserId_key" ON "EmployeeMonthlyScheduleDay"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeMonthlyScheduleDay_frontendUserId_date_idx" ON "EmployeeMonthlyScheduleDay"("frontendUserId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeScheduleSegment_scheduleDayId_sequence_key" ON "EmployeeScheduleSegment"("scheduleDayId", "sequence");

-- CreateIndex
CREATE INDEX "EmployeeScheduleSegment_frontendUserId_scheduleDayId_idx" ON "EmployeeScheduleSegment"("frontendUserId", "scheduleDayId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAttendanceSegment_attendanceRecordId_sequence_key" ON "EmployeeAttendanceSegment"("attendanceRecordId", "sequence");

-- CreateIndex
CREATE INDEX "EmployeeAttendanceSegment_frontendUserId_attendanceRecordId_idx" ON "EmployeeAttendanceSegment"("frontendUserId", "attendanceRecordId");

-- AddForeignKey
ALTER TABLE "EmployeeMonthlyScheduleDay" ADD CONSTRAINT "EmployeeMonthlyScheduleDay_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMonthlyScheduleDay" ADD CONSTRAINT "EmployeeMonthlyScheduleDay_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeScheduleSegment" ADD CONSTRAINT "EmployeeScheduleSegment_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeScheduleSegment" ADD CONSTRAINT "EmployeeScheduleSegment_scheduleDayId_frontendUserId_fkey" FOREIGN KEY ("scheduleDayId", "frontendUserId") REFERENCES "EmployeeMonthlyScheduleDay"("id", "frontendUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendanceSegment" ADD CONSTRAINT "EmployeeAttendanceSegment_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendanceSegment" ADD CONSTRAINT "EmployeeAttendanceSegment_attendanceRecordId_frontendUserId_fkey" FOREIGN KEY ("attendanceRecordId", "frontendUserId") REFERENCES "EmployeeAttendanceRecord"("id", "frontendUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the deployment month from the legacy weekly schedule, preferring an exact date override.
WITH deployment_days AS (
  SELECT generate_series(
    date_trunc('month', CURRENT_DATE),
    date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day',
    interval '1 day'
  )::date AS day
), resolved_schedule AS (
  SELECT
    employee."id" AS "employeeId",
    employee."frontendUserId",
    to_char(deployment_days.day, 'YYYY-MM-DD') AS "date",
    CASE WHEN override."id" IS NOT NULL THEN override."isWorkday" ELSE COALESCE(weekly."isWorkday", false) END AS "isWorkday",
    CASE WHEN override."id" IS NOT NULL THEN override."scheduledMinutes" ELSE COALESCE(weekly."scheduledMinutes", 0) END AS "scheduledMinutes",
    CASE WHEN override."id" IS NOT NULL THEN override."remark" ELSE NULL END AS "remark",
    CASE WHEN override."id" IS NOT NULL THEN override."plannedStartTime" ELSE weekly."plannedStartTime" END AS "plannedStartTime",
    CASE WHEN override."id" IS NOT NULL THEN override."plannedEndTime" ELSE weekly."plannedEndTime" END AS "plannedEndTime"
  FROM "Employee" AS employee
  CROSS JOIN deployment_days
  LEFT JOIN "EmployeeDateOverride" AS override ON override."employeeId" = employee."id" AND override."date" = to_char(deployment_days.day, 'YYYY-MM-DD')
  LEFT JOIN "EmployeeWeeklySchedule" AS weekly ON weekly."employeeId" = employee."id" AND weekly."weekday" = EXTRACT(DOW FROM deployment_days.day)::integer
)
INSERT INTO "EmployeeMonthlyScheduleDay" ("id", "frontendUserId", "employeeId", "date", "isWorkday", "scheduledMinutes", "remark", "createdAt", "updatedAt")
SELECT
  md5('monthly-schedule-day:' || "employeeId" || ':' || "date"),
  "frontendUserId",
  "employeeId",
  "date",
  "isWorkday",
  CASE WHEN "isWorkday" THEN "scheduledMinutes" ELSE 0 END,
  "remark",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM resolved_schedule;

-- A legacy day becomes one sequence-zero plan segment only when its complete clock pair is valid.
WITH deployment_days AS (
  SELECT generate_series(
    date_trunc('month', CURRENT_DATE),
    date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day',
    interval '1 day'
  )::date AS day
), resolved_schedule AS (
  SELECT
    employee."id" AS "employeeId",
    employee."frontendUserId",
    to_char(deployment_days.day, 'YYYY-MM-DD') AS "date",
    CASE WHEN override."id" IS NOT NULL THEN override."isWorkday" ELSE COALESCE(weekly."isWorkday", false) END AS "isWorkday",
    CASE WHEN override."id" IS NOT NULL THEN override."plannedStartTime" ELSE weekly."plannedStartTime" END AS "plannedStartTime",
    CASE WHEN override."id" IS NOT NULL THEN override."plannedEndTime" ELSE weekly."plannedEndTime" END AS "plannedEndTime"
  FROM "Employee" AS employee
  CROSS JOIN deployment_days
  LEFT JOIN "EmployeeDateOverride" AS override ON override."employeeId" = employee."id" AND override."date" = to_char(deployment_days.day, 'YYYY-MM-DD')
  LEFT JOIN "EmployeeWeeklySchedule" AS weekly ON weekly."employeeId" = employee."id" AND weekly."weekday" = EXTRACT(DOW FROM deployment_days.day)::integer
)
INSERT INTO "EmployeeScheduleSegment" ("id", "frontendUserId", "scheduleDayId", "sequence", "startTime", "endTime")
SELECT
  md5('monthly-schedule-segment:' || "employeeId" || ':' || "date"),
  "frontendUserId",
  md5('monthly-schedule-day:' || "employeeId" || ':' || "date"),
  0,
  "plannedStartTime",
  "plannedEndTime"
FROM resolved_schedule
WHERE "isWorkday"
  AND "plannedStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "plannedEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND split_part("plannedEndTime", ':', 1)::integer * 60 + split_part("plannedEndTime", ':', 2)::integer
    > split_part("plannedStartTime", ':', 1)::integer * 60 + split_part("plannedStartTime", ':', 2)::integer;

-- Preserve legacy punch pairs as a sequence-zero actual segment without changing the parent record.
INSERT INTO "EmployeeAttendanceSegment" ("id", "frontendUserId", "attendanceRecordId", "sequence", "checkInAt", "checkOutAt")
SELECT
  md5('attendance-segment:' || "id"),
  "frontendUserId",
  "id",
  0,
  "checkInAt",
  "checkOutAt"
FROM "EmployeeAttendanceRecord"
WHERE "checkInAt" IS NOT NULL AND "checkOutAt" IS NOT NULL;
