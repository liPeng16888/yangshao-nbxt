import { BadRequestException, RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { ROLES_KEY } from '../auth/roles.decorator'
import { FrontendPreferencesController } from './frontend-preferences.controller'
import { FrontendPreferencesModule } from './frontend-preferences.module'
import { FrontendPreferencesService } from './frontend-preferences.service'

const user: CurrentUser = {
  id: 'sub-1',
  account: 'sub-1',
  username: '子账号',
  role: UserRole.FRONTEND_SUB_USER,
  dataOwnerId: 'main-1',
  permissionVersion: 1,
  permissions: ['DATA_MAIN'],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: false,
  isFrontendSubAccount: true
}

function createService() {
  return {
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue({})
  } as unknown as FrontendPreferencesService
}

describe('FrontendPreferencesController', () => {
  it('exposes only the customer GET collection and PUT section routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, FrontendPreferencesController)).toBe('frontend-preferences')
    expect([
      [FrontendPreferencesController.prototype.list, RequestMethod.GET, '/'],
      [FrontendPreferencesController.prototype.save, RequestMethod.PUT, ':section']
    ].map(([handler, method, path]) => ({
      actualMethod: Reflect.getMetadata(METHOD_METADATA, handler),
      expectedMethod: method,
      actualPath: Reflect.getMetadata(PATH_METADATA, handler),
      expectedPath: path
    }))).toEqual([
      { actualMethod: RequestMethod.GET, expectedMethod: RequestMethod.GET, actualPath: '/', expectedPath: '/' },
      { actualMethod: RequestMethod.PUT, expectedMethod: RequestMethod.PUT, actualPath: ':section', expectedPath: ':section' }
    ])
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FrontendPreferencesModule)).toEqual([
      FrontendPreferencesController
    ])
  })

  it('keeps role, coarse permission and all three guards on the customer controller', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FrontendPreferencesController)).toEqual([UserRole.FRONTEND_USER])
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, FrontendPreferencesController)).toEqual([
      'DATA_MAIN', 'LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE'
    ])
    expect(Reflect.getMetadata(GUARDS_METADATA, FrontendPreferencesController)).toHaveLength(3)
  })

  it('passes only authenticated identity and the parsed fixed section to the service', async () => {
    const service = createService()
    const controller = new FrontendPreferencesController(service)
    const dto = { value: ['王庄'], baseVersion: 1 }

    await controller.list(user)
    await controller.save(user, 'LAB_REPORT_SAMPLE_UNITS', dto)

    expect(service.list).toHaveBeenCalledWith(user)
    expect(service.save).toHaveBeenCalledWith(user, 'LAB_REPORT_SAMPLE_UNITS', dto)
  })

  it('rejects an unknown section before calling the service', async () => {
    const service = createService()
    const controller = new FrontendPreferencesController(service)

    expect(() => controller.save(user, 'OTHER_OWNER_SECTION', { value: [], baseVersion: 0 }))
      .toThrow(BadRequestException)
    expect(service.save).not.toHaveBeenCalled()
  })
})
