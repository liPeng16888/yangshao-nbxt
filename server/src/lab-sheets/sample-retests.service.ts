import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import type { CurrentUser } from '../auth/current-user'
import { businessDateInBeijing } from '../common/date'
import { calculateResults, createEmptyRetestInputs, normalizeLabParameters } from '../common/lab'
import { PrismaService } from '../prisma/prisma.service'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { toSampleRetestDto, type SampleRetestRow } from './sample-retest.dto'

export type CreateSampleRetestsPayload = {
  sampleBlockIds: string[]
  idempotencyKey: string
}

export type SampleRetestDto = ReturnType<typeof toSampleRetestDto>

type RetestOperation = 'CREATE'

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
  responseSnapshot: Prisma.InputJsonArray
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
  }
  sampleRetestWriteRequest: {
    findUnique(args: { where: { idempotencyKey: string } }): Promise<SampleRetestWriteRequestRow | null>
    create(args: { data: SampleRetestWriteRequestData }): Promise<unknown>
  }
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

@Injectable()
export class SampleRetestsService {
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
          requestFingerprint
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
        requestFingerprint
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

  private requireIdempotencyKey(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('缺少幂等请求编号')
    }
    const key = value.trim()
    if (key.length > 200) throw new BadRequestException('幂等请求编号过长')
    return key
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
    payload: CreateSampleRetestsPayload
  ) {
    return createHash('sha256').update(this.stableJson({
      operation,
      actorUserId: user.id,
      dataOwnerId: user.dataOwnerId,
      sheetId,
      payload
    })).digest('hex')
  }

  private async resolveWriteRequest(
    reader: SampleRetestWriteRequestReader,
    idempotencyKey: string,
    operation: RetestOperation,
    requestFingerprint: string
  ): Promise<SampleRetestDto[] | null> {
    const request = await reader.findUnique({ where: { idempotencyKey } })
    if (!request) return null
    if (request.operation !== operation || request.requestFingerprint !== requestFingerprint) {
      this.idempotencyConflict()
    }
    const response = structuredClone(request.responseSnapshot)
    if (!Array.isArray(response) || !response.every((item) => this.isSampleRetestDto(item))) {
      throw new ConflictException({
        code: 'SAMPLE_RETEST_IDEMPOTENCY_STATE_INVALID',
        message: '幂等复样记录不完整，请使用新的请求编号'
      })
    }
    return response
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
      (value.voidReason === null || typeof value.voidReason === 'string') &&
      typeof value.createdById === 'string' &&
      typeof value.updatedById === 'string' &&
      (value.voidedById === null || typeof value.voidedById === 'string') &&
      typeof value.createdAt === 'string' &&
      typeof value.updatedAt === 'string' &&
      (value.voidedAt === null || typeof value.voidedAt === 'string')
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
