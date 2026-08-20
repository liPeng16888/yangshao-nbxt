import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { businessDateInBeijing } from '../common/date'
import { collapseConsecutiveFieldChanges } from '../common/change-log'
import { editableInputFields } from '../common/lab'

export type RecordLabCellChangesInput = {
  sheetId: string
  blockId: string
  frontendUserId: string
  changedById: string
  oldInputs: Record<string, unknown>
  nextInputs: Record<string, unknown>
  committedFields?: unknown
  changeRequestId?: string
}

@Injectable()
export class LabCellChangeService {
  async record(db: Prisma.TransactionClient, input: RecordLabCellChangesInput): Promise<void> {
    const explicit = Array.isArray(input.committedFields)
    const fields = this.normalizeFields(input.committedFields, input.oldInputs, input.nextInputs)
    for (const change of fields) {
      if (this.isEqual(change.oldValue, change.newValue)) continue
      await this.writeOne(db, input, change, explicit)
      await this.syncAbnormalRecord(db, input, change.field)
    }
  }

  private async writeOne(
    db: Prisma.TransactionClient,
    input: RecordLabCellChangesInput,
    change: { field: string; oldValue: unknown; newValue: unknown },
    explicit: boolean
  ) {
    const lastLog = await db.cellChangeLog.findFirst({ where: { blockId: input.blockId }, orderBy: { changedAt: 'desc' } })
    if (!explicit && !input.changeRequestId && lastLog && lastLog.field === change.field) {
      await db.cellChangeLog.update({
        where: { id: lastLog.id },
        data: {
          newValue: this.toJsonValue(change.newValue),
          changedAt: new Date()
        }
      })
      return
    }
    await db.cellChangeLog.create({
      data: {
        sheetId: input.sheetId,
        blockId: input.blockId,
        frontendUserId: input.frontendUserId,
        changedById: input.changedById,
        field: change.field,
        oldValue: this.toJsonValue(change.oldValue),
        newValue: this.toJsonValue(change.newValue),
        ...(input.changeRequestId ? { changeRequestId: input.changeRequestId } : {})
      }
    })
  }

  private async syncAbnormalRecord(db: Prisma.TransactionClient, input: RecordLabCellChangesInput, field: string) {
    const changeCount = await this.countEffectiveFieldChanges(db, input.blockId, field)
    if (changeCount < 3) {
      await db.abnormalRecord.deleteMany({ where: { blockId: input.blockId, field } })
      return
    }
    const sheet = await db.labSheet.findUnique({ where: { id: input.sheetId } })
    await db.abnormalRecord.upsert({
      where: { blockId_field: { blockId: input.blockId, field } },
      create: {
        sheetId: input.sheetId,
        blockId: input.blockId,
        frontendUserId: input.frontendUserId,
        date: sheet?.date || businessDateInBeijing(),
        field,
        changeCount
      },
      update: { changeCount }
    })
  }

  private normalizeFields(
    committedFields: unknown,
    oldInputs: Record<string, unknown>,
    nextInputs: Record<string, unknown>
  ): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
    if (Array.isArray(committedFields)) {
      const fields: Array<{ field: string; oldValue: unknown; newValue: unknown }> = []
      committedFields.forEach((item) => {
        const row = item as { field?: unknown; oldValue?: unknown; newValue?: unknown }
        const field = String(row.field || '')
        if (!editableInputFields.includes(field)) return
        fields.push({
          field,
          oldValue: row.oldValue ?? null,
          newValue: row.newValue ?? null
        })
      })
      return fields
    }
    return editableInputFields.map((field) => ({
      field,
      oldValue: oldInputs[field] ?? null,
      newValue: nextInputs[field] ?? null
    }))
  }

  private async countEffectiveFieldChanges(db: Prisma.TransactionClient, blockId: string, field: string) {
    const rows = await db.cellChangeLog.findMany({
      where: { blockId },
      orderBy: { changedAt: 'asc' },
      select: { field: true, oldValue: true, newValue: true, changedAt: true }
    })
    return collapseConsecutiveFieldChanges(rows, { windowMs: 2000 }).filter((row) => row.field === field).length
  }

  private toJsonValue(value: unknown) {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
  }

  private isEqual(left: unknown, right: unknown) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
  }
}
