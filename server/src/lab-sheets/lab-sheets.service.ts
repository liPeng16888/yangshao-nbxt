import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { todayInBeijing } from '../common/date'
import { calculateResults, createEmptyInputs, defaultLabParameters, defaultSampleBlockCount, editableInputFields, hasLabDetectionInput } from '../common/lab'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { collapseConsecutiveFieldChanges } from '../common/change-log'

@Injectable()
export class LabSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: LabSheetRealtimeService
  ) {}

  async getSheetForFrontendUser(frontendUserId: string, date = todayInBeijing()) {
    const sheet = await this.ensureSheet(frontendUserId, date)
    return this.toSheetDto(sheet)
  }

  async getDefaultSheetForFrontendUser(frontendUserId: string) {
    return this.toSheetDto(await this.ensureSheet(frontendUserId, todayInBeijing()))
  }

  async updateCurrentParameters(frontendUserId: string, parameters: Record<string, number>, sourceClientId?: string) {
    const sheet = await this.ensureSheet(frontendUserId, todayInBeijing())
    const nextParameters = { ...defaultLabParameters, ...parameters, savedAt: new Date().toISOString() }
    await this.prisma.labSheet.update({ where: { id: sheet.id }, data: { parameters: nextParameters as Prisma.InputJsonValue } })
    this.realtime.publish({
      type: 'parameters-updated',
      frontendUserId,
      date: sheet.date,
      sheetId: sheet.id,
      parameters: nextParameters,
      sourceClientId,
      updatedAt: new Date().toISOString()
    })
    return nextParameters
  }

  async addSampleBlocks(frontendUserId: string, sheetId: string, count: number, sourceClientId?: string) {
    if (!Number.isInteger(count) || count <= 0) throw new ForbiddenException('新增数量必须是正整数')
    const sheet = await this.prisma.labSheet.findUnique({ where: { id: sheetId }, include: { sampleBlocks: true } })
    if (!sheet || sheet.frontendUserId !== frontendUserId) throw new NotFoundException('未找到表格')
    this.assertSheetEditable(sheet)
    const parameters = sheet.parameters as typeof defaultLabParameters
    const start = sheet.sampleBlocks.length + 1
    await this.prisma.sampleBlock.createMany({
      data: Array.from({ length: count }, (_, idx) => {
        const index = start + idx
        const inputs = createEmptyInputs(index)
        return {
          sheetId: sheet.id,
          index,
          readonly: false,
          inputs: inputs as Prisma.InputJsonValue,
          results: calculateResults(inputs, parameters) as Prisma.InputJsonValue,
          parameterSnapshot: parameters as Prisma.InputJsonValue
        }
      })
    })
    const nextSheet = await this.getSheetForFrontendUser(frontendUserId, sheet.date)
    this.realtime.publish({
      type: 'sheet-reloaded',
      frontendUserId,
      date: sheet.date,
      sheetId: sheet.id,
      sheet: nextSheet,
      sourceClientId,
      updatedAt: new Date().toISOString()
    })
    return nextSheet
  }

  async saveSampleBlock(user: CurrentUser, sheetId: string, blockPayload: Record<string, unknown>, sourceClientId?: string) {
    const sheet = await this.prisma.labSheet.findUnique({ where: { id: sheetId } })
    if (!sheet || sheet.frontendUserId !== user.id) throw new NotFoundException('未找到表格')
    this.assertSheetEditable(sheet)
    const blockId = String(blockPayload.id || '')
    const block = await this.prisma.sampleBlock.findUnique({ where: { id: blockId } })
    if (!block || block.sheetId !== sheet.id) throw new NotFoundException('未找到样品')
    const oldInputs = (block.inputs || {}) as Record<string, unknown>
    const changedFields = this.normalizeChangedFields(blockPayload)
    if (!Object.keys(changedFields).length) return this.toBlockDto(block)
    this.assertNoInputConflict(block, blockPayload, changedFields)
    const nextInputs = { ...oldInputs, ...changedFields }
    const sheetParameters = (sheet.parameters || defaultLabParameters) as typeof defaultLabParameters
    const existingSnapshot = (block.parameterSnapshot || sheetParameters) as typeof defaultLabParameters
    const parameters = !hasLabDetectionInput(oldInputs) && hasLabDetectionInput(nextInputs) ? sheetParameters : existingSnapshot
    const results = calculateResults(nextInputs, parameters)
    const saved = await this.prisma.sampleBlock.update({
      where: { id: block.id },
      data: {
        inputs: nextInputs as Prisma.InputJsonValue,
        results: results as Prisma.InputJsonValue,
        parameterSnapshot: parameters as Prisma.InputJsonValue
      }
    })
    await this.recordInputChanges(sheet.id, block.id, sheet.frontendUserId, user.id, oldInputs, nextInputs, blockPayload.changeLogFields)
    const savedDto = this.toBlockDto(saved)
    this.realtime.publish({
      type: 'block-saved',
      frontendUserId: sheet.frontendUserId,
      date: sheet.date,
      sheetId: sheet.id,
      block: savedDto,
      sourceClientId,
      updatedAt: new Date().toISOString()
    })
    return savedDto
  }

  async getHistory(frontendUserId: string) {
    const sheets = await this.prisma.labSheet.findMany({
      where: { frontendUserId },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, readonly: true }
    })
    return sheets.map((sheet) => ({ ...sheet, readonly: this.isReadonlySheet(sheet) }))
  }

  async ensureSheet(frontendUserId: string, date: string) {
    const existing = await this.prisma.labSheet.findUnique({
      where: { frontendUserId_date: { frontendUserId, date } },
      include: { sampleBlocks: { orderBy: { index: 'asc' } } }
    })
    if (existing) return existing
    const initialParameters = await this.getInitialParametersForNewSheet(frontendUserId, date)
    return this.prisma.labSheet.create({
      data: {
        frontendUserId,
        date,
        readonly: false,
        parameters: initialParameters,
        sampleBlocks: {
          create: Array.from({ length: defaultSampleBlockCount }, (_, idx) => {
            const index = idx + 1
            const inputs = createEmptyInputs(index)
            return {
              index,
              readonly: false,
              inputs,
              results: calculateResults(inputs, initialParameters),
              parameterSnapshot: initialParameters
            }
          })
        }
      },
      include: { sampleBlocks: { orderBy: { index: 'asc' } } }
    })
  }

  private async getInitialParametersForNewSheet(frontendUserId: string, date: string) {
    const previousSheet = await this.prisma.labSheet.findFirst({
      where: {
        frontendUserId,
        date: { lt: date }
      },
      orderBy: { date: 'desc' },
      select: { parameters: true }
    })
    return this.normalizeLabParameters(previousSheet?.parameters)
  }

  private normalizeLabParameters(parameters: unknown) {
    if (!this.isPlainObject(parameters)) return { ...defaultLabParameters }
    return Object.entries(defaultLabParameters).reduce<typeof defaultLabParameters>((next, [key, defaultValue]) => {
      const value = parameters[key]
      next[key as keyof typeof defaultLabParameters] = typeof value === 'number' && Number.isFinite(value) ? value : defaultValue
      return next
    }, { ...defaultLabParameters })
  }

  private normalizeChangedFields(blockPayload: Record<string, unknown>) {
    const source =
      this.isPlainObject(blockPayload.changedFields)
        ? (blockPayload.changedFields as Record<string, unknown>)
        : this.isPlainObject(blockPayload.inputs)
          ? (blockPayload.inputs as Record<string, unknown>)
          : {}
    return Object.entries(source).reduce<Record<string, unknown>>((fields, [field, value]) => {
      if (!editableInputFields.includes(field)) return fields
      fields[field] = value ?? null
      return fields
    }, {})
  }

  private assertNoInputConflict(
    block: { updatedAt: Date; inputs: unknown; id: string; index: number; readonly: boolean; results: unknown; parameterSnapshot: unknown },
    blockPayload: Record<string, unknown>,
    changedFields: Record<string, unknown>
  ) {
    const baseUpdatedAt = typeof blockPayload.baseUpdatedAt === 'string' ? Date.parse(blockPayload.baseUpdatedAt) : NaN
    if (!Number.isFinite(baseUpdatedAt) || block.updatedAt.getTime() <= baseUpdatedAt) return
    const currentInputs = (block.inputs || {}) as Record<string, unknown>
    const baseInputs = this.isPlainObject(blockPayload.baseInputs) ? (blockPayload.baseInputs as Record<string, unknown>) : {}
    const conflicts = Object.keys(changedFields).filter((field) => {
      if (!Object.prototype.hasOwnProperty.call(baseInputs, field)) return true
      return !this.isJsonEqual(currentInputs[field] ?? null, baseInputs[field] ?? null)
    })
    if (!conflicts.length) return
    throw new ConflictException({
      message: '该样品格已被另一台设备修改，请确认后再保存',
      fields: conflicts,
      block: this.toBlockDto(block)
    })
  }

  private async recordInputChanges(
    sheetId: string,
    blockId: string,
    frontendUserId: string,
    changedById: string,
    oldInputs: Record<string, unknown>,
    nextInputs: Record<string, unknown>,
    committedFields: unknown
  ) {
    const hasCommittedFields = Array.isArray(committedFields)
    const fields = this.normalizeCommittedFields(committedFields, oldInputs, nextInputs)
    for (const { field, oldValue, newValue } of fields) {
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue
      const lastLog = await this.prisma.cellChangeLog.findFirst({ where: { blockId }, orderBy: { changedAt: 'desc' } })
      if (!hasCommittedFields && lastLog && lastLog.field === field) {
        await this.prisma.cellChangeLog.update({
          where: { id: lastLog.id },
          data: {
            newValue: this.toJsonValue(newValue),
            changedAt: new Date()
          }
        })
      } else {
        await this.prisma.cellChangeLog.create({
          data: {
            sheetId,
            blockId,
            frontendUserId,
            changedById,
            field,
            oldValue: this.toJsonValue(oldValue),
            newValue: this.toJsonValue(newValue)
          }
        })
      }
      const changeCount = await this.countEffectiveFieldChanges(blockId, field)
      if (changeCount < 3) {
        await this.prisma.abnormalRecord.deleteMany({ where: { blockId, field } })
        continue
      }
      const sheet = await this.prisma.labSheet.findUnique({ where: { id: sheetId } })
      await this.prisma.abnormalRecord.upsert({
        where: { blockId_field: { blockId, field } },
        create: {
          sheetId,
          blockId,
          frontendUserId,
          date: sheet?.date || todayInBeijing(),
          field,
          changeCount
        },
        update: { changeCount }
      })
    }
  }

  private normalizeCommittedFields(
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

  private async countEffectiveFieldChanges(blockId: string, field: string) {
    const rows = await this.prisma.cellChangeLog.findMany({
      where: { blockId },
      orderBy: { changedAt: 'asc' },
      select: { field: true, oldValue: true, newValue: true, changedAt: true }
    })
    return collapseConsecutiveFieldChanges(rows, { windowMs: 2000 }).filter((row) => row.field === field).length
  }

  private toSheetDto(sheet: Awaited<ReturnType<LabSheetsService['ensureSheet']>>) {
    const readonly = this.isReadonlySheet(sheet)
    return {
      id: sheet.id,
      date: sheet.date,
      readonly,
      parameters: sheet.parameters,
      sampleBlocks: sheet.sampleBlocks.map((block) => this.toBlockDto(block, readonly))
    }
  }

  private toBlockDto(block: { id: string; index: number; readonly: boolean; updatedAt?: Date; inputs: unknown; results: unknown; parameterSnapshot: unknown }, sheetReadonly = false) {
    return {
      id: block.id,
      index: block.index,
      readonly: sheetReadonly,
      updatedAt: block.updatedAt?.toISOString(),
      inputs: block.inputs,
      results: block.results,
      parameterSnapshot: block.parameterSnapshot
    }
  }

  private assertSheetEditable(sheet: { date: string; readonly: boolean }) {
    if (this.isReadonlySheet(sheet)) throw new ForbiddenException('历史日期表格仅支持查看，不能修改')
  }

  private isReadonlySheet(sheet: { date: string; readonly: boolean }) {
    return sheet.date !== todayInBeijing()
  }

  private hasSheetContent(blocks: Array<{ inputs: unknown }>) {
    return blocks.some((block) => this.hasVisibleSampleBlockInput(block.inputs))
  }

  private hasVisibleSampleBlockInput(inputs: unknown) {
    const row = (inputs || {}) as Record<string, unknown>
    if (hasLabDetectionInput(row)) return true
    return ['sampleNumber', 'customerText', 'price', 'paymentStatus', 'elementNote', 'note'].some((field) => {
      const value = row[field]
      if (typeof value === 'number') return Number.isFinite(value)
      if (typeof value === 'string') return value.trim() !== ''
      return Array.isArray(value) ? value.length > 0 : Boolean(value)
    })
  }

  private toJsonValue(value: unknown) {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
  }

  private isJsonEqual(left: unknown, right: unknown) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
  }
}
