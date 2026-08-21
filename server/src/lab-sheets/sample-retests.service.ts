import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import type { CurrentUser } from '../auth/current-user'
import { businessDateInBeijing } from '../common/date'
import {
  calculateResults,
  createEmptyRetestInputs,
  hasLabDetectionInput,
  normalizeLabDetectionInputs,
  normalizeLabParameters,
  validateStoredLabParameters
} from '../common/lab'
import { PrismaService } from '../prisma/prisma.service'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { toSampleRetestDto, type SampleRetestRow } from './sample-retest.dto'

export type CreateSampleRetestsPayload = {
  sampleBlockIds: string[]
  idempotencyKey: string
}

export type SaveSampleRetestPayload = {
  idempotencyKey: string
  baseUpdatedAt: string
  baseInputs?: Record<string, unknown>
  changedFields: Record<string, unknown>
}

export type DeleteSampleRetestPayload = {
  idempotencyKey: string
  baseUpdatedAt: string
}

export type VoidSampleRetestPayload = {
  idempotencyKey: string
  baseUpdatedAt: string
  reason?: string
}

export type SampleRetestDto = ReturnType<typeof toSampleRetestDto>

export type DeleteSampleRetestResponse = {
  id: string
  sampleBlockId: string
  deleted: true
}

type RetestOperation = 'CREATE' | 'SAVE' | 'DELETE' | 'VOID'

type WritableSheet = {
  id: string
  frontendUserId: string
  date: string
  readonly: boolean
  parameters: unknown
}

type WritableSampleBlock = {
  id: string
  sheetId: string
  inputs: unknown
  nextRetestSequence: number
}

type SampleRetestWriteRequestRow = {
  idempotencyKey: string
  requestFingerprint: string
  operation: string
  sheetId: string
  sampleBlockId: string | null
  sampleRetestId: string | null
  responseSnapshot: unknown
}

type SampleRetestWriteRequestData = Omit<SampleRetestWriteRequestRow, 'responseSnapshot'> & {
  responseSnapshot: Prisma.InputJsonArray | Prisma.InputJsonObject
}

type CreateSampleRetestData = {
  sampleBlockId: string
  sequence: number
  inputs: Prisma.InputJsonObject
  results: Prisma.InputJsonObject
  parameterSnapshot: Prisma.InputJsonObject
  everFilled: false
  status: 'ACTIVE'
  createdById: string
  updatedById: string
}

type SampleRetestTransaction = {
  $queryRaw(query: Prisma.Sql): Promise<unknown>
  labSheet: {
    findUnique(args: { where: { id: string } }): Promise<WritableSheet | null>
  }
  sampleBlock: {
    findUnique(args: { where: { id: string } }): Promise<WritableSampleBlock | null>
    findMany(args: {
      where: { id: { in: string[] }; sheetId: string }
      orderBy: { id: 'asc' }
    }): Promise<WritableSampleBlock[]>
    update(args: {
      where: { id: string }
      data: { nextRetestSequence: number }
    }): Promise<unknown>
  }
  sampleRetest: {
    create(args: { data: CreateSampleRetestData }): Promise<SampleRetestRow>
    findUnique(args: { where: { id: string } }): Promise<SampleRetestRow | null>
    update(args: {
      where: { id: string }
      data: SaveRetestData | VoidRetestData
    }): Promise<SampleRetestRow>
    delete(args: { where: { id: string } }): Promise<SampleRetestRow>
  }
  sampleRetestWriteRequest: {
    findUnique(args: { where: { idempotencyKey: string } }): Promise<SampleRetestWriteRequestRow | null>
    create(args: { data: SampleRetestWriteRequestData }): Promise<unknown>
  }
}

type SaveRetestData = {
  inputs: Prisma.InputJsonObject
  results: Prisma.InputJsonObject
  everFilled: boolean
  updatedById: string
}

type VoidRetestData = {
  status: 'VOID'
  voidReason: string | null
  voidedAt: Date
  voidedById: string
  updatedById: string
}

type SampleRetestWriteRequestReader = {
  findUnique(args: { where: { idempotencyKey: string } }): Promise<SampleRetestWriteRequestRow | null>
}

type SampleRetestPrisma = {
  $transaction<T>(operation: (tx: SampleRetestTransaction) => Promise<T>): Promise<T>
  sampleRetestWriteRequest: SampleRetestWriteRequestReader
}

type SampleRetestRealtime = Pick<LabSheetRealtimeService, 'publish'>

type CreateRetestsOutcome =
  | { response: SampleRetestDto[]; changed: false }
  | {
      response: SampleRetestDto[]
      changed: true
      sheet: Pick<WritableSheet, 'frontendUserId' | 'date'>
    }

type SaveRetestOutcome =
  | { response: SampleRetestDto; changed: false }
  | {
      response: SampleRetestDto
      changed: true
      sheet: Pick<WritableSheet, 'frontendUserId' | 'date'>
      sampleBlockId: string
    }

type DeleteRetestOutcome =
  | { response: DeleteSampleRetestResponse; changed: false }
  | {
      response: DeleteSampleRetestResponse
      changed: true
      sheet: Pick<WritableSheet, 'frontendUserId' | 'date'>
    }

type VoidRetestOutcome =
  | { response: SampleRetestDto; changed: false }
  | {
      response: SampleRetestDto
      changed: true
      sheet: Pick<WritableSheet, 'frontendUserId' | 'date'>
      sampleBlockId: string
    }

type WritableRetestContext = {
  sheet: WritableSheet
  block: WritableSampleBlock
  retest: SampleRetestRow
  parentCompleted: boolean
}

@Injectable()
export class SampleRetestsService {
  private readonly logger = new Logger(SampleRetestsService.name)

  constructor(
    @Inject(PrismaService) private readonly prisma: SampleRetestPrisma,
    @Inject(LabSheetRealtimeService) private readonly realtime: SampleRetestRealtime
  ) {}

  async createRetests(
    user: CurrentUser,
    sheetId: string,
    payload: CreateSampleRetestsPayload,
    sourceClientId?: string,
    canViewCompletedSensitiveData = false
  ): Promise<SampleRetestDto[]> {
    const idempotencyKey = this.requireIdempotencyKey(payload.idempotencyKey)
    const sampleBlockIds = this.normalizeSampleBlockIds(payload.sampleBlockIds)
    const requestFingerprint = this.writeFingerprint('CREATE', user, sheetId, {
      sampleBlockIds,
      idempotencyKey
    })
    let outcome: CreateRetestsOutcome

    try {
      outcome = await this.prisma.$transaction<CreateRetestsOutcome>(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "LabSheet" WHERE "id" = ${sheetId} FOR UPDATE
        `)
        const sheet = await tx.labSheet.findUnique({ where: { id: sheetId } })
        if (!sheet || sheet.frontendUserId !== user.dataOwnerId) {
          throw new NotFoundException('未找到表格')
        }
        this.assertSheetEditable(sheet)

        const sortedBlockIds = [...sampleBlockIds].sort()
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "SampleBlock"
          WHERE "sheetId" = ${sheet.id} AND "id" IN (${Prisma.join(sortedBlockIds)})
          ORDER BY "id" FOR UPDATE
        `)
        const blocks = await tx.sampleBlock.findMany({
          where: { id: { in: sortedBlockIds }, sheetId: sheet.id },
          orderBy: { id: 'asc' }
        })
        if (blocks.length !== sortedBlockIds.length || blocks.some((block, index) => block.id !== sortedBlockIds[index])) {
          throw new NotFoundException('未找到样品')
        }
        if (!canViewCompletedSensitiveData && blocks.some((block) => this.isCompleted(block.inputs))) {
          throw new ForbiddenException('已完成样品需要验证后才能创建复样')
        }

        const duplicate = await this.resolveWriteRequest(
          tx.sampleRetestWriteRequest,
          idempotencyKey,
          'CREATE',
          requestFingerprint,
          (value): value is SampleRetestDto[] => (
            Array.isArray(value) && value.every((item) => this.isSampleRetestDto(item))
          )
        )
        if (duplicate) return { response: duplicate, changed: false }

        const parameters = normalizeLabParameters(sheet.parameters)
        const createdByBlockId = new Map<string, SampleRetestDto>()
        for (const block of blocks) {
          const inputs = createEmptyRetestInputs()
          const created = await tx.sampleRetest.create({
            data: {
              sampleBlockId: block.id,
              sequence: block.nextRetestSequence,
              inputs,
              results: calculateResults(inputs, parameters),
              parameterSnapshot: parameters,
              everFilled: false,
              status: 'ACTIVE',
              createdById: user.id,
              updatedById: user.id
            }
          })
          await tx.sampleBlock.update({
            where: { id: block.id },
            data: { nextRetestSequence: block.nextRetestSequence + 1 }
          })
          createdByBlockId.set(block.id, toSampleRetestDto(created, {
            parentCompleted: this.isCompleted(block.inputs),
            sheetReadonly: false,
            canViewCompletedSensitiveData
          }))
        }

        const response = sampleBlockIds.map((blockId) => {
          const created = createdByBlockId.get(blockId)
          if (!created) throw new NotFoundException('未找到样品')
          return created
        })
        await tx.sampleRetestWriteRequest.create({
          data: {
            idempotencyKey,
            requestFingerprint,
            operation: 'CREATE',
            sheetId: sheet.id,
            sampleBlockId: null,
            sampleRetestId: null,
            responseSnapshot: this.toJsonArray(response)
          }
        })
        return { response, changed: true, sheet }
      })
    } catch (error) {
      if (!this.isPrismaUniqueConflict(error)) throw error
      const duplicate = await this.resolveWriteRequest(
        this.prisma.sampleRetestWriteRequest,
        idempotencyKey,
        'CREATE',
        requestFingerprint,
        (value): value is SampleRetestDto[] => (
          Array.isArray(value) && value.every((item) => this.isSampleRetestDto(item))
        )
      )
      if (!duplicate) throw error
      outcome = { response: duplicate, changed: false }
    }

    if (outcome.changed) {
      const updatedAt = new Date().toISOString()
      for (const retest of outcome.response) {
        this.realtime.publish({
          type: 'retests-changed',
          frontendUserId: outcome.sheet.frontendUserId,
          date: outcome.sheet.date,
          sheetId,
          sampleBlockId: retest.sampleBlockId,
          sampleRetestId: retest.id,
          sourceClientId,
          changedById: user.id,
          updatedAt
        })
      }
    }
    return outcome.response
  }

  async saveRetest(
    user: CurrentUser,
    sheetId: string,
    retestId: string,
    payload: SaveSampleRetestPayload,
    sourceClientId?: string,
    canViewCompletedSensitiveData = false
  ): Promise<SampleRetestDto> {
    const idempotencyKey = this.requireIdempotencyKey(payload.idempotencyKey)
    const changedFields = normalizeLabDetectionInputs(payload.changedFields)
    const baseInputs = normalizeLabDetectionInputs(payload.baseInputs)
    const baseUpdatedAt = this.requireBaseUpdatedAt(payload.baseUpdatedAt)
    const fingerprintPayload = {
      idempotencyKey,
      baseUpdatedAt,
      ...(payload.baseInputs === undefined ? {} : { baseInputs }),
      changedFields
    }
    const requestFingerprint = this.writeFingerprint(
      'SAVE',
      user,
      sheetId,
      fingerprintPayload,
      retestId
    )
    let outcome: SaveRetestOutcome

    try {
      outcome = await this.prisma.$transaction<SaveRetestOutcome>(async (tx) => {
        const sheet = await this.loadWritableSheet(tx, user, sheetId)
        const context = await this.loadRetestReplayContext(tx, sheet, retestId, canViewCompletedSensitiveData)
        const duplicate = await this.resolveWriteRequest(
          tx.sampleRetestWriteRequest,
          idempotencyKey,
          'SAVE',
          requestFingerprint,
          (value): value is SampleRetestDto => this.isSampleRetestDto(value)
        )
        if (duplicate) return { response: duplicate, changed: false }

        this.assertRetestActive(context)
        this.assertNoRetestInputConflict(
          context,
          baseUpdatedAt,
          baseInputs,
          changedFields,
          canViewCompletedSensitiveData
        )
        const parameters = this.requireStoredRetestParameters(context)
        const nextInputs = {
          ...normalizeLabDetectionInputs(context.retest.inputs),
          ...changedFields
        }
        const saved = await tx.sampleRetest.update({
          where: { id: context.retest.id },
          data: {
            inputs: this.toJsonObject(nextInputs),
            results: this.toJsonObject(calculateResults(
              nextInputs,
              parameters
            )),
            everFilled: context.retest.everFilled || hasLabDetectionInput(nextInputs),
            updatedById: user.id
          }
        })
        const response = toSampleRetestDto(saved, {
          parentCompleted: context.parentCompleted,
          sheetReadonly: false,
          canViewCompletedSensitiveData
        })
        await tx.sampleRetestWriteRequest.create({
          data: {
            idempotencyKey,
            requestFingerprint,
            operation: 'SAVE',
            sheetId: context.sheet.id,
            sampleBlockId: context.block.id,
            sampleRetestId: context.retest.id,
            responseSnapshot: this.toJsonObject(response)
          }
        })
        return {
          response,
          changed: true,
          sheet: context.sheet,
          sampleBlockId: context.block.id
        }
      })
    } catch (error) {
      if (!this.isPrismaUniqueConflict(error)) throw error
      const duplicate = await this.resolveWriteRequest(
        this.prisma.sampleRetestWriteRequest,
        idempotencyKey,
        'SAVE',
        requestFingerprint,
        (value): value is SampleRetestDto => this.isSampleRetestDto(value)
      )
      if (!duplicate) throw error
      outcome = { response: duplicate, changed: false }
    }

    if (outcome.changed) {
      this.realtime.publish({
        type: 'retests-changed',
        frontendUserId: outcome.sheet.frontendUserId,
        date: outcome.sheet.date,
        sheetId,
        sampleBlockId: outcome.sampleBlockId,
        sampleRetestId: outcome.response.id,
        sourceClientId,
        changedById: user.id,
        updatedAt: outcome.response.updatedAt
      })
    }
    return outcome.response
  }

  async deleteRetest(
    user: CurrentUser,
    sheetId: string,
    retestId: string,
    payload: DeleteSampleRetestPayload,
    sourceClientId?: string,
    canViewCompletedSensitiveData = false
  ): Promise<DeleteSampleRetestResponse> {
    const idempotencyKey = this.requireIdempotencyKey(payload.idempotencyKey)
    const baseUpdatedAt = this.requireBaseUpdatedAt(payload.baseUpdatedAt)
    const requestFingerprint = this.writeFingerprint('DELETE', user, sheetId, {
      idempotencyKey,
      baseUpdatedAt
    }, retestId)
    let outcome: DeleteRetestOutcome

    try {
      outcome = await this.prisma.$transaction<DeleteRetestOutcome>(async (tx) => {
        const sheet = await this.loadWritableSheet(tx, user, sheetId)
        const duplicate = await this.resolveWriteRequest(
          tx.sampleRetestWriteRequest,
          idempotencyKey,
          'DELETE',
          requestFingerprint,
          (value): value is DeleteSampleRetestResponse => this.isDeleteRetestResponse(value)
        )
        if (duplicate) return { response: duplicate, changed: false }

        const context = await this.loadRetestReplayContext(
          tx, sheet, retestId, canViewCompletedSensitiveData
        )
        this.assertRetestActive(context)
        this.assertExactRetestVersion(context.retest, baseUpdatedAt)
        const inputs = normalizeLabDetectionInputs(context.retest.inputs)
        if (context.retest.everFilled || hasLabDetectionInput(inputs)) {
          throw new ConflictException('已录入数据的复样只能作废')
        }
        await tx.sampleRetest.delete({ where: { id: context.retest.id } })
        const response: DeleteSampleRetestResponse = {
          id: context.retest.id,
          sampleBlockId: context.block.id,
          deleted: true
        }
        await tx.sampleRetestWriteRequest.create({
          data: {
            idempotencyKey,
            requestFingerprint,
            operation: 'DELETE',
            sheetId: context.sheet.id,
            sampleBlockId: context.block.id,
            sampleRetestId: context.retest.id,
            responseSnapshot: this.toJsonObject(response)
          }
        })
        return { response, changed: true, sheet: context.sheet }
      })
    } catch (error) {
      if (!this.isPrismaUniqueConflict(error)) throw error
      const duplicate = await this.resolveWriteRequest(
        this.prisma.sampleRetestWriteRequest,
        idempotencyKey,
        'DELETE',
        requestFingerprint,
        (value): value is DeleteSampleRetestResponse => this.isDeleteRetestResponse(value)
      )
      if (!duplicate) throw error
      outcome = { response: duplicate, changed: false }
    }

    if (outcome.changed) {
      this.publishRetestChanged(outcome.sheet, sheetId, outcome.response.sampleBlockId, outcome.response.id,
        sourceClientId, user.id, new Date().toISOString())
    }
    return outcome.response
  }

  async voidRetest(
    user: CurrentUser,
    sheetId: string,
    retestId: string,
    payload: VoidSampleRetestPayload,
    sourceClientId?: string,
    canViewCompletedSensitiveData = false
  ): Promise<SampleRetestDto> {
    const idempotencyKey = this.requireIdempotencyKey(payload.idempotencyKey)
    const baseUpdatedAt = this.requireBaseUpdatedAt(payload.baseUpdatedAt)
    const reason = this.normalizeVoidReason(payload.reason)
    const requestFingerprint = this.writeFingerprint('VOID', user, sheetId, {
      idempotencyKey,
      baseUpdatedAt,
      reason
    }, retestId)
    let outcome: VoidRetestOutcome

    try {
      outcome = await this.prisma.$transaction<VoidRetestOutcome>(async (tx) => {
        const sheet = await this.loadWritableSheet(tx, user, sheetId)
        await this.assertNoMismatchedWriteRequest(
          tx.sampleRetestWriteRequest,
          idempotencyKey,
          'VOID',
          requestFingerprint
        )
        const context = await this.loadRetestReplayContext(
          tx, sheet, retestId, canViewCompletedSensitiveData
        )
        const duplicate = await this.resolveWriteRequest(
          tx.sampleRetestWriteRequest,
          idempotencyKey,
          'VOID',
          requestFingerprint,
          (value): value is SampleRetestDto => this.isSampleRetestDto(value)
        )
        if (duplicate) return { response: duplicate, changed: false }

        this.assertRetestActive(context)
        this.assertExactRetestVersion(context.retest, baseUpdatedAt)
        if (!context.retest.everFilled) {
          throw new ConflictException('未录入数据的复样可以直接删除')
        }
        const voided = await tx.sampleRetest.update({
          where: { id: context.retest.id },
          data: {
            status: 'VOID',
            voidReason: reason,
            voidedAt: new Date(),
            voidedById: user.id,
            updatedById: user.id
          }
        })
        const response = toSampleRetestDto(voided, {
          parentCompleted: context.parentCompleted,
          sheetReadonly: false,
          canViewCompletedSensitiveData
        })
        await tx.sampleRetestWriteRequest.create({
          data: {
            idempotencyKey,
            requestFingerprint,
            operation: 'VOID',
            sheetId: context.sheet.id,
            sampleBlockId: context.block.id,
            sampleRetestId: context.retest.id,
            responseSnapshot: this.toJsonObject(response)
          }
        })
        return {
          response,
          changed: true,
          sheet: context.sheet,
          sampleBlockId: context.block.id
        }
      })
    } catch (error) {
      if (!this.isPrismaUniqueConflict(error)) throw error
      const duplicate = await this.resolveWriteRequest(
        this.prisma.sampleRetestWriteRequest,
        idempotencyKey,
        'VOID',
        requestFingerprint,
        (value): value is SampleRetestDto => this.isSampleRetestDto(value)
      )
      if (!duplicate) throw error
      outcome = { response: duplicate, changed: false }
    }

    if (outcome.changed) {
      this.publishRetestChanged(outcome.sheet, sheetId, outcome.sampleBlockId, outcome.response.id,
        sourceClientId, user.id, outcome.response.updatedAt)
    }
    return outcome.response
  }

  private async loadWritableSheet(
    tx: SampleRetestTransaction,
    user: CurrentUser,
    sheetId: string
  ): Promise<WritableSheet> {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "LabSheet" WHERE "id" = ${sheetId} FOR UPDATE
    `)
    const sheet = await tx.labSheet.findUnique({ where: { id: sheetId } })
    if (!sheet || sheet.frontendUserId !== user.dataOwnerId) {
      throw new NotFoundException('未找到表格')
    }
    this.assertSheetEditable(sheet)
    return sheet
  }

  private async loadRetestReplayContext(
    tx: SampleRetestTransaction,
    sheet: WritableSheet,
    retestId: string,
    canViewCompletedSensitiveData: boolean
  ): Promise<WritableRetestContext> {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "SampleRetest" WHERE "id" = ${retestId} FOR UPDATE
    `)
    const retest = await tx.sampleRetest.findUnique({ where: { id: retestId } })
    if (!retest) throw new NotFoundException('未找到复样')

    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "SampleBlock" WHERE "id" = ${retest.sampleBlockId} FOR UPDATE
    `)
    const block = await tx.sampleBlock.findUnique({ where: { id: retest.sampleBlockId } })
    if (!block || block.sheetId !== sheet.id) throw new NotFoundException('未找到复样')

    const parentCompleted = this.isCompleted(block.inputs)
    if (parentCompleted && !canViewCompletedSensitiveData) {
      throw new ForbiddenException('已完成样品需要验证后才能修改复样')
    }
    return { sheet, block, retest, parentCompleted }
  }

  private assertRetestActive(context: WritableRetestContext) {
    if (context.retest.status === 'ACTIVE') return
    throw new ConflictException({
      code: 'SAMPLE_RETEST_NOT_ACTIVE',
      message: '已作废的复样不能再修改',
      retest: toSampleRetestDto(context.retest, {
        parentCompleted: context.parentCompleted,
        sheetReadonly: false,
        canViewCompletedSensitiveData: true
      })
    })
  }

  private assertExactRetestVersion(retest: Pick<SampleRetestRow, 'updatedAt'>, baseUpdatedAt: string) {
    if (retest.updatedAt.getTime() === Date.parse(baseUpdatedAt)) return
    throw new ConflictException({
      code: 'SAMPLE_RETEST_VERSION_CONFLICT',
      message: '该复样已被修改，请刷新后重试'
    })
  }

  private publishRetestChanged(
    sheet: Pick<WritableSheet, 'frontendUserId' | 'date'>,
    sheetId: string,
    sampleBlockId: string,
    sampleRetestId: string,
    sourceClientId: string | undefined,
    changedById: string,
    updatedAt: string
  ) {
    this.realtime.publish({
      type: 'retests-changed',
      frontendUserId: sheet.frontendUserId,
      date: sheet.date,
      sheetId,
      sampleBlockId,
      sampleRetestId,
      sourceClientId,
      changedById,
      updatedAt
    })
  }

  private assertNoRetestInputConflict(
    context: WritableRetestContext,
    baseUpdatedAt: string,
    baseInputs: Record<string, number | null>,
    changedFields: Record<string, number | null>,
    canViewCompletedSensitiveData: boolean
  ) {
    const baseTime = Date.parse(baseUpdatedAt)
    const currentTime = context.retest.updatedAt.getTime()
    if (currentTime < baseTime) {
      throw new ConflictException({
        code: 'SAMPLE_RETEST_VERSION_CONFLICT',
        message: '复样版本时间与服务器不一致，请刷新后重试',
        fields: Object.keys(changedFields),
        retest: toSampleRetestDto(context.retest, {
          parentCompleted: context.parentCompleted,
          sheetReadonly: false,
          canViewCompletedSensitiveData
        })
      })
    }
    if (currentTime === baseTime) return
    const currentInputs = normalizeLabDetectionInputs(context.retest.inputs)
    const conflicts = Object.keys(changedFields).filter((field) => (
      !Object.prototype.hasOwnProperty.call(baseInputs, field) ||
      (currentInputs[field] ?? null) !== (baseInputs[field] ?? null)
    ))
    if (!conflicts.length) return
    throw new ConflictException({
      code: 'SAMPLE_RETEST_INPUT_CONFLICT',
      message: '该复样已被另一台设备修改，请确认后再保存',
      fields: conflicts,
      retest: toSampleRetestDto(context.retest, {
        parentCompleted: context.parentCompleted,
        sheetReadonly: false,
        canViewCompletedSensitiveData
      })
    })
  }

  private requireStoredRetestParameters(context: WritableRetestContext) {
    const parameters = validateStoredLabParameters(context.retest.parameterSnapshot)
    if (parameters) return parameters
    this.logger.error('复样参数快照无效', {
      sheetId: context.sheet.id,
      sampleBlockId: context.block.id,
      sampleRetestId: context.retest.id
    })
    throw new UnprocessableEntityException({
      code: 'SAMPLE_RETEST_PARAMETER_SNAPSHOT_INVALID',
      message: '复样参数快照无效，无法保存'
    })
  }

  private requireIdempotencyKey(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('缺少幂等请求编号')
    }
    const key = value.trim()
    if (key.length > 200) throw new BadRequestException('幂等请求编号过长')
    return key
  }

  private requireBaseUpdatedAt(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    const timestamp = Date.parse(normalized)
    if (!normalized || !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== normalized) {
      throw new BadRequestException('缺少或无效的复样版本时间')
    }
    return normalized
  }

  private normalizeVoidReason(value: unknown) {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string') throw new BadRequestException('作废原因格式错误')
    return value.trim() || null
  }

  private normalizeSampleBlockIds(value: unknown) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
      throw new BadRequestException('请选择 1 至 100 个样品')
    }
    const ids = value.map((id) => {
      if (typeof id !== 'string' || !id.trim()) throw new BadRequestException('样品编号不能为空')
      return id.trim()
    })
    if (new Set(ids).size !== ids.length) throw new BadRequestException('样品选择不能重复')
    return ids
  }

  private writeFingerprint(
    operation: RetestOperation,
    user: CurrentUser,
    sheetId: string,
    payload: unknown,
    sampleRetestId?: string
  ) {
    const request = {
      operation,
      actorUserId: user.id,
      dataOwnerId: user.dataOwnerId,
      sheetId,
      ...(sampleRetestId === undefined ? {} : { sampleRetestId }),
      payload
    }
    return createHash('sha256').update(this.stableJson(request)).digest('hex')
  }

  private async resolveWriteRequest<T>(
    reader: SampleRetestWriteRequestReader,
    idempotencyKey: string,
    operation: RetestOperation,
    requestFingerprint: string,
    isResponse: (value: unknown) => value is T
  ): Promise<T | null> {
    const request = await reader.findUnique({ where: { idempotencyKey } })
    if (!request) return null
    if (request.operation !== operation || request.requestFingerprint !== requestFingerprint) {
      this.idempotencyConflict()
    }
    const response = structuredClone(request.responseSnapshot)
    if (!isResponse(response)) {
      throw new ConflictException({
        code: 'SAMPLE_RETEST_IDEMPOTENCY_STATE_INVALID',
        message: '幂等复样记录不完整，请使用新的请求编号'
      })
    }
    return response
  }

  private async assertNoMismatchedWriteRequest(
    reader: SampleRetestWriteRequestReader,
    idempotencyKey: string,
    operation: RetestOperation,
    requestFingerprint: string
  ) {
    const request = await reader.findUnique({ where: { idempotencyKey } })
    if (request && (request.operation !== operation || request.requestFingerprint !== requestFingerprint)) {
      this.idempotencyConflict()
    }
  }

  private idempotencyConflict(): never {
    throw new ConflictException({
      code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT',
      message: '幂等请求编号已用于不同的复样操作'
    })
  }

  private assertSheetEditable(sheet: Pick<WritableSheet, 'date' | 'readonly'>) {
    if (sheet.date !== businessDateInBeijing()) {
      throw new ForbiddenException('历史日期表格仅支持查看，不能修改')
    }
  }

  private isCompleted(inputs: unknown) {
    return this.isPlainObject(inputs) && Boolean(inputs.completed)
  }

  private isSampleRetestDto(value: unknown): value is SampleRetestDto {
    if (!this.isPlainObject(value)) return false
    return typeof value.id === 'string' &&
      typeof value.sampleBlockId === 'string' &&
      typeof value.sequence === 'number' && Number.isInteger(value.sequence) &&
      typeof value.status === 'string' &&
      typeof value.everFilled === 'boolean' &&
      typeof value.readonly === 'boolean' &&
      typeof value.sensitiveFieldsHidden === 'boolean' &&
      this.isNumberOrNullRecord(value.inputs) &&
      this.isNumberOrNullRecord(value.results) &&
      (value.parameterSnapshot === null || this.isPlainObject(value.parameterSnapshot)) &&
      (value.voidReason === null || typeof value.voidReason === 'string') &&
      typeof value.createdById === 'string' &&
      typeof value.updatedById === 'string' &&
      (value.voidedById === null || typeof value.voidedById === 'string') &&
      typeof value.createdAt === 'string' &&
      typeof value.updatedAt === 'string' &&
      (value.voidedAt === null || typeof value.voidedAt === 'string')
  }

  private isDeleteRetestResponse(value: unknown): value is DeleteSampleRetestResponse {
    return this.isPlainObject(value) &&
      Object.keys(value).length === 3 &&
      typeof value.id === 'string' &&
      typeof value.sampleBlockId === 'string' &&
      value.deleted === true
  }

  private isNumberOrNullRecord(value: unknown): value is Record<string, number | null> {
    return this.isPlainObject(value) && Object.values(value).every((item) => (
      item === null || (typeof item === 'number' && Number.isFinite(item))
    ))
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
  }

  private toJsonArray(values: unknown[]): Prisma.InputJsonArray {
    return values.map((value) => this.toJsonValue(value))
  }

  private toJsonObject(value: unknown): Prisma.InputJsonObject {
    const json = this.toJsonValue(value)
    if (!this.isPlainObject(json)) throw new BadRequestException('复样数据格式错误')
    return json as Prisma.InputJsonObject
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) return value.map((item) => this.toJsonValue(item))
    if (this.isPlainObject(value)) {
      const entries: Array<[string, Prisma.InputJsonValue | null]> = []
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) entries.push([key, this.toJsonValue(item)])
      }
      return Object.fromEntries(entries)
    }
    return String(value)
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
    return this.isPlainObject(error) && error.code === 'P2002'
  }
}
