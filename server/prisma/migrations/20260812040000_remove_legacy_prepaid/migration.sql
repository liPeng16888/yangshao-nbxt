-- Destructive cutover: deploy only after the backup/restore gates in the runbook pass.
-- Prisma's migration history is the idempotency boundary. The DELETE is replay-safe,
-- but the DROP statements intentionally omit IF EXISTS so schema drift or an unsafe
-- manual replay fails loudly instead of being mistaken for a successful cutover.
BEGIN;

-- Delete logical references before removing their legacy source tables.
DELETE FROM "FinanceDeletionRequest" WHERE "sourceType" = 'PREPAID_RECHARGE';

-- These tables reference "User" only; dropping the leaf tables first removes their
-- foreign keys and indexes without CASCADE and cannot affect ordinary business tables.
DROP TABLE "PrepaidUsageRemark";
DROP TABLE "PrepaidCustomerRemark";
DROP TABLE "PrepaidRechargeRecord";

COMMIT;
