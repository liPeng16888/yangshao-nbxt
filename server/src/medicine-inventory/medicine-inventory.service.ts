import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import {
  MedicineMovementType,
  Prisma,
  type MedicineInventoryItem,
  type MedicineInventoryMovement
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'
import {
  CreateMedicineInboundPayload,
  CreateMedicineOutboundPayload,
  MEDICINE_UNIT_LABELS,
  MedicineInventoryItemDto,
  MedicineInventoryMovementDto,
  MedicineCommonNameDto,
  MedicineMovementKind,
  MedicineMovementQuery,
  validateMedicineQuantity
} from './medicine-inventory.types'

@Injectable()
export class MedicineInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: TenantRealtimeService
  ) {}

  async listItems(frontendUserIds: string[], itemIds?: string[]): Promise<MedicineInventoryItemDto[]> {
    const scopedFrontendUserIds = this.uniqueStrings(frontendUserIds)
    if (!scopedFrontendUserIds.length) return []

    const scopedItemIds = this.uniqueStrings(itemIds || [])
    const rows = await this.prisma.medicineInventoryItem.findMany({
      where: {
        frontendUserId: { in: scopedFrontendUserIds },
        ...(scopedItemIds.length ? { id: { in: scopedItemIds } } : {})
      },
      orderBy: [{ name: 'asc' }, { unit: 'asc' }]
    })
    return rows.map((row) => this.itemDto(row))
  }

  async listCommonNames(frontendUserIds: string[]): Promise<MedicineCommonNameDto[]> {
    const scopedFrontendUserIds = this.uniqueStrings(frontendUserIds)
    if (!scopedFrontendUserIds.length) return []
    return this.prisma.medicineCommonName.findMany({
      where: { frontendUserId: { in: scopedFrontendUserIds } },
      orderBy: { name: 'asc' }
    })
  }

  async createCommonName(frontendUserId: string, actorUserIdOrName: string, nameInput?: string): Promise<MedicineCommonNameDto> {
    const actorUserId = nameInput === undefined ? frontendUserId : actorUserIdOrName
    const actualName = nameInput === undefined ? actorUserIdOrName : nameInput
    const accountId = this.requiredString(frontendUserId, '前台账号不能为空')
    const name = this.requiredString(actualName, '请填写常用药品名称')
    const row = await this.prisma.medicineCommonName.upsert({
      where: { frontendUserId_name: { frontendUserId: accountId, name } },
      create: { frontendUserId: accountId, name },
      update: {}
    })
    this.publish(accountId, actorUserId, row.id, 'update', row.updatedAt)
    return row
  }

  async deleteCommonName(frontendUserId: string, actorUserIdOrCommonNameId: string, commonNameId?: string): Promise<void> {
    const actorUserId = commonNameId === undefined ? frontendUserId : actorUserIdOrCommonNameId
    const actualCommonNameId = commonNameId === undefined ? actorUserIdOrCommonNameId : commonNameId
    const accountId = this.requiredString(frontendUserId, '前台账号不能为空')
    const id = this.requiredString(actualCommonNameId, '请选择常用药品名称')
    const result = await this.prisma.medicineCommonName.deleteMany({ where: { id, frontendUserId: accountId } })
    if (!result.count) throw new NotFoundException('未找到当前账号的常用药品名称')
    this.publish(accountId, actorUserId, id, 'delete', new Date())
  }

  async listMovements(
    frontendUserIds: string[],
    kind: MedicineMovementKind,
    query: MedicineMovementQuery
  ): Promise<MedicineInventoryMovementDto[]> {
    const scopedFrontendUserIds = this.uniqueStrings(frontendUserIds)
    if (!scopedFrontendUserIds.length) return []

    const types = kind === 'inbound'
      ? [MedicineMovementType.INBOUND, MedicineMovementType.CORRECTION_OUT]
      : kind === 'outbound'
        ? [MedicineMovementType.OUTBOUND, MedicineMovementType.CORRECTION_IN]
        : null
    if (!types) throw new BadRequestException('药品流水类型无效')

    const medicineItemIds = this.uniqueStrings(query.medicineItemIds || [])
    const startDate = query.startDate ? this.businessDate(query.startDate, '开始日期') : undefined
    const endDate = query.endDate ? this.businessDate(query.endDate, '结束日期') : undefined
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('开始日期不能晚于结束日期')
    }

    const rows = await this.prisma.medicineInventoryMovement.findMany({
      where: {
        frontendUserId: { in: scopedFrontendUserIds },
        type: { in: types },
        ...(medicineItemIds.length ? { medicineItemId: { in: medicineItemIds } } : {}),
        ...(startDate || endDate
          ? { occurredOn: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
          : {})
      },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }]
    })
    return rows.map((row) => this.movementDto(row))
  }

  async createInbound(frontendUserId: string, actorUserIdOrPayload: string | CreateMedicineInboundPayload, maybePayload?: CreateMedicineInboundPayload) {
    const actorUserId = typeof actorUserIdOrPayload === 'string' ? actorUserIdOrPayload : frontendUserId
    const payload = typeof actorUserIdOrPayload === 'string' ? maybePayload! : actorUserIdOrPayload
    const accountId = this.requiredString(frontendUserId, '前台账号不能为空')
    const occurredOn = this.businessDate(payload.occurredOn, '入库日期')
    const name = this.requiredString(payload.name, '请填写药品名称')
    const quantity = this.quantityDecimal(payload.unit, payload.quantity)
    const remark = this.optionalString(payload.remark)

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const item = await tx.medicineInventoryItem.upsert({
          where: {
            frontendUserId_name_unit: {
              frontendUserId: accountId,
              name,
              unit: payload.unit
            }
          },
          create: {
            frontendUserId: accountId,
            name,
            unit: payload.unit,
            currentQuantity: quantity
          },
          update: {
            currentQuantity: { increment: quantity }
          }
        })
        const movement = await tx.medicineInventoryMovement.create({
          data: {
            frontendUserId: accountId,
            medicineItemId: item.id,
            type: MedicineMovementType.INBOUND,
            occurredOn,
            quantity,
            nameSnapshot: item.name,
            unitSnapshot: item.unit,
            remark
          }
        })
        return {
          item: this.itemDto(item),
          movement: this.movementDto(movement)
        }
      })
      this.publish(accountId, actorUserId, result.movement.id, 'create', new Date(result.movement.createdAt))
      return result
    } catch (error) {
      if (this.isQuantityRangeViolation(error)) {
        throw new ConflictException('库存数量超出允许范围，请核对当前库存和本次入库数量')
      }
      throw error
    }
  }

  async createOutbound(frontendUserId: string, actorUserIdOrPayload: string | CreateMedicineOutboundPayload, maybePayload?: CreateMedicineOutboundPayload) {
    const actorUserId = typeof actorUserIdOrPayload === 'string' ? actorUserIdOrPayload : frontendUserId
    const payload = typeof actorUserIdOrPayload === 'string' ? maybePayload! : actorUserIdOrPayload
    const accountId = this.requiredString(frontendUserId, '前台账号不能为空')
    const occurredOn = this.businessDate(payload.occurredOn, '出库日期')
    const medicineItemId = this.requiredString(payload.medicineItemId, '请选择出库药品')
    const remark = this.optionalString(payload.remark)

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.medicineInventoryItem.findFirst({
        where: { id: medicineItemId, frontendUserId: accountId }
      })
      if (!item) throw new NotFoundException('未找到当前账号的药品库存')

      const quantity = this.quantityDecimal(item.unit, payload.quantity)
      const updated = await tx.medicineInventoryItem.updateMany({
        where: {
          id: medicineItemId,
          frontendUserId: accountId,
          currentQuantity: { gte: quantity }
        },
        data: { currentQuantity: { decrement: quantity } }
      })

      if (updated.count !== 1) {
        const latest = await tx.medicineInventoryItem.findFirst({
          where: { id: medicineItemId, frontendUserId: accountId }
        })
        if (!latest) throw new NotFoundException('未找到当前账号的药品库存')
        throw new ConflictException(
          `库存不足，当前库存为 ${latest.currentQuantity.toString()} ${MEDICINE_UNIT_LABELS[latest.unit]}`
        )
      }

      const movement = await tx.medicineInventoryMovement.create({
        data: {
          frontendUserId: accountId,
          medicineItemId,
          type: MedicineMovementType.OUTBOUND,
          occurredOn,
          quantity,
          nameSnapshot: item.name,
          unitSnapshot: item.unit,
          remark
        }
      })
      const currentItem = await tx.medicineInventoryItem.findFirst({
        where: { id: medicineItemId, frontendUserId: accountId }
      })
      if (!currentItem) throw new NotFoundException('未找到当前账号的药品库存')

      return {
        item: this.itemDto(currentItem),
        movement: this.movementDto(movement)
      }
    })
    this.publish(accountId, actorUserId, result.movement.id, 'create', new Date(result.movement.createdAt))
    return result
  }

  async createCorrection(frontendUserId: string, actorUserIdOrMovementId: string, movementIdOrReason: string, maybeReason?: string) {
    const actorUserId = maybeReason === undefined ? frontendUserId : actorUserIdOrMovementId
    const movementId = maybeReason === undefined ? actorUserIdOrMovementId : movementIdOrReason
    const reason = maybeReason === undefined ? movementIdOrReason : maybeReason
    const accountId = this.requiredString(frontendUserId, '前台账号不能为空')
    const originalMovementId = this.requiredString(movementId, '请选择要更正的流水')
    const correctionReason = this.requiredString(reason, '请填写更正原因')

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const original = await tx.medicineInventoryMovement.findFirst({
          where: { id: originalMovementId, frontendUserId: accountId },
          include: { correctionMovement: { select: { id: true } } }
        })
        if (!original) throw new NotFoundException('未找到当前账号的药品流水')
        if (
          original.correctionOfId ||
          original.type === MedicineMovementType.CORRECTION_IN ||
          original.type === MedicineMovementType.CORRECTION_OUT
        ) {
          throw new ConflictException('更正流水不能再次更正')
        }
        if (original.correctionMovement) {
          throw new ConflictException('该流水已更正，不能重复更正')
        }

        const correctionType = original.type === MedicineMovementType.OUTBOUND
          ? MedicineMovementType.CORRECTION_IN
          : MedicineMovementType.CORRECTION_OUT
        const stockUpdate = correctionType === MedicineMovementType.CORRECTION_IN
          ? await tx.medicineInventoryItem.updateMany({
              where: { id: original.medicineItemId, frontendUserId: accountId },
              data: { currentQuantity: { increment: original.quantity } }
            })
          : await tx.medicineInventoryItem.updateMany({
              where: {
                id: original.medicineItemId,
                frontendUserId: accountId,
                currentQuantity: { gte: original.quantity }
              },
              data: { currentQuantity: { decrement: original.quantity } }
            })

        if (stockUpdate.count !== 1) {
          const latest = await tx.medicineInventoryItem.findFirst({
            where: { id: original.medicineItemId, frontendUserId: accountId }
          })
          if (!latest) throw new NotFoundException('未找到当前账号的药品库存')
          throw new ConflictException(
            `库存不足，当前库存为 ${latest.currentQuantity.toString()} ${MEDICINE_UNIT_LABELS[latest.unit]}，无法更正该入库流水`
          )
        }

        const correction = await tx.medicineInventoryMovement.create({
          data: {
            frontendUserId: accountId,
            medicineItemId: original.medicineItemId,
            type: correctionType,
            occurredOn: original.occurredOn,
            quantity: original.quantity,
            nameSnapshot: original.nameSnapshot,
            unitSnapshot: original.unitSnapshot,
            remark: correctionReason,
            correctionOfId: original.id
          }
        })
        const currentItem = await tx.medicineInventoryItem.findFirst({
          where: { id: original.medicineItemId, frontendUserId: accountId }
        })
        if (!currentItem) throw new NotFoundException('未找到当前账号的药品库存')

        return {
          item: this.itemDto(currentItem),
          movement: this.movementDto(correction)
        }
      })
      this.publish(accountId, actorUserId, result.movement.id, 'create', new Date(result.movement.createdAt))
      return result
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('该流水已更正，不能重复更正')
      }
      if (this.isQuantityRangeViolation(error)) {
        throw new ConflictException('库存数量超出允许范围，无法完成更正')
      }
      throw error
    }
  }

  private itemDto(row: MedicineInventoryItem): MedicineInventoryItemDto {
    return {
      ...row,
      unitLabel: MEDICINE_UNIT_LABELS[row.unit],
      currentQuantity: row.currentQuantity.toNumber()
    }
  }

  private movementDto(row: MedicineInventoryMovement): MedicineInventoryMovementDto {
    return {
      ...row,
      unitLabel: MEDICINE_UNIT_LABELS[row.unitSnapshot],
      quantity: row.quantity.toNumber()
    }
  }

  private publish(dataOwnerId: string, changedById: string, entityId: string, operation: 'create' | 'update' | 'delete', updatedAt: Date) {
    this.realtime?.publish({ dataOwnerId, module: 'medicine-inventory', entityId, operation, changedById, updatedAt: updatedAt.toISOString() })
  }

  private quantityDecimal(unit: MedicineInventoryItem['unit'], input: unknown) {
    const result = validateMedicineQuantity(unit, input)
    if (!result.ok) throw new BadRequestException(result.message)
    return new Prisma.Decimal(result.value)
  }

  private requiredString(value: unknown, message: string) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized) throw new BadRequestException(message)
    return normalized
  }

  private optionalString(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized || null
  }

  private businessDate(value: unknown, label: string) {
    const normalized = this.requiredString(value, `请填写${label}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(`${label}必须为 YYYY-MM-DD 格式`)
    }
    const date = new Date(`${normalized}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
      throw new BadRequestException(`${label}无效`)
    }
    return normalized
  }

  private isUniqueConstraintViolation(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
  }

  private isQuantityRangeViolation(error: unknown) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'P2000' || error.code === 'P2020')
    )
  }

  private uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
  }
}
