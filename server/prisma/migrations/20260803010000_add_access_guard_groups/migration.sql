-- Replace the legacy shared access-password configuration with account-scoped access groups.

CREATE TYPE "AccessGuardFeature" AS ENUM (
  'FINANCE',
  'REPORTS',
  'BLACKLIST',
  'HISTORICAL_DATES',
  'MEDICINE_INVENTORY',
  'CUSTOMER_OVERVIEW',
  'COMPLETED_SAMPLE_DATA'
);

CREATE TABLE "AccessGuardGroup" (
  "id" TEXT NOT NULL,
  "frontendUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "ttlMinutes" INTEGER NOT NULL DEFAULT 5,
  "password" TEXT NOT NULL,
  "recoveryPrompt" TEXT NOT NULL,
  "recoveryAnswer" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccessGuardGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessGuardGroupFeature" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "frontendUserId" TEXT NOT NULL,
  "feature" "AccessGuardFeature" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccessGuardGroupFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessGuardGroup_frontendUserId_name_key" ON "AccessGuardGroup"("frontendUserId", "name");
CREATE INDEX "AccessGuardGroup_frontendUserId_idx" ON "AccessGuardGroup"("frontendUserId");
CREATE UNIQUE INDEX "AccessGuardGroupFeature_frontendUserId_feature_key" ON "AccessGuardGroupFeature"("frontendUserId", "feature");
CREATE UNIQUE INDEX "AccessGuardGroupFeature_groupId_feature_key" ON "AccessGuardGroupFeature"("groupId", "feature");
CREATE INDEX "AccessGuardGroupFeature_groupId_idx" ON "AccessGuardGroupFeature"("groupId");

ALTER TABLE "AccessGuardGroup" ADD CONSTRAINT "AccessGuardGroup_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessGuardGroupFeature" ADD CONSTRAINT "AccessGuardGroupFeature_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccessGuardGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessGuardGroupFeature" ADD CONSTRAINT "AccessGuardGroupFeature_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
