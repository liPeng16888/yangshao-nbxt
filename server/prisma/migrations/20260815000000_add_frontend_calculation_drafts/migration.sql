-- CreateEnum
CREATE TYPE "CalculationDraftKind" AS ENUM ('STANDARD_SAMPLE', 'COEFFICIENT');

-- CreateTable
CREATE TABLE "FrontendCalculationDraft" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "kind" "CalculationDraftKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrontendCalculationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FrontendCalculationDraft_frontendUserId_kind_key" ON "FrontendCalculationDraft"("frontendUserId", "kind");

-- CreateIndex
CREATE INDEX "FrontendCalculationDraft_frontendUserId_idx" ON "FrontendCalculationDraft"("frontendUserId");

-- AddForeignKey
ALTER TABLE "FrontendCalculationDraft" ADD CONSTRAINT "FrontendCalculationDraft_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") on delete cascade on update cascade;
