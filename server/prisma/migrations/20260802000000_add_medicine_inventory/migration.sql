-- Add medicine inventory structure without changing existing data.

CREATE TYPE "MedicineUnit" AS ENUM ('BOTTLE', 'LITER', 'MILLILITER', 'GRAM');
CREATE TYPE "MedicineMovementType" AS ENUM ('INBOUND', 'OUTBOUND', 'CORRECTION_IN', 'CORRECTION_OUT');

CREATE TABLE "MedicineInventoryItem" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "MedicineUnit" NOT NULL,
    "currentQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicineInventoryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MedicineInventoryItem_currentQuantity_check" CHECK ("currentQuantity" >= 0)
);

CREATE TABLE "MedicineInventoryMovement" (
    "id" TEXT NOT NULL,
    "frontendUserId" TEXT NOT NULL,
    "medicineItemId" TEXT NOT NULL,
    "type" "MedicineMovementType" NOT NULL,
    "occurredOn" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "unitSnapshot" "MedicineUnit" NOT NULL,
    "remark" TEXT,
    "correctionOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineInventoryMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MedicineInventoryMovement_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "MedicineInventoryItem_frontendUserId_name_unit_key" ON "MedicineInventoryItem"("frontendUserId", "name", "unit");
CREATE INDEX "MedicineInventoryItem_frontendUserId_name_idx" ON "MedicineInventoryItem"("frontendUserId", "name");

CREATE UNIQUE INDEX "MedicineInventoryMovement_correctionOfId_key" ON "MedicineInventoryMovement"("correctionOfId");
CREATE INDEX "MedicineInventoryMovement_frontendUserId_occurredOn_idx" ON "MedicineInventoryMovement"("frontendUserId", "occurredOn");
CREATE INDEX "MedicineInventoryMovement_medicineItemId_occurredOn_idx" ON "MedicineInventoryMovement"("medicineItemId", "occurredOn");

ALTER TABLE "MedicineInventoryItem" ADD CONSTRAINT "MedicineInventoryItem_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineInventoryMovement" ADD CONSTRAINT "MedicineInventoryMovement_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineInventoryMovement" ADD CONSTRAINT "MedicineInventoryMovement_medicineItemId_fkey" FOREIGN KEY ("medicineItemId") REFERENCES "MedicineInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineInventoryMovement" ADD CONSTRAINT "MedicineInventoryMovement_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "MedicineInventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
