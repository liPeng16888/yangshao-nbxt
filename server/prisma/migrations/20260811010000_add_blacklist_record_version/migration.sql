-- Add an optimistic-concurrency version to existing blacklist rows.
ALTER TABLE "BlacklistRecord"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
