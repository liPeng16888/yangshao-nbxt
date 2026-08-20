import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { businessDateInBeijing } from '../common/date'
import { defaultLabParameters } from '../common/lab'
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
  voidReason: null
  createdById: string
  updatedById: string
  voidedById: null
  createdAt: Date
  updatedAt: Date
  voidedAt: null
}

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
  failCreateForBlockId: string | null = null
  private nextRetestId = 1
  readonly sampleRetestWriteRequest = {
    findUnique: async ({ where }: { where: { idempotencyKey: string } }): Promise<WriteRequest | null> => (
      structuredClone(this.requests.get(where.idempotencyKey) ?? null)
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
      throw error
    }
  }

  private transactionClient() {
    return {
      $queryRaw: async (query: unknown): Promise<unknown> => {
        const text = queryText(query)
        this.log.push(text.includes('SampleBlock') ? 'lock-parents' : 'lock-sheet')
        return []
      },
      labSheet: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          this.log.push('read-sheet')
          return structuredClone(this.sheets.get(where.id) ?? null)
        }
      },
      sampleBlock: {
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
        }
      },
      sampleRetestWriteRequest: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
          this.log.push('read-request')
          return structuredClone(this.requests.get(where.idempotencyKey) ?? null)
        },
        create: async ({ data }: { data: WriteRequest }) => {
          this.log.push('create-request')
          if (this.requests.has(data.idempotencyKey)) {
            throw { code: 'P2002', meta: { target: ['idempotencyKey'] } }
          }
          const stored = structuredClone(data)
          this.requests.set(data.idempotencyKey, stored)
          return structuredClone(stored)
        }
      }
    }
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
