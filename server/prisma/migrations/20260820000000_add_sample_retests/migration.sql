-- CreateEnum
CREATE TYPE "SampleRetestStatus" AS ENUM ('ACTIVE', 'VOID');

-- AlterTable
ALTER TABLE "SampleBlock"
ADD COLUMN "nextRetestSequence" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SampleRetest" (
    "id" TEXT NOT NULL,
    "sampleBlockId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "inputs" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "parameterSnapshot" JSONB NOT NULL,
    "everFilled" BOOLEAN NOT NULL DEFAULT false,
    "status" "SampleRetestStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "SampleRetest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleRetestWriteRequest" (
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "sampleBlockId" TEXT,
    "sampleRetestId" TEXT,
    "responseSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleRetestWriteRequest_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "SampleRetest_sampleBlockId_sequence_key" ON "SampleRetest"("sampleBlockId", "sequence");

-- CreateIndex
CREATE INDEX "SampleRetest_sampleBlockId_status_sequence_idx" ON "SampleRetest"("sampleBlockId", "status", "sequence");

-- CreateIndex
CREATE INDEX "SampleRetestWriteRequest_sheetId_sampleBlockId_idx" ON "SampleRetestWriteRequest"("sheetId", "sampleBlockId");

-- CreateIndex
CREATE INDEX "SampleRetestWriteRequest_sampleRetestId_idx" ON "SampleRetestWriteRequest"("sampleRetestId");

-- CreateIndex
CREATE INDEX "SampleRetestWriteRequest_createdAt_idx" ON "SampleRetestWriteRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "SampleRetest" ADD CONSTRAINT "SampleRetest_sampleBlockId_fkey" FOREIGN KEY ("sampleBlockId") REFERENCES "SampleBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
