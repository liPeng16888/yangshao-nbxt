// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  buildEmployeeMutationPayload,
  normalizeAttendanceGenerationResponse,
  normalizeAttendanceMutationPayload,
  normalizeAttendanceQuery,
  normalizeBonusResponse,
  normalizeCommissionResponse,
  normalizeCommissionTypeResponse,
  normalizeDeleteEmployeeResponse,
  normalizeEmployeeResponse,
  normalizeLeaveResponse,
  normalizeMonthlySettingResponse,
  normalizePayrollAdjustmentResponse,
  normalizePayrollResponse,
  selectEmployeeAttendanceGrant,
  toBeijingDateTimeLocal
} from './employeeAttendance'
import { verifyAccessGuardGroup } from './accessGuard'

describe('employee attendance real API adapters', () => {
  it('omits blank sensitive fields from edits while retaining explicit changes', () => {
    const payload = buildEmployeeMutationPayload({ employeeNumber: 'YG001', name: '张三', hireDate: '2026-01-01', idCard: '', bankCard: ' ', address: '新地址', emergencyContact: '' }, true)
    expect(payload).toEqual(expect.objectContaining({ employeeNumber: 'YG001', address: '新地址' }))
    expect(payload).not.toHaveProperty('idCard')
    expect(payload).not.toHaveProperty('bankCard')
    expect(payload).not.toHaveProperty('emergencyContact')
  })

  it('keeps masked sensitive values out of editable plaintext keys', () => {
    const row = normalizeEmployeeResponse({ id: 'e1', employeeNumber: '001', name: '张三', hireDate: '2026-01-01', idCard: '410****1234', bankCard: '622****7890', address: '洛***区', emergencyContact: '张***001', baseSalary: '6000.00' }) as unknown as Record<string, unknown>
    expect(row).toMatchObject({ idCardMasked: '410****1234', bankCardMasked: '622****7890', baseSalary: 6000 })
    expect(row.idCard).toBeUndefined()
    expect(row.bankCard).toBeUndefined()
    expect(row.address).toBeUndefined()
    expect(row.emergencyContact).toBeUndefined()
  })

  it('maps server snapshot and lock field names without losing payroll rows', () => {
    expect(normalizeCommissionResponse({ id: 'c1', unitPriceSnapshot: '12.50', amount: '25.00', quantity: '2', payrollLockedAt: 'locked' })).toMatchObject({ unitPrice: 12.5, lockedAt: 'locked' })
    const payroll = normalizePayrollResponse({ id: 'p1', month: '2026-08', status: 'DRAFT', items: [{ id: 'i1', employeeId: 'e1', employeeNameSnapshot: '张三', employeeNumberSnapshot: '001', payableAmount: '6123.45', issues: [], adjustments: [] }] })!
    expect(payroll.items[0]).toMatchObject({ payableAmount: 6123.45, employee: { name: '张三' } })
    const blocked = normalizePayrollResponse({ id: 'p2', month: '2026-08', status: 'DRAFT', issueCount: 2, items: [] })!
    expect(blocked).toMatchObject({ issueCount: 2, issues: ['当前有 2 项工资确认阻断问题'] })
  })

  it('normalizes attendance generation counts and selects only an attendance-feature grant', () => {
    expect(normalizeAttendanceGenerationResponse({ created: 3, updated: 2, skippedManual: 1 })).toEqual({ created: 3, updated: 2, skippedManual: 1, generated: 5 })
    expect(selectEmployeeAttendanceGrant({ finance: { groupId: 'finance', grantVersion: 1, expiresAt: Date.now() + 1000, token: 'wrong', features: ['FINANCE'] }, attendance: { groupId: 'attendance', grantVersion: 2, expiresAt: Date.now() + 1000, token: 'right', features: ['EMPLOYEE_ATTENDANCE'] } })).toBe('right')
    expect(selectEmployeeAttendanceGrant({ legacy: { expiresAt: Date.now() + 1000, token: 'legacy-without-feature' } })).toBeUndefined()
    expect(selectEmployeeAttendanceGrant({ stale: { expiresAt: Date.now() + 1000, token: 'legacy-versionless', features: ['EMPLOYEE_ATTENDANCE'] } })).toBeUndefined()
  })

  it('serializes datetime-local punches with a fixed Beijing offset and restores Beijing wall time for editing', () => {
    const payload = normalizeAttendanceMutationPayload({
      employeeId: 'e1', date: '2026-08-08', isScheduledWorkday: true, scheduledMinutes: 480,
      checkInAt: '2026-08-08T08:05', checkOutAt: '2026-08-08T17:30'
    })
    expect(payload).toMatchObject({
      checkInAt: '2026-08-08T08:05:00+08:00',
      checkOutAt: '2026-08-08T17:30:00+08:00'
    })
    expect(toBeijingDateTimeLocal('2026-08-08T00:05:00Z')).toBe('2026-08-08T08:05')
    expect(normalizeAttendanceMutationPayload({
      employeeId: 'e1', date: '2026-08-08', isScheduledWorkday: true, scheduledMinutes: 480,
      checkInAt: '', checkOutAt: ''
    })).toMatchObject({ checkInAt: null, checkOutAt: null })
  })

  it('rejects a query that combines a month with a date range', () => {
    expect(() => normalizeAttendanceQuery({ month: '2026-08', startDate: '2026-08-01', endDate: '2026-08-31' }))
      .toThrow('月份和日期范围不能同时筛选')
    expect(normalizeAttendanceQuery({ month: '2026-08' })).toEqual({ month: '2026-08' })
  })

  it('provides a mock grant token that can be tagged with attendance features', async () => {
    await expect(verifyAccessGuardGroup('attendance-group', '1234', 5, '1234')).resolves.toMatchObject({
      token: 'mock-access-grant:attendance-group:1', groupId: 'attendance-group', grantVersion: 1
    })
  })

  it('normalizes Decimal fields on every Decimal-bearing write response', () => {
    expect(normalizeMonthlySettingResponse({ id: 'ms-1', employeeId: 'e1', month: '2026-08', scheduledWorkDays: '22.50', restQuotaDays: '4.25' }))
      .toMatchObject({ scheduledWorkDays: 22.5, restQuotaDays: 4.25 })
    expect(normalizeLeaveResponse({ id: 'l1', countedDays: '0.50', hours: '4.00', payrollLockedAt: 'locked' }))
      .toMatchObject({ countedDays: 0.5, hours: 4, lockedAt: 'locked' })
    expect(normalizeCommissionTypeResponse({ id: 'ct1', unitPrice: '12.35' })).toMatchObject({ unitPrice: 12.35 })
    expect(normalizeBonusResponse({ id: 'b1', amount: '88.60', payrollLockedAt: 'locked' })).toMatchObject({ amount: 88.6, lockedAt: 'locked' })
    expect(normalizePayrollAdjustmentResponse({ id: 'a1', payrollItemId: 'p1', amount: '-10.01', reason: '补扣' }))
      .toMatchObject({ amount: -10.01 })
  })

  it('normalizes both delete-employee response variants', () => {
    expect(normalizeDeleteEmployeeResponse({ ok: true })).toEqual({ ok: true })
    expect(normalizeDeleteEmployeeResponse({ id: 'e1', employeeNumber: '001', name: '张三', hireDate: '2026-01-01', status: 'INACTIVE', baseSalary: '6000.00' }))
      .toMatchObject({ id: 'e1', status: 'INACTIVE', baseSalary: 6000 })
  })
})
