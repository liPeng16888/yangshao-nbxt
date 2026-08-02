import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
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
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
export class MedicineInventoryController {
  constructor(private readonly medicineInventory: MedicineInventoryService) {}

  @Get('items')
  items(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listItems([user.id], parseMedicineMultiValue(query.medicineItemIds))
  }

  @Get('inbounds')
  inbounds(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listMovements([user.id], 'inbound', movementQuery(query))
  }

  @Post('inbounds')
  createInbound(@CurrentUserInfo() user: CurrentUser, @Body() body: CreateMedicineInboundDto) {
    return this.medicineInventory.createInbound(user.id, {
      occurredOn: body.occurredOn,
      name: body.name,
      unit: body.unit,
      quantity: body.quantity,
      remark: body.remark
    })
  }

  @Get('outbounds')
  outbounds(@CurrentUserInfo() user: CurrentUser, @Query() query: MedicineInventoryQuery) {
    return this.medicineInventory.listMovements([user.id], 'outbound', movementQuery(query))
  }

  @Post('outbounds')
  createOutbound(@CurrentUserInfo() user: CurrentUser, @Body() body: CreateMedicineOutboundDto) {
    return this.medicineInventory.createOutbound(user.id, {
      occurredOn: body.occurredOn,
      medicineItemId: body.medicineItemId,
      quantity: body.quantity,
      remark: body.remark
    })
  }

  @Post('movements/:id/corrections')
  createCorrection(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') movementId: string,
    @Body() body: CreateMedicineCorrectionDto
  ) {
    return this.medicineInventory.createCorrection(user.id, movementId, body.reason)
  }
}
