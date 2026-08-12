ALTER TABLE "SharedPrepaidLedgerEntry"
ADD COLUMN "requestFingerprint" TEXT,
ADD COLUMN "responseSnapshot" JSONB,
ADD COLUMN "reason" TEXT;
