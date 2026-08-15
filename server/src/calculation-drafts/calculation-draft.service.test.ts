import { BadRequestException, ConflictException } from '@nestjs/common'
import { CalculationDraftKind } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalculationDraftService } from './calculation-draft.service'

const updatedAt = new Date('2026-08-15T08:00:00.000Z')

const validStandard = {
  aluminum: {
    highStandard: 69.74,
    highReading: 7.7,
    lowStandard: 52,
    lowReading: 12.2,
    baseValue: 214.38
  },
  silicon: {
    lowStandard: 4.88,
    lowReading: 0.405,
    highStandard: 17.05,
    highReading: 1.31
  },
  iron: {
    lowStandard: 6.09,
    lowReading: 0.147,
    highStandard: 15.31,
    highReading: 0.461
  }
}

const validCoefficient = {
  parameters: {
    ironBlank: 0.04,
    ironFactor: 29.1,
    siliconBlank: 0.027,
    siliconFactor: 13,
    aluminumFactor1: 0.502,
    aluminumFactor2: 4.98,
    calciumFactor: 1.15,
    magnesiumFactor: 0.556,
    titaniumFactor: 0.57
  },
  standardAddCount: 1,
  calculationAddCount: 1,
  standardRows: [{
    id: 'standard-1',
    code: '001',
    autoCode: true,
    aluminum: null,
    silicon: null,
    iron: null,
    calcium: null,
    magnesium: null,
    titanium: null
  }],
  calculationRows: [{
    id: 'calculation-1',
    code: '001',
    autoCode: true,
    inputs: {
      ironRaw: null,
      siliconRaw: null,
      aluminumRaw: null,
      calciumRaw: null,
      magnesiumRaw: null,
      titaniumRaw: null
    }
  }]
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    frontendUserId: 'front-a',
    kind: CalculationDraftKind.STANDARD_SAMPLE,
    payload: validStandard,
    revision: 1,
    createdAt: new Date('2026-08-15T07:00:00.000Z'),
    updatedAt,
    ...overrides
  }
}

describe('CalculationDraftService', () => {
  const prisma = {
    frontendCalculationDraft: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn()
    }
  }
  let service: CalculationDraftService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new CalculationDraftService(prisma as never)
  })

  it('returns the validated standard-sample defaults at revision zero through an account-kind read', async () => {
    prisma.frontendCalculationDraft.findUnique.mockResolvedValue(null)

    const result = await service.get('front-a', 'STANDARD_SAMPLE')

    expect(prisma.frontendCalculationDraft.findUnique).toHaveBeenCalledWith({
      where: { frontendUserId_kind: { frontendUserId: 'front-a', kind: 'STANDARD_SAMPLE' } }
    })
    expect(result).toEqual({
      kind: 'STANDARD_SAMPLE',
      payload: validStandard,
      revision: 0,
      updatedAt: null
    })
  })

  it('returns deterministic valid coefficient defaults without a database row', async () => {
    prisma.frontendCalculationDraft.findUnique.mockResolvedValue(null)

    const result = await service.get('front-a', 'COEFFICIENT')

    expect(result).toMatchObject({
      kind: 'COEFFICIENT',
      revision: 0,
      updatedAt: null,
      payload: {
        parameters: validCoefficient.parameters,
        standardAddCount: 1,
        calculationAddCount: 1
      }
    })
    expect(result.payload.standardRows).toHaveLength(3)
    expect(result.payload.calculationRows).toHaveLength(3)
    expect(result.payload.standardRows[0]).toEqual(validCoefficient.standardRows[0])
    expect(result.payload.calculationRows[0]).toEqual(validCoefficient.calculationRows[0])
  })

  it('maps only the public draft contract and never returns a cross-account row', async () => {
    prisma.frontendCalculationDraft.findUnique
      .mockResolvedValueOnce(draftRow())
      .mockResolvedValueOnce(draftRow({ frontendUserId: 'front-b', revision: 9 }))

    const own = await service.get('front-a', 'STANDARD_SAMPLE')
    const foreign = await service.get('front-a', 'STANDARD_SAMPLE')

    expect(own).toEqual({
      kind: 'STANDARD_SAMPLE',
      payload: validStandard,
      revision: 1,
      updatedAt
    })
    expect(own).not.toHaveProperty('id')
    expect(own).not.toHaveProperty('frontendUserId')
    expect(own).not.toHaveProperty('createdAt')
    expect(foreign).toMatchObject({ kind: 'STANDARD_SAMPLE', revision: 0, updatedAt: null })
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe base revision %s before any Prisma operation',
    async (baseRevision) => {
      await expect(service.save('front-a', 'STANDARD_SAMPLE', baseRevision, validStandard))
        .rejects.toBeInstanceOf(BadRequestException)

      expect(prisma.frontendCalculationDraft.findUnique).not.toHaveBeenCalled()
      expect(prisma.frontendCalculationDraft.create).not.toHaveBeenCalled()
      expect(prisma.frontendCalculationDraft.updateMany).not.toHaveBeenCalled()
    }
  )

  it('rejects an invalid payload before any Prisma operation', async () => {
    await expect(service.save('front-a', 'STANDARD_SAMPLE', 0, { ...validStandard, frontendUserId: 'front-b' }))
      .rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.frontendCalculationDraft.findUnique).not.toHaveBeenCalled()
    expect(prisma.frontendCalculationDraft.create).not.toHaveBeenCalled()
    expect(prisma.frontendCalculationDraft.updateMany).not.toHaveBeenCalled()
  })

  it('creates the first account-kind draft at revision one', async () => {
    prisma.frontendCalculationDraft.findUnique.mockResolvedValue(null)
    prisma.frontendCalculationDraft.create.mockResolvedValue(draftRow())

    const result = await service.save('front-a', 'STANDARD_SAMPLE', 0, validStandard)

    expect(prisma.frontendCalculationDraft.create).toHaveBeenCalledWith({
      data: {
        frontendUserId: 'front-a',
        kind: 'STANDARD_SAMPLE',
        payload: validStandard,
        revision: 1
      }
    })
    expect(result).toEqual({ kind: 'STANDARD_SAMPLE', payload: validStandard, revision: 1, updatedAt })
  })

  it('converts a duplicate-create race to the canonical account-scoped conflict', async () => {
    const serverRow = draftRow({
      kind: CalculationDraftKind.COEFFICIENT,
      payload: validCoefficient,
      revision: 4
    })
    prisma.frontendCalculationDraft.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(serverRow)
    prisma.frontendCalculationDraft.create.mockRejectedValue({ code: 'P2002', meta: { target: 'secret' } })

    const error = await service.save('front-a', 'COEFFICIENT', 0, validCoefficient).catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getStatus()).toBe(409)
    expect(error.getResponse()).toEqual({
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { kind: 'COEFFICIENT', payload: validCoefficient, revision: 4, updatedAt }
    })
    expect(prisma.frontendCalculationDraft.findUnique).toHaveBeenLastCalledWith({
      where: { frontendUserId_kind: { frontendUserId: 'front-a', kind: 'COEFFICIENT' } }
    })
  })

  it('updates with an atomic account-kind-revision selector and returns the stored next revision', async () => {
    const current = draftRow({
      kind: CalculationDraftKind.COEFFICIENT,
      payload: validCoefficient,
      revision: 3
    })
    const savedAt = new Date('2026-08-15T09:00:00.000Z')
    const saved = draftRow({
      kind: CalculationDraftKind.COEFFICIENT,
      payload: validCoefficient,
      revision: 4,
      updatedAt: savedAt
    })
    prisma.frontendCalculationDraft.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(saved)
    prisma.frontendCalculationDraft.updateMany.mockResolvedValue({ count: 1 })

    const result = await service.save('front-a', 'COEFFICIENT', 3, validCoefficient)

    expect(prisma.frontendCalculationDraft.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'draft-1',
        frontendUserId: 'front-a',
        kind: 'COEFFICIENT',
        revision: 3
      },
      data: { payload: validCoefficient, revision: { increment: 1 } }
    })
    expect(prisma.frontendCalculationDraft.findUnique).toHaveBeenLastCalledWith({
      where: { frontendUserId_kind: { frontendUserId: 'front-a', kind: 'COEFFICIENT' } }
    })
    expect(result).toEqual({ kind: 'COEFFICIENT', payload: validCoefficient, revision: 4, updatedAt: savedAt })
  })

  it('reloads only the same account-kind and returns the canonical conflict when atomic update loses', async () => {
    const current = draftRow({ kind: CalculationDraftKind.COEFFICIENT, payload: validCoefficient, revision: 3 })
    const server = draftRow({ kind: CalculationDraftKind.COEFFICIENT, payload: validCoefficient, revision: 4 })
    prisma.frontendCalculationDraft.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(server)
    prisma.frontendCalculationDraft.updateMany.mockResolvedValue({ count: 0 })

    const error = await service.save('front-a', 'COEFFICIENT', 3, validCoefficient).catch((caught) => caught)

    expect(error.getResponse()).toEqual({
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { kind: 'COEFFICIENT', payload: validCoefficient, revision: 4, updatedAt }
    })
    expect(prisma.frontendCalculationDraft.findUnique).toHaveBeenLastCalledWith({
      where: { frontendUserId_kind: { frontendUserId: 'front-a', kind: 'COEFFICIENT' } }
    })
  })

  it('returns a conflict if another write advances the draft before the successful update reload', async () => {
    const current = draftRow({ kind: CalculationDraftKind.COEFFICIENT, payload: validCoefficient, revision: 3 })
    const newerPayload = {
      ...validCoefficient,
      parameters: { ...validCoefficient.parameters, ironBlank: 0.08 }
    }
    const newer = draftRow({
      kind: CalculationDraftKind.COEFFICIENT,
      payload: newerPayload,
      revision: 5
    })
    prisma.frontendCalculationDraft.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(newer)
    prisma.frontendCalculationDraft.updateMany.mockResolvedValue({ count: 1 })

    const error = await service.save('front-a', 'COEFFICIENT', 3, validCoefficient).catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getResponse()).toEqual({
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { kind: 'COEFFICIENT', payload: newerPayload, revision: 5, updatedAt }
    })
  })

  it('returns a safe canonical conflict if the reload after a successful update fails', async () => {
    const current = draftRow({ kind: CalculationDraftKind.COEFFICIENT, payload: validCoefficient, revision: 3 })
    prisma.frontendCalculationDraft.findUnique
      .mockResolvedValueOnce(current)
      .mockRejectedValue(new Error('database details'))
    prisma.frontendCalculationDraft.updateMany.mockResolvedValue({ count: 1 })

    const error = await service.save('front-a', 'COEFFICIENT', 3, validCoefficient).catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getResponse()).toMatchObject({
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { kind: 'COEFFICIENT', revision: 0, updatedAt: null }
    })
    expect(JSON.stringify(error.getResponse())).not.toContain('database details')
  })

  it('returns a safe canonical conflict if a successful update reload contains malformed JSON', async () => {
    const current = draftRow({ kind: CalculationDraftKind.COEFFICIENT, payload: validCoefficient, revision: 3 })
    const malformed = draftRow({
      kind: CalculationDraftKind.COEFFICIENT,
      payload: { frontendUserId: 'front-b' },
      revision: 4
    })
    prisma.frontendCalculationDraft.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValue(malformed)
    prisma.frontendCalculationDraft.updateMany.mockResolvedValue({ count: 1 })

    const error = await service.save('front-a', 'COEFFICIENT', 3, validCoefficient).catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getResponse()).toMatchObject({
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { kind: 'COEFFICIENT', revision: 0, updatedAt: null }
    })
    expect(JSON.stringify(error.getResponse())).not.toContain('frontendUserId')
  })

  it.each([
    ['missing', null],
    ['failed', new Error('database details')]
  ] as const)('uses a safe default when a conflict reload is %s', async (_label, reloadResult) => {
    const current = draftRow({ kind: CalculationDraftKind.COEFFICIENT, payload: validCoefficient, revision: 3 })
    prisma.frontendCalculationDraft.findUnique.mockResolvedValueOnce(current)
    if (reloadResult instanceof Error) prisma.frontendCalculationDraft.findUnique.mockRejectedValueOnce(reloadResult)
    else prisma.frontendCalculationDraft.findUnique.mockResolvedValueOnce(reloadResult)
    prisma.frontendCalculationDraft.updateMany.mockResolvedValue({ count: 0 })

    const error = await service.save('front-a', 'COEFFICIENT', 3, validCoefficient).catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getResponse()).toMatchObject({
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { kind: 'COEFFICIENT', revision: 0, updatedAt: null }
    })
    expect(JSON.stringify(error.getResponse())).not.toContain('database details')
  })
})
