-- Add prepaid recharge and usage tracking without touching existing lab, finance, account, or blacklist data.

CREATE TABLE "PrepaidRechargeRecord" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "rechargeDate" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "usableTimes" INTEGER NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepaidRechargeRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrepaidCustomerRemark" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepaidCustomerRemark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrepaidUsageRemark" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "usageDate" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepaidUsageRemark_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrepaidRechargeRecord_frontendUserId_rechargeDate_idx" ON "PrepaidRechargeRecord"("frontendUserId", "rechargeDate");
CREATE INDEX "PrepaidRechargeRecord_frontendUserId_customer_idx" ON "PrepaidRechargeRecord"("frontendUserId", "customer");

CREATE UNIQUE INDEX "PrepaidCustomerRemark_frontendUserId_customer_key" ON "PrepaidCustomerRemark"("frontendUserId", "customer");
CREATE INDEX "PrepaidCustomerRemark_frontendUserId_idx" ON "PrepaidCustomerRemark"("frontendUserId");

CREATE UNIQUE INDEX "PrepaidUsageRemark_frontendUserId_usageDate_customer_key" ON "PrepaidUsageRemark"("frontendUserId", "usageDate", "customer");
CREATE INDEX "PrepaidUsageRemark_frontendUserId_usageDate_idx" ON "PrepaidUsageRemark"("frontendUserId", "usageDate");

ALTER TABLE "PrepaidRechargeRecord" ADD CONSTRAINT "PrepaidRechargeRecord_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrepaidCustomerRemark" ADD CONSTRAINT "PrepaidCustomerRemark_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrepaidUsageRemark" ADD CONSTRAINT "PrepaidUsageRemark_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
