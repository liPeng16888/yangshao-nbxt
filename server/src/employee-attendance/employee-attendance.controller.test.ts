import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { INTERCEPTORS_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { AccessGuardFeature, UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { EmployeeAttendanceController } from './employee-attendance.controller'
import { EmployeeAttendanceService } from './employee-attendance.service'

const frontendUser: CurrentUser = {
  id: 'front-1', account: 'front-1', username: '前台一', role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
  isFrontendMainAccount: true, isFrontendSubAccount: false
}

function createController(options: { protected?: boolean; grantValid?: boolean } = {}) {
  const serviceNames = [
    'listEmployees', 'getEmployee', 'revealEmployee', 'createEmployee', 'updateEmployee', 'deleteEmployee',
    'attachPhoto', 'getPhotoPath', 'listWeeklySchedules', 'createWeeklySchedule', 'updateWeeklySchedule', 'deleteWeeklySchedule',
    'listDateOverrides', 'createDateOverride', 'updateDateOverride', 'deleteDateOverride', 'listMonthlySettings',
    'upsertMonthlySetting', 'deleteMonthlySetting', 'listMonthlySchedules', 'saveMonthlyScheduleDay', 'deleteMonthlyScheduleDay',
    'batchSaveMonthlySchedules', 'copyPreviousMonthSchedules', 'customerView', 'listAttendance', 'createAttendance', 'generateAttendance',
    'updateAttendance', 'deleteAttendance', 'listLeaveTypes', 'createLeaveType', 'updateLeaveType', 'deleteLeaveType',
    'listLeaveRequests', 'createLeaveRequest', 'updateLeaveRequest', 'deleteLeaveRequest', 'approveLeave', 'rejectLeave',
    'listCommissionTypes', 'createCommissionType', 'updateCommissionType', 'deleteCommissionType',
    'listCommissionRecords', 'createCommissionRecord', 'updateCommissionRecord', 'deleteCommissionRecord',
    'listBonuses', 'createBonus', 'updateBonus', 'deleteBonus', 'compensationTotals',
    'overview', 'generate', 'getPayroll', 'createAdjustment', 'updateAdjustment', 'deleteAdjustment', 'confirm', 'reopen'
  ] as const
  const service = Object.fromEntries(serviceNames.map((name) => [name, vi.fn().mockResolvedValue({})])) as unknown as EmployeeAttendanceService
  const auth = {
    isFeatureProtected: vi.fn().mockResolvedValue(Boolean(options.protected)),
    hasAccessGrant: vi.fn().mockResolvedValue(Boolean(options.grantValid)),
    assertAccessGrant: vi.fn(async (user: CurrentUser, grant: string | undefined, feature: AccessGuardFeature, alwaysRequire = false) => {
      const protectedFeature = alwaysRequire || await auth.isFeatureProtected(user, feature)
      if (protectedFeature && !(await auth.hasAccessGrant(user, grant, feature))) throw new ForbiddenException('访问授权无效或已过期')
    })
  }
  const photos = { save: vi.fn().mockResolvedValue('/private/new.jpg'), read: vi.fn().mockResolvedValue({ buffer: Buffer.from('photo'), contentType: 'image/png' }), remove: vi.fn() }
  const realtime = { publish: vi.fn() }
  return { controller: new EmployeeAttendanceController(service, auth as never, photos as never, service as never, realtime as never, service as never), service: service as any, auth, photos, realtime }
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

    expect(auth.isFeatureProtected).toHaveBeenCalledWith(frontendUser, AccessGuardFeature.EMPLOYEE_ATTENDANCE)
    expect(auth.hasAccessGrant).toHaveBeenCalledWith(frontendUser, 'bad-grant', AccessGuardFeature.EMPLOYEE_ATTENDANCE)
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

  it('returns private photos with detected content type and no-store response headers', async () => {
    const { controller } = createController()
    const file = await controller.readPhoto(frontendUser, 'employee-1', undefined)
    expect(file.getHeaders()).toMatchObject({ type: 'image/png' })
    expect(Reflect.getMetadata('__headers__', EmployeeAttendanceController.prototype.readPhoto)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Cache-Control', value: 'private, no-store' }),
      expect.objectContaining({ name: 'X-Content-Type-Options', value: 'nosniff' })
    ]))
  })

  it('checks the attendance grant and authenticated ownership on every public endpoint', async () => {
    const { controller, service, auth } = createController({ protected: true, grantValid: true })
    const grant = 'valid-grant'
    const body = { frontendUserId: 'front-2' }
    const version = { baseUpdatedAt: '2026-08-11T00:00:00.000Z' }
    const cases: Array<{ method: string; args: unknown[]; serviceMethod: string; prefix: string[]; force?: boolean }> = [
      { method: 'listEmployees', args: [{}, grant], serviceMethod: 'listEmployees', prefix: ['front-1'] },
      { method: 'getEmployee', args: ['id', grant], serviceMethod: 'getEmployee', prefix: ['front-1'] },
      { method: 'revealEmployee', args: ['id', grant], serviceMethod: 'revealEmployee', prefix: ['front-1', 'front-1'], force: true },
      { method: 'createEmployee', args: [body, grant], serviceMethod: 'createEmployee', prefix: ['front-1', 'front-1'] },
      { method: 'updateEmployee', args: ['id', body, grant], serviceMethod: 'updateEmployee', prefix: ['front-1', 'front-1'] },
      { method: 'deleteEmployee', args: ['id', version, grant], serviceMethod: 'deleteEmployee', prefix: ['front-1', 'front-1'] },
      { method: 'uploadPhoto', args: ['id', { buffer: Buffer.from('x') }, grant], serviceMethod: 'attachPhoto', prefix: ['front-1', 'front-1'] },
      { method: 'readPhoto', args: ['id', grant], serviceMethod: 'getPhotoPath', prefix: ['front-1'] },
      { method: 'listWeeklySchedules', args: [undefined, grant], serviceMethod: 'listWeeklySchedules', prefix: ['front-1'] },
      { method: 'createWeeklySchedule', args: [body, grant], serviceMethod: 'createWeeklySchedule', prefix: ['front-1', 'front-1'] },
      { method: 'updateWeeklySchedule', args: ['id', body, grant], serviceMethod: 'updateWeeklySchedule', prefix: ['front-1', 'front-1'] },
      { method: 'deleteWeeklySchedule', args: ['id', version, grant], serviceMethod: 'deleteWeeklySchedule', prefix: ['front-1', 'front-1'] },
      { method: 'listDateOverrides', args: [{}, grant], serviceMethod: 'listDateOverrides', prefix: ['front-1'] },
      { method: 'createDateOverride', args: [body, grant], serviceMethod: 'createDateOverride', prefix: ['front-1', 'front-1'] },
      { method: 'updateDateOverride', args: ['id', body, grant], serviceMethod: 'updateDateOverride', prefix: ['front-1', 'front-1'] },
      { method: 'deleteDateOverride', args: ['id', version, grant], serviceMethod: 'deleteDateOverride', prefix: ['front-1', 'front-1'] },
      { method: 'listMonthlySettings', args: ['2026-08', grant], serviceMethod: 'listMonthlySettings', prefix: ['front-1'] },
      { method: 'createMonthlySetting', args: [body, grant], serviceMethod: 'upsertMonthlySetting', prefix: ['front-1', 'front-1'] },
      { method: 'deleteMonthlySetting', args: ['id', version, grant], serviceMethod: 'deleteMonthlySetting', prefix: ['front-1', 'front-1'] },
      { method: 'listMonthlySchedules', args: [{ employeeId: 'employee-1', month: '2026-08' }, grant], serviceMethod: 'listMonthlySchedules', prefix: ['front-1', 'employee-1', '2026-08'] },
      { method: 'scheduleAttendanceOverview', args: [{ employeeId: 'employee-1', month: '2026-08' }, grant], serviceMethod: 'customerView', prefix: ['front-1', 'employee-1', '2026-08'] },
      { method: 'saveMonthlyScheduleDay', args: [body, grant], serviceMethod: 'saveMonthlyScheduleDay', prefix: ['front-1', 'front-1'] },
      { method: 'deleteMonthlyScheduleDay', args: ['id', version, grant], serviceMethod: 'deleteMonthlyScheduleDay', prefix: ['front-1', 'front-1'] },
      { method: 'batchSaveMonthlySchedules', args: [{ ...body, dates: ['2026-08-11'] }, grant], serviceMethod: 'batchSaveMonthlySchedules', prefix: ['front-1', 'front-1'] },
      { method: 'copyPreviousMonthSchedules', args: [{ employeeId: 'employee-1', targetMonth: '2026-08', overwrite: true }, grant], serviceMethod: 'copyPreviousMonthSchedules', prefix: ['front-1', 'front-1'] },
      { method: 'listAttendance', args: [{}, grant], serviceMethod: 'listAttendance', prefix: ['front-1'] },
      { method: 'createAttendance', args: [body, grant], serviceMethod: 'createAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'createAttendanceGeneration', args: [body, grant], serviceMethod: 'generateAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'updateAttendance', args: ['id', body, grant], serviceMethod: 'updateAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'deleteAttendance', args: ['id', version, grant], serviceMethod: 'deleteAttendance', prefix: ['front-1', 'front-1'] },
      { method: 'listLeaveTypes', args: [grant], serviceMethod: 'listLeaveTypes', prefix: ['front-1'] },
      { method: 'createLeaveType', args: [body, grant], serviceMethod: 'createLeaveType', prefix: ['front-1', 'front-1'] },
      { method: 'updateLeaveType', args: ['id', body, grant], serviceMethod: 'updateLeaveType', prefix: ['front-1', 'front-1'] },
      { method: 'deleteLeaveType', args: ['id', version, grant], serviceMethod: 'deleteLeaveType', prefix: ['front-1', 'front-1'] },
      { method: 'listLeaveRequests', args: [{}, grant], serviceMethod: 'listLeaveRequests', prefix: ['front-1'] },
      { method: 'createLeaveRequest', args: [body, grant], serviceMethod: 'createLeaveRequest', prefix: ['front-1', 'front-1'] },
      { method: 'updateLeaveRequest', args: ['id', body, grant], serviceMethod: 'updateLeaveRequest', prefix: ['front-1', 'front-1'] },
      { method: 'deleteLeaveRequest', args: ['id', version, grant], serviceMethod: 'deleteLeaveRequest', prefix: ['front-1', 'front-1'] },
      { method: 'approveLeave', args: ['id', {}, grant], serviceMethod: 'approveLeave', prefix: ['front-1', 'front-1'] },
      { method: 'rejectLeave', args: ['id', {}, grant], serviceMethod: 'rejectLeave', prefix: ['front-1', 'front-1'] },
      { method: 'listCommissionTypes', args: [grant], serviceMethod: 'listCommissionTypes', prefix: ['front-1'] },
      { method: 'createCommissionType', args: [body, grant], serviceMethod: 'createCommissionType', prefix: ['front-1', 'front-1'] },
      { method: 'updateCommissionType', args: ['id', body, grant], serviceMethod: 'updateCommissionType', prefix: ['front-1', 'front-1'] },
      { method: 'deleteCommissionType', args: ['id', version, grant], serviceMethod: 'deleteCommissionType', prefix: ['front-1', 'front-1'] },
      { method: 'listCommissionRecords', args: [{}, grant], serviceMethod: 'listCommissionRecords', prefix: ['front-1'] },
      { method: 'createCommissionRecord', args: [body, grant], serviceMethod: 'createCommissionRecord', prefix: ['front-1', 'front-1'] },
      { method: 'updateCommissionRecord', args: ['id', body, grant], serviceMethod: 'updateCommissionRecord', prefix: ['front-1', 'front-1'] },
      { method: 'deleteCommissionRecord', args: ['id', version, grant], serviceMethod: 'deleteCommissionRecord', prefix: ['front-1', 'front-1'] },
      { method: 'listBonuses', args: [{}, grant], serviceMethod: 'listBonuses', prefix: ['front-1'] },
      { method: 'createBonus', args: [body, grant], serviceMethod: 'createBonus', prefix: ['front-1', 'front-1'] },
      { method: 'updateBonus', args: ['id', body, grant], serviceMethod: 'updateBonus', prefix: ['front-1', 'front-1'] },
      { method: 'deleteBonus', args: ['id', version, grant], serviceMethod: 'deleteBonus', prefix: ['front-1', 'front-1'] },
      { method: 'compensationTotals', args: ['2026-08', grant], serviceMethod: 'compensationTotals', prefix: ['front-1'] },
      { method: 'overview', args: ['2026-08', grant], serviceMethod: 'overview', prefix: ['front-1'] },
      { method: 'generatePayroll', args: [{ month: '2026-08' }, grant], serviceMethod: 'generate', prefix: ['front-1', 'front-1'] },
      { method: 'getPayroll', args: ['2026-08', grant], serviceMethod: 'getPayroll', prefix: ['front-1'] },
      { method: 'createPayrollAdjustment', args: ['item-1', { amount: 10, reason: '调整' }, grant], serviceMethod: 'createAdjustment', prefix: ['front-1', 'front-1'] },
      { method: 'updatePayrollAdjustment', args: ['adjustment-1', { amount: 10, reason: '调整' }, grant], serviceMethod: 'updateAdjustment', prefix: ['front-1', 'front-1'] },
      { method: 'deletePayrollAdjustment', args: ['adjustment-1', version, grant], serviceMethod: 'deleteAdjustment', prefix: ['front-1', 'front-1'] },
      { method: 'confirmPayroll', args: ['run-1', grant], serviceMethod: 'confirm', prefix: ['front-1', 'front-1'] },
      { method: 'reopenPayroll', args: ['run-1', { reason: '补录' }, grant], serviceMethod: 'reopen', prefix: ['front-1', 'front-1'] }
    ]
    const routedMethods = Object.getOwnPropertyNames(EmployeeAttendanceController.prototype)
      .filter((name) => Reflect.getMetadata(METHOD_METADATA, EmployeeAttendanceController.prototype[name as keyof EmployeeAttendanceController]) !== undefined)
    expect(cases.map((item) => item.method).sort()).toEqual(routedMethods.sort())

    for (const item of cases) {
      vi.clearAllMocks()
      await (controller as any)[item.method](frontendUser, ...item.args)
      expect(auth.assertAccessGrant).toHaveBeenCalledWith(frontendUser, grant, AccessGuardFeature.EMPLOYEE_ATTENDANCE, Boolean(item.force))
      expect(service[item.serviceMethod]).toHaveBeenCalled()
      expect(service[item.serviceMethod].mock.calls.at(-1).slice(0, item.prefix.length)).toEqual(item.prefix)
    }
  })
})
