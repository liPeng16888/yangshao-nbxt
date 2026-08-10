-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EmployeeLeaveUnit" AS ENUM ('HOUR', 'HALF_DAY', 'FULL_DAY');

-- CreateEnum
CREATE TYPE "EmployeeLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmployeePayrollStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "EmployeeAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CONFIRM', 'REOPEN', 'REVEAL');

-- AlterEnum
ALTER TYPE "AccessGuardFeature" ADD VALUE 'EMPLOYEE_ATTENDANCE';

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "idCardCipher" TEXT,
    "bankCardCipher" TEXT,
    "addressCipher" TEXT,
    "emergencyContactCipher" TEXT,
    "photoPath" TEXT,
    "hireDate" TEXT NOT NULL,
    "terminationDate" TEXT,
    "baseSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "attendanceBonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtimeHourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "restQuotaDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWeeklySchedule" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorkday" BOOLEAN NOT NULL DEFAULT true,
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 480,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWeeklySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDateOverride" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isWorkday" BOOLEAN NOT NULL,
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 480,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeMonthlySetting" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "scheduledWorkDays" DECIMAL(6,2) NOT NULL,
    "restQuotaDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeMonthlySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAttendanceRecord" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isScheduledWorkday" BOOLEAN NOT NULL,
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "absenceMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "payrollLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLeaveType" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "countsTowardRestQuota" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLeaveRequest" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "unit" "EmployeeLeaveUnit" NOT NULL,
    "hours" DECIMAL(6,2),
    "countedDays" DECIMAL(6,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EmployeeLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewRemark" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "payrollLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCommissionType" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCommissionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCommissionRecord" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "commissionTypeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remark" TEXT,
    "payrollLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCommissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBonus" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "payrollLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayrollRun" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "EmployeePayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayrollItem" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeNumberSnapshot" TEXT NOT NULL,
    "employeeNameSnapshot" TEXT NOT NULL,
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "attendanceBonus" DECIMAL(12,2) NOT NULL,
    "scheduledWorkDays" DECIMAL(6,2) NOT NULL,
    "restQuotaDays" DECIMAL(6,2) NOT NULL,
    "countedLeaveDays" DECIMAL(6,2) NOT NULL,
    "excessLeaveDays" DECIMAL(6,2) NOT NULL,
    "absenceDays" DECIMAL(6,2) NOT NULL,
    "dailyRate" DECIMAL(12,2) NOT NULL,
    "leaveDeduction" DECIMAL(12,2) NOT NULL,
    "absenceDeduction" DECIMAL(12,2) NOT NULL,
    "overtimeMinutes" INTEGER NOT NULL,
    "overtimeHourlyRate" DECIMAL(12,2) NOT NULL,
    "overtimePay" DECIMAL(12,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "bonusAmount" DECIMAL(12,2) NOT NULL,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL,
    "payableAmount" DECIMAL(12,2) NOT NULL,
    "issues" JSONB NOT NULL,
    "calculationSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayrollAdjustment" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "payrollItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAuditLog" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "EmployeeAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_frontendUserId_status_idx" ON "Employee"("frontendUserId", "status");

-- CreateIndex
CREATE INDEX "Employee_frontendUserId_name_idx" ON "Employee"("frontendUserId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_frontendUserId_employeeNumber_key" ON "Employee"("frontendUserId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_id_frontendUserId_key" ON "Employee"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeWeeklySchedule_frontendUserId_employeeId_idx" ON "EmployeeWeeklySchedule"("frontendUserId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWeeklySchedule_employeeId_weekday_key" ON "EmployeeWeeklySchedule"("employeeId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWeeklySchedule_id_frontendUserId_key" ON "EmployeeWeeklySchedule"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeDateOverride_frontendUserId_date_idx" ON "EmployeeDateOverride"("frontendUserId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDateOverride_employeeId_date_key" ON "EmployeeDateOverride"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDateOverride_id_frontendUserId_key" ON "EmployeeDateOverride"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeMonthlySetting_frontendUserId_month_idx" ON "EmployeeMonthlySetting"("frontendUserId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeMonthlySetting_employeeId_month_key" ON "EmployeeMonthlySetting"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeMonthlySetting_id_frontendUserId_key" ON "EmployeeMonthlySetting"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeAttendanceRecord_frontendUserId_date_idx" ON "EmployeeAttendanceRecord"("frontendUserId", "date");

-- CreateIndex
CREATE INDEX "EmployeeAttendanceRecord_frontendUserId_employeeId_date_idx" ON "EmployeeAttendanceRecord"("frontendUserId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAttendanceRecord_employeeId_date_key" ON "EmployeeAttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAttendanceRecord_id_frontendUserId_key" ON "EmployeeAttendanceRecord"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeLeaveType_frontendUserId_active_idx" ON "EmployeeLeaveType"("frontendUserId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLeaveType_frontendUserId_name_key" ON "EmployeeLeaveType"("frontendUserId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLeaveType_id_frontendUserId_key" ON "EmployeeLeaveType"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeLeaveRequest_frontendUserId_status_startDate_idx" ON "EmployeeLeaveRequest"("frontendUserId", "status", "startDate");

-- CreateIndex
CREATE INDEX "EmployeeLeaveRequest_frontendUserId_employeeId_startDate_en_idx" ON "EmployeeLeaveRequest"("frontendUserId", "employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "EmployeeLeaveRequest_leaveTypeId_idx" ON "EmployeeLeaveRequest"("leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLeaveRequest_id_frontendUserId_key" ON "EmployeeLeaveRequest"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeCommissionType_frontendUserId_active_idx" ON "EmployeeCommissionType"("frontendUserId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCommissionType_frontendUserId_name_key" ON "EmployeeCommissionType"("frontendUserId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCommissionType_id_frontendUserId_key" ON "EmployeeCommissionType"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeCommissionRecord_frontendUserId_date_idx" ON "EmployeeCommissionRecord"("frontendUserId", "date");

-- CreateIndex
CREATE INDEX "EmployeeCommissionRecord_frontendUserId_employeeId_date_idx" ON "EmployeeCommissionRecord"("frontendUserId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "EmployeeCommissionRecord_commissionTypeId_idx" ON "EmployeeCommissionRecord"("commissionTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCommissionRecord_id_frontendUserId_key" ON "EmployeeCommissionRecord"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeBonus_frontendUserId_date_idx" ON "EmployeeBonus"("frontendUserId", "date");

-- CreateIndex
CREATE INDEX "EmployeeBonus_frontendUserId_employeeId_date_idx" ON "EmployeeBonus"("frontendUserId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBonus_id_frontendUserId_key" ON "EmployeeBonus"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeePayrollRun_frontendUserId_status_month_idx" ON "EmployeePayrollRun"("frontendUserId", "status", "month");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollRun_frontendUserId_month_key" ON "EmployeePayrollRun"("frontendUserId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollRun_id_frontendUserId_key" ON "EmployeePayrollRun"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeePayrollItem_frontendUserId_employeeId_idx" ON "EmployeePayrollItem"("frontendUserId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollItem_payrollRunId_employeeId_key" ON "EmployeePayrollItem"("payrollRunId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollItem_id_employeeId_frontendUserId_key" ON "EmployeePayrollItem"("id", "employeeId", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeePayrollAdjustment_frontendUserId_payrollItemId_idx" ON "EmployeePayrollAdjustment"("frontendUserId", "payrollItemId");

-- CreateIndex
CREATE INDEX "EmployeePayrollAdjustment_frontendUserId_employeeId_idx" ON "EmployeePayrollAdjustment"("frontendUserId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollAdjustment_id_frontendUserId_key" ON "EmployeePayrollAdjustment"("id", "frontendUserId");

-- CreateIndex
CREATE INDEX "EmployeeAuditLog_frontendUserId_createdAt_idx" ON "EmployeeAuditLog"("frontendUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeAuditLog_frontendUserId_entityType_entityId_idx" ON "EmployeeAuditLog"("frontendUserId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EmployeeAuditLog_actorUserId_createdAt_idx" ON "EmployeeAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAuditLog_id_frontendUserId_key" ON "EmployeeAuditLog"("id", "frontendUserId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWeeklySchedule" ADD CONSTRAINT "EmployeeWeeklySchedule_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWeeklySchedule" ADD CONSTRAINT "EmployeeWeeklySchedule_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDateOverride" ADD CONSTRAINT "EmployeeDateOverride_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDateOverride" ADD CONSTRAINT "EmployeeDateOverride_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMonthlySetting" ADD CONSTRAINT "EmployeeMonthlySetting_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMonthlySetting" ADD CONSTRAINT "EmployeeMonthlySetting_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendanceRecord" ADD CONSTRAINT "EmployeeAttendanceRecord_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAttendanceRecord" ADD CONSTRAINT "EmployeeAttendanceRecord_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeaveType" ADD CONSTRAINT "EmployeeLeaveType_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_leaveTypeId_frontendUserId_fkey" FOREIGN KEY ("leaveTypeId", "frontendUserId") REFERENCES "EmployeeLeaveType"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeaveRequest" ADD CONSTRAINT "EmployeeLeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCommissionType" ADD CONSTRAINT "EmployeeCommissionType_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCommissionRecord" ADD CONSTRAINT "EmployeeCommissionRecord_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCommissionRecord" ADD CONSTRAINT "EmployeeCommissionRecord_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCommissionRecord" ADD CONSTRAINT "EmployeeCommissionRecord_commissionTypeId_frontendUserId_fkey" FOREIGN KEY ("commissionTypeId", "frontendUserId") REFERENCES "EmployeeCommissionType"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBonus" ADD CONSTRAINT "EmployeeBonus_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBonus" ADD CONSTRAINT "EmployeeBonus_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollRun" ADD CONSTRAINT "EmployeePayrollRun_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollRun" ADD CONSTRAINT "EmployeePayrollRun_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollItem" ADD CONSTRAINT "EmployeePayrollItem_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollItem" ADD CONSTRAINT "EmployeePayrollItem_payrollRunId_frontendUserId_fkey" FOREIGN KEY ("payrollRunId", "frontendUserId") REFERENCES "EmployeePayrollRun"("id", "frontendUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollItem" ADD CONSTRAINT "EmployeePayrollItem_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollAdjustment" ADD CONSTRAINT "EmployeePayrollAdjustment_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollAdjustment" ADD CONSTRAINT "EmployeePayrollAdjustment_payrollItemId_employeeId_fronten_fkey" FOREIGN KEY ("payrollItemId", "employeeId", "frontendUserId") REFERENCES "EmployeePayrollItem"("id", "employeeId", "frontendUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayrollAdjustment" ADD CONSTRAINT "EmployeePayrollAdjustment_employeeId_frontendUserId_fkey" FOREIGN KEY ("employeeId", "frontendUserId") REFERENCES "Employee"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAuditLog" ADD CONSTRAINT "EmployeeAuditLog_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAuditLog" ADD CONSTRAINT "EmployeeAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
