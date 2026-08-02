import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AdminAccessService } from '../admin/admin-access.service'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { MedicineMovementQueryDto, parseMedicineMultiValue } from './medicine-inventory.dto'
import { MedicineInventoryService } from './medicine-inventory.service'

type MedicineInventoryQuery = Omit<MedicineMovementQueryDto, 'frontendUserIds' | 'medicineItemIds'> & {
  frontendUserIds?: string | string[]
  medicineItemIds?: string | string[]
}

function movementQuery(query: MedicineInventoryQuery) {
  const medicineItemIds = parseMedicineMultiValue(query.medicineItemIds)
  return {
    ...(medicineItemIds.length ? { medicineItemIds } : {}),
    ...(query.startDate ? { startDate: query.startDate } : {}),
    ...(query.endDate ? { endDate: query.endDate } : {})
  }
}

async function allowedFrontendUserIds(
  adminAccess: AdminAccessService,
  user: CurrentUser,
  query: MedicineInventoryQuery
) {
  return adminAccess.getAllowedFrontendUserIds(user, adminAccess.parseFrontendUserIds(query.frontendUserIds))
}

@Controller('admin/medicine-inventory')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
export class AdminMedicineInventoryController {
  constructor(
    private readonly medicineInventory: MedicineInventoryService,
    private readonly adminAccess: AdminAccessService
  ) {}

  @Get('items')
  async items(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listItems(
      await allowedFrontendUserIds(this.adminAccess, user, query),
      parseMedicineMultiValue(query.medicineItemIds)
    )
  }

  @Get('inbounds')
  async inbounds(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listMovements(
      await allowedFrontendUserIds(this.adminAccess, user, query),
      'inbound',
      movementQuery(query)
    )
  }

  @Get('outbounds')
  async outbounds(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listMovements(
      await allowedFrontendUserIds(this.adminAccess, user, query),
      'outbound',
      movementQuery(query)
    )
  }
}
