import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { AdminEmployeeAttendanceController } from './admin-employee-attendance.controller'

const root: CurrentUser = { id: 'admin-1', account: 'root', username: '主账号', role: UserRole.ROOT_ADMIN }
const sub: CurrentUser = { id: 'admin-2', account: 'sub', username: '子账号', role: UserRole.SUB_ADMIN }

function fixture() {
  const payroll: any = Object.fromEntries([
    'adminOverview', 'adminEmployees', 'adminSchedules', 'adminAttendance', 'adminLeaves',
    'adminCommissions', 'adminBonuses', 'adminPayroll', 'adminAudit', 'adminRevealEmployee'
  ].map((name) => [name, vi.fn().mockResolvedValue([])]))
  const access = {
    parseFrontendUserIds: vi.fn((value?: string | string[]) => Array.isArray(value) ? value : value ? value.split(',') : []),
    getAllowedFrontendUserIds: vi.fn().mockResolvedValue(['front-1'])
  }
  return { controller: new AdminEmployeeAttendanceController(payroll, access as never), payroll, access }
}

describe('AdminEmployeeAttendanceController', () => {
  it('exposes only readonly GET routes plus the password-gated employee reveal POST', () => {
    const routes = Object.getOwnPropertyNames(AdminEmployeeAttendanceController.prototype)
      .filter((name) => Reflect.getMetadata(METHOD_METADATA, AdminEmployeeAttendanceController.prototype[name as keyof AdminEmployeeAttendanceController]) !== undefined)
      .map((name) => ({
        name,
        method: Reflect.getMetadata(METHOD_METADATA, AdminEmployeeAttendanceController.prototype[name as keyof AdminEmployeeAttendanceController]),
        path: Reflect.getMetadata(PATH_METADATA, AdminEmployeeAttendanceController.prototype[name as keyof AdminEmployeeAttendanceController])
      }))

    expect(routes.filter((route) => route.method !== RequestMethod.GET)).toEqual([
      { name: 'revealEmployee', method: RequestMethod.POST, path: 'employees/:id/reveal' }
    ])
    expect(routes.map((route) => route.path).sort()).toEqual([
      'attendance', 'audit', 'bonuses', 'commissions', 'employees', 'employees/:id/reveal',
      'leaves', 'overview', 'payroll', 'schedules'
    ])
  })

  it('passes only AdminAccessService-approved frontend accounts to every query', async () => {
    const { controller, payroll, access } = fixture()
    const query = { frontendUserIds: 'front-1,front-2', month: '2026-08', employeeId: 'employee-1' }

    await controller.payroll(sub, query)

    expect(access.parseFrontendUserIds).toHaveBeenCalledWith(query.frontendUserIds)
    expect(access.getAllowedFrontendUserIds).toHaveBeenCalledWith(sub, ['front-1', 'front-2'])
    expect(payroll.adminPayroll).toHaveBeenCalledWith(['front-1'], expect.objectContaining({ month: '2026-08', employeeId: 'employee-1' }))
  })

  it('passes the permitted account set and monthly schedule filter to the readonly schedules query', async () => {
    const { controller, payroll } = fixture()

    await controller.schedules(sub, { frontendUserIds: 'front-1,front-2', employeeId: 'employee-1', month: '2026-08' })

    expect(payroll.adminSchedules).toHaveBeenCalledWith(['front-1'], expect.objectContaining({ employeeId: 'employee-1', month: '2026-08' }))
  })

  it('applies account filtering before password-gated reveal', async () => {
    const { controller, payroll, access } = fixture()

    await controller.revealEmployee(root, 'employee-1', { password: 'secret' }, { frontendUserIds: 'front-1' })

    expect(access.getAllowedFrontendUserIds).toHaveBeenCalledWith(root, ['front-1'])
    expect(payroll.adminRevealEmployee).toHaveBeenCalledWith(root, ['front-1'], 'employee-1', 'secret')
  })
})
