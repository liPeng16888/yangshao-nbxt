import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  RequestMethod,
  ValidationPipe
} from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import {
  Prisma,
  SharedPrepaidConsumptionKind,
  SharedPrepaidLedgerKind,
  SharedPrepaidPayableStatus,
  UserRole
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '../auth/current-user'
import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { ROLES_KEY } from '../auth/roles.decorator'
import {
  CreateSharedPrepaidRechargeDto,
  ReverseSharedPrepaidRechargeDto,
  SharedPrepaidConsumptionQueryDto,
  SharedPrepaidMemberQueryDto,
  SharedPrepaidRechargeQueryDto
} from './shared-prepaid.dto'
import { SharedPrepaidLedgerService } from './shared-prepaid-ledger.service'
import { SharedPrepaidQueryService } from './shared-prepaid-query.service'
import { SharedPrepaidController } from './shared-prepaid.controller'

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
  consumingFrontendUserId?: string
  actorUserId?: string
  kind?: SharedPrepaidConsumptionKind
  amount: Prisma.Decimal
  sheetId?: string
  sampleBlockId?: string
  sampleIndex?: number
  sampleNumberSnapshot?: string | null
  sampleCountSnapshot?: number
  elementsSnapshot?: unknown
  phoneSnapshot?: string
  sheetDate?: string
  active: boolean
  reversalOfId?: string | null
  idempotencyKey?: string
  createdAt: Date
  [key: string]: unknown
}

interface StoredAllocation {
  id: string
  consumptionId: string
  rechargeId: string
  sourceOwnerId: string
  allocatedAmount: Prisma.Decimal
  paidRatio: Prisma.Decimal
  exactTransferAmount: Prisma.Decimal
  createdAt: Date
}

interface StoredPayable {
  id: string
  consumptionId: string
  sourceOwnerId: string
  consumerOwnerId: string
  exactAmount: Prisma.Decimal
  amount: Prisma.Decimal
  status: SharedPrepaidPayableStatus
  reversalOfId: string | null
  createdAt: Date
  updatedAt: Date
}

class FakePrisma {
  members: StoredMember[] = []
  recharges: StoredRecharge[] = []
  ledgerEntries: StoredLedger[] = []
  consumptions: StoredConsumption[] = []
  allocations: StoredAllocation[] = []
  payables: StoredPayable[] = []
  lockedMemberIds: string[] = []
  memberUpsertRacePhone: string | null = null
  failNextLedgerCreate = false
  p2002AfterNextCommit: 'same-request' | 'different-request' | null = null
  failNextMemberUpdateMany = false
  afterNextLock: (() => Promise<void>) | null = null
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
  readonly sharedPrepaidAllocation: any = {}
  readonly sharedPrepaidPayable: any = {}

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
    this.sharedPrepaidMember.updateMany = async (args: any) => {
      if (this.failNextMemberUpdateMany) {
        this.failNextMemberUpdateMany = false
        return { count: 0 }
      }
      const member = this.members.find((candidate) => candidate.id === args.where.id)
      if (!member || (args.where.version !== undefined && member.version !== args.where.version)) return { count: 0 }
      const minimumBalance = args.where.cachedBalance?.gte
      if (minimumBalance !== undefined && member.cachedBalance.lessThan(minimumBalance)) return { count: 0 }
      if (args.data.cachedBalance?.increment) member.cachedBalance = member.cachedBalance.add(args.data.cachedBalance.increment)
      if (args.data.cachedBalance?.decrement) member.cachedBalance = member.cachedBalance.sub(args.data.cachedBalance.decrement)
      member.version += args.data.version?.increment ?? 0
      member.updatedAt = createdAt
      return { count: 1 }
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
    this.sharedPrepaidRecharge.updateMany = async (args: any) => {
      const recharge = this.recharges.find((candidate) => candidate.id === args.where.id)
      if (!recharge) return { count: 0 }
      if (args.where.reversedAt === null && recharge.reversedAt !== null) return { count: 0 }
      if (args.where.remainingAmount?.gte !== undefined && recharge.remainingAmount.lessThan(args.where.remainingAmount.gte)) {
        return { count: 0 }
      }
      if (args.data.remainingAmount?.increment) {
        recharge.remainingAmount = recharge.remainingAmount.add(args.data.remainingAmount.increment)
      }
      if (args.data.remainingAmount?.decrement) {
        recharge.remainingAmount = recharge.remainingAmount.sub(args.data.remainingAmount.decrement)
      }
      recharge.updatedAt = createdAt
      return { count: 1 }
    }
    this.sharedPrepaidRecharge.findMany = async (args: any) => {
      let rows = [...this.recharges]
      if (args.where?.memberId) rows = rows.filter((row) => row.memberId === args.where.memberId)
      if (args.where?.id?.in) rows = rows.filter((row) => args.where.id.in.includes(row.id))
      if (args.where?.reversedAt === null) rows = rows.filter((row) => row.reversedAt === null)
      if (args.where?.remainingAmount?.gt !== undefined) {
        rows = rows.filter((row) => row.remainingAmount.greaterThan(args.where.remainingAmount.gt))
      }
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
      if (Array.isArray(args.orderBy)) {
        rows.sort((left, right) => (
          left.rechargeDate.localeCompare(right.rechargeDate) ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id)
        ))
      } else {
        rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      }
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

    const consumptionWithRelations = (row: StoredConsumption) => ({
      ...row,
      allocations: this.allocations
        .filter((allocation) => allocation.consumptionId === row.id)
        .map((allocation) => ({
          ...allocation,
          recharge: this.recharges.find((recharge) => recharge.id === allocation.rechargeId)
        })),
      payables: this.payables.filter((payable) => payable.consumptionId === row.id)
    })
    this.sharedPrepaidConsumption.findFirst = async (args: any) => {
      const row = this.consumptions.find((candidate) => (
        (!args.where?.sampleBlockId || candidate.sampleBlockId === args.where.sampleBlockId) &&
        (typeof args.where?.active !== 'boolean' || candidate.active === args.where.active) &&
        (!args.where?.kind || candidate.kind === args.where.kind)
      ))
      return row ? consumptionWithRelations(row) : null
    }
    this.sharedPrepaidConsumption.findUnique = async (args: any) => {
      const row = this.consumptions.find((candidate) => (
        args.where.id ? candidate.id === args.where.id : candidate.idempotencyKey === args.where.idempotencyKey
      ))
      return row ? consumptionWithRelations(row) : null
    }
    this.sharedPrepaidConsumption.findMany = async (args: any) => this.consumptions.filter((row) => (
      (!args.where?.memberId || row.memberId === args.where.memberId) &&
      (typeof args.where?.active !== 'boolean' || row.active === args.where.active)
    )).map((row) => consumptionWithRelations(row))
    this.sharedPrepaidConsumption.create = async (args: any) => {
      if (this.consumptions.some((row) => row.idempotencyKey === args.data.idempotencyKey)) {
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] } }
      }
      if (args.data.kind === SharedPrepaidConsumptionKind.CONSUMPTION && args.data.active && this.consumptions.some((row) => (
        row.sampleBlockId === args.data.sampleBlockId && row.active && row.kind === SharedPrepaidConsumptionKind.CONSUMPTION
      ))) throw { code: 'P2002', meta: { target: ['sampleBlockId'] } }
      const row: StoredConsumption = {
        id: `consumption-${this.nextId++}`,
        ...args.data,
        reversalOfId: args.data.reversalOfId ?? null,
        createdAt
      }
      this.consumptions.push(row)
      return consumptionWithRelations(row)
    }
    this.sharedPrepaidConsumption.updateMany = async (args: any) => {
      const rows = this.consumptions.filter((candidate) => (
        candidate.id === args.where.id &&
        (typeof args.where.active !== 'boolean' || candidate.active === args.where.active)
      ))
      rows.forEach((row) => Object.assign(row, args.data))
      return { count: rows.length }
    }

    this.sharedPrepaidAllocation.createMany = async (args: any) => {
      for (const data of args.data) {
        this.allocations.push({ id: `allocation-${this.nextId++}`, ...data, createdAt })
      }
      return { count: args.data.length }
    }

    this.sharedPrepaidPayable.createMany = async (args: any) => {
      for (const data of args.data) {
        this.payables.push({
          id: `payable-${this.nextId++}`,
          status: SharedPrepaidPayableStatus.PENDING,
          reversalOfId: null,
          ...data,
          createdAt,
          updatedAt: createdAt
        })
      }
      return { count: args.data.length }
    }
    this.sharedPrepaidPayable.create = async (args: any) => {
      const row: StoredPayable = {
        id: `payable-${this.nextId++}`,
        status: SharedPrepaidPayableStatus.PENDING,
        reversalOfId: null,
        ...args.data,
        createdAt,
        updatedAt: createdAt
      }
      this.payables.push(row)
      return { ...row }
    }
    this.sharedPrepaidPayable.updateMany = async (args: any) => {
      const rows = this.payables.filter((candidate) => (
        candidate.id === args.where.id &&
        (!args.where.status || candidate.status === args.where.status)
      ))
      rows.forEach((row) => Object.assign(row, args.data, { updatedAt: createdAt }))
      return { count: rows.length }
    }
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
    if (strings.join('?').includes('FOR UPDATE')) {
      this.lockedMemberIds.push(String(values[0]))
      const afterLock = this.afterNextLock
      this.afterNextLock = null
      if (afterLock) await afterLock()
    }
    return []
  }

  private captureState() {
    return {
      members: this.members.map((row) => this.cloneValue(row)),
      recharges: this.recharges.map((row) => this.cloneValue(row)),
      ledgerEntries: this.ledgerEntries.map((row) => this.cloneValue(row)),
      consumptions: this.consumptions.map((row) => this.cloneValue(row)),
      allocations: this.allocations.map((row) => this.cloneValue(row)),
      payables: this.payables.map((row) => this.cloneValue(row)),
      lockedMemberIds: [...this.lockedMemberIds],
      nextId: this.nextId
    }
  }

  private restoreState(snapshot: ReturnType<FakePrisma['captureState']>) {
    this.members = snapshot.members
    this.recharges = snapshot.recharges
    this.ledgerEntries = snapshot.ledgerEntries
    this.consumptions = snapshot.consumptions
    this.allocations = snapshot.allocations
    this.payables = snapshot.payables
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

function consumptionInput(overrides: Record<string, unknown> = {}) {
  return {
    sheetId: 'sheet-1',
    sampleBlockId: 'block-1',
    sampleIndex: 1,
    sheetDate: '2026-08-12',
    consumingFrontendUserId: 'front-1',
    actorUserId: 'sub-1',
    oldInputs: {
      sampleNumber: 'A-001',
      ironRaw: 1,
      paymentStatus: '',
      price: null
    },
    nextInputs: {
      sampleNumber: 'A-001',
      ironRaw: 1,
      paymentStatus: '预存款',
      price: 100,
      prepaidMemberId: 'member-1',
      prepaidMemberPhone: '13800000000'
    },
    idempotencyKey: 'consume-1',
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

  it('transforms and whitelists the global consumption filters', async () => {
    const consumptions = await transform({
      page: '2',
      pageSize: '50',
      phone: '138 0000-0000',
      sourceOwnerId: 'front-1',
      consumingFrontendUserId: 'front-2',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'REVERSED',
      payableStatus: 'COMPLETED',
      ignored: 'x'
    }, SharedPrepaidConsumptionQueryDto, 'query')

    expect(consumptions).toMatchObject({
      page: 2,
      pageSize: 50,
      phone: '138 0000-0000',
      sourceOwnerId: 'front-1',
      consumingFrontendUserId: 'front-2',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'REVERSED',
      payableStatus: 'COMPLETED'
    })
    expect(consumptions).not.toHaveProperty('ignored')
  })

  it.each([
    [SharedPrepaidMemberQueryDto, { page: {} }],
    [SharedPrepaidRechargeQueryDto, { isOpeningBalance: 'yes' }],
    [SharedPrepaidRechargeQueryDto, { startDate: '2026/08/01' }],
    [SharedPrepaidConsumptionQueryDto, { status: 'DELETED' }],
    [SharedPrepaidConsumptionQueryDto, { payableStatus: 'SETTLED' }]
  ])('rejects invalid query types and values', async (metatype, value) => {
    await expect(transform(value, metatype, 'query')).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('SharedPrepaidController reversal routes', () => {
  it('exposes an authorized consumption reversal route and derives owner and actor from the current user', async () => {
    const calls: unknown[][] = []
    const controller = new SharedPrepaidController({
      reverseConsumption: (...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve({ id: 'reversal-1' })
      }
    } as never, {} as never, {} as never)

    await controller.reverseConsumption(
      mainUser,
      'consumption-1',
      'reversal-key',
      { reason: '金额录错', ownerFrontendUserId: 'front-2', actorUserId: 'sub-2' } as never
    )

    const handler = SharedPrepaidController.prototype.reverseConsumption
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('consumptions/:id/reversal')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, handler)).toEqual(['PREPAID_CONSUMPTIONS'])
    expect(Reflect.getMetadata(ROLES_KEY, SharedPrepaidController)).toEqual([UserRole.FRONTEND_USER])
    expect(calls).toEqual([[mainUser, 'consumption-1', '金额录错', 'reversal-key']])
  })
})

describe('SharedPrepaidLedgerService', () => {
  let prisma: FakePrisma
  let service: SharedPrepaidLedgerService
  let realtime: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    prisma = new FakePrisma()
    realtime = { publish: vi.fn() }
    service = new SharedPrepaidLedgerService(prisma as never, realtime as never)
  })

  it('publishes global recharge and member invalidations only after commit and not for retries or rollback', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'realtime-recharge')

    expect(realtime.publish).toHaveBeenNthCalledWith(1, expect.objectContaining({
      module: 'recharges', entityId: recharge.id, operation: 'create', changedById: mainUser.id
    }))
    expect(realtime.publish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      module: 'members', entityId: recharge.memberId, operation: 'update', changedById: mainUser.id
    }))

    realtime.publish.mockClear()
    await service.createRecharge(mainUser, rechargePayload(), 'realtime-recharge')
    expect(realtime.publish).not.toHaveBeenCalled()

    prisma.failNextLedgerCreate = true
    await expect(service.createRecharge(mainUser, rechargePayload({ phone: '13900000000' }), 'realtime-rollback'))
      .rejects.toThrow('injected ledger failure')
    expect(realtime.publish).not.toHaveBeenCalled()
  })

  it('publishes recharge reversal invalidations with metadata only', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'realtime-reversal-source')
    realtime.publish.mockClear()

    await service.reverseRecharge(mainUser, recharge.id, '录入错误', 'realtime-recharge-reversal')

    expect(realtime.publish.mock.calls).toEqual([
      [expect.objectContaining({ module: 'recharges', entityId: recharge.id, operation: 'update' })],
      [expect.objectContaining({ module: 'members', entityId: recharge.memberId, operation: 'update' })]
    ])
    expect(JSON.stringify(realtime.publish.mock.calls)).not.toMatch(/phone|balance|remark|proof/i)
  })

  it('publishes member, consumption, and settlement invalidations after a manual consumption reversal commits', async () => {
    await service.createRecharge(
      mainUser,
      rechargePayload({ paidAmount: 100, giftAmount: 0 }),
      'realtime-consumption-lot'
    )
    const memberId = prisma.members[0]!.id
    await prisma.$transaction((tx) => service.syncSampleConsumption(tx as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'realtime-consumption-source'
    })))
    const consumptionId = prisma.consumptions[0]!.id
    realtime.publish.mockClear()

    const reversal = await service.reverseConsumption(
      mainUser,
      consumptionId,
      '消费录入错误',
      'realtime-consumption-reversal'
    )

    expect(realtime.publish.mock.calls).toEqual([
      [expect.objectContaining({
        module: 'consumptions', entityId: reversal.id, operation: 'update', changedById: mainUser.id
      })],
      [expect.objectContaining({
        module: 'members', entityId: memberId, operation: 'update', changedById: mainUser.id
      })],
      [expect.objectContaining({
        module: 'settlements', entityId: reversal.id, operation: 'update', changedById: mainUser.id
      })]
    ])
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
      .rejects.toThrow('该充值已有消费记录，请先冲正相关消费')
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

  it('rechecks a recharge reversal winner after waiting for the member lock', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload(), 'idem-lock-source')
    prisma.afterNextLock = async () => {
      await service.reverseRecharge(mainUser, recharge.id, '录入错误', 'idem-lock-reversal')
    }

    const result = await service.reverseRecharge(mainUser, recharge.id, '录入错误', 'idem-lock-reversal')

    expect(result).toMatchObject({ id: recharge.id, balance: 0 })
    expect(prisma.ledgerEntries.filter((row) => row.kind === SharedPrepaidLedgerKind.RECHARGE_REVERSAL)).toHaveLength(1)
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

  it('manually reverses an unbatched consumption by restoring its exact lots and immutable snapshots', async () => {
    const ownLot = await service.createRecharge(mainUser, rechargePayload({
      paidAmount: 50,
      giftAmount: 0
    }), 'manual-own-lot')
    const otherLot = await service.createRecharge(otherMainUser, rechargePayload({
      paidAmount: 100,
      giftAmount: 0,
      rechargeDate: '2026-08-10'
    }), 'manual-other-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 80
      },
      idempotencyKey: 'manual-consume'
    }))
    const original = prisma.consumptions[0]

    const result = await service.reverseConsumption(mainUser, original.id, '金额录错', 'manual-reversal')

    expect(result).toMatchObject({
      reversalOfId: original.id,
      memberId,
      consumingFrontendUserId: 'front-1',
      actorUserId: 'front-1',
      amount: 80,
      balance: 150,
      reason: '金额录错'
    })
    expect(prisma.recharges.find((row) => row.id === ownLot.id)?.remainingAmount.toNumber()).toBe(50)
    expect(prisma.recharges.find((row) => row.id === otherLot.id)?.remainingAmount.toNumber()).toBe(100)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(150)
    expect(original).toMatchObject({
      kind: SharedPrepaidConsumptionKind.CONSUMPTION,
      amount: new Prisma.Decimal(80),
      sampleNumberSnapshot: 'A-001',
      elementsSnapshot: ['ironRaw'],
      phoneSnapshot: '13800000000',
      active: false
    })
    expect(prisma.consumptions[1]).toMatchObject({
      kind: SharedPrepaidConsumptionKind.REVERSAL,
      amount: new Prisma.Decimal(80),
      reversalOfId: original.id,
      actorUserId: 'front-1',
      active: false
    })
    expect(prisma.allocations).toHaveLength(2)
    expect(prisma.payables).toMatchObject([{ status: SharedPrepaidPayableStatus.REVERSED }])
    expect(prisma.ledgerEntries.at(-1)).toMatchObject({
      kind: SharedPrepaidLedgerKind.CONSUMPTION_REVERSAL,
      balanceDelta: new Prisma.Decimal(80),
      referenceId: prisma.consumptions[1].id,
      ownerFrontendUserId: 'front-1',
      actorUserId: 'front-1',
      reason: '金额录错',
      requestFingerprint: expect.any(String),
      responseSnapshot: expect.any(Object)
    })
  })

  it('rejects manual reversal while the consumption is held by an unfinished settlement', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-held-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'manual-held-consume'
    }))
    prisma.payables[0].status = SharedPrepaidPayableStatus.HELD

    await expect(service.reverseConsumption(
      otherMainUser,
      prisma.consumptions[0].id,
      '金额录错',
      'manual-held-reversal'
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_CONSUMPTION_SETTLEMENT_HELD' })
    })
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(80)
    expect(prisma.recharges[0].remainingAmount.toNumber()).toBe(80)
    expect(prisma.consumptions).toHaveLength(1)
    expect(prisma.consumptions[0].active).toBe(true)
  })

  it('manually reverses a completed payable with an exact opposite pending payable', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-completed-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: '33.30'
      },
      idempotencyKey: 'manual-completed-consume'
    }))
    const originalPayable = prisma.payables[0]
    originalPayable.status = SharedPrepaidPayableStatus.COMPLETED

    await service.reverseConsumption(
      otherMainUser,
      prisma.consumptions[0].id,
      '结算后发现金额录错',
      'manual-completed-reversal'
    )

    expect(prisma.payables).toHaveLength(2)
    expect(originalPayable.status).toBe(SharedPrepaidPayableStatus.COMPLETED)
    expect(prisma.payables[1]).toMatchObject({
      sourceOwnerId: originalPayable.consumerOwnerId,
      consumerOwnerId: originalPayable.sourceOwnerId,
      exactAmount: new Prisma.Decimal('33.30000000'),
      amount: new Prisma.Decimal('33.3'),
      status: SharedPrepaidPayableStatus.PENDING,
      reversalOfId: originalPayable.id
    })
  })

  it('keeps manual consumption reversal main-account-only and scoped to the consuming owner', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-owner-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'manual-owner-consume'
    }))
    const consumptionId = prisma.consumptions[0].id

    await expect(service.reverseConsumption(subUser, consumptionId, '金额录错', 'manual-sub-reversal'))
      .rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.reverseConsumption(otherMainUser, consumptionId, '金额录错', 'manual-other-reversal'))
      .rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.consumptions).toHaveLength(1)
    expect(prisma.consumptions[0].active).toBe(true)
  })

  it('rejects an empty reason, a second reversal, and reversal of a reversal record', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-state-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'manual-state-consume'
    }))
    const originalId = prisma.consumptions[0].id

    await expect(service.reverseConsumption(mainUser, originalId, '  ', 'manual-empty-reason'))
      .rejects.toBeInstanceOf(BadRequestException)
    await service.reverseConsumption(mainUser, originalId, '金额录错', 'manual-first-reversal')
    const reversalId = prisma.consumptions[1].id

    await expect(service.reverseConsumption(mainUser, originalId, '再次冲正', 'manual-second-reversal'))
      .rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PREPAID_CONSUMPTION_ALREADY_REVERSED' })
      })
    await expect(service.reverseConsumption(mainUser, reversalId, '再次冲正', 'manual-reverse-reversal'))
      .rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PREPAID_CONSUMPTION_REVERSAL_TARGET_INVALID' })
      })
  })

  it('returns the original manual reversal snapshot and conflicts on any changed request field', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-idempotent-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'manual-idempotent-consume'
    }))
    const consumptionId = prisma.consumptions[0].id

    const first = await service.reverseConsumption(mainUser, consumptionId, ' 金额录错 ', 'manual-idempotent-reversal')
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 50, giftAmount: 0 }), 'manual-later-balance')
    const retry = await service.reverseConsumption(mainUser, consumptionId, '金额录错', 'manual-idempotent-reversal')

    expect(retry).toEqual(first)
    expect(first.balance).toBe(100)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(150)
    expect(prisma.consumptions.filter((row) => row.kind === SharedPrepaidConsumptionKind.REVERSAL)).toHaveLength(1)
    await expect(service.reverseConsumption(mainUser, consumptionId, '日期录错', 'manual-idempotent-reversal'))
      .rejects.toBeInstanceOf(ConflictException)
    await expect(service.reverseConsumption(mainUser, 'another-consumption', '金额录错', 'manual-idempotent-reversal'))
      .rejects.toBeInstanceOf(ConflictException)
    await expect(service.reverseConsumption(otherMainUser, consumptionId, '金额录错', 'manual-idempotent-reversal'))
      .rejects.toBeInstanceOf(ConflictException)
  })

  it('returns the committed winner after a same-request idempotency race without duplicate reversal rows', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-race-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'manual-race-consume'
    }))
    prisma.p2002AfterNextCommit = 'same-request'

    const result = await service.reverseConsumption(
      mainUser,
      prisma.consumptions[0].id,
      '金额录错',
      'manual-race-reversal'
    )

    expect(result).toMatchObject({ reversalOfId: prisma.consumptions[0].id, balance: 100 })
    expect(prisma.consumptions.filter((row) => row.kind === SharedPrepaidConsumptionKind.REVERSAL)).toHaveLength(1)
    expect(prisma.ledgerEntries.filter((row) => row.kind === SharedPrepaidLedgerKind.CONSUMPTION_REVERSAL)).toHaveLength(1)
  })

  it('rechecks a consumption reversal winner after waiting for the member lock', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-lock-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'manual-lock-consume'
    }))
    const consumptionId = prisma.consumptions[0].id
    prisma.afterNextLock = async () => {
      await service.reverseConsumption(mainUser, consumptionId, '金额录错', 'manual-lock-reversal')
    }

    const result = await service.reverseConsumption(
      mainUser,
      consumptionId,
      '金额录错',
      'manual-lock-reversal'
    )

    expect(result).toMatchObject({ reversalOfId: consumptionId, balance: 100 })
    expect(prisma.consumptions.filter((row) => row.kind === SharedPrepaidConsumptionKind.REVERSAL)).toHaveLength(1)
    expect(prisma.ledgerEntries.filter((row) => row.kind === SharedPrepaidLedgerKind.CONSUMPTION_REVERSAL)).toHaveLength(1)
  })

  it('rolls back every manual consumption reversal write when the append-only ledger fails', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'manual-atomic-lot')
    const memberId = prisma.members[0].id
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 20
      },
      idempotencyKey: 'manual-atomic-consume'
    }))
    prisma.failNextLedgerCreate = true

    await expect(service.reverseConsumption(
      mainUser,
      prisma.consumptions[0].id,
      '金额录错',
      'manual-atomic-reversal'
    )).rejects.toThrow('injected ledger failure')
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(80)
    expect(prisma.recharges[0].remainingAmount.toNumber()).toBe(80)
    expect(prisma.consumptions).toHaveLength(1)
    expect(prisma.consumptions[0].active).toBe(true)
    expect(prisma.payables).toEqual([])
    expect(prisma.ledgerEntries).toHaveLength(2)
  })

  it('consumes the current owner lots first, then global FIFO lots, and creates one rounded payable per source owner', async () => {
    const otherLot = await service.createRecharge(otherMainUser, rechargePayload({
      rechargeDate: '2026-08-01',
      paidAmount: 100,
      giftAmount: 10
    }), 'lot-other')
    const ownLot = await service.createRecharge(mainUser, rechargePayload({
      rechargeDate: '2026-08-10',
      paidAmount: 60,
      giftAmount: 0
    }), 'lot-own')
    const memberId = prisma.members[0].id

    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId
      }
    }))

    expect(prisma.allocations.map((row) => ({ rechargeId: row.rechargeId, amount: row.allocatedAmount.toNumber() }))).toEqual([
      { rechargeId: ownLot.id, amount: 60 },
      { rechargeId: otherLot.id, amount: 40 }
    ])
    expect(prisma.payables).toHaveLength(1)
    expect(prisma.payables[0]).toMatchObject({
      sourceOwnerId: 'front-2',
      consumerOwnerId: 'front-1',
      exactAmount: new Prisma.Decimal('36.36363636'),
      amount: new Prisma.Decimal('36.4'),
      status: SharedPrepaidPayableStatus.PENDING
    })
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(70)
    expect(prisma.ledgerEntries.at(-1)).toMatchObject({
      kind: SharedPrepaidLedgerKind.CONSUMPTION,
      balanceDelta: new Prisma.Decimal(-100),
      ownerFrontendUserId: 'front-1',
      actorUserId: 'sub-1'
    })
  })

  it('rejects an insufficient deduction without partial lot, member, consumption, or payable writes', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload({ paidAmount: 50, giftAmount: 0 }), 'lot-small')
    const memberId = prisma.members[0].id

    const operation = service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 60
      },
      idempotencyKey: 'consume-insufficient'
    }))

    await expect(operation).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PREPAID_BALANCE_INSUFFICIENT',
        availableBalance: new Prisma.Decimal(50)
      })
    })
    expect(prisma.recharges.find((row) => row.id === recharge.id)?.remainingAmount.toNumber()).toBe(50)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(50)
    expect(prisma.consumptions).toEqual([])
    expect(prisma.allocations).toEqual([])
    expect(prisma.payables).toEqual([])
    expect(prisma.ledgerEntries).toHaveLength(1)
  })

  it('reverses the exact original lots before applying a changed prepaid amount', async () => {
    const recharge = await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'lot-change')
    const memberId = prisma.members[0].id
    const originalNextInputs = {
      ...consumptionInput().nextInputs as object,
      prepaidMemberId: memberId,
      price: 60
    }
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: originalNextInputs,
      idempotencyKey: 'consume-original'
    }))

    await service.syncSampleConsumption(prisma as never, consumptionInput({
      oldInputs: originalNextInputs,
      nextInputs: { ...originalNextInputs, price: 30 },
      idempotencyKey: 'consume-changed'
    }))

    expect(prisma.consumptions.map((row) => ({ kind: row.kind, amount: row.amount.toNumber(), active: row.active }))).toEqual([
      { kind: SharedPrepaidConsumptionKind.CONSUMPTION, amount: 60, active: false },
      { kind: SharedPrepaidConsumptionKind.REVERSAL, amount: 60, active: false },
      { kind: SharedPrepaidConsumptionKind.CONSUMPTION, amount: 30, active: true }
    ])
    expect(prisma.recharges.find((row) => row.id === recharge.id)?.remainingAmount.toNumber()).toBe(70)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(70)
    expect(prisma.ledgerEntries.slice(-3).map((row) => row.balanceDelta.toNumber())).toEqual([-60, 60, -30])
  })

  it('restores the old member and charges the normalized global phone member when selection changes', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'member-one-lot')
    await service.createRecharge(otherMainUser, rechargePayload({
      phone: '13900000000',
      paidAmount: 80,
      giftAmount: 0
    }), 'member-two-lot')
    const firstMember = prisma.members.find((row) => row.phone === '13800000000')!
    const secondMember = prisma.members.find((row) => row.phone === '13900000000')!
    const firstInputs = {
      ...consumptionInput().nextInputs as object,
      prepaidMemberId: firstMember.id,
      price: 40
    }
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: firstInputs,
      idempotencyKey: 'member-first'
    }))

    await service.syncSampleConsumption(prisma as never, consumptionInput({
      oldInputs: firstInputs,
      nextInputs: {
        ...firstInputs,
        prepaidMemberId: secondMember.id,
        prepaidMemberPhone: '139-0000-0000',
        price: 30
      },
      idempotencyKey: 'member-changed'
    }))

    expect(firstMember.cachedBalance.toNumber()).toBe(100)
    expect(secondMember.cachedBalance.toNumber()).toBe(50)
    expect(prisma.consumptions.filter((row) => row.active)).toMatchObject([{
      memberId: secondMember.id,
      phoneSnapshot: '13900000000',
      amount: new Prisma.Decimal(30)
    }])
  })

  it('creates an opposite payable without rewriting a completed settlement', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'cross-lot')
    const memberId = prisma.members[0].id
    const prepaidInputs = {
      ...consumptionInput().nextInputs as object,
      prepaidMemberId: memberId,
      price: 40
    }
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      nextInputs: prepaidInputs,
      idempotencyKey: 'cross-consume'
    }))
    prisma.payables[0].status = SharedPrepaidPayableStatus.COMPLETED

    await service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      oldInputs: prepaidInputs,
      nextInputs: {
        ...prepaidInputs,
        paymentStatus: '已结款',
        prepaidMemberId: null,
        prepaidMemberPhone: null
      },
      idempotencyKey: 'cross-reversal'
    }))

    expect(prisma.payables).toHaveLength(2)
    expect(prisma.payables[0].status).toBe(SharedPrepaidPayableStatus.COMPLETED)
    expect(prisma.payables[1]).toMatchObject({
      sourceOwnerId: 'front-2',
      consumerOwnerId: 'front-1',
      exactAmount: new Prisma.Decimal(40),
      amount: new Prisma.Decimal(40),
      reversalOfId: prisma.payables[0].id,
      status: SharedPrepaidPayableStatus.PENDING
    })
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(100)
  })

  it('returns idempotently after response loss without duplicate consumption, allocation, payable, or ledger rows', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'retry-lot')
    const memberId = prisma.members[0].id
    const input = consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 40
      },
      idempotencyKey: 'response-loss'
    })

    await service.syncSampleConsumption(prisma as never, input)
    await service.syncSampleConsumption(prisma as never, input)

    expect(prisma.consumptions).toHaveLength(1)
    expect(prisma.allocations).toHaveLength(1)
    expect(prisma.payables).toHaveLength(0)
    expect(prisma.ledgerEntries.filter((row) => row.kind === SharedPrepaidLedgerKind.CONSUMPTION)).toHaveLength(1)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(60)
  })

  it('rejects an orphan consumption idempotency row instead of appending duplicate financial rows', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'orphan-lot')
    const memberId = prisma.members[0].id
    prisma.consumptions.push({
      id: 'orphan-consumption',
      memberId,
      consumingFrontendUserId: 'front-1',
      actorUserId: 'sub-1',
      kind: SharedPrepaidConsumptionKind.CONSUMPTION,
      amount: new Prisma.Decimal(40),
      sheetId: 'other-sheet',
      sampleBlockId: 'other-block',
      sampleIndex: 1,
      sampleNumberSnapshot: null,
      sampleCountSnapshot: 1,
      elementsSnapshot: [],
      phoneSnapshot: '13800000000',
      sheetDate: '2026-08-12',
      active: false,
      reversalOfId: null,
      idempotencyKey: 'orphan-consumption-key',
      createdAt
    })

    await expect(service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 40
      },
      idempotencyKey: 'orphan-consumption-key'
    }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_IDEMPOTENCY_STATE_INVALID' })
    })
    expect(prisma.consumptions).toHaveLength(1)
    expect(prisma.allocations).toEqual([])
  })

  it('marks an unheld pending payable reversed without fabricating an opposite transfer', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'pending-lot')
    const memberId = prisma.members[0].id
    const prepaidInputs = {
      ...consumptionInput().nextInputs as object,
      prepaidMemberId: memberId,
      price: 25
    }
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      nextInputs: prepaidInputs,
      idempotencyKey: 'pending-consume'
    }))

    await service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      oldInputs: prepaidInputs,
      nextInputs: { ...prepaidInputs, paymentStatus: '已结款' },
      idempotencyKey: 'pending-reversal'
    }))

    expect(prisma.payables).toHaveLength(1)
    expect(prisma.payables[0].status).toBe(SharedPrepaidPayableStatus.REVERSED)
  })

  it('rolls back a reversed original consumption when the replacement amount is insufficient', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'replace-lot')
    const memberId = prisma.members[0].id
    const prepaidInputs = {
      ...consumptionInput().nextInputs as object,
      prepaidMemberId: memberId,
      price: 60
    }
    await prisma.$transaction((tx) => service.syncSampleConsumption(tx as never, consumptionInput({
      nextInputs: prepaidInputs,
      idempotencyKey: 'replace-original'
    })))

    await expect(prisma.$transaction((tx) => service.syncSampleConsumption(tx as never, consumptionInput({
      oldInputs: prepaidInputs,
      nextInputs: { ...prepaidInputs, price: 120 },
      idempotencyKey: 'replace-insufficient'
    })))).rejects.toBeInstanceOf(ConflictException)

    expect(prisma.members[0].cachedBalance.toNumber()).toBe(40)
    expect(prisma.recharges[0].remainingAmount.toNumber()).toBe(40)
    expect(prisma.consumptions).toHaveLength(1)
    expect(prisma.consumptions[0].active).toBe(true)
    expect(prisma.ledgerEntries.filter((row) => row.kind !== SharedPrepaidLedgerKind.RECHARGE)).toHaveLength(1)
  })

  it('rolls back lot and consumption writes when the optimistic member version update loses', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'version-lot')
    const memberId = prisma.members[0].id
    prisma.failNextMemberUpdateMany = true

    await expect(prisma.$transaction((tx) => service.syncSampleConsumption(tx as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        price: 40
      },
      idempotencyKey: 'version-conflict'
    })))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_BALANCE_VERSION_CONFLICT' })
    })

    expect(prisma.members[0].cachedBalance.toNumber()).toBe(100)
    expect(prisma.recharges[0].remainingAmount.toNumber()).toBe(100)
    expect(prisma.consumptions).toEqual([])
    expect(prisma.allocations).toEqual([])
  })

  it('blocks reversal while a payable is held by an unfinished settlement', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'held-lot')
    const memberId = prisma.members[0].id
    const prepaidInputs = {
      ...consumptionInput().nextInputs as object,
      prepaidMemberId: memberId,
      price: 20
    }
    await service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      nextInputs: prepaidInputs,
      idempotencyKey: 'held-consume'
    }))
    prisma.payables[0].status = SharedPrepaidPayableStatus.HELD

    await expect(service.syncSampleConsumption(prisma as never, consumptionInput({
      consumingFrontendUserId: 'front-2',
      actorUserId: 'front-2',
      oldInputs: prepaidInputs,
      nextInputs: { ...prepaidInputs, paymentStatus: '已结款' },
      idempotencyKey: 'held-reversal'
    }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_CONSUMPTION_SETTLEMENT_HELD' })
    })
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(80)
    expect(prisma.consumptions[0].active).toBe(true)
  })

  it('rejects an incomplete or mismatched prepaid member tuple before changing balance', async () => {
    await service.createRecharge(mainUser, rechargePayload({ paidAmount: 100, giftAmount: 0 }), 'tuple-lot')
    const memberId = prisma.members[0].id

    await expect(service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: '',
        prepaidMemberPhone: '13800000000'
      },
      idempotencyKey: 'tuple-missing'
    }))).rejects.toBeInstanceOf(BadRequestException)
    await service.createRecharge(otherMainUser, rechargePayload({
      phone: '13900000000',
      paidAmount: 50,
      giftAmount: 0
    }), 'tuple-other-member')
    await expect(service.syncSampleConsumption(prisma as never, consumptionInput({
      nextInputs: {
        ...consumptionInput().nextInputs as object,
        prepaidMemberId: memberId,
        prepaidMemberPhone: '13900000000'
      },
      idempotencyKey: 'tuple-mismatch'
    }))).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.members[0].cachedBalance.toNumber()).toBe(100)
    expect(prisma.members[1].cachedBalance.toNumber()).toBe(50)
    expect(prisma.consumptions).toEqual([])
  })
})

describe('SharedPrepaidQueryService', () => {
  it('returns global member totals, remaining owner composition, and latest activity as JSON numbers', async () => {
    const prisma = new FakePrisma()
    const ledger = new SharedPrepaidLedgerService(prisma as never, { publish() {} } as never)
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
    const ledger = new SharedPrepaidLedgerService(prisma as never, { publish() {} } as never)
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
    const ledger = new SharedPrepaidLedgerService(prisma as never, { publish() {} } as never)
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
    const ledger = new SharedPrepaidLedgerService(prisma as never, { publish() {} } as never)
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
