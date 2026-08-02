import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminMedicineInventoryController } from './admin-medicine-inventory.controller'
import { MedicineInventoryController } from './medicine-inventory.controller'
import { MedicineInventoryService } from './medicine-inventory.service'

@Module({
  imports: [AdminModule],
  controllers: [MedicineInventoryController, AdminMedicineInventoryController],
  providers: [MedicineInventoryService],
  exports: [MedicineInventoryService]
})
export class MedicineInventoryModule {}
