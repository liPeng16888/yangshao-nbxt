import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { ROLES_KEY } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { LabSheetsController } from './lab-sheets.controller'

const frontendUser: CurrentUser = {
  id: 'front-1',
  account: 'front-1',
  username: '前台一',
  role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
  isFrontendMainAccount: true, isFrontendSubAccount: false
}

const frontendSubUser: CurrentUser = {
  id: 'sub-1', account: 'sub-1', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
  dataOwnerId: 'front-1', permissionVersion: 2, permissions: ['DATA_MAIN'], requiresAccessGuardPassword: true,
  isFrontendMainAccount: false, isFrontendSubAccount: true
}

describe('LabSheetsController segmented parameter access', () => {
  const sheets = {
    applyCurrentParametersFromIndex: vi.fn().mockResolvedValue({}),
    addSampleBlocks: vi.fn().mockResolvedValue({})
  }
  const retests = {
    createRetests: vi.fn().mockResolvedValue([]),
    saveRetest: vi.fn().mockResolvedValue({}),
    deleteRetest: vi.fn().mockResolvedValue({}),
    voidRetest: vi.fn().mockResolvedValue({})
  }
  const auth = {
    isFeatureProtected: vi.fn(),
    hasAccessGrant: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sheets.applyCurrentParametersFromIndex.mockResolvedValue({})
    sheets.addSampleBlocks.mockResolvedValue({})
    retests.createRetests.mockResolvedValue([])
    retests.saveRetest.mockResolvedValue({})
    retests.deleteRetest.mockResolvedValue({})
    retests.voidRetest.mockResolvedValue({})
  })

  it('passes a denied completed-sample grant to the apply service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockResolvedValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)
    const payload = { parameters: {}, startIndex: 3 }

    await controller.applyCurrentParameters(frontendUser, payload, 'client-1', 'wrong-grant')

    expect(auth.hasAccessGrant).toHaveBeenCalledWith(frontendUser, 'wrong-grant', 'COMPLETED_SAMPLE_DATA')
    expect(sheets.applyCurrentParametersFromIndex).toHaveBeenCalledWith('front-1', payload, 'client-1', false, 'front-1')
  })

  it('passes an accepted completed-sample grant to the apply service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockResolvedValue(true)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)

    await controller.applyCurrentParameters(frontendUser, { parameters: {}, startIndex: 3 }, 'client-1', 'valid-grant')

    expect(sheets.applyCurrentParametersFromIndex).toHaveBeenCalledWith(
      'front-1',
      { parameters: {}, startIndex: 3 },
      'client-1',
      true,
      'front-1'
    )
  })

  it('allows completed-sample fields when the feature is not protected', async () => {
    auth.isFeatureProtected.mockResolvedValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)

    await controller.applyCurrentParameters(frontendUser, { parameters: {}, startIndex: 1 }, 'client-1')

    expect(auth.hasAccessGrant).not.toHaveBeenCalled()
    expect(sheets.applyCurrentParametersFromIndex).toHaveBeenCalledWith(
      'front-1',
      { parameters: {}, startIndex: 1 },
      'client-1',
      true,
      'front-1'
    )
  })

  it('passes a denied completed-sample grant to the add-blocks service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockResolvedValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)

    await controller.addBlocks(frontendUser, 'sheet-1', 2, 'client-1', 'wrong-grant')

    expect(auth.hasAccessGrant).toHaveBeenCalledWith(frontendUser, 'wrong-grant', 'COMPLETED_SAMPLE_DATA')
    expect(sheets.addSampleBlocks).toHaveBeenCalledWith('front-1', 'sheet-1', 2, 'client-1', false, 'front-1')
  })

  it('passes an accepted completed-sample grant to the add-blocks service', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockResolvedValue(true)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)

    await controller.addBlocks(frontendUser, 'sheet-1', 1, 'client-1', 'valid-grant')

    expect(sheets.addSampleBlocks).toHaveBeenCalledWith('front-1', 'sheet-1', 1, 'client-1', true, 'front-1')
  })

  it('uses the parent data owner for subaccount reads and writes', async () => {
    auth.isFeatureProtected.mockResolvedValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)

    await controller.addBlocks(frontendSubUser, 'sheet-1', 1, 'client-1')

    expect(sheets.addSampleBlocks).toHaveBeenCalledWith('front-1', 'sheet-1', 1, 'client-1', true, 'sub-1')
  })

  it('passes the parent data owner, actual actor and completed-data grant to retest creation', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockResolvedValue(true)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)
    const payload = { sampleBlockIds: ['block-1'], idempotencyKey: 'create-1' }

    await controller.createRetests(frontendSubUser, 'sheet-1', payload, 'client-1', 'grant-1')

    expect(auth.hasAccessGrant).toHaveBeenCalledWith(frontendSubUser, 'grant-1', 'COMPLETED_SAMPLE_DATA')
    expect(retests.createRetests).toHaveBeenCalledWith(frontendSubUser, 'sheet-1', payload, 'client-1', true)
  })

  it('forwards all retest write routes with their IDs, payloads and denied completed-data grant', async () => {
    auth.isFeatureProtected.mockResolvedValue(true)
    auth.hasAccessGrant.mockResolvedValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)
    const createPayload = { sampleBlockIds: ['block-1'], idempotencyKey: 'create-1' }
    const savePayload = { changedFields: { aluminum: 1 }, idempotencyKey: 'save-1' }
    const deletePayload = { baseUpdatedAt: '2026-08-20T10:00:00.000Z', idempotencyKey: 'delete-1' }
    const voidPayload = { baseUpdatedAt: '2026-08-20T10:00:00.000Z', idempotencyKey: 'void-1', reason: '复核无效' }

    await controller.createRetests(frontendUser, 'sheet-1', createPayload, 'client-1', 'denied')
    await controller.saveRetest(frontendUser, 'sheet-1', 'retest-1', savePayload, 'client-1', 'denied')
    await controller.deleteRetest(frontendUser, 'sheet-1', 'retest-1', deletePayload, 'client-1', 'denied')
    await controller.voidRetest(frontendUser, 'sheet-1', 'retest-1', voidPayload, 'client-1', 'denied')

    expect(retests.createRetests).toHaveBeenCalledWith(frontendUser, 'sheet-1', createPayload, 'client-1', false)
    expect(retests.saveRetest).toHaveBeenCalledWith(frontendUser, 'sheet-1', 'retest-1', savePayload, 'client-1', false)
    expect(retests.deleteRetest).toHaveBeenCalledWith(frontendUser, 'sheet-1', 'retest-1', deletePayload, 'client-1', false)
    expect(retests.voidRetest).toHaveBeenCalledWith(frontendUser, 'sheet-1', 'retest-1', voidPayload, 'client-1', false)
  })

  it('allows unprotected retest writes without an access-grant lookup', async () => {
    auth.isFeatureProtected.mockResolvedValue(false)
    const controller = new LabSheetsController(sheets as never, auth as never, retests as never)
    const payload = { sampleBlockIds: ['block-1'], idempotencyKey: 'create-1' }

    await controller.createRetests(frontendUser, 'sheet-1', payload, 'client-1')

    expect(auth.hasAccessGrant).not.toHaveBeenCalled()
    expect(retests.createRetests).toHaveBeenCalledWith(frontendUser, 'sheet-1', payload, 'client-1', true)
  })

  it('keeps all retest routes behind the frontend DATA_MAIN guards for main and permitted subaccounts', () => {
    const handler = LabSheetsController.prototype.createRetests
    const contextFor = (user: CurrentUser) => ({
      getClass: () => LabSheetsController,
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => ({ user }) })
    })

    expect(Reflect.getMetadata(GUARDS_METADATA, LabSheetsController)).toEqual([AuthGuard, RolesGuard, FrontendPermissionGuard])
    expect(Reflect.getMetadata(ROLES_KEY, LabSheetsController)).toEqual([UserRole.FRONTEND_USER])
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, LabSheetsController)).toEqual(['DATA_MAIN'])
    expect(new RolesGuard(new Reflector()).canActivate(contextFor(frontendUser) as never)).toBe(true)
    expect(new RolesGuard(new Reflector()).canActivate(contextFor(frontendSubUser) as never)).toBe(true)
    expect(new FrontendPermissionGuard(new Reflector()).canActivate(contextFor(frontendUser) as never)).toBe(true)
    expect(new FrontendPermissionGuard(new Reflector()).canActivate(contextFor(frontendSubUser) as never)).toBe(true)
    expect(() => new FrontendPermissionGuard(new Reflector()).canActivate(contextFor({ ...frontendSubUser, permissions: [] }) as never))
      .toThrow(ForbiddenException)
  })

  it.each([
    ['createRetests', RequestMethod.POST, ':sheetId/sample-retests'],
    ['saveRetest', RequestMethod.PUT, ':sheetId/sample-retests/:retestId'],
    ['deleteRetest', RequestMethod.DELETE, ':sheetId/sample-retests/:retestId'],
    ['voidRetest', RequestMethod.PATCH, ':sheetId/sample-retests/:retestId/void']
  ] as const)('registers %s as the protected %s %s route', (name, method, path) => {
    const handler = LabSheetsController.prototype[name]

    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method)
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path)
  })
})
