-- Add tenant-scoped frontend subaccounts and their leaf menu permissions.

ALTER TYPE "UserRole" ADD VALUE 'FRONTEND_SUB_USER';

CREATE TYPE "FrontendMenuPermission" AS ENUM (
  'DATA_MAIN',
  'DATA_STANDARD_SAMPLE',
  'DATA_COEFFICIENT',
  'LAB_REPORT_IMAGE_TEMPLATE',
  'LAB_REPORT_SMS_TEMPLATE',
  'ATTENDANCE_OVERVIEW',
  'ATTENDANCE_EMPLOYEES',
  'ATTENDANCE_SCHEDULES',
  'ATTENDANCE_RECORDS',
  'ATTENDANCE_LEAVE',
  'ATTENDANCE_COMPENSATION',
  'ATTENDANCE_PAYROLL',
  'FINANCE_EXPENSES',
  'FINANCE_INCOME',
  'FINANCE_UNSETTLED',
  'FINANCE_MONTHLY_SETTLEMENT',
  'FINANCE_PREPAID_ADD',
  'FINANCE_PREPAID_CUSTOMERS',
  'REPORTS',
  'MEDICINE_STOCK',
  'MEDICINE_INBOUND',
  'MEDICINE_OUTBOUND',
  'CUSTOMER_OVERVIEW',
  'BLACKLIST'
);

ALTER TABLE "User"
  ADD COLUMN "parentFrontendUserId" TEXT,
  ADD COLUMN "permissionVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "requiresAccessGuardPassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE TABLE "FrontendSubAccountPermission" (
  "id" TEXT NOT NULL,
  "subAccountId" TEXT NOT NULL,
  "permission" "FrontendMenuPermission" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FrontendSubAccountPermission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_parentFrontendUserId_idx" ON "User"("parentFrontendUserId");
CREATE INDEX "FrontendSubAccountPermission_subAccountId_idx" ON "FrontendSubAccountPermission"("subAccountId");
CREATE UNIQUE INDEX "FrontendSubAccountPermission_subAccountId_permission_key" ON "FrontendSubAccountPermission"("subAccountId", "permission");

ALTER TABLE "User" ADD CONSTRAINT "User_parentFrontendUserId_fkey" FOREIGN KEY ("parentFrontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FrontendSubAccountPermission" ADD CONSTRAINT "FrontendSubAccountPermission_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
