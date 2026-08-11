import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { businessDateInBeijing } from '../common/date'
import { calculateResults, createEmptyInputs, defaultLabParameters, defaultSampleBlockCount, editableInputFields, hasLabDetectionInput } from '../common/lab'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { collapseConsecutiveFieldChanges } from '../common/change-log'
import {
  SharedPrepaidLedgerService,
  type SharedPrepaidSampleMutation
} from '../shared-prepaid/shared-prepaid-ledger.service'
import { SharedPrepaidRealtimeService } from '../shared-prepaid/shared-prepaid-realtime.service'

const prepaidTupleFields = ['paymentStatus', 'price', 'prepaidMemberId', 'prepaidMemberPhone']

type LabSaveResponse = Record<string, unknown>
type LabSaveRequestRow = {
  idempotencyKey: string
  requestFingerprint: string
  sheetId: string
  sampleBlockId: string
  responseSnapshot: unknown
}
type LabSaveRequestReader = {
  labSampleSaveRequest: {
    findUnique(args: { where: { idempotencyKey: string } }): Promise<LabSaveRequestRow | null>
  }
}
type LabSaveRequestWriter = LabSaveRequestReader & {
  labSampleSaveRequest: LabSaveRequestReader['labSampleSaveRequest'] & {
    create(args: { data: LabSaveRequestRow }): Promise<LabSaveRequestRow>
  }
}

@Injectable()
export class LabSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: LabSheetRealtimeService,
    private readonly sharedPrepaid: SharedPrepaidLedgerService,
    private readonly sharedPrepaidRealtime: SharedPrepaidRealtimeService
  ) {}

  async getSheetForFrontendUser(frontendUserId: string, date = businessDateInBeijing(), canViewCompletedSensitiveData = true) {
    const sheet = await this.ensureSheet(frontendUserId, date)
    return this.toSheetDto(sheet, canViewCompletedSensitiveData)
  }

  async getDefaultSheetForFrontendUser(frontendUserId: string, canViewCompletedSensitiveData = true) {
    return this.toSheetDto(await this.ensureSheet(frontendUserId, businessDateInBeijing()), canViewCompletedSensitiveData)
  }

  async updateCurrentParameters(frontendUserId: string, parameters: Record<string, number>, sourceClientId?: string, actorUserId = frontendUserId) {
    const sheet = await this.ensureSheet(frontendUserId, businessDateInBeijing())
    const nextParameters = { ...defaultLabParameters, ...parameters, savedAt: new Date().toISOString() }
    await this.prisma.labSheet.update({ where: { id: sheet.id }, data: { parameters: nextParameters as Prisma.InputJsonValue } })
    this.realtime.publish({
      type: 'parameters-updated',
      frontendUserId,
      date: sheet.date,
      sheetId: sheet.id,
      parameters: nextParameters,
      sourceClientId,
      changedById: actorUserId,
      updatedAt: new Date().toISOString()
    })
    return nextParameters
  }

  async applyCurrentParametersFromIndex(
    frontendUserId: string,
    payload: unknown,
    sourceClientId?: string,
    canViewCompletedSensitiveData = false,
    actorUserId = frontendUserId
  ) {
    if (!this.isPlainObject(payload)) throw new BadRequestException('请求格式不正确')
    const startIndex = payload.startIndex
    if (typeof startIndex !== 'number' || !Number.isInteger(startIndex) || startIndex <= 0) {
      throw new BadRequestException('起始样品编号必须是正整数')
    }
    const parameters = this.requireCompleteLabParameters(payload.parameters)
    const current = await this.ensureSheet(frontendUserId, businessDateInBeijing())
    this.assertSheetEditable(current)
    const nextParameters = { ...parameters, savedAt: new Date().toISOString() }

    const updatedSheet = await this.withSheetWriteLock(current.id, async (tx) => {
      const sheet = await tx.labSheet.findUnique({
        where: { id: current.id },
        include: { sampleBlocks: { orderBy: { index: 'asc' } } }
      })
      if (!sheet || sheet.frontendUserId !== frontendUserId) throw new NotFoundException('未找到表格')
      this.assertSheetEditable(sheet)
      if (!sheet.sampleBlocks.some((block) => block.index === startIndex)) {
        throw new BadRequestException('起始样品不存在，请刷新后重新选择')
      }
      const segmentedSnapshot = { ...nextParameters, segmentedApplication: true }
      await tx.labSheet.update({
        where: { id: sheet.id },
        data: { parameters: nextParameters as Prisma.InputJsonValue }
      })
      for (const block of sheet.sampleBlocks.filter((item) => item.index < startIndex && !hasLabDetectionInput(item.inputs as Record<string, unknown>))) {
        await tx.sampleBlock.update({
          where: { id: block.id },
          data: {
            parameterSnapshot: {
              ...((block.parameterSnapshot || sheet.parameters) as Record<string, unknown>),
              segmentedApplication: true
            } as Prisma.InputJsonValue
          }
        })
      }
      for (const block of sheet.sampleBlocks.filter((item) => item.index >= startIndex)) {
        await tx.sampleBlock.update({
          where: { id: block.id },
          data: {
            parameterSnapshot: segmentedSnapshot as Prisma.InputJsonValue,
            results: calculateResults(block.inputs as Record<string, unknown>, nextParameters) as Prisma.InputJsonValue
          }
        })
      }
      const reloaded = await tx.labSheet.findUnique({
        where: { id: sheet.id },
        include: { sampleBlocks: { orderBy: { index: 'asc' } } }
      })
      if (!reloaded) throw new NotFoundException('未找到表格')
      return reloaded
    })

    const dto = this.toSheetDto(updatedSheet, canViewCompletedSensitiveData)
    this.realtime.publish({
      type: 'sheet-reloaded',
      frontendUserId,
      date: dto.date,
      sheetId: dto.id,
      sourceClientId,
      changedById: actorUserId,
      updatedAt: new Date().toISOString()
    })
    return dto
  }

  async addSampleBlocks(
    frontendUserId: string,
    sheetId: string,
    count: number,
    sourceClientId?: string,
    canViewCompletedSensitiveData = false,
    actorUserId = frontendUserId
  ) {
    if (!Number.isInteger(count) || count <= 0) throw new ForbiddenException('新增数量必须是正整数')
    const updatedSheet = await this.withSheetWriteLock(sheetId, async (tx) => {
      const sheet = await tx.labSheet.findUnique({
        where: { id: sheetId },
        include: { sampleBlocks: { orderBy: { index: 'asc' } } }
      })
      if (!sheet || sheet.frontendUserId !== frontendUserId) throw new NotFoundException('未找到表格')
      this.assertSheetEditable(sheet)
      const parameters = sheet.parameters as typeof defaultLabParameters
      const start = Math.max(0, ...sheet.sampleBlocks.map((block) => block.index)) + 1
      await tx.sampleBlock.createMany({
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
      const reloaded = await tx.labSheet.findUnique({
        where: { id: sheet.id },
        include: { sampleBlocks: { orderBy: { index: 'asc' } } }
      })
      if (!reloaded) throw new NotFoundException('未找到表格')
      return reloaded
    })
    const nextSheet = this.toSheetDto(updatedSheet, canViewCompletedSensitiveData)
    this.realtime.publish({
      type: 'sheet-reloaded',
      frontendUserId,
      date: nextSheet.date,
      sheetId: nextSheet.id,
      sourceClientId,
      changedById: actorUserId,
      updatedAt: new Date().toISOString()
    })
    return nextSheet
  }

  async saveSampleBlock(user: CurrentUser, sheetId: string, blockPayload: Record<string, unknown>, sourceClientId?: string, canViewCompletedSensitiveData = true) {
    const blockId = String(blockPayload.id || '')
    const dataOwnerId = user.dataOwnerId || user.id
    const idempotencyKey = this.requireLabSaveIdempotencyKey(blockPayload.idempotencyKey)
    const requestFingerprint = this.labSaveRequestFingerprint({
      actorUserId: user.id,
      dataOwnerId,
      sheetId,
      canViewCompletedSensitiveData,
      blockPayload
    })
    let outcome: {
      response: LabSaveResponse
      sheet?: { frontendUserId: string; date: string }
      changed: boolean
      prepaidMutation?: SharedPrepaidSampleMutation | null
    }
    try {
      outcome = await this.withSheetWriteLock(sheetId, idempotencyKey, async (tx) => {
        const sheet = await tx.labSheet.findUnique({ where: { id: sheetId } })
        if (!sheet || sheet.frontendUserId !== dataOwnerId) throw new NotFoundException('未找到表格')
        const duplicate = await this.resolveLabSaveRequest(tx as unknown as LabSaveRequestReader, idempotencyKey, requestFingerprint)
        if (duplicate) return { response: duplicate, changed: false }
        this.assertSheetEditable(sheet)
        const block = await tx.sampleBlock.findUnique({ where: { id: blockId } })
        if (!block || block.sheetId !== sheet.id) throw new NotFoundException('未找到样品')
        const oldInputs = (block.inputs || {}) as Record<string, unknown>
        const changedFields = this.normalizeChangedFields(blockPayload)
        if (!Object.keys(changedFields).length) {
          const response = this.toStableBlockDto(block, canViewCompletedSensitiveData)
          await this.createLabSaveRequest(tx as unknown as LabSaveRequestWriter, {
            idempotencyKey, requestFingerprint, sheetId: sheet.id, sampleBlockId: block.id, responseSnapshot: response
          })
          return { response, sheet, changed: false }
        }
        const effectiveChangedFields = Object.entries(changedFields).reduce<Record<string, unknown>>((fields, [field, value]) => {
          if (!this.isJsonEqual(oldInputs[field] ?? null, value ?? null)) fields[field] = value
          return fields
        }, {})
        if (!Object.keys(effectiveChangedFields).length) {
          const response = this.toStableBlockDto(block, canViewCompletedSensitiveData)
          await this.createLabSaveRequest(tx as unknown as LabSaveRequestWriter, {
            idempotencyKey, requestFingerprint, sheetId: sheet.id, sampleBlockId: block.id, responseSnapshot: response
          })
          return { response, sheet, changed: false }
        }
        this.assertNoInputConflict(block, blockPayload, effectiveChangedFields)
        const nextInputs = { ...oldInputs, ...effectiveChangedFields }
        let prepaidMutation: SharedPrepaidSampleMutation | null = null
        const prepaidTupleChanged = prepaidTupleFields.some((field) => (
          Object.prototype.hasOwnProperty.call(effectiveChangedFields, field)
        ))
        if (prepaidTupleChanged && (oldInputs.paymentStatus === '预存款' || nextInputs.paymentStatus === '预存款')) {
          prepaidMutation = await this.sharedPrepaid.syncSampleConsumption(tx, {
            sheetId: sheet.id,
            sampleBlockId: block.id,
            sampleIndex: block.index,
            sheetDate: sheet.date,
            consumingFrontendUserId: dataOwnerId,
            actorUserId: user.id,
            oldInputs,
            nextInputs,
            idempotencyKey
          })
        }
        const sheetParameters = (sheet.parameters || defaultLabParameters) as typeof defaultLabParameters
        const existingSnapshot = (block.parameterSnapshot || sheetParameters) as typeof defaultLabParameters
        const firstDetectionInput = !hasLabDetectionInput(oldInputs) && hasLabDetectionInput(nextInputs)
        const parameters = firstDetectionInput && !this.isSegmentedSnapshot(existingSnapshot)
          ? sheetParameters
          : existingSnapshot
        const results = calculateResults(nextInputs, parameters)
        const saved = await tx.sampleBlock.update({
          where: { id: block.id },
          data: {
            inputs: nextInputs as Prisma.InputJsonValue,
            results: results as Prisma.InputJsonValue,
            parameterSnapshot: parameters as Prisma.InputJsonValue
          }
        })
        await this.recordInputChanges(tx, sheet.id, block.id, sheet.frontendUserId, user.id, oldInputs, nextInputs, blockPayload.changeLogFields)
        const response = this.toStableBlockDto(saved, canViewCompletedSensitiveData)
        await this.createLabSaveRequest(tx as unknown as LabSaveRequestWriter, {
          idempotencyKey, requestFingerprint, sheetId: sheet.id, sampleBlockId: block.id, responseSnapshot: response
        })
        return { response, sheet, changed: true, prepaidMutation }
      })
    } catch (error) {
      if (!this.isPrismaUniqueConflict(error)) throw error
      const duplicate = await this.resolveLabSaveRequest(
        this.prisma as unknown as LabSaveRequestReader,
        idempotencyKey,
        requestFingerprint
      )
      if (!duplicate) throw error
      outcome = { response: duplicate, changed: false }
    }
    if (outcome.changed) {
      if (outcome.prepaidMutation) {
        this.publishSharedPrepaidMutation(outcome.prepaidMutation, user.id)
      }
      this.realtime.publish({
        type: 'block-saved',
        frontendUserId: outcome.sheet!.frontendUserId,
        date: outcome.sheet!.date,
        sheetId,
        sourceClientId,
        changedById: user.id,
        updatedAt: new Date().toISOString()
      })
    }
    return outcome.response
  }

  private publishSharedPrepaidMutation(
    mutation: SharedPrepaidSampleMutation,
    changedById: string
  ) {
    const updatedAt = new Date().toISOString()
    this.sharedPrepaidRealtime.publish({
      module: 'consumptions',
      entityId: mutation.consumptionId,
      operation: mutation.operation,
      changedById,
      updatedAt
    })
    this.sharedPrepaidRealtime.publish({
      module: 'members',
      entityId: mutation.memberId,
      operation: 'update',
      changedById,
      updatedAt
    })
    this.sharedPrepaidRealtime.publish({
      module: 'settlements',
      entityId: mutation.consumptionId,
      operation: 'update',
      changedById,
      updatedAt
    })
  }

  private async withSheetWriteLock<T>(
    sheetId: string,
    operationOrIdempotencyKey: string | ((tx: Prisma.TransactionClient) => Promise<T>),
    maybeOperation?: (tx: Prisma.TransactionClient) => Promise<T>
  ) {
    const idempotencyKey = typeof operationOrIdempotencyKey === 'string' ? operationOrIdempotencyKey : ''
    const operation = typeof operationOrIdempotencyKey === 'function' ? operationOrIdempotencyKey : maybeOperation!
    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        await tx.$queryRaw<Array<{ pg_advisory_xact_lock: unknown }>>(Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
        `)
      }
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "LabSheet" WHERE "id" = ${sheetId} FOR UPDATE
      `)
      return operation(tx)
    })
  }

  private isSegmentedSnapshot(value: unknown) {
    return this.isPlainObject(value) && value.segmentedApplication === true
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

  private requireCompleteLabParameters(parameters: unknown) {
    if (!this.isPlainObject(parameters)) throw new BadRequestException('参数必须是有限数值')
    return Object.keys(defaultLabParameters).reduce<typeof defaultLabParameters>((next, key) => {
      const value = parameters[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException('参数必须是有限数值')
      }
      next[key as keyof typeof defaultLabParameters] = value
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

  private requireLabSaveIdempotencyKey(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('缺少幂等请求编号')
    const key = value.trim()
    if (key.length > 200) throw new BadRequestException('幂等请求编号过长')
    return key
  }

  private labSaveRequestFingerprint(input: {
    actorUserId: string
    dataOwnerId: string
    sheetId: string
    canViewCompletedSensitiveData: boolean
    blockPayload: Record<string, unknown>
  }) {
    const request = Object.fromEntries(
      Object.entries(input.blockPayload).filter(([key]) => key !== 'idempotencyKey')
    )
    return createHash('sha256').update(this.stableJson({
      actorUserId: input.actorUserId,
      dataOwnerId: input.dataOwnerId,
      sheetId: input.sheetId,
      canViewCompletedSensitiveData: input.canViewCompletedSensitiveData,
      request
    })).digest('hex')
  }

  private async resolveLabSaveRequest(
    reader: LabSaveRequestReader,
    idempotencyKey: string,
    requestFingerprint: string
  ): Promise<LabSaveResponse | null> {
    const request = await reader.labSampleSaveRequest.findUnique({ where: { idempotencyKey } })
    if (!request) return null
    if (request.requestFingerprint !== requestFingerprint) this.labSaveIdempotencyConflict()
    if (!this.isPlainObject(request.responseSnapshot)) {
      throw new ConflictException({
        code: 'LAB_SAVE_IDEMPOTENCY_STATE_INVALID',
        message: '幂等保存记录不完整，请使用新的请求编号'
      })
    }
    return this.cloneJsonObject(request.responseSnapshot)
  }

  private async createLabSaveRequest(writer: LabSaveRequestWriter, row: LabSaveRequestRow) {
    await writer.labSampleSaveRequest.create({ data: row })
  }

  private toStableBlockDto(
    block: Parameters<LabSheetsService['toBlockDto']>[0],
    canViewCompletedSensitiveData: boolean
  ): LabSaveResponse {
    return this.cloneJsonObject(this.toBlockDto(block, false, canViewCompletedSensitiveData))
  }

  private cloneJsonObject(value: unknown): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  }

  private stableJson(value: unknown) {
    return JSON.stringify(this.canonicalJsonValue(value))
  }

  private canonicalJsonValue(value: unknown): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) return value.map((item) => this.canonicalJsonValue(item === undefined ? null : item))
    if (this.isPlainObject(value)) {
      return Object.fromEntries(
        Object.keys(value).sort().flatMap((key) => (
          value[key] === undefined ? [] : [[key, this.canonicalJsonValue(value[key])]]
        ))
      )
    }
    return String(value)
  }

  private isPrismaUniqueConflict(error: unknown) {
    return (error as { code?: unknown })?.code === 'P2002'
  }

  private labSaveIdempotencyConflict(): never {
    throw new ConflictException({
      code: 'LAB_SAVE_IDEMPOTENCY_CONFLICT',
      message: '幂等请求编号已用于不同的样品保存'
    })
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
    db: Prisma.TransactionClient,
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
      const lastLog = await db.cellChangeLog.findFirst({ where: { blockId }, orderBy: { changedAt: 'desc' } })
      if (!hasCommittedFields && lastLog && lastLog.field === field) {
        await db.cellChangeLog.update({
          where: { id: lastLog.id },
          data: {
            newValue: this.toJsonValue(newValue),
            changedAt: new Date()
          }
        })
      } else {
        await db.cellChangeLog.create({
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
      const changeCount = await this.countEffectiveFieldChanges(db, blockId, field)
      if (changeCount < 3) {
        await db.abnormalRecord.deleteMany({ where: { blockId, field } })
        continue
      }
      const sheet = await db.labSheet.findUnique({ where: { id: sheetId } })
      await db.abnormalRecord.upsert({
        where: { blockId_field: { blockId, field } },
        create: {
          sheetId,
          blockId,
          frontendUserId,
          date: sheet?.date || businessDateInBeijing(),
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

  private async countEffectiveFieldChanges(db: Prisma.TransactionClient, blockId: string, field: string) {
    const rows = await db.cellChangeLog.findMany({
      where: { blockId },
      orderBy: { changedAt: 'asc' },
      select: { field: true, oldValue: true, newValue: true, changedAt: true }
    })
    return collapseConsecutiveFieldChanges(rows, { windowMs: 2000 }).filter((row) => row.field === field).length
  }

  private toSheetDto(sheet: Awaited<ReturnType<LabSheetsService['ensureSheet']>>, canViewCompletedSensitiveData = false) {
    const readonly = this.isReadonlySheet(sheet)
    return {
      id: sheet.id,
      date: sheet.date,
      readonly,
      parameters: sheet.parameters,
      sampleBlocks: sheet.sampleBlocks.map((block) => this.toBlockDto(block, readonly, canViewCompletedSensitiveData))
    }
  }

  private toBlockDto(block: { id: string; index: number; readonly: boolean; updatedAt?: Date; inputs: unknown; results: unknown; parameterSnapshot: unknown }, sheetReadonly = false, canViewCompletedSensitiveData = false) {
    const inputs = (block.inputs || {}) as Record<string, unknown>
    const results = calculateResults(inputs, this.normalizeLabParameters(block.parameterSnapshot))
    const completed = Boolean(inputs.completed)
    const hidden = completed && !canViewCompletedSensitiveData
    return {
      id: block.id,
      index: block.index,
      readonly: sheetReadonly,
      updatedAt: block.updatedAt?.toISOString(),
      sensitiveFieldsHidden: hidden,
      inputs: hidden ? this.redactCompletedInputs(inputs) : inputs,
      results: hidden ? this.redactCompletedResults(results) : results,
      parameterSnapshot: block.parameterSnapshot
    }
  }

  private redactCompletedInputs(inputs: Record<string, unknown>) {
    const redacted = { ...inputs }
    for (const field of ['ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust', 'sulfur', 'densityRaw', 'whiteness', 'calciumRaw', 'magnesiumRaw', 'carbon', 'titaniumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample', 'moisture', 'crucible', 'sampleWeight', 'burnedCrucibleSample', 'price', 'paymentStatus', 'prepaidMemberId', 'prepaidMemberPhone']) redacted[field] = null
    return redacted
  }

  private redactCompletedResults(results: unknown) {
    return Object.fromEntries(Object.keys((results || {}) as Record<string, unknown>).map((key) => [key, null]))
  }

  private assertSheetEditable(sheet: { date: string; readonly: boolean }) {
    if (this.isReadonlySheet(sheet)) throw new ForbiddenException('历史日期表格仅支持查看，不能修改')
  }

  private isReadonlySheet(sheet: { date: string; readonly: boolean }) {
    return sheet.date !== businessDateInBeijing()
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
