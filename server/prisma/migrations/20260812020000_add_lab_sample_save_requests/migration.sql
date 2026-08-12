CREATE TABLE "LabSampleSaveRequest" (
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "sheetId" TEXT NOT NULL,
  "sampleBlockId" TEXT NOT NULL,
  "responseSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LabSampleSaveRequest_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE INDEX "LabSampleSaveRequest_sheetId_sampleBlockId_idx"
ON "LabSampleSaveRequest"("sheetId", "sampleBlockId");

CREATE INDEX "LabSampleSaveRequest_createdAt_idx"
ON "LabSampleSaveRequest"("createdAt");
