import { BadRequestException, ForbiddenException, RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { ROLES_KEY } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { CalculationDraftController } from './calculation-draft.controller'
import { CalculationDraftService } from './calculation-draft.service'

const frontendUser: CurrentUser = {
  id: 'front-1',
  account: 'front-1',
  username: '前台一',
  role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1',
  permissionVersion: 0,
  permissions: [],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: true,
  isFrontendSubAccount: false
}

const frontendSubUser: CurrentUser = {
  ...frontendUser,
  id: 'sub-1',
  account: 'sub-1',
  username: '子账号',
  role: UserRole.FRONTEND_SUB_USER,
  dataOwnerId: 'front-1',
  permissions: ['DATA_STANDARD_SAMPLE'],
  isFrontendMainAccount: false,
  isFrontendSubAccount: true
}

const payload = {
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

function createController() {
  const service = {
    get: vi.fn().mockResolvedValue({}),
    save: vi.fn().mockResolvedValue({})
  }
  return {
    controller: new CalculationDraftController(service as unknown as CalculationDraftService),
    service
  }
}

describe('CalculationDraftController', () => {
  it('maps only the exact public slug and authenticated frontend identity on GET', async () => {
    const { controller, service } = createController()

    await controller.get(frontendUser, 'standard-sample')

    expect(service.get).toHaveBeenCalledWith('front-1', 'STANDARD_SAMPLE')
    await expect(controller.get(frontendUser, 'STANDARD_SAMPLE')).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.get(frontendUser, 'standard_sample')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('maps coefficient PUT without accepting a client-supplied tenant identity', async () => {
    const { controller, service } = createController()

    await controller.put(frontendUser, 'coefficient', { baseRevision: 0, payload })

    expect(service.save).toHaveBeenCalledWith('front-1', 'COEFFICIENT', 0, payload)
    await expect(controller.put(frontendUser, 'coefficient', {
      baseRevision: 0,
      payload,
      frontendUserId: 'front-2'
    } as never)).rejects.toBeInstanceOf(BadRequestException)
    expect(service.save).toHaveBeenCalledTimes(1)
  })

  it('shares drafts through the authoritative data owner for frontend subaccounts', async () => {
    const { controller, service } = createController()

    await controller.get(frontendSubUser, 'standard-sample')
    await controller.put(frontendSubUser, 'standard-sample', { baseRevision: 0, payload })

    expect(service.get).toHaveBeenCalledWith('front-1', 'STANDARD_SAMPLE')
    expect(service.save).toHaveBeenCalledWith('front-1', 'STANDARD_SAMPLE', 0, payload)
  })

  it('does not let a subaccount use one calculation permission to access the other draft kind', async () => {
    const { controller, service } = createController()

    await expect(controller.get(frontendSubUser, 'coefficient')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(controller.put(frontendSubUser, 'coefficient', { baseRevision: 0, payload }))
      .rejects.toBeInstanceOf(ForbiddenException)
    expect(service.get).not.toHaveBeenCalled()
    expect(service.save).not.toHaveBeenCalled()
  })

  it.each([
    null,
    [],
    { payload },
    { baseRevision: 0 },
    { baseRevision: 0, payload, injected: true }
  ])('rejects malformed PUT bodies before calling the service', async (body) => {
    const { controller, service } = createController()

    await expect(controller.put(frontendUser, 'standard-sample', body as never))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(service.save).not.toHaveBeenCalled()
  })

  it('is protected by authentication, frontend-only role metadata, and GET/PUT routes only', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CalculationDraftController)).toBe('calculation-drafts')
    expect(Reflect.getMetadata(GUARDS_METADATA, CalculationDraftController)).toEqual([AuthGuard, RolesGuard, FrontendPermissionGuard])
    expect(Reflect.getMetadata(ROLES_KEY, CalculationDraftController)).toEqual([UserRole.FRONTEND_USER])
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, CalculationDraftController)).toEqual([
      'DATA_STANDARD_SAMPLE',
      'DATA_COEFFICIENT'
    ])
    expect(Reflect.getMetadata(PATH_METADATA, CalculationDraftController.prototype.get)).toBe(':kind')
    expect(Reflect.getMetadata(METHOD_METADATA, CalculationDraftController.prototype.get)).toBe(RequestMethod.GET)
    expect(Reflect.getMetadata(PATH_METADATA, CalculationDraftController.prototype.put)).toBe(':kind')
    expect(Reflect.getMetadata(METHOD_METADATA, CalculationDraftController.prototype.put)).toBe(RequestMethod.PUT)
    expect(Object.getOwnPropertyNames(CalculationDraftController.prototype).filter((name) => name !== 'constructor'))
      .toEqual(['get', 'put'])
  })
})
