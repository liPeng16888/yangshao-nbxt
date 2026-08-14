CREATE TYPE "FrontendPreferenceSection" AS ENUM ('LAB_REPORT_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE', 'LAB_REPORT_SAMPLE_UNITS', 'LAB_ELEMENT_GROUPS');
CREATE TABLE "FrontendBusinessPreference" (
  "id" TEXT NOT NULL,
  "frontendUserId" TEXT NOT NULL,
  "section" "FrontendPreferenceSection" NOT NULL,
  "value" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FrontendBusinessPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FrontendBusinessPreference_frontendUserId_section_key" ON "FrontendBusinessPreference"("frontendUserId", "section");
CREATE INDEX "FrontendBusinessPreference_frontendUserId_idx" ON "FrontendBusinessPreference"("frontendUserId");
CREATE INDEX "FrontendBusinessPreference_updatedById_idx" ON "FrontendBusinessPreference"("updatedById");
ALTER TABLE "FrontendBusinessPreference" ADD CONSTRAINT "FrontendBusinessPreference_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FrontendBusinessPreference" ADD CONSTRAINT "FrontendBusinessPreference_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
