import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { INTERCEPTORS_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { AccessGuardFeature, UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { EmployeeAttendanceController } from './employee-attendance.controller'
import { EmployeeAttendanceService } from './employee-attendance.service'

const frontendUser: CurrentUser = {
  id: 'front-1', account: 'front-1', username: '前台一', role: UserRole.FRONTEND_USER
}

function createController(options: { protected?: boolean; grantValid?: boolean } = {}) {
  const serviceNames = [
    'listEmployees', 'getEmployee', 'revealEmployee', 'createEmployee', 'updateEmployee', 'deleteEmployee',
    'attachPhoto', 'getPhotoPath', 'listWeeklySchedules', 'createWeeklySchedule', 'updateWeeklySchedule', 'deleteWeeklySchedule',
    'listDateOverrides', 'createDateOverride', 'updateDateOverride', 'deleteDateOverride', 'listMonthlySettings',
    'upsertMonthlySetting', 'deleteMonthlySetting', 'listAttendance', 'createAttendance', 'generateAttendance',
    'updateAttendance', 'deleteAttendance', 'listLeaveTypes', 'createLeaveType', 'updateLeaveType', 'deleteLeaveType',
    'listLeaveRequests', 'createLeaveRequest', 'updateLeaveRequest', 'deleteLeaveRequest', 'approveLeave', 'rejectLeave',
    'listCommissionTypes', 'createCommissionType', 'updateCommissionType', 'deleteCommissionType',
    'listCommissionRecords', 'createCommissionRecord', 'updateCommissionRecord', 'deleteCommissionRecord',
    'listBonuses', 'createBonus', 'updateBonus', 'deleteBonus', 'compensationTotals'
  ] as const
  const service = Object.fromEntries(serviceNames.map((name) => [name, vi.fn().mockResolvedValue({})])) as unknown as EmployeeAttendanceService
  const auth = {
    isFeatureProtected: vi.fn().mockResolvedValue(Boolean(options.protected)),
    hasAccessGrant: vi.fn().mockReturnValue(Boolean(options.grantValid)),
    assertAccessGrant: vi.fn(async (frontendUserId: string, grant: string | undefined, feature: AccessGuardFeature, alwaysRequire = false) => {
      const protectedFeature = alwaysRequire || await auth.isFeatureProtected(frontendUserId, feature)
      if (protectedFeature && !auth.hasAccessGrant(frontendUserId, grant, feature)) throw new ForbiddenException('访问授权无效或已过期')
    })
  }
  const photos = { save: vi.fn().mockResolvedValue('/private/new.jpg'), read: vi.fn().mockResolvedValue(Buffer.from('photo')), remove: vi.fn() }
  return { controller: new EmployeeAttendanceController(service, auth as never, photos as never), service: service as any, auth, photos }
}

describe('EmployeeAttendanceController authorization and ownership', () => {
  it('uses only the authenticated frontend account for writes', async () => {
    const { controller, service } = createController()
    const body = { frontendUserId: 'front-2', employeeNumber: '001', name: '张三', hireDate: '2026-08-01' }

    await controller.createEmployee(frontendUser, body as never, undefined)

    expect(service.createEmployee).toHaveBeenCalledWith('front-1', 'front-1', {
      employeeNumber: '001', name: '张三', hireDate: '2026-08-01'
    })
  })

  it('requires a valid grant when employee attendance is protected', async () => {
    const { controller, service, auth } = createController({ protected: true, grantValid: false })

    await expect(controller.listEmployees(frontendUser, {}, 'bad-grant')).rejects.toBeInstanceOf(ForbiddenException)

    expect(auth.isFeatureProtected).toHaveBeenCalledWith('front-1', AccessGuardFeature.EMPLOYEE_ATTENDANCE)
    expect(auth.hasAccessGrant).toHaveBeenCalledWith('front-1', 'bad-grant', AccessGuardFeature.EMPLOYEE_ATTENDANCE)
    expect(service.listEmployees).not.toHaveBeenCalled()
  })

  it('allows protected attendance requests with the matching grant', async () => {
    const { controller, service } = createController({ protected: true, grantValid: true })

    await controller.listEmployees(frontendUser, {}, 'valid-grant')

    expect(service.listEmployees).toHaveBeenCalledWith('front-1', {})
  })

  it('always requires an attendance grant before revealing employee sensitive data', async () => {
    const { controller, service } = createController({ protected: false, grantValid: false })

    await expect(controller.revealEmployee(frontendUser, 'employee-1', undefined)).rejects.toBeInstanceOf(ForbiddenException)
    expect(service.revealEmployee).not.toHaveBeenCalled()
  })

  it('exposes authenticated CRUD routes rather than admin routes', () => {
    const methods = Object.getOwnPropertyNames(EmployeeAttendanceController.prototype)
      .filter((name) => name.startsWith('create'))
      .map((name) => Reflect.getMetadata(METHOD_METADATA, EmployeeAttendanceController.prototype[name as keyof EmployeeAttendanceController]))

    expect(methods.length).toBeGreaterThan(5)
    expect(methods.every((method) => method === RequestMethod.POST)).toBe(true)
  })

  it('limits employee photo buffering to 5 MB at the Multer interceptor', () => {
    const [Interceptor] = Reflect.getMetadata(INTERCEPTORS_METADATA, EmployeeAttendanceController.prototype.uploadPhoto)
    const instance = new Interceptor() as { multer: { limits: { fileSize: number } } }
    expect(instance.multer.limits.fileSize).toBe(5 * 1024 * 1024)
  })

  it('checks the attendance grant and authenticated ownership on every public endpoint', async () => {
    const { controller, service, auth } = createController({ protected: true, grantValid: true })
    const grant = 'valid-grant'
    const body = { frontendUserId: 'front-2' }
    const cases: Array<{ method: string; args: unknown[]; serviceMethod: string; prefix: string[]; force?: boolean }> = [
      { method: 'listEmployees', args: [{}, grant], serviceMethod: 'listEmployees', prefix: ['front-1'] },
      { method: 'getEmployee', args: ['id', grant], serviceMethod: 'getEmployee', prefix: ['front-1'] },
      { method: 'revealEmployee', args: ['id', grant], serviceMethod: 'revealEmployee', prefix: ['front-1', 'front-1'], force: true },
      { method: 'createEmployee', args: [body, grant], serviceMethod: 'createEmployee', prefix: ['front-1', 'front-1'] },
      { method: 'updateEmployee', args: ['id', body, grant], serviceMethod: 'updateEmployee', prefix: ['front-1', 'front-1'] },
      { method: 'deleteEmployee', args: ['id', grant], serviceMethod: 'deleteEmployee', prefix: ['front-1', 'front-1'] },
      { method: 'uploadPhoto', args: ['id', { buffer: Buffer.from('x') }, grant], serviceMethod: 'attachPhoto', prefix: ['front-1', 'front-1'] },
      { method: 'readPhoto', args: ['id', grant], serviceMethod: 'getPhotoPath', prefix: ['front-1'] },
      { method: 'listWeeklySchedules', args: [undefined, grant], serviceMethod: 'listWeeklySchedules', prefix: ['front-1'] },
      { method: 'createWeeklySchedule', args: [body, grant], serviceMethod: 'createWeeklySchedule', prefix: ['front-1', 'front-1'] },
      { method: 'updateWeeklySchedule', args: ['id', body, grant], serviceMethod: 'updateWeeklySchedule', prefix: ['front-1', 'front-1'] },
      { method: 'deleteWeeklySchedule', args: ['id', grant], serviceMethod: 'deleteWeeklySchedule', prefix: ['front-1', 'front-1'] },
      { method: 'listDateOverrides', args: [{}, grant], serviceMethod: 'listDateOverrides', prefix: ['front-1'] },
      { method: 'createDateOverride', args: [body, grant], serviceMethod: 'createDateOverride', prefix: ['front-1', 'front-1'] },
      { method: 'updateDateOverride', args: ['id', body, grant], serviceMethod: 'updateDateOverride', prefix: ['front-1', 'front-1'] },
      { method: 'deleteDateOverride', args: ['id', grant], serviceMethod: 'deleteDateOverride', prefix: ['front-1', 'front-1'] },
      { method: 'listMonthlySettings', args: ['2026-08', grant], serviceMethod: 'listMonthlySettings', prefix: ['front-1'] },
      { method: 'createMonthlySetting', args: [body, grant], serviceMethod: 'upsertMonthlySetting', prefix: ['front-1', 'front-1'] },
      { method: 'deleteMonthlySetting', args: ['id', grant], serviceMethod: 'deleteMonthlySetting', prefix: ['front-1', 'front-1'] },
      { method: 'listAttendance', args: [{}, grant], serviceMethod: 'listAttendance', prefix: ['front-1'] },
      { method: 'createAttendance', args: [body, grant], serviceMethod: 'createAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'createAttendanceGeneration', args: [body, grant], serviceMethod: 'generateAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'updateAttendance', args: ['id', body, grant], serviceMethod: 'updateAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'deleteAttendance', args: ['id', grant], serviceMethod: 'deleteAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'listLeaveTypes', args: [grant], serviceMethod: 'listLeaveTypes', prefix: ['front-1'] },
      { method: 'createLeaveType', args: [body, grant], serviceMethod: 'createLeaveType', prefix: ['front-1', 'front-1'] },
      { method: 'updateLeaveType', args: ['id', body, grant], serviceMethod: 'updateLeaveType', prefix: ['front-1', 'front-1'] },
      { method: 'deleteLeaveType', args: ['id', grant], serviceMethod: 'deleteLeaveType', prefix: ['front-1', 'front-1'] },
      { method: 'listLeaveRequests', args: [{}, grant], serviceMethod: 'listLeaveRequests', prefix: ['front-1'] },
      { method: 'createLeaveRequest', args: [body, grant], serviceMethod: 'createLeaveRequest', prefix: ['front-1', 'front-1'] },
      { method: 'updateLeaveRequest', args: ['id', body, grant], serviceMethod: 'updateLeaveRequest', prefix: ['front-1', 'front-1'] },
      { method: 'deleteLeaveRequest', args: ['id', grant], serviceMethod: 'deleteLeaveRequest', prefix: ['front-1', 'front-1'] },
      { method: 'approveLeave', args: ['id', {}, grant], serviceMethod: 'approveLeave', prefix: ['front-1', 'front-1'] },
      { method: 'rejectLeave', args: ['id', {}, grant], serviceMethod: 'rejectLeave', prefix: ['front-1', 'front-1'] },
      { method: 'listCommissionTypes', args: [grant], serviceMethod: 'listCommissionTypes', prefix: ['front-1'] },
      { method: 'createCommissionType', args: [body, grant], serviceMethod: 'createCommissionType', prefix: ['front-1', 'front-1'] },
      { method: 'updateCommissionType', args: ['id', body, grant], serviceMethod: 'updateCommissionType', prefix: ['front-1', 'front-1'] },
      { method: 'deleteCommissionType', args: ['id', grant], serviceMethod: 'deleteCommissionType', prefix: ['front-1', 'front-1'] },
      { method: 'listCommissionRecords', args: [{}, grant], serviceMethod: 'listCommissionRecords', prefix: ['front-1'] },
      { method: 'createCommissionRecord', args: [body, grant], serviceMethod: 'createCommissionRecord', prefix: ['front-1', 'front-1'] },
      { method: 'updateCommissionRecord', args: ['id', body, grant], serviceMethod: 'updateCommissionRecord', prefix: ['front-1', 'front-1'] },
      { method: 'deleteCommissionRecord', args: ['id', grant], serviceMethod: 'deleteCommissionRecord', prefix: ['front-1', 'front-1'] },
      { method: 'listBonuses', args: [{}, grant], serviceMethod: 'listBonuses', prefix: ['front-1'] },
      { method: 'createBonus', args: [body, grant], serviceMethod: 'createBonus', prefix: ['front-1', 'front-1'] },
      { method: 'updateBonus', args: ['id', body, grant], serviceMethod: 'updateBonus', prefix: ['front-1', 'front-1'] },
      { method: 'deleteBonus', args: ['id', grant], serviceMethod: 'deleteBonus', prefix: ['front-1', 'front-1'] },
      { method: 'compensationTotals', args: ['2026-08', grant], serviceMethod: 'compensationTotals', prefix: ['front-1'] }
    ]
    const routedMethods = Object.getOwnPropertyNames(EmployeeAttendanceController.prototype)
      .filter((name) => Reflect.getMetadata(METHOD_METADATA, EmployeeAttendanceController.prototype[name as keyof EmployeeAttendanceController]) !== undefined)
    expect(cases.map((item) => item.method).sort()).toEqual(routedMethods.sort())

    for (const item of cases) {
      vi.clearAllMocks()
      await (controller as any)[item.method](frontendUser, ...item.args)
      expect(auth.assertAccessGrant).toHaveBeenCalledWith('front-1', grant, AccessGuardFeature.EMPLOYEE_ATTENDANCE, Boolean(item.force))
      expect(service[item.serviceMethod]).toHaveBeenCalled()
      expect(service[item.serviceMethod].mock.calls.at(-1).slice(0, item.prefix.length)).toEqual(item.prefix)
    }
  })
})
