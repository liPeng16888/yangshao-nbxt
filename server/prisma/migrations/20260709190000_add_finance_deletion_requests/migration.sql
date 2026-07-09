-- Add finance deletion approval workflow without changing existing finance or prepaid data.

ALTER TYPE "ReminderType" ADD VALUE IF NOT EXISTS 'FINANCE_DELETE_APPROVED';
ALTER TYPE "ReminderType" ADD VALUE IF NOT EXISTS 'FINANCE_DELETE_REJECTED';

CREATE TYPE "FinanceDeletionRequestType" AS ENUM ('EXPENSE', 'PREPAID_RECHARGE');
CREATE TYPE "FinanceDeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "FinanceDeletionRequest" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "sourceType" "FinanceDeletionRequestType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "status" "FinanceDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewRemark" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceDeletionRequest_frontendUserId_status_idx" ON "FinanceDeletionRequest"("frontendUserId", "status");
CREATE INDEX "FinanceDeletionRequest_sourceType_sourceId_idx" ON "FinanceDeletionRequest"("sourceType", "sourceId");
CREATE INDEX "FinanceDeletionRequest_status_createdAt_idx" ON "FinanceDeletionRequest"("status", "createdAt");

ALTER TABLE "FinanceDeletionRequest" ADD CONSTRAINT "FinanceDeletionRequest_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceDeletionRequest" ADD CONSTRAINT "FinanceDeletionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
