-- Phase A: add non-destructive business invariants before the legacy-table cleanup.
-- NOT VALID minimizes the initial lock; VALIDATE still rejects unsafe existing rows.

ALTER TABLE "SharedPrepaidMember"
  ADD CONSTRAINT "SharedPrepaidMember_cachedBalance_bounds"
  CHECK ("cachedBalance" >= 0 AND "cachedBalance" <= 999999999999.99) NOT VALID,
  ADD CONSTRAINT "SharedPrepaidMember_version_positive"
  CHECK ("version" >= 1) NOT VALID;

ALTER TABLE "SharedPrepaidRecharge"
  ADD CONSTRAINT "SharedPrepaidRecharge_amount_invariants"
  CHECK (
    "paidAmount" > 0 AND "paidAmount" <= 999999999999.99
    AND "giftAmount" >= 0 AND "giftAmount" <= 999999999999.99
    AND "totalAmount" > 0 AND "totalAmount" <= 999999999999.99
    AND "remainingAmount" >= 0 AND "remainingAmount" <= 999999999999.99
    AND "totalAmount" = "paidAmount" + "giftAmount"
    AND "remainingAmount" <= "totalAmount"
  ) NOT VALID;

ALTER TABLE "SharedPrepaidLedgerEntry"
  ADD CONSTRAINT "SharedPrepaidLedgerEntry_balanceDelta_bounds"
  CHECK (
    "balanceDelta" <> 0
    AND "balanceDelta" >= -999999999999.99
    AND "balanceDelta" <= 999999999999.99
  ) NOT VALID;

ALTER TABLE "SharedPrepaidConsumption"
  ADD CONSTRAINT "SharedPrepaidConsumption_amount_invariants"
  CHECK (
    "amount" > 0 AND "amount" <= 999999999999.99
    AND "sampleIndex" >= 0
    AND "sampleCountSnapshot" > 0
    AND ("kind" <> 'REVERSAL' OR "active" = FALSE)
  ) NOT VALID;

ALTER TABLE "SharedPrepaidAllocation"
  ADD CONSTRAINT "SharedPrepaidAllocation_amount_invariants"
  CHECK (
    "allocatedAmount" > 0 AND "allocatedAmount" <= 999999999999.99
    AND "paidRatio" > 0 AND "paidRatio" <= 1
    AND "exactTransferAmount" >= 0
    AND "exactTransferAmount" <= 999999999999.99999999
  ) NOT VALID;

ALTER TABLE "SharedPrepaidPayable"
  ADD CONSTRAINT "SharedPrepaidPayable_amount_invariants"
  CHECK (
    "sourceOwnerId" <> "consumerOwnerId"
    AND "exactAmount" >= 0 AND "exactAmount" <= 999999999999.99999999
    AND "amount" >= 0 AND "amount" <= 9999999999999.9
  ) NOT VALID;

ALTER TABLE "SharedPrepaidSettlement"
  ADD CONSTRAINT "SharedPrepaidSettlement_amount_invariants"
  CHECK (
    "accountAId" <> "accountBId"
    AND "aToBAmount" >= 0 AND "aToBAmount" <= 9999999999999.9
    AND "bToAAmount" >= 0 AND "bToAAmount" <= 9999999999999.9
    AND "aToBAmount" + "bToAAmount" <= 9999999999999.9
    AND "netAmount" >= 0 AND "netAmount" <= 9999999999999.9
    AND "netAmount" = ABS("aToBAmount" - "bToAAmount")
    AND (
      ("netAmount" = 0 AND "payerFrontendUserId" IS NULL AND "receiverFrontendUserId" IS NULL)
      OR (
        "netAmount" > 0
        AND "payerFrontendUserId" IS NOT NULL
        AND "receiverFrontendUserId" IS NOT NULL
        AND "payerFrontendUserId" <> "receiverFrontendUserId"
      )
    )
  ) NOT VALID;

ALTER TABLE "SharedPrepaidSettlementLine"
  ADD CONSTRAINT "SharedPrepaidSettlementLine_amount_invariants"
  CHECK (
    "direction" IN ('A_TO_B', 'B_TO_A')
    AND "amount" >= 0 AND "amount" <= 9999999999999.9
  ) NOT VALID;

ALTER TABLE "SharedPrepaidMember"
  VALIDATE CONSTRAINT "SharedPrepaidMember_cachedBalance_bounds",
  VALIDATE CONSTRAINT "SharedPrepaidMember_version_positive";
ALTER TABLE "SharedPrepaidRecharge"
  VALIDATE CONSTRAINT "SharedPrepaidRecharge_amount_invariants";
ALTER TABLE "SharedPrepaidLedgerEntry"
  VALIDATE CONSTRAINT "SharedPrepaidLedgerEntry_balanceDelta_bounds";
ALTER TABLE "SharedPrepaidConsumption"
  VALIDATE CONSTRAINT "SharedPrepaidConsumption_amount_invariants";
ALTER TABLE "SharedPrepaidAllocation"
  VALIDATE CONSTRAINT "SharedPrepaidAllocation_amount_invariants";
ALTER TABLE "SharedPrepaidPayable"
  VALIDATE CONSTRAINT "SharedPrepaidPayable_amount_invariants";
ALTER TABLE "SharedPrepaidSettlement"
  VALIDATE CONSTRAINT "SharedPrepaidSettlement_amount_invariants";
ALTER TABLE "SharedPrepaidSettlementLine"
  VALIDATE CONSTRAINT "SharedPrepaidSettlementLine_amount_invariants";
