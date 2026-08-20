import 'reflect-metadata'
import { ForbiddenException, Logger, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { defaultLabParameters } from '../common/lab'
import { AdminDataController } from './data.controller'
import { AdminDataService } from './data.service'

const subAdmin: CurrentUser = {
  id: 'sub-admin-1',
  account: 'sub-admin',
  username: '受限后台',
  role: UserRole.SUB_ADMIN,
  dataOwnerId: 'sub-admin-1',
  permissionVersion: 1,
  permissions: [],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: false,
  isFrontendSubAccount: false
}

function makeRetest(sequence: number, status: 'ACTIVE' | 'VOID') {
  return {
    id: `retest-${sequence}`,
    sampleBlockId: 'block-1',
    sequence,
    inputs: { ironRaw: sequence },
    results: { iron: 999 },
    parameterSnapshot: { ...defaultLabParameters, ironFactor: 10 + sequence },
    everFilled: true,
    status,
    voidReason: status === 'VOID' ? '复核无效' : null,
    createdById: 'front-1',
    updatedById: 'front-1',
    voidedById: status === 'VOID' ? 'front-1' : null,
    createdAt: new Date(`2026-08-20T0${sequence}:00:00.000Z`),
    updatedAt: new Date(`2026-08-20T0${sequence}:30:00.000Z`),
    voidedAt: status === 'VOID' ? new Date('2026-08-20T03:00:00.000Z') : null
  }
}

function makeSheet(options: {
  inputs?: Record<string, unknown>
  retests?: ReturnType<typeof makeRetest>[]
} = {}) {
  return {
    id: 'sheet-1',
    frontendUserId: 'front-1',
    date: '2026-08-20',
    parameters: defaultLabParameters,
    updatedAt: new Date('2026-08-20T04:00:00.000Z'),
    frontendUser: { account: 'front-one', username: '前台一', displayRemark: null },
    sampleBlocks: [{
      id: 'block-1',
      index: 1,
      inputs: options.inputs ?? { sequence: '001', sampleNumber: '样品甲', completed: true },
      results: { iron: 1 },
      parameterSnapshot: defaultLabParameters,
      retests: options.retests ?? [makeRetest(1, 'ACTIVE'), makeRetest(2, 'VOID')]
    }]
  }
}

function makeService(options: { denied?: boolean; sheets?: ReturnType<typeof makeSheet>[] } = {}) {
  const prisma = {
    labSheet: { findMany: vi.fn().mockResolvedValue(options.sheets ?? [makeSheet()]) },
    customer: { findMany: vi.fn().mockResolvedValue([]) }
  }
  const access = {
    parseFrontendUserIds: vi.fn((value?: string | string[]) => Array.isArray(value) ? value : String(value || '').split(',').filter(Boolean)),
    getAllowedFrontendUserIds: options.denied
      ? vi.fn().mockRejectedValue(new ForbiddenException('没有访问部分前端账号的权限'))
      : vi.fn().mockResolvedValue(['front-1'])
  }
  const customerOverviewService = { getRows: vi.fn() }
  return {
    service: new AdminDataService(prisma as never, access as never, customerOverviewService as never),
    prisma,
    access,
    customerOverviewService
  }
}

describe('AdminDataService lab sheet retests', () => {
  it('returns ordered active and void retests only from the allowed frontend account scope', async () => {
    const { service, prisma, access, customerOverviewService } = makeService()

    const result = await service.labSheets(subAdmin, {
      frontendUserIds: ['front-1'],
      date: '2026-08-20'
    })

    expect(access.getAllowedFrontendUserIds).toHaveBeenCalledWith(subAdmin, ['front-1'])
    expect(prisma.labSheet.findMany).toHaveBeenCalledWith({
      where: { frontendUserId: { in: ['front-1'] }, date: '2026-08-20' },
      include: {
        frontendUser: { select: { account: true, username: true, displayRemark: true } },
        sampleBlocks: {
          orderBy: { index: 'asc' },
          include: { retests: { orderBy: { sequence: 'asc' } } }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
    expect(result[0].sampleBlocks[0].retests).toMatchObject([
      { id: 'retest-1', sequence: 1, status: 'ACTIVE', readonly: true, sensitiveFieldsHidden: false },
      { id: 'retest-2', sequence: 2, status: 'VOID', readonly: true, voidReason: '复核无效' }
    ])
    expect(result[0].sampleBlocks[0].retests[0].results.iron).toBe(10.56)
    expect(customerOverviewService.getRows).not.toHaveBeenCalled()
  })

  it('rejects a corrupted retest snapshot from the admin read-only boundary', async () => {
    const corrupted = makeSheet({
      retests: [makeRetest(1, 'ACTIVE')]
    })
    corrupted.sampleBlocks[0].retests[0].parameterSnapshot = null as never
    const { service } = makeService({ sheets: [corrupted] })
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    try {
      await expect(service.labSheets(subAdmin, {
        frontendUserIds: ['front-1'],
        date: '2026-08-20'
      })).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({ code: 'SAMPLE_RETEST_PARAMETER_SNAPSHOT_INVALID' })
      })
    } finally {
      log.mockRestore()
    }
  })

  it('does not query retests after the existing access service rejects a disallowed tenant', async () => {
    const { service, prisma } = makeService({ denied: true })

    await expect(service.labSheets(subAdmin, {
      frontendUserIds: ['front-1', 'front-denied'],
      date: '2026-08-20'
    })).rejects.toThrow('没有访问部分前端账号的权限')

    expect(prisma.labSheet.findMany).not.toHaveBeenCalled()
  })

  it('retains a sheet and blank parent block when the block has active or void retests', async () => {
    const blankParentWithRetests = makeSheet({
      inputs: { sequence: '001', completed: false },
      retests: [makeRetest(1, 'ACTIVE'), makeRetest(2, 'VOID')]
    })
    const { service } = makeService({ sheets: [blankParentWithRetests] })

    const result = await service.labSheets(subAdmin, {
      frontendUserIds: ['front-1'],
      date: '2026-08-20'
    })

    expect(result).toHaveLength(1)
    expect(result[0].sampleBlocks).toHaveLength(1)
    expect(result[0].sampleBlocks[0].retests.map((row) => row.status)).toEqual(['ACTIVE', 'VOID'])
  })

  it('continues omitting a truly blank parent block and sheet when no retest exists', async () => {
    const trulyBlank = makeSheet({
      inputs: { sequence: '001', completed: false },
      retests: []
    })
    const { service } = makeService({ sheets: [trulyBlank] })

    const result = await service.labSheets(subAdmin, {
      frontendUserIds: ['front-1'],
      date: '2026-08-20'
    })

    expect(result).toEqual([])
  })

  it('keeps the existing admin lab-sheet route GET-only and registers no admin retest mutation', () => {
    const controller = AdminDataController.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
    const routes = Object.getOwnPropertyNames(AdminDataController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => ({
        path: Reflect.getMetadata(PATH_METADATA, controller[name]) as string | undefined,
        method: Reflect.getMetadata(METHOD_METADATA, controller[name]) as RequestMethod | undefined
      }))

    expect(routes).toContainEqual({ path: 'data-statistics/lab-sheets', method: RequestMethod.GET })
    expect(routes.filter((route) => route.path?.includes('sample-retest'))).toEqual([])
  })
})
