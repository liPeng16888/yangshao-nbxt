import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { businessDateInBeijing } from '../common/date'
import { createEmptyRetestInputs, defaultLabParameters } from '../common/lab'
import type { LabSheetRealtimeEvent } from './lab-sheet-realtime.service'
import { SampleRetestsService } from './sample-retests.service'

type Sheet = {
  id: string
  frontendUserId: string
  date: string
  readonly: boolean
  parameters: Record<string, unknown>
}

type Block = {
  id: string
  sheetId: string
  inputs: Record<string, unknown>
  nextRetestSequence: number
}

type Retest = {
  id: string
  sampleBlockId: string
  sequence: number
  inputs: Prisma.InputJsonObject
  results: Prisma.InputJsonObject
  parameterSnapshot: Prisma.InputJsonObject
  everFilled: boolean
  status: string
  voidReason: string | null
  createdById: string
  updatedById: string
  voidedById: string | null
  createdAt: Date
  updatedAt: Date
  voidedAt: Date | null
}

type RetestUpdateData = Partial<Pick<Retest,
  'inputs' | 'results' | 'everFilled' | 'status' | 'voidReason' | 'voidedAt' | 'voidedById' | 'updatedById'
>>

type WriteRequest = {
  idempotencyKey: string
  requestFingerprint: string
  operation: string
  sheetId: string
  sampleBlockId: string | null
  sampleRetestId: string | null
  responseSnapshot: unknown
}

const frontendUser: CurrentUser = {
  id: 'front-1',
  account: 'front-1',
  username: '主账号',
  role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1',
  permissionVersion: 1,
  permissions: [],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: true,
  isFrontendSubAccount: false
}

function queryText(query: unknown) {
  if (!query || typeof query !== 'object' || !('sql' in query)) return ''
  return typeof query.sql === 'string' ? query.sql : ''
}

class FakePrisma {
  readonly log: string[] = []
  readonly sheets = new Map<string, Sheet>()
  readonly blocks = new Map<string, Block>()
  readonly retests: Retest[] = []
  readonly requests = new Map<string, WriteRequest>()
  readonly attemptedWriteRequests: WriteRequest[] = []
  readonly p2002Error = { code: 'P2002', meta: { target: ['idempotencyKey'] } }
  failCreateForBlockId: string | null = null
  uniqueRaceWinnerFactory: ((loser: WriteRequest) => WriteRequest | null) | null = null
  private nextRetestId = 1
  private committedRaceWinner: WriteRequest | null | undefined
  readonly sampleRetestWriteRequest = {
    findUnique: async ({ where }: { where: { idempotencyKey: string } }): Promise<WriteRequest | null> => (
      this.readOutsideRequest(where.idempotencyKey)
    )
  }

  constructor() {
    this.sheets.set('sheet-1', {
      id: 'sheet-1',
      frontendUserId: 'front-1',
      date: businessDateInBeijing(),
      readonly: false,
      parameters: { ...defaultLabParameters, ironFactor: 31.2, siliconFactor: 'invalid', savedAt: 'latest' }
    })
    this.blocks.set('block-1', {
      id: 'block-1', sheetId: 'sheet-1', inputs: { completed: false }, nextRetestSequence: 3
    })
    this.blocks.set('block-2', {
      id: 'block-2', sheetId: 'sheet-1', inputs: { completed: false }, nextRetestSequence: 1
    })
  }

  async $transaction<T>(operation: (tx: ReturnType<FakePrisma['transactionClient']>) => Promise<T>) {
    this.log.push('transaction-begin')
    const blocksBefore = structuredClone([...this.blocks.entries()])
    const retestsBefore = structuredClone(this.retests)
    const requestsBefore = structuredClone([...this.requests.entries()])
    const nextRetestIdBefore = this.nextRetestId
    try {
      const result = await operation(this.transactionClient())
      this.log.push('transaction-commit')
      return result
    } catch (error) {
      this.blocks.clear()
      blocksBefore.forEach(([id, block]) => this.blocks.set(id, block))
      this.retests.splice(0, this.retests.length, ...retestsBefore)
      this.requests.clear()
      requestsBefore.forEach(([key, request]) => this.requests.set(key, request))
      this.nextRetestId = nextRetestIdBefore
      this.log.push('transaction-rollback')
      if (error === this.p2002Error && this.committedRaceWinner !== undefined) {
        const winner = this.committedRaceWinner
        this.committedRaceWinner = undefined
        if (winner) this.requests.set(winner.idempotencyKey, structuredClone(winner))
      }
      throw error
    }
  }

  private transactionClient() {
    return {
      $queryRaw: async (query: unknown): Promise<unknown> => {
        const text = queryText(query)
        this.log.push(
          text.includes('SampleRetest')
            ? 'lock-retest'
            : text.includes('SampleBlock')
              ? 'lock-parents'
              : 'lock-sheet'
        )
        return []
      },
      labSheet: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          this.log.push('read-sheet')
          return structuredClone(this.sheets.get(where.id) ?? null)
        }
      },
      sampleBlock: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          this.log.push('read-parent')
          return structuredClone(this.blocks.get(where.id) ?? null)
        },
        findMany: async ({ where }: { where: { id: { in: string[] }; sheetId: string } }) => {
          this.log.push('read-parents')
          return where.id.in
            .map((id) => this.blocks.get(id))
            .filter((block): block is Block => Boolean(block && block.sheetId === where.sheetId))
            .map((block) => structuredClone(block))
        },
        update: async ({ where, data }: { where: { id: string }; data: { nextRetestSequence: number } }) => {
          this.log.push(`update:${where.id}`)
          const block = this.blocks.get(where.id)
          if (!block) throw new Error('missing fake block')
          block.nextRetestSequence = data.nextRetestSequence
          return structuredClone(block)
        }
      },
      sampleRetest: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          this.log.push('read-retest')
          return structuredClone(this.retests.find((row) => row.id === where.id) ?? null)
        },
        create: async ({ data }: { data: Omit<Retest, 'id' | 'voidReason' | 'voidedById' | 'createdAt' | 'updatedAt' | 'voidedAt'> }) => {
          this.log.push(`create:${data.sampleBlockId}`)
          if (data.sampleBlockId === this.failCreateForBlockId) throw new Error('forced create failure')
          const now = new Date('2026-08-20T10:00:00.000Z')
          const row: Retest = {
            ...structuredClone(data),
            id: `retest-${this.nextRetestId++}`,
            voidReason: null,
            voidedById: null,
            createdAt: now,
            updatedAt: now,
            voidedAt: null
          }
          this.retests.push(row)
          return structuredClone(row)
        },
        update: async ({ where, data }: { where: { id: string }; data: RetestUpdateData }) => {
          this.log.push(`update-retest:${where.id}`)
          const row = this.retests.find((item) => item.id === where.id)
          if (!row) throw new Error('missing fake retest')
          Object.assign(row, structuredClone(data))
          row.updatedAt = new Date(row.updatedAt.getTime() + 1000)
          return structuredClone(row)
        },
        delete: async ({ where }: { where: { id: string } }) => {
          this.log.push(`delete-retest:${where.id}`)
          const index = this.retests.findIndex((item) => item.id === where.id)
          if (index < 0) throw new Error('missing fake retest')
          const [deleted] = this.retests.splice(index, 1)
          return structuredClone(deleted)
        }
      },
      sampleRetestWriteRequest: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
          this.log.push('read-request')
          return structuredClone(this.requests.get(where.idempotencyKey) ?? null)
        },
        create: async ({ data }: { data: WriteRequest }) => {
          this.log.push('create-request')
          this.attemptedWriteRequests.push(structuredClone(data))
          if (this.uniqueRaceWinnerFactory) {
            const createWinner = this.uniqueRaceWinnerFactory
            this.uniqueRaceWinnerFactory = null
            this.committedRaceWinner = createWinner(structuredClone(data))
            throw this.p2002Error
          }
          if (this.requests.has(data.idempotencyKey)) {
            throw this.p2002Error
          }
          const stored = structuredClone(data)
          this.requests.set(data.idempotencyKey, stored)
          return structuredClone(stored)
        }
      }
    }
  }

  private readOutsideRequest(idempotencyKey: string) {
    this.log.push('read-request-outside')
    return structuredClone(this.requests.get(idempotencyKey) ?? null)
  }
}

class FakeRealtime {
  readonly events: LabSheetRealtimeEvent[] = []

  constructor(private readonly log: string[]) {}

  publish(event: LabSheetRealtimeEvent) {
    this.log.push('publish')
    this.events.push(structuredClone(event))
  }
}

function setup() {
  const prisma = new FakePrisma()
  const realtime = new FakeRealtime(prisma.log)
  const service = new SampleRetestsService(prisma, realtime)
  return { prisma, realtime, service }
}

function getSheet(prisma: FakePrisma, id = 'sheet-1') {
  const sheet = prisma.sheets.get(id)
  if (!sheet) throw new Error(`missing fake sheet ${id}`)
  return sheet
}

function getBlock(prisma: FakePrisma, id: string) {
  const block = prisma.blocks.get(id)
  if (!block) throw new Error(`missing fake block ${id}`)
  return block
}

function getLastAttemptedWriteRequest(prisma: FakePrisma) {
  const request = prisma.attemptedWriteRequests.at(-1)
  if (!request) throw new Error('missing attempted fake write request')
  return request
}

function addRetest(prisma: FakePrisma, overrides: Partial<Retest> = {}) {
  const timestamp = new Date('2026-08-20T09:00:00.000Z')
  const row: Retest = {
    id: 'retest-1',
    sampleBlockId: 'block-1',
    sequence: 3,
    inputs: createEmptyRetestInputs(),
    results: {},
    parameterSnapshot: { ...defaultLabParameters, ironBlank: 0.04, ironFactor: 10 },
    everFilled: false,
    status: 'ACTIVE',
    voidReason: null,
    createdById: 'front-1',
    updatedById: 'front-1',
    voidedById: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    voidedAt: null,
    ...structuredClone(overrides)
  }
  prisma.retests.push(row)
  return row
}

function makeSaveRaceWinner(
  loser: WriteRequest,
  overrides: Partial<Pick<WriteRequest, 'operation' | 'requestFingerprint'>> = {}
): WriteRequest {
  const response = structuredClone(loser.responseSnapshot)
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('unexpected fake save response snapshot')
  }
  return {
    ...structuredClone(loser),
    ...overrides,
    responseSnapshot: { ...response, updatedAt: '2026-08-20T09:42:00.000Z' }
  }
}

function makeRetestRaceWinner(
  loser: WriteRequest,
  overrides: Partial<Pick<WriteRequest, 'operation' | 'requestFingerprint'>> = {}
): WriteRequest {
  const response = structuredClone(loser.responseSnapshot)
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('unexpected fake retest response snapshot')
  }
  return {
    ...structuredClone(loser),
    ...overrides,
    responseSnapshot: { ...response, updatedAt: '2026-08-20T09:42:00.000Z' }
  }
}

function makeRaceWinner(
  loser: WriteRequest,
  overrides: Partial<Pick<WriteRequest, 'operation' | 'requestFingerprint'>> = {}
): WriteRequest {
  const response = structuredClone(loser.responseSnapshot)
  if (!Array.isArray(response) || response.length !== 1) throw new Error('unexpected fake response snapshot')
  const first = response[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) throw new Error('unexpected fake response row')
  return {
    ...structuredClone(loser),
    ...overrides,
    responseSnapshot: [{ ...first, id: 'winner-retest', sequence: 41 }]
  }
}

describe('SampleRetestsService.createRetests', () => {
  it('creates one blank retest per selected parent from the latest sheet parameters', async () => {
    const { prisma, realtime, service } = setup()

    const result = await service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1', 'block-2'],
      idempotencyKey: 'create-batch-1'
    }, 'client-1', true)

    expect(result.map((row) => [row.sampleBlockId, row.sequence])).toEqual([
      ['block-1', 3], ['block-2', 1]
    ])
    expect(prisma.retests.every((row) => row.parameterSnapshot.ironFactor === 31.2)).toBe(true)
    expect(prisma.retests.every((row) => row.parameterSnapshot.siliconFactor === defaultLabParameters.siliconFactor)).toBe(true)
    expect(prisma.retests.every((row) => !('savedAt' in row.parameterSnapshot))).toBe(true)
    expect(prisma.retests.every((row) => Object.values(row.inputs).every((value) => value === null))).toBe(true)
    expect(prisma.retests.every((row) => Object.values(row.results).every((value) => value === 0))).toBe(true)
    expect(prisma.retests.map(({ createdById, updatedById }) => ({ createdById, updatedById }))).toEqual([
      { createdById: 'front-1', updatedById: 'front-1' },
      { createdById: 'front-1', updatedById: 'front-1' }
    ])
    expect([...prisma.blocks.values()].map(({ id, nextRetestSequence }) => ({ id, nextRetestSequence }))).toEqual([
      { id: 'block-1', nextRetestSequence: 4 },
      { id: 'block-2', nextRetestSequence: 2 }
    ])
    expect(prisma.log).toEqual([
      'transaction-begin', 'lock-sheet', 'read-sheet', 'lock-parents', 'read-parents', 'read-request',
      'create:block-1', 'update:block-1', 'create:block-2', 'update:block-2', 'create-request',
      'transaction-commit', 'publish', 'publish'
    ])
    expect(realtime.events).toEqual([
      expect.objectContaining({
        type: 'retests-changed', frontendUserId: 'front-1', date: businessDateInBeijing(),
        sheetId: 'sheet-1', sampleBlockId: 'block-1', sampleRetestId: 'retest-1',
        sourceClientId: 'client-1', changedById: 'front-1'
      }),
      expect.objectContaining({
        type: 'retests-changed', sampleBlockId: 'block-2', sampleRetestId: 'retest-2'
      })
    ])
    for (const event of realtime.events) {
      expect(event).not.toHaveProperty('inputs')
      expect(event).not.toHaveProperty('results')
      expect(event).not.toHaveProperty('parameterSnapshot')
    }
  })

  it('locks and processes parents by ID while returning rows in selected-parent order', async () => {
    const { prisma, service } = setup()

    const result = await service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-2', 'block-1'], idempotencyKey: 'reverse-selection'
    }, undefined, true)

    expect(prisma.log.filter((entry) => entry.startsWith('create:'))).toEqual(['create:block-1', 'create:block-2'])
    expect(result.map((row) => row.sampleBlockId)).toEqual(['block-2', 'block-1'])
  })

  it('returns an immutable original response for the same idempotency key', async () => {
    const { prisma, realtime, service } = setup()
    const payload = { sampleBlockIds: ['block-1'], idempotencyKey: 'same-key' }

    const first = await service.createRetests(frontendUser, 'sheet-1', payload, 'client-1', true)
    first[0].sequence = 99
    first[0].inputs.ironRaw = 99
    const retry = await service.createRetests(frontendUser, 'sheet-1', payload, 'client-2', true)

    expect(retry[0].sequence).toBe(3)
    expect(retry[0].inputs.ironRaw).toBeNull()
    expect(prisma.retests).toHaveLength(1)
    expect(realtime.events).toHaveLength(1)
  })

  it('rejects the same idempotency key with a different fingerprint', async () => {
    const { prisma, service } = setup()
    await service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'same-key'
    }, 'client-1', true)

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-2'], idempotencyKey: 'same-key'
    }, 'client-1', true)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
    })
    expect(prisma.retests).toHaveLength(1)
  })

  it('binds idempotency to the actual actor', async () => {
    const { service } = setup()
    const payload = { sampleBlockIds: ['block-1'], idempotencyKey: 'actor-key' }
    await service.createRetests(frontendUser, 'sheet-1', payload, undefined, true)

    await expect(service.createRetests({ ...frontendUser, id: 'sub-1' }, 'sheet-1', payload, undefined, true))
      .rejects.toMatchObject({ status: 409 })
  })

  it('returns the immutable committed winner after losing the write-request unique-key race', async () => {
    const { prisma, realtime, service } = setup()
    prisma.uniqueRaceWinnerFactory = (loser) => makeRaceWinner(loser)
    const payload = { sampleBlockIds: ['block-1'], idempotencyKey: 'matching-race' }

    const recovered = await service.createRetests(frontendUser, 'sheet-1', payload, 'loser-client', true)

    expect(recovered).toMatchObject([{ id: 'winner-retest', sampleBlockId: 'block-1', sequence: 41 }])
    expect(prisma.log).toContain('transaction-rollback')
    expect(prisma.log.at(-1)).toBe('read-request-outside')
    expect(prisma.retests).toEqual([])
    expect(getBlock(prisma, 'block-1').nextRetestSequence).toBe(3)
    expect(prisma.requests.size).toBe(1)
    expect(realtime.events).toEqual([])

    recovered[0].sequence = 99
    recovered[0].inputs.ironRaw = 99
    const retry = await service.createRetests(frontendUser, 'sheet-1', payload, 'retry-client', true)
    expect(retry[0].sequence).toBe(41)
    expect(retry[0].inputs.ironRaw).toBeNull()
    expect(prisma.retests).toEqual([])
    expect(realtime.events).toEqual([])
  })

  it('rejects a P2002 race winner with a mismatched request fingerprint', async () => {
    const { prisma, realtime, service } = setup()
    prisma.uniqueRaceWinnerFactory = (loser) => makeRaceWinner(loser, {
      requestFingerprint: 'different-request-fingerprint'
    })

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'mismatched-race'
    }, undefined, true)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
    })
    expect(prisma.log.at(-1)).toBe('read-request-outside')
    expect(prisma.retests).toEqual([])
    expect(getBlock(prisma, 'block-1').nextRetestSequence).toBe(3)
    expect(realtime.events).toEqual([])
  })

  it('rejects a P2002 race winner whose fingerprint belongs to another actor', async () => {
    const payload = { sampleBlockIds: ['block-1'], idempotencyKey: 'actor-race' }
    const probe = setup()
    probe.prisma.uniqueRaceWinnerFactory = () => null
    await expect(probe.service.createRetests(frontendUser, 'sheet-1', payload, undefined, true))
      .rejects.toBe(probe.prisma.p2002Error)
    const mainActorFingerprint = getLastAttemptedWriteRequest(probe.prisma).requestFingerprint

    const { prisma, service } = setup()
    prisma.uniqueRaceWinnerFactory = (loser) => makeRaceWinner(loser, {
      requestFingerprint: mainActorFingerprint
    })
    await expect(service.createRetests({ ...frontendUser, id: 'sub-1' }, 'sheet-1', payload, undefined, true))
      .rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
      })
    expect(prisma.log.at(-1)).toBe('read-request-outside')
  })

  it('rethrows P2002 when the outer reader cannot find a committed write request', async () => {
    const { prisma, realtime, service } = setup()
    prisma.uniqueRaceWinnerFactory = () => null

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'missing-race-winner'
    }, undefined, true)).rejects.toBe(prisma.p2002Error)
    expect(prisma.log.at(-1)).toBe('read-request-outside')
    expect(prisma.requests.size).toBe(0)
    expect(prisma.retests).toEqual([])
    expect(getBlock(prisma, 'block-1').nextRetestSequence).toBe(3)
    expect(realtime.events).toEqual([])
  })

  it.each([
    ['an empty selection', { sampleBlockIds: [], idempotencyKey: 'key' }],
    ['more than 100 parents', { sampleBlockIds: Array.from({ length: 101 }, (_, index) => `block-${index}`), idempotencyKey: 'key' }],
    ['a duplicate parent', { sampleBlockIds: ['block-1', 'block-1'], idempotencyKey: 'key' }],
    ['a blank parent', { sampleBlockIds: ['  '], idempotencyKey: 'key' }],
    ['a blank idempotency key', { sampleBlockIds: ['block-1'], idempotencyKey: '  ' }],
    ['an overlong idempotency key', { sampleBlockIds: ['block-1'], idempotencyKey: 'x'.repeat(201) }]
  ])('rejects %s before opening a transaction', async (_label, payload) => {
    const { prisma, service } = setup()

    await expect(service.createRetests(frontendUser, 'sheet-1', payload, undefined, true))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.log).toEqual([])
  })

  it('hides cross-tenant sheets as not found after taking the sheet lock', async () => {
    const { prisma, service } = setup()
    getSheet(prisma).frontendUserId = 'front-2'

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'cross-tenant'
    }, undefined, true)).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.log).toEqual(['transaction-begin', 'lock-sheet', 'read-sheet', 'transaction-rollback'])
    expect(prisma.retests).toEqual([])
  })

  it('returns not found for a missing sheet after taking the requested sheet lock', async () => {
    const { prisma, service } = setup()

    await expect(service.createRetests(frontendUser, 'missing-sheet', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'missing-sheet'
    }, undefined, true)).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.log).toEqual(['transaction-begin', 'lock-sheet', 'read-sheet', 'transaction-rollback'])
    expect(prisma.retests).toEqual([])
  })

  it('rejects historical sheets without creating rows', async () => {
    const { prisma, service } = setup()
    getSheet(prisma).date = '2000-01-01'

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'history'
    }, undefined, true)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.retests).toEqual([])
  })

  it('creates nothing when one parent in the batch is invalid', async () => {
    const { prisma, realtime, service } = setup()

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1', 'missing'], idempotencyKey: 'invalid-batch'
    }, undefined, true)).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.retests).toEqual([])
    expect(getBlock(prisma, 'block-1').nextRetestSequence).toBe(3)
    expect(realtime.events).toEqual([])
  })

  it('requires the supplied grant boolean for a completed parent', async () => {
    const { prisma, service } = setup()
    getBlock(prisma, 'block-1').inputs.completed = true

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'completed-denied'
    }, undefined, false)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.retests).toEqual([])
  })

  it('allows a completed parent when the supplied grant boolean is true', async () => {
    const { prisma, service } = setup()
    getBlock(prisma, 'block-1').inputs.completed = true

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'completed-granted'
    }, undefined, true)).resolves.toHaveLength(1)
  })

  it('uses nextRetestSequence after the formerly highest retest was deleted', async () => {
    const { prisma, service } = setup()
    getBlock(prisma, 'block-1').nextRetestSequence = 8

    const [created] = await service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1'], idempotencyKey: 'no-reuse'
    }, undefined, true)

    expect(created.sequence).toBe(8)
    expect(getBlock(prisma, 'block-1').nextRetestSequence).toBe(9)
  })

  it('rolls back the whole batch and publishes nothing when a later create fails', async () => {
    const { prisma, realtime, service } = setup()
    prisma.failCreateForBlockId = 'block-2'

    await expect(service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-1', 'block-2'], idempotencyKey: 'forced-rollback'
    }, undefined, true)).rejects.toThrow('forced create failure')
    expect(prisma.retests).toEqual([])
    expect(getBlock(prisma, 'block-1').nextRetestSequence).toBe(3)
    expect(getBlock(prisma, 'block-2').nextRetestSequence).toBe(1)
    expect(prisma.requests.size).toBe(0)
    expect(realtime.events).toEqual([])
  })
})

describe('SampleRetestsService.saveRetest', () => {
  it('locks authoritative rows, persists only detection changes, uses the frozen snapshot, and publishes one metadata event', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma, {
      inputs: { ...createEmptyRetestInputs(), siliconRaw: 2, calciumRaw: 4 }
    })
    const actor = { ...frontendUser, id: 'sub-1', isFrontendMainAccount: false, isFrontendSubAccount: true }

    const saved = await service.saveRetest(actor, 'sheet-1', 'retest-1', {
      idempotencyKey: 'save-1',
      baseUpdatedAt: '2026-08-20T09:00:00.000Z',
      baseInputs: { ironRaw: null, calciumRaw: 4 },
      changedFields: { ironRaw: 1, calciumRaw: null, sampleNumber: '不得写入' } as never
    }, 'client-1', true)

    expect(saved.inputs).toMatchObject({ ironRaw: 1, siliconRaw: 2, calciumRaw: null })
    expect(saved.inputs).not.toHaveProperty('sampleNumber')
    expect(saved.results.iron).toBe(9.6)
    expect(saved.everFilled).toBe(true)
    expect(saved.updatedById).toBe('sub-1')
    expect(prisma.retests[0].inputs).not.toHaveProperty('sampleNumber')
    expect(prisma.retests[0].parameterSnapshot.ironFactor).toBe(10)
    expect(prisma.log).toEqual([
      'transaction-begin', 'lock-sheet', 'read-sheet', 'lock-retest', 'read-retest',
      'lock-parents', 'read-parent', 'read-request', 'update-retest:retest-1', 'create-request',
      'transaction-commit', 'publish'
    ])
    expect(realtime.events).toEqual([
      expect.objectContaining({
        type: 'retests-changed', frontendUserId: 'front-1', date: businessDateInBeijing(),
        sheetId: 'sheet-1', sampleBlockId: 'block-1', sampleRetestId: 'retest-1',
        sourceClientId: 'client-1', changedById: 'sub-1', updatedAt: saved.updatedAt
      })
    ])
    expect(realtime.events[0]).not.toHaveProperty('inputs')
    expect(realtime.events[0]).not.toHaveProperty('results')
    expect(realtime.events[0]).not.toHaveProperty('parameterSnapshot')
  })

  it('treats zero as entered data and permanently latches everFilled', async () => {
    const { prisma, service } = setup()
    addRetest(prisma)

    const saved = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'save-zero', changedFields: { ironRaw: 0 }
    }, undefined, true)

    expect(saved.inputs.ironRaw).toBe(0)
    expect(saved.everFilled).toBe(true)

    const cleared = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'clear-zero', changedFields: { ironRaw: null }
    }, undefined, true)
    expect(cleared.inputs.ironRaw).toBeNull()
    expect(cleared.everFilled).toBe(true)
    expect(prisma.retests[0].everFilled).toBe(true)
  })

  it('merges a stale different-field save into the latest inputs', async () => {
    const { prisma, service } = setup()
    addRetest(prisma, {
      inputs: { ...createEmptyRetestInputs(), ironRaw: 2 },
      everFilled: true,
      updatedAt: new Date('2026-08-20T09:00:05.000Z')
    })

    const saved = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'merge-different-field',
      baseUpdatedAt: '2026-08-20T09:00:00.000Z',
      baseInputs: { siliconRaw: null },
      changedFields: { siliconRaw: 1 }
    }, undefined, true)

    expect(saved.inputs).toMatchObject({ ironRaw: 2, siliconRaw: 1 })
    expect(saved.results).toMatchObject({ iron: 19.6, silicon: 12.649 })
  })

  it('returns 409 with the latest safe retest for a stale same-field save', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma, {
      inputs: { ...createEmptyRetestInputs(), ironRaw: 2, sampleNumber: '不应返回' } as never,
      everFilled: true,
      updatedAt: new Date('2026-08-20T09:00:05.000Z')
    })

    await expect(service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'same-field-conflict',
      baseUpdatedAt: '2026-08-20T09:00:00.000Z',
      baseInputs: { ironRaw: null },
      changedFields: { ironRaw: 1 }
    }, 'client-1', true)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'SAMPLE_RETEST_INPUT_CONFLICT',
        fields: ['ironRaw'],
        retest: expect.objectContaining({
          id: 'retest-1', inputs: expect.objectContaining({ ironRaw: 2 }),
          results: expect.objectContaining({ iron: 19.6 })
        })
      })
    })
    expect(prisma.log).not.toContain('update-retest:retest-1')
    expect(prisma.requests.size).toBe(0)
    expect(realtime.events).toEqual([])
  })

  it('rejects historical, cross-tenant, and VOID targets before writing', async () => {
    const history = setup()
    addRetest(history.prisma)
    getSheet(history.prisma).date = '2000-01-01'
    await expect(history.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'history-save', changedFields: { ironRaw: 1 }
    }, undefined, true)).rejects.toBeInstanceOf(ForbiddenException)
    expect(history.prisma.log).not.toContain('update-retest:retest-1')

    const otherTenant = setup()
    addRetest(otherTenant.prisma)
    getSheet(otherTenant.prisma).frontendUserId = 'front-2'
    await expect(otherTenant.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'tenant-save', changedFields: { ironRaw: 1 }
    }, undefined, true)).rejects.toBeInstanceOf(NotFoundException)
    expect(otherTenant.prisma.log).not.toContain('lock-retest')

    const voided = setup()
    addRetest(voided.prisma, { status: 'VOID', everFilled: true })
    await expect(voided.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-save', changedFields: { ironRaw: 1 }
    }, undefined, true)).rejects.toMatchObject({ status: 409 })
    expect(voided.prisma.log).not.toContain('update-retest:retest-1')
  })

  it('requires completed-data authorization and allows the same parent with a grant', async () => {
    const denied = setup()
    addRetest(denied.prisma)
    getBlock(denied.prisma, 'block-1').inputs.completed = true

    await expect(denied.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'completed-denied-save', changedFields: { ironRaw: 1 }
    }, undefined, false)).rejects.toBeInstanceOf(ForbiddenException)
    expect(denied.prisma.log).not.toContain('update-retest:retest-1')

    const granted = setup()
    addRetest(granted.prisma)
    getBlock(granted.prisma, 'block-1').inputs.completed = true
    await expect(granted.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'completed-granted-save', changedFields: { ironRaw: 1 }
    }, undefined, true)).resolves.toMatchObject({
      sensitiveFieldsHidden: false,
      inputs: expect.objectContaining({ ironRaw: 1 })
    })
  })

  it('returns an immutable retry response without another write or event', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma)
    const payload = { idempotencyKey: 'same-save', changedFields: { ironRaw: 1 } }

    const first = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'client-1', true)
    first.inputs.ironRaw = 99
    first.results.iron = 99
    const retry = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'client-2', true)

    expect(retry.inputs.ironRaw).toBe(1)
    expect(retry.results.iron).toBe(9.6)
    expect(prisma.log.filter((entry) => entry === 'update-retest:retest-1')).toHaveLength(1)
    expect(realtime.events).toHaveLength(1)
  })

  it('replays a SAVE snapshot after the row is VOID, while changed payloads and actors still conflict', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma)
    const savePayload = { idempotencyKey: 'save-before-void', changedFields: { ironRaw: 1 } }
    const saved = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', savePayload, 'save-client', true)
    await service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-after-save', baseUpdatedAt: saved.updatedAt
    }, 'void-client', true)

    const replay = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', savePayload, 'replay-client', true)
    expect(replay).toEqual(saved)
    expect(prisma.log.filter((entry) => entry === 'update-retest:retest-1')).toHaveLength(2)
    expect(realtime.events).toHaveLength(2)

    await expect(service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'save-before-void', changedFields: { ironRaw: 2 }
    }, undefined, true)).rejects.toMatchObject({
      status: 409, response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
    })
    await expect(service.saveRetest({ ...frontendUser, id: 'sub-1' }, 'sheet-1', 'retest-1', savePayload, undefined, true))
      .rejects.toMatchObject({
        status: 409, response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
      })
    expect(prisma.log.filter((entry) => entry === 'update-retest:retest-1')).toHaveLength(2)
    expect(realtime.events).toHaveLength(2)
  })

  it('rejects reused save keys with changed fingerprints or operation types', async () => {
    const changedRequest = setup()
    addRetest(changedRequest.prisma)
    await changedRequest.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'save-key', changedFields: { ironRaw: 1 }
    }, undefined, true)
    await expect(changedRequest.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'save-key', changedFields: { ironRaw: 2 }
    }, undefined, true)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
    })

    const changedOperation = setup()
    addRetest(changedOperation.prisma)
    await changedOperation.service.createRetests(frontendUser, 'sheet-1', {
      sampleBlockIds: ['block-2'], idempotencyKey: 'operation-key'
    }, undefined, true)
    await expect(changedOperation.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'operation-key', changedFields: { ironRaw: 1 }
    }, undefined, true)).rejects.toMatchObject({ status: 409 })
    expect(changedOperation.prisma.log).not.toContain('update-retest:retest-1')
  })

  it('recovers the immutable committed SAVE winner after a P2002 race and emits no loser event', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma)
    prisma.uniqueRaceWinnerFactory = (loser) => makeSaveRaceWinner(loser)
    const payload = { idempotencyKey: 'save-race', changedFields: { ironRaw: 1 } }

    const recovered = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'loser', true)

    expect(recovered).toMatchObject({
      id: 'retest-1', updatedAt: '2026-08-20T09:42:00.000Z',
      inputs: expect.objectContaining({ ironRaw: 1 })
    })
    expect(prisma.log).toContain('transaction-rollback')
    expect(prisma.log.at(-1)).toBe('read-request-outside')
    expect(prisma.retests[0].inputs.ironRaw).toBeNull()
    expect(realtime.events).toEqual([])

    recovered.inputs.ironRaw = 99
    const retry = await service.saveRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'retry', true)
    expect(retry.inputs.ironRaw).toBe(1)
    expect(retry.updatedAt).toBe('2026-08-20T09:42:00.000Z')
    expect(realtime.events).toEqual([])
  })

  it('rejects a P2002 SAVE winner with a mismatched fingerprint', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma)
    prisma.uniqueRaceWinnerFactory = (loser) => makeSaveRaceWinner(loser, {
      requestFingerprint: 'different-save-fingerprint'
    })

    await expect(service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'mismatched-save-race', changedFields: { ironRaw: 1 }
    }, undefined, true)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
    })
    expect(prisma.retests[0].inputs.ironRaw).toBeNull()
    expect(realtime.events).toEqual([])
  })
})

describe('SampleRetestsService.deleteRetest', () => {
  it('deletes a persistently blank ACTIVE retest at its exact version without reusing the parent sequence', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma)

    await expect(service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-blank', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, 'client-1', true)).resolves.toEqual({ id: 'retest-1', sampleBlockId: 'block-1', deleted: true })

    expect(prisma.retests).toEqual([])
    expect(getBlock(prisma, 'block-1').nextRetestSequence).toBe(3)
    expect(prisma.log).toContain('delete-retest:retest-1')
    expect(realtime.events).toEqual([expect.objectContaining({
      type: 'retests-changed', sheetId: 'sheet-1', sampleBlockId: 'block-1', sampleRetestId: 'retest-1',
      sourceClientId: 'client-1', changedById: 'front-1'
    })])
    expect(realtime.events[0]).not.toHaveProperty('inputs')
    expect(realtime.events[0]).not.toHaveProperty('results')
  })

  it('rejects stale, currently nonblank, and ever-filled retests without deleting them', async () => {
    const stale = setup()
    addRetest(stale.prisma, { updatedAt: new Date('2026-08-20T09:00:01.000Z') })
    await expect(stale.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-stale', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toMatchObject({ status: 409 })
    expect(stale.prisma.retests).toHaveLength(1)

    const zero = setup()
    addRetest(zero.prisma, { inputs: { ...createEmptyRetestInputs(), ironRaw: 0 } })
    await expect(zero.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-zero', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toThrow('已录入数据的复样只能作废')
    expect(zero.prisma.retests).toHaveLength(1)

    const cleared = setup()
    addRetest(cleared.prisma, { everFilled: true })
    await expect(cleared.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-cleared', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toThrow('已录入数据的复样只能作废')
    expect(cleared.prisma.retests).toHaveLength(1)
  })

  it('enforces tenant, today, completed-parent grant, and ACTIVE state before deleting', async () => {
    const history = setup()
    addRetest(history.prisma)
    getSheet(history.prisma).date = '2000-01-01'
    await expect(history.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-history', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toBeInstanceOf(ForbiddenException)

    const tenant = setup()
    addRetest(tenant.prisma)
    getSheet(tenant.prisma).frontendUserId = 'other-tenant'
    await expect(tenant.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-tenant', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toBeInstanceOf(NotFoundException)

    const completed = setup()
    addRetest(completed.prisma)
    getBlock(completed.prisma, 'block-1').inputs.completed = true
    await expect(completed.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-completed', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, false)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(completed.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-completed-granted', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).resolves.toMatchObject({ deleted: true })

    const voided = setup()
    addRetest(voided.prisma, { status: 'VOID', everFilled: true })
    await expect(voided.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-void', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toMatchObject({ status: 409 })
  })

  it('replays only the immutable DELETE response and recovers a matching P2002 winner without another event', async () => {
    const retry = setup()
    addRetest(retry.prisma)
    const payload = { idempotencyKey: 'same-delete', baseUpdatedAt: '2026-08-20T09:00:00.000Z' }
    const first = await retry.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'first', true)
    ;(first as { deleted: boolean }).deleted = false
    await expect(retry.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'retry', true))
      .resolves.toEqual({ id: 'retest-1', sampleBlockId: 'block-1', deleted: true })
    expect(retry.realtime.events).toHaveLength(1)

    const raced = setup()
    addRetest(raced.prisma)
    raced.prisma.uniqueRaceWinnerFactory = (loser) => structuredClone(loser)
    await expect(raced.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-race', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).resolves.toEqual({ id: 'retest-1', sampleBlockId: 'block-1', deleted: true })
    expect(raced.prisma.retests).toHaveLength(1)
    expect(raced.realtime.events).toEqual([])
  })

  it('binds DELETE idempotency to the operation and actual actor', async () => {
    const { prisma, service } = setup()
    addRetest(prisma)
    const payload = { idempotencyKey: 'delete-key', baseUpdatedAt: '2026-08-20T09:00:00.000Z' }
    await service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', payload, undefined, true)

    await expect(service.deleteRetest({ ...frontendUser, id: 'sub-1' }, 'sheet-1', 'retest-1', payload, undefined, true))
      .rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' }) })
    await expect(service.voidRetest(frontendUser, 'sheet-1', 'retest-1', payload, undefined, true))
      .rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' }) })
  })
})

describe('SampleRetestsService.voidRetest', () => {
  it('voids an ever-filled ACTIVE retest while preserving its detection snapshot and auditing the actual actor', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma, {
      inputs: { ...createEmptyRetestInputs(), ironRaw: 1 },
      results: { iron: 9.6 }, everFilled: true
    })
    const actor = { ...frontendUser, id: 'sub-1', isFrontendMainAccount: false, isFrontendSubAccount: true }

    const voided = await service.voidRetest(actor, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-filled', baseUpdatedAt: '2026-08-20T09:00:00.000Z', reason: '  复核失败  '
    }, 'client-1', true)

    expect(voided).toMatchObject({
      id: 'retest-1', status: 'VOID', inputs: { ironRaw: 1 }, results: { iron: 9.6 },
      everFilled: true, voidReason: '复核失败', voidedById: 'sub-1', updatedById: 'sub-1'
    })
    expect(voided.voidedAt).toEqual(expect.any(String))
    expect(prisma.retests[0]).toMatchObject({ status: 'VOID', voidReason: '复核失败', voidedById: 'sub-1' })
    expect(realtime.events).toEqual([expect.objectContaining({ type: 'retests-changed', changedById: 'sub-1' })])
  })

  it('requires the completed-parent grant before replaying a sensitive VOID snapshot', async () => {
    const { prisma, realtime, service } = setup()
    addRetest(prisma, { everFilled: true, inputs: { ...createEmptyRetestInputs(), ironRaw: 1 } })
    getBlock(prisma, 'block-1').inputs.completed = true
    const payload = { idempotencyKey: 'void-completed-replay', baseUpdatedAt: '2026-08-20T09:00:00.000Z' }
    const first = await service.voidRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'first', true)

    await expect(service.voidRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'denied', false))
      .rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.log.filter((entry) => entry === 'update-retest:retest-1')).toHaveLength(1)
    expect(realtime.events).toHaveLength(1)

    const replay = await service.voidRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'granted', true)
    expect(replay).toEqual(first)
    expect(prisma.log.filter((entry) => entry === 'update-retest:retest-1')).toHaveLength(1)
    expect(realtime.events).toHaveLength(1)
  })

  it('requires the exact version and prior data, normalizes blank reasons, and has no restore path', async () => {
    const stale = setup()
    addRetest(stale.prisma, { everFilled: true, updatedAt: new Date('2026-08-20T09:00:01.000Z') })
    await expect(stale.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-stale', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toMatchObject({ status: 409 })

    const blank = setup()
    addRetest(blank.prisma)
    await expect(blank.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-blank', baseUpdatedAt: '2026-08-20T09:00:00.000Z', reason: '   '
    }, undefined, true)).rejects.toThrow('未录入数据的复样可以直接删除')

    const voided = setup()
    addRetest(voided.prisma, { everFilled: true })
    const result = await voided.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-null-reason', baseUpdatedAt: '2026-08-20T09:00:00.000Z', reason: '  '
    }, undefined, true)
    expect(result.voidReason).toBeNull()
    await expect(voided.service.saveRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'save-voided', changedFields: { ironRaw: 1 }
    }, undefined, true)).rejects.toMatchObject({ status: 409 })
    await expect(voided.service.deleteRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'delete-voided', baseUpdatedAt: result.updatedAt
    }, undefined, true)).rejects.toMatchObject({ status: 409 })
    await expect(voided.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-again', baseUpdatedAt: result.updatedAt
    }, undefined, true)).rejects.toMatchObject({ status: 409 })
  })

  it('enforces tenant, today, and completed-parent grant before voiding', async () => {
    const history = setup()
    addRetest(history.prisma, { everFilled: true })
    getSheet(history.prisma).date = '2000-01-01'
    await expect(history.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-history', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toBeInstanceOf(ForbiddenException)

    const tenant = setup()
    addRetest(tenant.prisma, { everFilled: true })
    getSheet(tenant.prisma).frontendUserId = 'other-tenant'
    await expect(tenant.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-tenant', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).rejects.toBeInstanceOf(NotFoundException)

    const completed = setup()
    addRetest(completed.prisma, { everFilled: true })
    getBlock(completed.prisma, 'block-1').inputs.completed = true
    await expect(completed.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-completed', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, false)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(completed.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-completed-granted', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)).resolves.toMatchObject({ status: 'VOID' })
  })

  it('replays immutable VOID results and recovers matching P2002 winners without duplicate mutations or events', async () => {
    const retry = setup()
    addRetest(retry.prisma, { everFilled: true })
    const payload = { idempotencyKey: 'same-void', baseUpdatedAt: '2026-08-20T09:00:00.000Z', reason: '原因' }
    const first = await retry.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'first', true)
    first.status = 'ACTIVE'
    const replay = await retry.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', payload, 'retry', true)
    expect(replay.status).toBe('VOID')
    expect(retry.prisma.log.filter((entry) => entry === 'update-retest:retest-1')).toHaveLength(1)
    expect(retry.realtime.events).toHaveLength(1)

    const raced = setup()
    addRetest(raced.prisma, { everFilled: true })
    raced.prisma.uniqueRaceWinnerFactory = (loser) => makeRetestRaceWinner(loser)
    const recovered = await raced.service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-race', baseUpdatedAt: '2026-08-20T09:00:00.000Z'
    }, undefined, true)
    expect(recovered).toMatchObject({ id: 'retest-1', status: 'VOID', updatedAt: '2026-08-20T09:42:00.000Z' })
    expect(raced.prisma.retests[0].status).toBe('ACTIVE')
    expect(raced.realtime.events).toEqual([])
  })

  it('binds VOID idempotency to operation, payload, and actor', async () => {
    const { prisma, service } = setup()
    addRetest(prisma, { everFilled: true })
    await service.voidRetest(frontendUser, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-key', baseUpdatedAt: '2026-08-20T09:00:00.000Z', reason: '原因 A'
    }, undefined, true)
    await expect(service.voidRetest({ ...frontendUser, id: 'sub-1' }, 'sheet-1', 'retest-1', {
      idempotencyKey: 'void-key', baseUpdatedAt: '2026-08-20T09:00:01.000Z', reason: '原因 B'
    }, undefined, true)).rejects.toMatchObject({
      status: 409, response: expect.objectContaining({ code: 'SAMPLE_RETEST_IDEMPOTENCY_CONFLICT' })
    })
  })
})
