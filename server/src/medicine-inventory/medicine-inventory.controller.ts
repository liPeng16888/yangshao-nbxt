import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import {
  CreateMedicineCorrectionDto,
  CreateMedicineInboundDto,
  CreateMedicineOutboundDto,
  MedicineMovementQueryDto,
  parseMedicineMultiValue
} from './medicine-inventory.dto'
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

@Controller('medicine-inventory')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
export class MedicineInventoryController {
  constructor(private readonly medicineInventory: MedicineInventoryService) {}

  @Get('items')
  @FrontendPermission('MEDICINE_STOCK')
  items(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listItems([user.dataOwnerId], parseMedicineMultiValue(query.medicineItemIds))
  }

  @Get('common-names')
  @FrontendPermission('MEDICINE_INBOUND')
  commonNames(@CurrentUserInfo() user: CurrentUser) {
    return this.medicineInventory.listCommonNames([user.dataOwnerId])
  }

  @Post('common-names')
  @FrontendPermission('MEDICINE_INBOUND')
  createCommonName(@CurrentUserInfo() user: CurrentUser, @Body('name') name: string) {
    return this.medicineInventory.createCommonName(user.dataOwnerId, user.id, name)
  }

  @Delete('common-names/:id')
  @FrontendPermission('MEDICINE_INBOUND')
  async deleteCommonName(@CurrentUserInfo() user: CurrentUser, @Param('id') commonNameId: string) {
    await this.medicineInventory.deleteCommonName(user.dataOwnerId, user.id, commonNameId)
  }

  @Get('inbounds')
  @FrontendPermission('MEDICINE_INBOUND')
  inbounds(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listMovements([user.dataOwnerId], 'inbound', movementQuery(query))
  }

  @Post('inbounds')
  @FrontendPermission('MEDICINE_INBOUND')
  createInbound(@CurrentUserInfo() user: CurrentUser, @Body() body: CreateMedicineInboundDto) {
    return this.medicineInventory.createInbound(user.dataOwnerId, user.id, {
      occurredOn: body.occurredOn,
      name: body.name,
      unit: body.unit,
      quantity: body.quantity,
      remark: body.remark
    })
  }

  @Get('outbounds')
  @FrontendPermission('MEDICINE_OUTBOUND')
  outbounds(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listMovements([user.dataOwnerId], 'outbound', movementQuery(query))
  }

  @Post('outbounds')
  @FrontendPermission('MEDICINE_OUTBOUND')
  createOutbound(@CurrentUserInfo() user: CurrentUser, @Body() body: CreateMedicineOutboundDto) {
    return this.medicineInventory.createOutbound(user.dataOwnerId, user.id, {
      occurredOn: body.occurredOn,
      medicineItemId: body.medicineItemId,
      quantity: body.quantity,
      remark: body.remark
    })
  }

  @Post('movements/:id/corrections')
  @FrontendPermission('MEDICINE_INBOUND', 'MEDICINE_OUTBOUND')
  createCorrection(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') movementId: string,
    @Body() body: CreateMedicineCorrectionDto
  ) {
    return this.medicineInventory.createCorrection(user.dataOwnerId, user.id, movementId, body.reason)
  }
}
