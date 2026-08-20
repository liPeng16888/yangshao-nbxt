ALTER TYPE "ReminderType" ADD VALUE IF NOT EXISTS 'LAB_SAMPLE_CHANGE_APPROVED';
ALTER TYPE "ReminderType" ADD VALUE IF NOT EXISTS 'LAB_SAMPLE_CHANGE_REJECTED';

CREATE TYPE "LabSampleChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "LabSampleChangeRequest" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "baseBlockUpdatedAt" TIMESTAMP(3) NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "requestedChanges" JSONB NOT NULL,
    "previewResults" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LabSampleChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewRemark" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "settlementEffects" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSampleChangeRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CellChangeLog" ADD COLUMN "changeRequestId" TEXT;

CREATE INDEX "LabSampleChangeRequest_frontendUserId_status_createdAt_idx" ON "LabSampleChangeRequest"("frontendUserId", "status", "createdAt");
CREATE INDEX "LabSampleChangeRequest_status_createdAt_idx" ON "LabSampleChangeRequest"("status", "createdAt");
CREATE INDEX "LabSampleChangeRequest_sheetId_blockId_idx" ON "LabSampleChangeRequest"("sheetId", "blockId");
CREATE INDEX "LabSampleChangeRequest_reviewedById_idx" ON "LabSampleChangeRequest"("reviewedById");

ALTER TABLE "LabSampleChangeRequest" ADD CONSTRAINT "LabSampleChangeRequest_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabSampleChangeRequest" ADD CONSTRAINT "LabSampleChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabSampleChangeRequest" ADD CONSTRAINT "LabSampleChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabSampleChangeRequest" ADD CONSTRAINT "LabSampleChangeRequest_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "LabSheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabSampleChangeRequest" ADD CONSTRAINT "LabSampleChangeRequest_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "SampleBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CellChangeLog" ADD CONSTRAINT "CellChangeLog_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "LabSampleChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LabSampleChangeRequest_one_pending_per_block"
ON "LabSampleChangeRequest" ("blockId")
WHERE "status" = 'PENDING';
