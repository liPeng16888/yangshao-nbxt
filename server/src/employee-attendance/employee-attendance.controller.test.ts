import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA } from '@nestjs/common/constants'
import { AccessGuardFeature, UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { EmployeeAttendanceController } from './employee-attendance.controller'
import { EmployeeAttendanceService } from './employee-attendance.service'

const frontendUser: CurrentUser = {
  id: 'front-1', account: 'front-1', username: '前台一', role: UserRole.FRONTEND_USER
}

function createController(options: { protected?: boolean; grantValid?: boolean } = {}) {
  const service = {
    listEmployees: vi.fn().mockResolvedValue([]),
    createEmployee: vi.fn().mockResolvedValue({}),
    createAttendance: vi.fn().mockResolvedValue({}),
    revealEmployee: vi.fn().mockResolvedValue({})
  } as unknown as EmployeeAttendanceService
  const auth = {
    isFeatureProtected: vi.fn().mockResolvedValue(Boolean(options.protected)),
    hasAccessGrant: vi.fn().mockReturnValue(Boolean(options.grantValid)),
    assertAccessGrant: vi.fn(async (frontendUserId: string, grant: string | undefined, feature: AccessGuardFeature, alwaysRequire = false) => {
      const protectedFeature = alwaysRequire || await auth.isFeatureProtected(frontendUserId, feature)
      if (protectedFeature && !auth.hasAccessGrant(frontendUserId, grant, feature)) throw new ForbiddenException('访问授权无效或已过期')
    })
  }
  return { controller: new EmployeeAttendanceController(service, auth as never, {} as never), service, auth }
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
})
