import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ValidationPipe
} from '@nestjs/common'
import { Prisma, SharedPrepaidLedgerKind, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'

import type { CurrentUser } from '../auth/current-user'
import {
  CreateSharedPrepaidRechargeDto,
  ReverseSharedPrepaidRechargeDto,
  SharedPrepaidMemberQueryDto,
  SharedPrepaidRechargeQueryDto
} from './shared-prepaid.dto'
import { SharedPrepaidLedgerService } from './shared-prepaid-ledger.service'
import { SharedPrepaidQueryService } from './shared-prepaid-query.service'

const createdAt = new Date('2026-08-11T08:00:00.000Z')

const mainUser: CurrentUser = {
  id: 'front-1',
  account: 'front-one',
  username: '主账号一',
  role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1',
  permissionVersion: 1,
  permissions: [],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: true,
  isFrontendSubAccount: false
}

const subUser: CurrentUser = {
  ...mainUser,
  id: 'sub-1',
  account: 'sub-one',
  username: '子账号一',
  role: UserRole.FRONTEND_SUB_USER,
  permissions: ['PREPAID_RECHARGE'],
  isFrontendMainAccount: false,
  isFrontendSubAccount: true
}

const otherMainUser: CurrentUser = {
  ...mainUser,
  id: 'front-2',
  account: 'front-two',
  username: '主账号二',
  dataOwnerId: 'front-2'
}

interface StoredMember {
  id: string
  phone: string
  cachedBalance: Prisma.Decimal
  version: number
  createdById: string
  createdAt: Date
  updatedAt: Date
}

interface StoredRecharge {
  id: string
  memberId: string
  ownerFrontendUserId: string
  actorUserId: string
  rechargeDate: string
  paidAmount: Prisma.Decimal
  giftAmount: Prisma.Decimal
  totalAmount: Prisma.Decimal
  remainingAmount: Prisma.Decimal
  isOpeningBalance: boolean
  remark: string | null
  idempotencyKey: string
  reversedAt: Date | null
  reversedByLedgerId: string | null
  createdAt: Date
  updatedAt: Date
}

interface StoredLedger {
  id: string
  memberId: string
  kind: SharedPrepaidLedgerKind
  balanceDelta: Prisma.Decimal
  ownerFrontendUserId: string
  actorUserId: string
  referenceType: string
  referenceId: string
  idempotencyKey: string
  requestFingerprint?: string | null
  responseSnapshot?: unknown
  reason?: string | null
  createdAt: Date
}

interface StoredConsumption {
  id: string
  memberId: string
  amount: Prisma.Decimal
  active: boolean
  createdAt: Date
  [key: string]: unknown
}

class FakePrisma {
  members: StoredMember[] = []
  recharges: StoredRecharge[] = []
  ledgerEntries: StoredLedger[] = []
  consumptions: StoredConsumption[] = []
  lockedMemberIds: string[] = []
  memberUpsertRacePhone: string | null = null
  failNextLedgerCreate = false
  p2002AfterNextCommit: 'same-request' | 'different-request' | null = null
  private nextId = 1

  private user(id: string) {
    const users = [mainUser, subUser, otherMainUser]
    const user = users.find((candidate) => candidate.id === id)
    return {
      id,
      account: user?.account ?? id,
      username: user?.username ?? id,
      displayRemark: null
    }
  }

  private memberWithRelations(member: StoredMember) {
    return {
      ...member,
      recharges: this.recharges
        .filter((recharge) => recharge.memberId === member.id)
        .map((recharge) => ({
          ...recharge,
          ownerFrontendUser: this.user(recharge.ownerFrontendUserId),
          actorUser: this.user(recharge.actorUserId)
        })),
      consumptions: this.consumptions.filter((consumption) => consumption.memberId === member.id),
      ledgerEntries: this.ledgerEntries.filter((entry) => entry.memberId === member.id)
    }
  }

  private rechargeWithRelations(recharge: StoredRecharge) {
    const member = this.members.find((candidate) => candidate.id === recharge.memberId)
    if (!member) throw new Error('missing fake member')
    return {
      ...recharge,
      member,
      ownerFrontendUser: this.user(recharge.ownerFrontendUserId),
      actorUser: this.user(recharge.actorUserId),
      reversedByLedger: recharge.reversedByLedgerId
        ? this.ledgerEntries.find((entry) => entry.id === recharge.reversedByLedgerId) ?? null
        : null
    }
  }

  readonly sharedPrepaidMember: any = {}
  readonly sharedPrepaidRecharge: any = {}
  readonly sharedPrepaidLedgerEntry: any = {}
  readonly sharedPrepaidConsumption: any = {}

  constructor() {
    this.sharedPrepaidMember.findUnique = async (args: any) => {
      const member = this.members.find((candidate) => (
        args.where.id ? candidate.id === args.where.id : candidate.phone === args.where.phone
      ))
      return member ? (args.include ? this.memberWithRelations(member) : { ...member }) : null
    }
    this.sharedPrepaidMember.upsert = async (args: any) => {
      const existing = this.members.find((member) => member.phone === args.where.phone)
      if (existing) return { ...existing }
      if (this.memberUpsertRacePhone === args.where.phone) {
        this.memberUpsertRacePhone = null
        this.members.push({
          id: `member-${this.nextId++}`,
          phone: args.where.phone,
          cachedBalance: new Prisma.Decimal(0),
          version: 1,
          createdById: 'racing-user',
          createdAt,
          updatedAt: createdAt
        })
        throw { code: 'P2002', meta: { target: ['phone'] }, preserveState: true }
      }
      const member: StoredMember = {
        id: `member-${this.nextId++}`,
        phone: args.create.phone,
        cachedBalance: new Prisma.Decimal(0),
        version: 1,
        createdById: args.create.createdById,
        createdAt,
        updatedAt: createdAt
      }
      this.members.push(member)
      return { ...member }
    }
    this.sharedPrepaidMember.update = async (args: any) => {
      const member = this.members.find((candidate) => candidate.id === args.where.id)
      if (!member) throw new Error('missing fake member')
      const balanceChange = args.data.cachedBalance?.increment ?? args.data.cachedBalance?.decrement
      if (args.data.cachedBalance?.increment) member.cachedBalance = member.cachedBalance.add(balanceChange)
      if (args.data.cachedBalance?.decrement) member.cachedBalance = member.cachedBalance.sub(balanceChange)
      member.version += args.data.version?.increment ?? 0
      member.updatedAt = createdAt
      return { ...member }
    }
    this.sharedPrepaidMember.findMany = async (args: any) => {
      let rows = [...this.members]
      const phoneFilter = args.where?.phone?.contains
      if (phoneFilter) rows = rows.filter((member) => member.phone.includes(phoneFilter))
      rows.sort((left, right) => left.phone.localeCompare(right.phone))
      rows = rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length))
      return rows.map((member) => args.include ? this.memberWithRelations(member) : { ...member })
    }
    this.sharedPrepaidMember.count = async (args: any = {}) => {
      const phoneFilter = args.where?.phone?.contains
      return phoneFilter
        ? this.members.filter((member) => member.phone.includes(phoneFilter)).length
        : this.members.length
    }

    this.sharedPrepaidRecharge.findUnique = async (args: any) => {
      const recharge = this.recharges.find((candidate) => (
        args.where.id ? candidate.id === args.where.id : candidate.idempotencyKey === args.where.idempotencyKey
      ))
      return recharge ? this.rechargeWithRelations(recharge) : null
    }
    this.sharedPrepaidRecharge.create = async (args: any) => {
      if (this.recharges.some((row) => row.idempotencyKey === args.data.idempotencyKey)) {
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] } }
      }
      const recharge: StoredRecharge = {
        id: `recharge-${this.nextId++}`,
        ...args.data,
        reversedAt: null,
        reversedByLedgerId: null,
        createdAt,
        updatedAt: createdAt
      }
      this.recharges.push(recharge)
      return { ...recharge }
    }
    this.sharedPrepaidRecharge.update = async (args: any) => {
      const recharge = this.recharges.find((candidate) => candidate.id === args.where.id)
      if (!recharge) throw new Error('missing fake recharge')
      Object.assign(recharge, args.data, { updatedAt: createdAt })
      return this.rechargeWithRelations(recharge)
    }
    this.sharedPrepaidRecharge.findMany = async (args: any) => {
      let rows = [...this.recharges]
      if (args.where?.member?.phone?.contains) {
        const value = args.where.member.phone.contains
        rows = rows.filter((row) => this.members.find((member) => member.id === row.memberId)?.phone.includes(value))
      }
      if (args.where?.ownerFrontendUserId) rows = rows.filter((row) => row.ownerFrontendUserId === args.where.ownerFrontendUserId)
      if (args.where?.rechargeDate?.gte) rows = rows.filter((row) => row.rechargeDate >= args.where.rechargeDate.gte)
      if (args.where?.rechargeDate?.lte) rows = rows.filter((row) => row.rechargeDate <= args.where.rechargeDate.lte)
      if (typeof args.where?.isOpeningBalance === 'boolean') {
        rows = rows.filter((row) => row.isOpeningBalance === args.where.isOpeningBalance)
      }
      rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      rows = rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length))
      return rows.map((row) => this.rechargeWithRelations(row))
    }
    this.sharedPrepaidRecharge.count = async (args: any = {}) => (
      (await this.sharedPrepaidRecharge.findMany({ ...args, skip: 0, take: this.recharges.length })).length
    )

    this.sharedPrepaidLedgerEntry.findUnique = async (args: any) => (
      this.ledgerEntries.find((entry) => entry.idempotencyKey === args.where.idempotencyKey) ?? null
    )
    this.sharedPrepaidLedgerEntry.create = async (args: any) => {
      if (this.failNextLedgerCreate) {
        this.failNextLedgerCreate = false
        throw new Error('injected ledger failure')
      }
      if (this.ledgerEntries.some((row) => row.idempotencyKey === args.data.idempotencyKey)) {
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] } }
      }
      const entry: StoredLedger = {
        id: `ledger-${this.nextId++}`,
        ...args.data,
        createdAt
      }
      this.ledgerEntries.push(entry)
      return { ...entry }
    }

    this.sharedPrepaidConsumption.findMany = async (args: any) => this.consumptions.filter((row) => (
      (!args.where?.memberId || row.memberId === args.where.memberId) &&
      (typeof args.where?.active !== 'boolean' || row.active === args.where.active)
    ))
  }

  async $transaction<T>(callback: (tx: FakePrisma) => Promise<T>): Promise<T> {
    const snapshot = this.captureState()
    try {
      const result = await callback(this)
      if (this.p2002AfterNextCommit) {
        const race = this.p2002AfterNextCommit
        this.p2002AfterNextCommit = null
        if (race === 'different-request') {
          this.ledgerEntries.at(-1)!.requestFingerprint = 'different-concurrent-request'
        }
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] }, preserveState: true }
      }
      return result
    } catch (error) {
      const preserveState = Boolean(error && typeof error === 'object' && 'preserveState' in error && error.preserveState)
      if (!preserveState) this.restoreState(snapshot)
      throw error
    }
  }

  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    if (strings.join('?').includes('FOR UPDATE')) this.lockedMemberIds.push(String(values[0]))
    return []
  }

  private captureState() {
    return {
      members: this.members.map((row) => this.cloneValue(row)),
      recharges: this.recharges.map((row) => this.cloneValue(row)),
      ledgerEntries: this.ledgerEntries.map((row) => this.cloneValue(row)),
      consumptions: this.consumptions.map((row) => this.cloneValue(row)),
      lockedMemberIds: [...this.lockedMemberIds],
      nextId: this.nextId
    }
  }

  private restoreState(snapshot: ReturnType<FakePrisma['captureState']>) {
    this.members = snapshot.members
    this.recharges = snapshot.recharges
    this.ledgerEntries = snapshot.ledgerEntries
    this.consumptions = snapshot.consumptions
    this.lockedMemberIds = snapshot.lockedMemberIds
    this.nextId = snapshot.nextId
  }

  private cloneValue<T>(value: T): T {
    if (value instanceof Prisma.Decimal) return new Prisma.Decimal(value) as T
    if (value instanceof Date) return new Date(value) as T
    if (Array.isArray(value)) return value.map((item) => this.cloneValue(item)) as T
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.cloneValue(item)])
      ) as T
    }
    return value
  }
}

function rechargePayload(overrides: Record<string, unknown> = {}) {
  return {
    phone: '13800000000',
    rechargeDate: '2026-08-11',
    paidAmount: '1000.00',
    giftAmount: '100.00',
    isOpeningBalance: false,
    remark: '首次充值',
    ...overrides
  }
}

describe('shared prepaid runtime DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })

  async function transform<T>(value: unknown, metatype: new () => T, type: 'body' | 'query' = 'body') {
    return pipe.transform(value, { type, metatype }) as Promise<T>
  }

  it('validates a recharge body and strips client-supplied owner and actor fields', async () => {
    const dto = await transform({
      ...rechargePayload(),
      ownerFrontendUserId: 'front-2',
      actorUserId: 'sub-2'
    }, CreateSharedPrepaidRechargeDto)

    expect(dto).toBeInstanceOf(CreateSharedPrepaidRechargeDto)
    expect(dto).toMatchObject(rechargePayload())
    expect(dto).not.toHaveProperty('ownerFrontendUserId')
    expect(dto).not.toHaveProperty('actorUserId')
  })

  it.each([
    ['null body', null],
    ['object phone', rechargePayload({ phone: { value: '13800000000' } })],
    ['object paid amount', rechargePayload({ paidAmount: { value: 1000 } })],
    ['array gift amount', rechargePayload({ giftAmount: [100] })],
    ['string opening flag', rechargePayload({ isOpeningBalance: 'false' })],
    ['object remark', rechargePayload({ remark: { text: '备注' } })]
  ])('rejects an invalid recharge DTO %s', async (_label, value) => {
    await expect(transform(value, CreateSharedPrepaidRechargeDto)).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each([null, {}, { reason: null }, { reason: { text: '原因' } }, { reason: '' }])(
    'rejects an invalid reversal DTO %j',
    async (value) => {
      await expect(transform(value, ReverseSharedPrepaidRechargeDto)).rejects.toBeInstanceOf(BadRequestException)
    }
  )

  it('transforms and whitelists member and recharge query parameters', async () => {
    const members = await transform({ page: '2', pageSize: '50', phone: '138', ignored: 'x' }, SharedPrepaidMemberQueryDto, 'query')
    const recharges = await transform({
      page: '1',
      pageSize: '20',
      isOpeningBalance: 'true',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      ignored: 'x'
    }, SharedPrepaidRechargeQueryDto, 'query')

    expect(members).toMatchObject({ page: 2, pageSize: 50, phone: '138' })
    expect(members).not.toHaveProperty('ignored')
    expect(recharges).toMatchObject({ page: 1, pageSize: 20, isOpeningBalance: true })
    expect(recharges).not.toHaveProperty('ignored')
  })

  it.each([
    [SharedPrepaidMemberQueryDto, { page: {} }],
    [SharedPrepaidRechargeQueryDto, { isOpeningBalance: 'yes' }],
    [SharedPrepaidRechargeQueryDto, { startDate: '2026/08/01' }]
  ])('rejects invalid query types and values', async (metatype, value) => {
    await expect(transform(value, metatype, 'query')).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('SharedPrepaidLedgerService', () => {
  let prisma: FakePrisma
  let service: SharedPrepaidLedgerService

  beforeEach(() => {
    prisma = new FakePrisma()
    service = new SharedPrepaidLedgerService(prisma as never)
  })

  it.each([
    ['null body', null],
    ['object phone', rechargePayload({ phone: { value: '13800000000' } })],
    ['object amount', rechargePayload({ paidAmount: { value: 1000 } })],
    ['string opening flag', rechargePayload({ isOpeningBalance: 'false' })],
    ['object remark', rechargePayload({ remark: { text: '备注' } })]
  ])('rejects an invalid service payload %s with 400', async (_label, payload) => {
    await expect(service.createRecharge(mainUser, payload as never, 'idem-invalid-type'))
      .rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects a non-string reversal reason with 400', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'idem-reason-source')

    await expect(service.reverseRecharge(mainUser, recharge.id, { text: '原因' }, 'idem-object-reason'))
      .rejects.toBeInstanceOf(BadRequestException)
  })

  it.each([
    ['phone', { phone: '12800000000' }],
    ['recharge date', { rechargeDate: '' }],
    ['calendar date', { rechargeDate: '2026-02-30' }],
    ['required paid amount', { paidAmount: undefined }],
    ['positive paid amount', { paidAmount: 0 }],
    ['required gift amount', { giftAmount: undefined }],
    ['non-negative gift amount', { giftAmount: -1 }]
  ])('rejects an invalid %s', async (_label, overrides) => {
    await expect(service.createRecharge(mainUser, rechargePayload(overrides), 'idem-invalid'))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.recharges).toHaveLength(0)
  })

  it('derives owner from a subaccount data owner and audits the actor while locking the balance', async () => {
    const result = await service.createRecharge(subUser, rechargePayload(), 'idem-1')

    expect(result).toMatchObject({
      phone: '13800000000',
      ownerFrontendUserId: 'front-1',
      actorUserId: 'sub-1',
      paidAmount: 1000,
      giftAmount: 100,
      totalAmount: 1100,
      balance: 1100
    })
    expect(prisma.lockedMemberIds).toEqual([prisma.members[0].id])
    expect(prisma.ledgerEntries).toMatchObject([{
      kind: SharedPrepaidLedgerKind.RECHARGE,
      balanceDelta: new Prisma.Decimal(1100),
      ownerFrontendUserId: 'front-1',
      actorUserId: 'sub-1',
      requestFingerprint: expect.any(String),
      responseSnapshot: expect.any(Object)
    }])
  })

  it('allows only a main account to create an opening balance', async () => {
    await expect(service.createRecharge(
      subUser,
      rechargePayload({ isOpeningBalance: true }),
      'idem-opening'
    )).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.recharges).toHaveLength(0)
  })

  it('normalizes and globally reuses one member across unrelated main accounts', async () => {
    await service.createRecharge(mainUser, rechargePayload({ phone: '138-0000-0000' }), 'idem-a')
    await service.createRecharge(otherMainUser, rechargePayload({ paidAmount: 50, giftAmount: 5 }), 'idem-b')

    expect(prisma.members).toHaveLength(1)
    const query = new SharedPrepaidQueryService(prisma as never)
    const firstView = await query.getMemberByPhone('138 0000 0000')
    const secondView = await query.getMemberByPhone('13800000000')
    expect(firstView).toEqual(secondView)
    expect(firstView).toMatchObject({ phone: '13800000000', paidTotal: 1050, giftTotal: 105, balance: 1155 })
  })

  it('returns the original response snapshot for the same canonical request after later balance changes', async () => {
    const first = await service.createRecharge(mainUser, rechargePayload(), 'idem-retry')
    await service.reverseRecharge(mainUser, first.id, '录入错误', 'idem-later-reversal')
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 50, giftAmount: 0 }), 'idem-later')
    const retry = await service.createRecharge(
      mainUser,
      rechargePayload({ phone: '138-0000-0000', paidAmount: 1000, giftAmount: '100.0' }),
      'idem-retry'
    )

    expect(retry).toEqual(first)
    expect(prisma.members).toHaveLength(1)
    expect(prisma.recharges).toHaveLength(2)
    expect(prisma.ledgerEntries).toHaveLength(3)
  })

  it.each([
    ['actor', mainUser, subUser, rechargePayload()],
    ['owner', mainUser, otherMainUser, rechargePayload()],
    ['phone', mainUser, mainUser, rechargePayload({ phone: '13900000000' })],
    ['date', mainUser, mainUser, rechargePayload({ rechargeDate: '2026-08-12' })],
    ['paid amount', mainUser, mainUser, rechargePayload({ paidAmount: 999 })],
    ['gift amount', mainUser, mainUser, rechargePayload({ giftAmount: 99 })],
    ['opening flag', mainUser, mainUser, rechargePayload({ isOpeningBalance: true })],
    ['remark', mainUser, mainUser, rechargePayload({ remark: '其他备注' })]
  ])('rejects idempotency-key reuse with a different %s', async (_label, firstUser, retryUser, retryPayload) => {
    await service.createRecharge(firstUser, rechargePayload(), 'idem-conflict')

    await expect(service.createRecharge(retryUser, retryPayload, 'idem-conflict'))
      .rejects.toBeInstanceOf(ConflictException)
    expect(prisma.recharges).toHaveLength(1)
    expect(prisma.ledgerEntries).toHaveLength(1)
  })

  it('returns an identical concurrent P2002 winner and rejects a different concurrent winner', async () => {
    prisma.p2002AfterNextCommit = 'same-request'
    const winner = await service.createRecharge(mainUser, rechargePayload(), 'idem-race-same')
    expect(winner).toMatchObject({ balance: 1100, actorUserId: 'front-1' })

    prisma.p2002AfterNextCommit = 'different-request'
    await expect(service.createRecharge(mainUser, rechargePayload({ paidAmount: 1, giftAmount: 0 }), 'idem-race-different'))
      .rejects.toBeInstanceOf(ConflictException)
  })

  it('rolls back member, recharge, and balance changes after an intermediate ledger failure', async () => {
    prisma.failNextLedgerCreate = true

    await expect(service.createRecharge(mainUser, rechargePayload(), 'idem-rollback'))
      .rejects.toThrow('injected ledger failure')
    expect(prisma.members).toEqual([])
    expect(prisma.recharges).toEqual([])
    expect(prisma.ledgerEntries).toEqual([])
  })

  it('retries a global member uniqueness race and reuses the concurrently created member', async () => {
    prisma.memberUpsertRacePhone = '13800000000'

    const result = await service.createRecharge(mainUser, rechargePayload(), 'idem-race')

    expect(result).toMatchObject({ phone: '13800000000', balance: 1100 })
    expect(prisma.members).toHaveLength(1)
    expect(prisma.members[0].createdById).toBe('racing-user')
  })

  it('increments a locked member balance and version with Decimal values', async () => {
    await service.createRecharge(mainUser, rechargePayload(), 'idem-first')
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: '20.25', giftAmount: '0.75' }), 'idem-second')

    expect(prisma.members[0].cachedBalance.equals(new Prisma.Decimal('1121.00'))).toBe(true)
    expect(prisma.members[0].version).toBe(3)
    expect(prisma.lockedMemberIds).toEqual([prisma.members[0].id, prisma.members[0].id])
  })

  it('reverses only an unused lot by appending an immutable negative ledger entry', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'idem-original')

    const reversed = await service.reverseRecharge(mainUser, recharge.id, '充值录入错误', 'idem-reversal')

    expect(reversed).toMatchObject({ id: recharge.id, balance: 0 })
    expect(prisma.recharges[0]).toMatchObject({
      paidAmount: new Prisma.Decimal(1000),
      giftAmount: new Prisma.Decimal(100),
      totalAmount: new Prisma.Decimal(1100)
    })
    expect(prisma.recharges[0].reversedAt).toBeInstanceOf(Date)
    expect(prisma.ledgerEntries).toHaveLength(2)
    expect(prisma.ledgerEntries[1]).toMatchObject({
      kind: SharedPrepaidLedgerKind.RECHARGE_REVERSAL,
      balanceDelta: new Prisma.Decimal(-1100),
      referenceId: recharge.id,
      reason: '充值录入错误',
      requestFingerprint: expect.any(String),
      responseSnapshot: expect.any(Object)
    })
  })

  it('rejects reversal after any amount from the lot has been consumed', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'idem-used')
    prisma.recharges[0].remainingAmount = new Prisma.Decimal(1099)

    await expect(service.reverseRecharge(mainUser, recharge.id, '录入错误', 'idem-cannot-reverse'))
      .rejects.toBeInstanceOf(ConflictException)
    expect(prisma.ledgerEntries).toHaveLength(1)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(1100)
  })

  it('keeps manual reversal as a main-account-only mutation', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'idem-main')

    await expect(service.reverseRecharge(subUser, recharge.id, '录入错误', 'idem-sub-reversal'))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('conflicts when another authenticated account reuses a reversal idempotency key', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'idem-main')
    await service.reverseRecharge(mainUser, recharge.id, '录入错误', 'idem-owner-reversal')

    await expect(service.reverseRecharge(
      otherMainUser,
      recharge.id,
      '录入错误',
      'idem-owner-reversal'
    )).rejects.toBeInstanceOf(ConflictException)
  })

  it('returns the original reversal response after later balance changes', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'idem-original')
    const first = await service.reverseRecharge(mainUser, recharge.id, ' 录入错误 ', 'idem-reversal')
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 50, giftAmount: 0 }), 'idem-later')

    const retry = await service.reverseRecharge(mainUser, recharge.id, '录入错误', 'idem-reversal')

    expect(retry).toEqual(first)
    expect(first.balance).toBe(0)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(50)
  })

  it('conflicts when a reversal idempotency key is reused with a different reason or target', async () => {
    const first = await service.createRecharge(mainUser, rechargePayload(), 'idem-first')
    const second = await service.createRecharge(mainUser, rechargePayload({ paidAmount: 50, giftAmount: 0 }), 'idem-second')
    await service.reverseRecharge(mainUser, first.id, '金额录错', 'idem-reversal')

    await expect(service.reverseRecharge(mainUser, first.id, '日期录错', 'idem-reversal'))
      .rejects.toBeInstanceOf(ConflictException)
    await expect(service.reverseRecharge(mainUser, second.id, '金额录错', 'idem-reversal'))
      .rejects.toBeInstanceOf(ConflictException)
  })
})

describe('SharedPrepaidQueryService', () => {
  it('returns global member totals, remaining owner composition, and latest activity as JSON numbers', async () => {
    const prisma = new FakePrisma()
    const ledger = new SharedPrepaidLedgerService(prisma as never)
    await ledger.createRecharge(mainUser, rechargePayload(), 'idem-one')
    await ledger.createRecharge(otherMainUser, rechargePayload({ paidAmount: 50, giftAmount: 5 }), 'idem-two')
    const member = prisma.members[0]
    prisma.recharges[0].remainingAmount = new Prisma.Decimal(1080)
    member.cachedBalance = new Prisma.Decimal(1135)
    prisma.consumptions.push({
      id: 'consumption-1',
      memberId: member.id,
      amount: new Prisma.Decimal(20),
      active: true,
      createdAt: new Date('2026-08-12T03:00:00.000Z')
    })

    const query = new SharedPrepaidQueryService(prisma as never)
    const result = await query.listMembers({ page: 1, pageSize: 20, phone: '138' })

    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 20 })
    expect(result.items[0]).toMatchObject({
      phone: '13800000000',
      paidTotal: 1050,
      giftTotal: 105,
      consumedTotal: 20,
      balance: 1135,
      latestRechargeTime: createdAt,
      latestConsumptionTime: new Date('2026-08-12T03:00:00.000Z')
    })
    expect(result.items[0].ownerComposition).toEqual([
      expect.objectContaining({ ownerFrontendUserId: 'front-1', balance: 1080 }),
      expect.objectContaining({ ownerFrontendUserId: 'front-2', balance: 55 })
    ])
  })

  it('lists global recharge history and exposes full member detail without account scoping', async () => {
    const prisma = new FakePrisma()
    const ledger = new SharedPrepaidLedgerService(prisma as never)
    const first = await ledger.createRecharge(mainUser, rechargePayload(), 'idem-one')
    await ledger.createRecharge(otherMainUser, rechargePayload({ paidAmount: 50, giftAmount: 0 }), 'idem-two')
    const query = new SharedPrepaidQueryService(prisma as never)

    const recharges = await query.listRecharges({ phone: '138', page: 1, pageSize: 20 })
    const detail = await query.getMemberDetail(first.memberId)

    expect(recharges.total).toBe(2)
    expect(recharges.items.map((row) => row.ownerFrontendUserId)).toEqual(['front-1', 'front-2'])
    expect(detail).toMatchObject({ id: first.memberId, phone: '13800000000', balance: 1150 })
    expect(detail.recharges).toHaveLength(2)
    expect(detail.ledgerEntries).toHaveLength(2)
  })

  it('keeps reversed lots in member history without counting them in active totals', async () => {
    const prisma = new FakePrisma()
    const ledger = new SharedPrepaidLedgerService(prisma as never)
    const recharge = await ledger.createRecharge(mainUser, rechargePayload(), 'idem-original')
    await ledger.reverseRecharge(mainUser, recharge.id, '录入错误', 'idem-reversal')
    const query = new SharedPrepaidQueryService(prisma as never)

    const detail = await query.getMemberDetail(recharge.memberId)

    expect(detail).toMatchObject({ paidTotal: 0, giftTotal: 0, balance: 0 })
    expect(detail.ownerComposition).toEqual([])
    expect(detail.recharges).toHaveLength(1)
    expect(detail.recharges[0].reversedAt).toBeInstanceOf(Date)
  })

  it('preserves Date instances while converting nested Decimal detail values to numbers', async () => {
    const prisma = new FakePrisma()
    const ledger = new SharedPrepaidLedgerService(prisma as never)
    const recharge = await ledger.createRecharge(mainUser, rechargePayload(), 'idem-dates')
    const consumptionCreatedAt = new Date('2026-08-12T03:00:00.000Z')
    const allocationCreatedAt = new Date('2026-08-12T03:00:01.000Z')
    prisma.consumptions.push({
      id: 'consumption-dates',
      memberId: recharge.memberId,
      amount: new Prisma.Decimal('12.50'),
      active: true,
      createdAt: consumptionCreatedAt,
      allocations: [{
        id: 'allocation-dates',
        allocatedAmount: new Prisma.Decimal('12.50'),
        createdAt: allocationCreatedAt
      }]
    })
    const query = new SharedPrepaidQueryService(prisma as never)

    const detail = await query.getMemberDetail(recharge.memberId) as any

    expect(detail.consumptions[0].createdAt).toEqual(consumptionCreatedAt)
    expect(detail.consumptions[0].allocations[0].createdAt).toEqual(allocationCreatedAt)
    expect(detail.consumptions[0].allocations[0].allocatedAmount).toBe(12.5)
  })
})
