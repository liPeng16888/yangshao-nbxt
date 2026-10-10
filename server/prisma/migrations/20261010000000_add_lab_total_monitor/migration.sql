CREATE TABLE "LabTotalMonitorSetting" (
    "frontendUserId" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabTotalMonitorSetting_pkey" PRIMARY KEY ("frontendUserId")
);
ALTER TABLE "LabTotalMonitorSetting" ADD CONSTRAINT "LabTotalMonitorSetting_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabTotalMonitorSetting" ADD CONSTRAINT "LabTotalMonitorSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
