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
    CONSTRAINT "MedicineInventoryItem_currentQuantity_nonnegative_check" CHECK ("currentQuantity" >= 0),
    CONSTRAINT "MedicineInventoryItem_bottleQuantity_integer_check" CHECK ("unit" <> 'BOTTLE' OR "currentQuantity" = trunc("currentQuantity"))
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
    CONSTRAINT "MedicineInventoryMovement_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "MedicineInventoryMovement_bottleQuantity_integer_check" CHECK ("unitSnapshot" <> 'BOTTLE' OR "quantity" = trunc("quantity"))
);

CREATE UNIQUE INDEX "MedicineInventoryItem_frontendUserId_name_unit_key" ON "MedicineInventoryItem"("frontendUserId", "name", "unit");
CREATE UNIQUE INDEX "MedicineInventoryItem_id_frontendUserId_key" ON "MedicineInventoryItem"("id", "frontendUserId");
CREATE INDEX "MedicineInventoryItem_frontendUserId_name_idx" ON "MedicineInventoryItem"("frontendUserId", "name");

CREATE UNIQUE INDEX "MedicineInventoryMovement_correctionOfId_key" ON "MedicineInventoryMovement"("correctionOfId");
CREATE INDEX "MedicineInventoryMovement_frontendUserId_occurredOn_idx" ON "MedicineInventoryMovement"("frontendUserId", "occurredOn");
CREATE INDEX "MedicineInventoryMovement_medicineItemId_occurredOn_idx" ON "MedicineInventoryMovement"("medicineItemId", "occurredOn");

ALTER TABLE "MedicineInventoryItem" ADD CONSTRAINT "MedicineInventoryItem_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineInventoryMovement" ADD CONSTRAINT "MedicineInventoryMovement_frontendUserId_fkey" FOREIGN KEY ("frontendUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineInventoryMovement" ADD CONSTRAINT "MedicineInventoryMovement_medicineItemId_frontendUserId_fkey" FOREIGN KEY ("medicineItemId", "frontendUserId") REFERENCES "MedicineInventoryItem"("id", "frontendUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineInventoryMovement" ADD CONSTRAINT "MedicineInventoryMovement_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "MedicineInventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
