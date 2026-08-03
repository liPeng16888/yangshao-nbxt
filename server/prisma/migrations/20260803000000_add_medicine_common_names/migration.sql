-- Add per-account reusable medicine names without modifying inventory or movement history.

CREATE TABLE "MedicineCommonName" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineCommonName_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicineCommonName_frontendUserId_name_key" ON "MedicineCommonName"("frontendUserId", "name");
CREATE INDEX "MedicineCommonName_frontendUserId_name_idx" ON "MedicineCommonName"("frontendUserId", "name");

ALTER TABLE "MedicineCommonName" ADD CONSTRAINT "MedicineCommonName_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
