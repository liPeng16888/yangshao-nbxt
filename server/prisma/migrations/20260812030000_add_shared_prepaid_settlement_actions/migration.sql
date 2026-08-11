-- CreateEnum
CREATE TYPE "SharedPrepaidSettlementActionOperation" AS ENUM ('SUBMIT_PAYMENT', 'CONFIRM_RECEIPT', 'REJECT', 'CANCEL');

-- CreateTable
CREATE TABLE "SharedPrepaidSettlementAction" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "operation" "SharedPrepaidSettlementActionOperation" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorFrontendUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "responseSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPrepaidSettlementAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidSettlementAction_idempotencyKey_key"
ON "SharedPrepaidSettlementAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SharedPrepaidSettlementAction_settlementId_createdAt_idx"
ON "SharedPrepaidSettlementAction"("settlementId", "createdAt");

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlementAction"
ADD CONSTRAINT "SharedPrepaidSettlementAction_settlementId_fkey"
FOREIGN KEY ("settlementId") REFERENCES "SharedPrepaidSettlement"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlementAction"
ADD CONSTRAINT "SharedPrepaidSettlementAction_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlementAction"
ADD CONSTRAINT "SharedPrepaidSettlementAction_actorFrontendUserId_fkey"
FOREIGN KEY ("actorFrontendUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
