import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '../auth/current-user'
import { ROLES_KEY } from '../auth/roles.decorator'
import { AdminModule } from '../admin/admin.module'
import { RolesGuard } from '../auth/roles.guard'
import { AdminSharedPrepaidController } from './admin-shared-prepaid.controller'
import { SharedPrepaidController } from './shared-prepaid.controller'
import { SharedPrepaidModule } from './shared-prepaid.module'

const rootAdmin: CurrentUser = {
  id: 'root-admin',
  account: 'root',
  username: '主管理员',
  role: UserRole.ROOT_ADMIN,
  dataOwnerId: 'root-admin',
  permissionVersion: 1,
  permissions: [],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: false,
  isFrontendSubAccount: false
}

const subAdmin: CurrentUser = {
  ...rootAdmin,
  id: 'sub-admin',
  account: 'sub',
  username: '子管理员',
  dataOwnerId: 'sub-admin',
  role: UserRole.SUB_ADMIN
}

const frontendUser: CurrentUser = {
  ...rootAdmin,
  id: 'front-1',
  account: 'front',
  username: '前台账号',
  dataOwnerId: 'front-1',
  role: UserRole.FRONTEND_USER,
  isFrontendMainAccount: true
}

function roleContext(controller: object, handler: string, user: CurrentUser) {
  return {
    getHandler: () => Object.getPrototypeOf(controller)[handler],
    getClass: () => controller.constructor,
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  }
}

function fixture(allowedIds = ['front-1']) {
  const queryService = Object.fromEntries([
    'listAdminRecharges',
    'getAdminRechargeDetail',
    'listAdminMembers',
    'getAdminMemberDetail',
    'listAdminConsumptions',
    'getAdminConsumptionDetail',
    'listAdminSettlements',
    'getAdminSettlementDetail'
  ].map((name) => [name, vi.fn().mockResolvedValue({ items: [] })]))
  const adminAccess = {
    parseFrontendUserIds: vi.fn((value?: string | string[]) => (
      Array.isArray(value) ? value : value ? value.split(',') : []
    )),
    getAllowedFrontendUserIds: vi.fn().mockResolvedValue(allowedIds)
  }
  return {
    controller: new AdminSharedPrepaidController(queryService as never, adminAccess as never),
    queryService,
    adminAccess
  }
}

describe('AdminSharedPrepaidController', () => {
  it('is registered with the module that imports the admin access service', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SharedPrepaidModule))
      .toContain(AdminSharedPrepaidController)
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, SharedPrepaidModule))
      .toContain(AdminModule)
  })

  it('registers only the four GET collections and their GET details under the admin prefix', () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, AdminSharedPrepaidController)
    const registeredRoutes = Object.getOwnPropertyNames(AdminSharedPrepaidController.prototype)
      .filter((name) => name !== 'constructor')
      .flatMap((name) => {
        const handler = AdminSharedPrepaidController.prototype[name as keyof AdminSharedPrepaidController]
        const method = Reflect.getMetadata(METHOD_METADATA, handler)
        const path = Reflect.getMetadata(PATH_METADATA, handler)
        return method === undefined ? [] : [{ method, path: `/${controllerPath}/${path}` }]
      })

    expect(registeredRoutes.map((route) => route.path).sort()).toEqual([
      '/admin/shared-prepaid/consumptions',
      '/admin/shared-prepaid/consumptions/:id',
      '/admin/shared-prepaid/members',
      '/admin/shared-prepaid/members/:id',
      '/admin/shared-prepaid/recharges',
      '/admin/shared-prepaid/recharges/:id',
      '/admin/shared-prepaid/settlements',
      '/admin/shared-prepaid/settlements/:id'
    ])
    expect(registeredRoutes.filter((route) => route.path.startsWith('/admin/shared-prepaid'))
      .every((route) => route.method === RequestMethod.GET)).toBe(true)
    expect(Reflect.getMetadata(ROLES_KEY, AdminSharedPrepaidController)).toEqual([
      UserRole.ROOT_ADMIN,
      UserRole.SUB_ADMIN
    ])
  })

  it('rejects frontend tokens on admin reads and admin tokens on frontend mutations', () => {
    const guard = new RolesGuard(new Reflector())
    const adminController = Object.create(AdminSharedPrepaidController.prototype)
    const frontendController = Object.create(SharedPrepaidController.prototype)

    expect(() => guard.canActivate(roleContext(adminController, 'listRecharges', frontendUser) as never))
      .toThrow(ForbiddenException)
    expect(() => guard.canActivate(roleContext(frontendController, 'createRecharge', rootAdmin) as never))
      .toThrow(ForbiddenException)
  })

  it('lets root admin query every frontend account while preserving filters and pagination', async () => {
    const { controller, queryService, adminAccess } = fixture(['front-1', 'front-2'])
    const query = {
      frontendUserIds: '',
      page: 2,
      pageSize: 25,
      ownerFrontendUserId: 'front-2',
      phone: '1380000',
      startDate: '2026-08-01',
      endDate: '2026-08-12',
      isOpeningBalance: false
    }

    await controller.listRecharges(rootAdmin, query)

    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledWith(rootAdmin, [])
    expect(queryService.listAdminRecharges).toHaveBeenCalledWith(
      ['front-1', 'front-2'],
      expect.objectContaining({ page: 2, pageSize: 25, ownerFrontendUserId: 'front-2', phone: '1380000' })
    )
  })

  it('passes only the sub-admin allowed account scope to all collections', async () => {
    const { controller, queryService, adminAccess } = fixture(['front-1'])
    const query = { frontendUserIds: 'front-1,front-denied', page: 1, pageSize: 20 }

    await controller.listRecharges(subAdmin, query)
    await controller.listMembers(subAdmin, query)
    await controller.listConsumptions(subAdmin, { ...query, status: 'REVERSED' })
    await controller.listSettlements(subAdmin, { ...query, status: 'REJECTED' })

    expect(adminAccess.parseFrontendUserIds).toHaveBeenCalledTimes(4)
    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledTimes(4)
    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenNthCalledWith(
      1,
      subAdmin,
      ['front-1', 'front-denied']
    )
    expect(queryService.listAdminRecharges).toHaveBeenCalledWith(['front-1'], expect.any(Object))
    expect(queryService.listAdminMembers).toHaveBeenCalledWith(['front-1'], expect.any(Object))
    expect(queryService.listAdminConsumptions).toHaveBeenCalledWith(
      ['front-1'],
      expect.objectContaining({ status: 'REVERSED' })
    )
    expect(queryService.listAdminSettlements).toHaveBeenCalledWith(
      ['front-1'],
      expect.objectContaining({ status: 'REJECTED' })
    )
  })

  it('checks the same allowed account scope before returning any detail', async () => {
    const { controller, queryService, adminAccess } = fixture(['front-1'])
    const query = { frontendUserIds: 'front-1' }

    await controller.getRechargeDetail(subAdmin, 'recharge-1', query)
    await controller.getMemberDetail(subAdmin, 'member-1', query)
    await controller.getConsumptionDetail(subAdmin, 'consumption-1', query)
    await controller.getSettlementDetail(subAdmin, 'settlement-1', query)

    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledTimes(4)
    expect(queryService.getAdminRechargeDetail).toHaveBeenCalledWith(['front-1'], 'recharge-1')
    expect(queryService.getAdminMemberDetail).toHaveBeenCalledWith(['front-1'], 'member-1')
    expect(queryService.getAdminConsumptionDetail).toHaveBeenCalledWith(['front-1'], 'consumption-1')
    expect(queryService.getAdminSettlementDetail).toHaveBeenCalledWith(['front-1'], 'settlement-1')
  })
})
