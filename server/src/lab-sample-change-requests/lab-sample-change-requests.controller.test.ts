import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { AdminModule } from '../admin/admin.module'
import { AuthModule } from '../auth/auth.module'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { ROLES_KEY } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { AppModule } from '../app.module'
import { LabSheetsModule } from '../lab-sheets/lab-sheets.module'
import { AdminLabSampleChangeRequestsController } from './admin-lab-sample-change-requests.controller'
import { LabSampleChangeRequestsController } from './lab-sample-change-requests.controller'
import { LabSampleChangeRequestsModule } from './lab-sample-change-requests.module'
import { LabSampleChangeRequestsService } from './lab-sample-change-requests.service'

const frontendUser: CurrentUser = { id: 'front-1', account: 'front-1', username: '前台一', role: UserRole.FRONTEND_USER }
const subAdmin: CurrentUser = { id: 'admin-1', account: 'admin-1', username: '子管理员', role: UserRole.SUB_ADMIN }

function fixture() {
  const service = {
    createForFrontend: vi.fn().mockResolvedValue({}),
    listForFrontend: vi.fn().mockResolvedValue([]),
    getForFrontend: vi.fn().mockResolvedValue({}),
    withdrawForFrontend: vi.fn().mockResolvedValue({}),
    listForAdmin: vi.fn().mockResolvedValue([]),
    getForAdmin: vi.fn().mockResolvedValue({}),
    approveForAdmin: vi.fn().mockResolvedValue({}),
    rejectForAdmin: vi.fn().mockResolvedValue({})
  } as unknown as LabSampleChangeRequestsService
  return {
    service,
    controller: new LabSampleChangeRequestsController(service),
    adminController: new AdminLabSampleChangeRequestsController(service)
  }
}

describe('Lab sample change request controllers', () => {
  it('passes both independent access grants to frontend creation', async () => {
    const { controller, service } = fixture()
    const createDto = { blockId: 'block-1', baseUpdatedAt: '2026-08-19T00:00:00.000Z', changes: { price: 10 }, reason: '修正价格' }

    await controller.create(frontendUser, createDto as never, 'history-token', 'completed-token')

    expect(service.createForFrontend).toHaveBeenCalledWith(frontendUser, createDto, {
      historical: 'history-token', completedData: 'completed-token'
    })
  })

  it('passes both independent access grants to every other frontend request route', async () => {
    const { controller, service } = fixture()
    const query = { status: 'PENDING', date: '2026-08-19' }

    await controller.list(frontendUser, query as never, 'history-token', 'completed-token')
    await controller.detail(frontendUser, 'request-1', 'history-token', 'completed-token')
    await controller.withdraw(frontendUser, 'request-1', 'history-token', 'completed-token')

    const grants = { historical: 'history-token', completedData: 'completed-token' }
    expect(service.listForFrontend).toHaveBeenCalledWith(frontendUser, query, grants)
    expect(service.getForFrontend).toHaveBeenCalledWith(frontendUser, 'request-1', grants)
    expect(service.withdrawForFrontend).toHaveBeenCalledWith(frontendUser, 'request-1', grants)
  })

  it('passes admin filters and actor to the admin service', async () => {
    const { adminController, service } = fixture()
    const query = { frontendUserIds: 'front-1', status: 'PENDING', date: '2026-08-19' }

    await adminController.list(subAdmin, query as never)
    await adminController.detail(subAdmin, 'request-1')

    expect(service.listForAdmin).toHaveBeenCalledWith(subAdmin, query)
    expect(service.getForAdmin).toHaveBeenCalledWith(subAdmin, 'request-1')
  })

  it('maps unified review bodies directly for approve and reject', async () => {
    const { adminController, service } = fixture()
    const approveDto = { reviewRemark: '审核通过' }
    const rejectDto = { reviewRemark: '请补充说明' }

    await adminController.approve(subAdmin, 'request-1', approveDto as never)
    await adminController.reject(subAdmin, 'request-1', rejectDto as never)

    expect(service.approveForAdmin).toHaveBeenCalledWith(subAdmin, 'request-1', approveDto)
    expect(service.rejectForAdmin).toHaveBeenCalledWith(subAdmin, 'request-1', rejectDto)
  })

  it('exposes the exact guarded frontend and admin routes', () => {
    const frontendHandlers = ['create', 'list', 'detail', 'withdraw'] as const
    const adminHandlers = ['list', 'detail', 'approve', 'reject'] as const

    expect(Reflect.getMetadata(PATH_METADATA, LabSampleChangeRequestsController)).toBe('lab-sheets/change-requests')
    expect(Reflect.getMetadata(PATH_METADATA, AdminLabSampleChangeRequestsController)).toBe('admin/lab-sheet-change-requests')
    expect(frontendHandlers.map((name) => [Reflect.getMetadata(METHOD_METADATA, LabSampleChangeRequestsController.prototype[name]), Reflect.getMetadata(PATH_METADATA, LabSampleChangeRequestsController.prototype[name])]))
      .toEqual([[RequestMethod.POST, '/'], [RequestMethod.GET, '/'], [RequestMethod.GET, ':id'], [RequestMethod.POST, ':id/withdraw']])
    expect(adminHandlers.map((name) => [Reflect.getMetadata(METHOD_METADATA, AdminLabSampleChangeRequestsController.prototype[name]), Reflect.getMetadata(PATH_METADATA, AdminLabSampleChangeRequestsController.prototype[name])]))
      .toEqual([[RequestMethod.GET, '/'], [RequestMethod.GET, ':id'], [RequestMethod.POST, ':id/approve'], [RequestMethod.POST, ':id/reject']])
  })

  it('restricts controllers with AuthGuard, RolesGuard, and the required roles', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, LabSampleChangeRequestsController)).toEqual([AuthGuard, RolesGuard])
    expect(Reflect.getMetadata(ROLES_KEY, LabSampleChangeRequestsController)).toEqual([UserRole.FRONTEND_USER])
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminLabSampleChangeRequestsController)).toEqual([AuthGuard, RolesGuard])
    expect(Reflect.getMetadata(ROLES_KEY, AdminLabSampleChangeRequestsController)).toEqual([UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN])
  })

  it('wires request APIs into their module and AppModule after LabSheetsModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, LabSampleChangeRequestsModule)).toEqual([AuthModule, AdminModule, LabSheetsModule])
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, LabSampleChangeRequestsModule)).toEqual([LabSampleChangeRequestsService])
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, LabSampleChangeRequestsModule)).toEqual([
      LabSampleChangeRequestsController, AdminLabSampleChangeRequestsController
    ])

    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)
    expect(appImports).toContain(LabSampleChangeRequestsModule)
    expect(appImports.indexOf(LabSampleChangeRequestsModule)).toBe(appImports.indexOf(LabSheetsModule) + 1)
  })
})
