-- AddEnumValues
-- PostgreSQL requires enum values to be committed before a later transaction
-- can use them in INSERTs or casts. Keep these additions in their own Prisma
-- migration so the ledger migration may safely migrate existing permissions.
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_RECHARGE';
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_CUSTOMERS';
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_CONSUMPTIONS';
ALTER TYPE "FrontendMenuPermission" ADD VALUE 'PREPAID_SETTLEMENTS';
