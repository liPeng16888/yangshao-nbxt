-- CreateEnum
CREATE TYPE "SharedPrepaidLedgerKind" AS ENUM ('RECHARGE', 'CONSUMPTION', 'CONSUMPTION_REVERSAL', 'RECHARGE_REVERSAL');

-- CreateEnum
CREATE TYPE "SharedPrepaidConsumptionKind" AS ENUM ('CONSUMPTION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "SharedPrepaidPayableStatus" AS ENUM ('PENDING', 'HELD', 'COMPLETED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SharedPrepaidSettlementStatus" AS ENUM ('AWAITING_PAYMENT', 'AWAITING_RECEIPT', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- Add the replacement permissions before migrating existing assignments.
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_RECHARGE';
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_CUSTOMERS';
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_CONSUMPTIONS';
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_SETTLEMENTS';

INSERT INTO "FrontendSubAccountPermission" ("id", "subAccountId", "permission", "createdAt")
SELECT md5("subAccountId" || ':PREPAID_RECHARGE')::uuid::text, "subAccountId", 'PREPAID_RECHARGE'::"FrontendMenuPermission", NOW()
FROM "FrontendSubAccountPermission" WHERE "permission" = 'FINANCE_PREPAID_ADD'
ON CONFLICT DO NOTHING;

INSERT INTO "FrontendSubAccountPermission" ("id", "subAccountId", "permission", "createdAt")
SELECT md5(old."subAccountId" || ':' || p."permission")::uuid::text, old."subAccountId", p."permission"::"FrontendMenuPermission", NOW()
FROM "FrontendSubAccountPermission" old
CROSS JOIN (VALUES ('PREPAID_CUSTOMERS'), ('PREPAID_CONSUMPTIONS')) AS p("permission")
WHERE old."permission" = 'FINANCE_PREPAID_CUSTOMERS'
ON CONFLICT DO NOTHING;

DELETE FROM "FrontendSubAccountPermission"
WHERE "permission" IN ('FINANCE_PREPAID_ADD', 'FINANCE_PREPAID_CUSTOMERS');

-- Remove the retired enum values after all permission rows have been migrated.
BEGIN;
CREATE TYPE "FrontendMenuPermission_new" AS ENUM ('DATA_MAIN', 'DATA_STANDARD_SAMPLE', 'DATA_COEFFICIENT', 'LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE', 'ATTENDANCE_OVERVIEW', 'ATTENDANCE_EMPLOYEES', 'ATTENDANCE_SCHEDULES', 'ATTENDANCE_RECORDS', 'ATTENDANCE_LEAVE', 'ATTENDANCE_COMPENSATION', 'ATTENDANCE_PAYROLL', 'FINANCE_EXPENSES', 'FINANCE_INCOME', 'FINANCE_UNSETTLED', 'FINANCE_MONTHLY_SETTLEMENT', 'PREPAID_RECHARGE', 'PREPAID_CUSTOMERS', 'PREPAID_CONSUMPTIONS', 'PREPAID_SETTLEMENTS', 'REPORTS', 'MEDICINE_STOCK', 'MEDICINE_INBOUND', 'MEDICINE_OUTBOUND', 'CUSTOMER_OVERVIEW', 'BLACKLIST');
ALTER TABLE "FrontendSubAccountPermission" ALTER COLUMN "permission" TYPE "FrontendMenuPermission_new" USING ("permission"::text::"FrontendMenuPermission_new");
ALTER TYPE "FrontendMenuPermission" RENAME TO "FrontendMenuPermission_old";
ALTER TYPE "FrontendMenuPermission_new" RENAME TO "FrontendMenuPermission";
DROP TYPE "FrontendMenuPermission_old";
COMMIT;

-- CreateTable
CREATE TABLE "SharedPrepaidMember" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cachedBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedPrepaidMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPrepaidRecharge" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "ownerFrontendUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "rechargeDate" TEXT NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL,
    "giftAmount" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "remainingAmount" DECIMAL(14,2) NOT NULL,
    "isOpeningBalance" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedByLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedPrepaidRecharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPrepaidLedgerEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "SharedPrepaidLedgerKind" NOT NULL,
    "balanceDelta" DECIMAL(14,2) NOT NULL,
    "ownerFrontendUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPrepaidLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPrepaidConsumption" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "consumingFrontendUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" "SharedPrepaidConsumptionKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sheetId" TEXT NOT NULL,
    "sampleBlockId" TEXT NOT NULL,
    "sampleIndex" INTEGER NOT NULL,
    "sampleNumberSnapshot" TEXT,
    "sampleCountSnapshot" INTEGER NOT NULL DEFAULT 1,
    "elementsSnapshot" JSONB NOT NULL,
    "phoneSnapshot" TEXT NOT NULL,
    "sheetDate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reversalOfId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPrepaidConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPrepaidAllocation" (
    "id" TEXT NOT NULL,
    "consumptionId" TEXT NOT NULL,
    "rechargeId" TEXT NOT NULL,
    "sourceOwnerId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(14,2) NOT NULL,
    "paidRatio" DECIMAL(20,10) NOT NULL,
    "exactTransferAmount" DECIMAL(20,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPrepaidAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPrepaidPayable" (
    "id" TEXT NOT NULL,
    "consumptionId" TEXT NOT NULL,
    "sourceOwnerId" TEXT NOT NULL,
    "consumerOwnerId" TEXT NOT NULL,
    "exactAmount" DECIMAL(20,8) NOT NULL,
    "amount" DECIMAL(14,1) NOT NULL,
    "status" "SharedPrepaidPayableStatus" NOT NULL DEFAULT 'PENDING',
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedPrepaidPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPrepaidSettlement" (
    "id" TEXT NOT NULL,
    "accountAId" TEXT NOT NULL,
    "accountBId" TEXT NOT NULL,
    "aToBAmount" DECIMAL(14,1) NOT NULL,
    "bToAAmount" DECIMAL(14,1) NOT NULL,
    "netAmount" DECIMAL(14,1) NOT NULL,
    "payerFrontendUserId" TEXT,
    "receiverFrontendUserId" TEXT,
    "status" "SharedPrepaidSettlementStatus" NOT NULL,
    "actualTransferredAt" TIMESTAMP(3),
    "proofUrls" JSONB NOT NULL,
    "remark" TEXT,
    "createdById" TEXT NOT NULL,
    "paymentSubmittedById" TEXT,
    "paymentSubmittedAt" TIMESTAMP(3),
    "receiptConfirmedById" TEXT,
    "receiptConfirmedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedPrepaidSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPrepaidSettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,1) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPrepaidSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidMember_phone_key" ON "SharedPrepaidMember"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidRecharge_idempotencyKey_key" ON "SharedPrepaidRecharge"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidRecharge_reversedByLedgerId_key" ON "SharedPrepaidRecharge"("reversedByLedgerId");

-- CreateIndex
CREATE INDEX "SharedPrepaidRecharge_memberId_ownerFrontendUserId_recharge_idx" ON "SharedPrepaidRecharge"("memberId", "ownerFrontendUserId", "rechargeDate", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidLedgerEntry_idempotencyKey_key" ON "SharedPrepaidLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SharedPrepaidLedgerEntry_memberId_createdAt_idx" ON "SharedPrepaidLedgerEntry"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "SharedPrepaidLedgerEntry_referenceType_referenceId_idx" ON "SharedPrepaidLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidConsumption_reversalOfId_key" ON "SharedPrepaidConsumption"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidConsumption_idempotencyKey_key" ON "SharedPrepaidConsumption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SharedPrepaidConsumption_memberId_createdAt_idx" ON "SharedPrepaidConsumption"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "SharedPrepaidConsumption_consumingFrontendUserId_createdAt_idx" ON "SharedPrepaidConsumption"("consumingFrontendUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SharedPrepaidConsumption_sampleBlockId_active_idx" ON "SharedPrepaidConsumption"("sampleBlockId", "active");

-- One active normal consumption may exist per sample block.
CREATE UNIQUE INDEX "SharedPrepaidConsumption_one_active_per_block"
ON "SharedPrepaidConsumption" ("sampleBlockId")
WHERE "active" = true AND "kind" = 'CONSUMPTION';

-- CreateIndex
CREATE INDEX "SharedPrepaidAllocation_rechargeId_idx" ON "SharedPrepaidAllocation"("rechargeId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidAllocation_consumptionId_rechargeId_key" ON "SharedPrepaidAllocation"("consumptionId", "rechargeId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidPayable_reversalOfId_key" ON "SharedPrepaidPayable"("reversalOfId");

-- CreateIndex
CREATE INDEX "SharedPrepaidPayable_sourceOwnerId_consumerOwnerId_status_c_idx" ON "SharedPrepaidPayable"("sourceOwnerId", "consumerOwnerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidPayable_consumptionId_sourceOwnerId_consumerOw_key" ON "SharedPrepaidPayable"("consumptionId", "sourceOwnerId", "consumerOwnerId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidSettlement_idempotencyKey_key" ON "SharedPrepaidSettlement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SharedPrepaidSettlement_accountAId_accountBId_status_create_idx" ON "SharedPrepaidSettlement"("accountAId", "accountBId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SharedPrepaidSettlementLine_payableId_releasedAt_idx" ON "SharedPrepaidSettlementLine"("payableId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SharedPrepaidSettlementLine_settlementId_payableId_key" ON "SharedPrepaidSettlementLine"("settlementId", "payableId");

-- One payable may belong to only one unreleased settlement line.
CREATE UNIQUE INDEX "SharedPrepaidSettlementLine_one_active_per_payable"
ON "SharedPrepaidSettlementLine" ("payableId") WHERE "releasedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "SharedPrepaidMember" ADD CONSTRAINT "SharedPrepaidMember_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidRecharge" ADD CONSTRAINT "SharedPrepaidRecharge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SharedPrepaidMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidRecharge" ADD CONSTRAINT "SharedPrepaidRecharge_ownerFrontendUserId_fkey" FOREIGN KEY ("ownerFrontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidRecharge" ADD CONSTRAINT "SharedPrepaidRecharge_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidRecharge" ADD CONSTRAINT "SharedPrepaidRecharge_reversedByLedgerId_fkey" FOREIGN KEY ("reversedByLedgerId") REFERENCES "SharedPrepaidLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidLedgerEntry" ADD CONSTRAINT "SharedPrepaidLedgerEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SharedPrepaidMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidLedgerEntry" ADD CONSTRAINT "SharedPrepaidLedgerEntry_ownerFrontendUserId_fkey" FOREIGN KEY ("ownerFrontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidLedgerEntry" ADD CONSTRAINT "SharedPrepaidLedgerEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidConsumption" ADD CONSTRAINT "SharedPrepaidConsumption_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SharedPrepaidMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidConsumption" ADD CONSTRAINT "SharedPrepaidConsumption_consumingFrontendUserId_fkey" FOREIGN KEY ("consumingFrontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidConsumption" ADD CONSTRAINT "SharedPrepaidConsumption_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidConsumption" ADD CONSTRAINT "SharedPrepaidConsumption_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "LabSheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidConsumption" ADD CONSTRAINT "SharedPrepaidConsumption_sampleBlockId_fkey" FOREIGN KEY ("sampleBlockId") REFERENCES "SampleBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidConsumption" ADD CONSTRAINT "SharedPrepaidConsumption_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "SharedPrepaidConsumption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidAllocation" ADD CONSTRAINT "SharedPrepaidAllocation_consumptionId_fkey" FOREIGN KEY ("consumptionId") REFERENCES "SharedPrepaidConsumption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidAllocation" ADD CONSTRAINT "SharedPrepaidAllocation_rechargeId_fkey" FOREIGN KEY ("rechargeId") REFERENCES "SharedPrepaidRecharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidAllocation" ADD CONSTRAINT "SharedPrepaidAllocation_sourceOwnerId_fkey" FOREIGN KEY ("sourceOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidPayable" ADD CONSTRAINT "SharedPrepaidPayable_consumptionId_fkey" FOREIGN KEY ("consumptionId") REFERENCES "SharedPrepaidConsumption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidPayable" ADD CONSTRAINT "SharedPrepaidPayable_sourceOwnerId_fkey" FOREIGN KEY ("sourceOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidPayable" ADD CONSTRAINT "SharedPrepaidPayable_consumerOwnerId_fkey" FOREIGN KEY ("consumerOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidPayable" ADD CONSTRAINT "SharedPrepaidPayable_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "SharedPrepaidPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_accountAId_fkey" FOREIGN KEY ("accountAId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_accountBId_fkey" FOREIGN KEY ("accountBId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_payerFrontendUserId_fkey" FOREIGN KEY ("payerFrontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_receiverFrontendUserId_fkey" FOREIGN KEY ("receiverFrontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_paymentSubmittedById_fkey" FOREIGN KEY ("paymentSubmittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_receiptConfirmedById_fkey" FOREIGN KEY ("receiptConfirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlement" ADD CONSTRAINT "SharedPrepaidSettlement_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlementLine" ADD CONSTRAINT "SharedPrepaidSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SharedPrepaidSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPrepaidSettlementLine" ADD CONSTRAINT "SharedPrepaidSettlementLine_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "SharedPrepaidPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
