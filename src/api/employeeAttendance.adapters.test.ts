// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  buildEmployeeMutationPayload,
  normalizeAttendanceGenerationResponse,
  normalizeCommissionResponse,
  normalizeEmployeeResponse,
  normalizePayrollResponse,
  selectEmployeeAttendanceGrant
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
    expect(selectEmployeeAttendanceGrant({ finance: { expiresAt: Date.now() + 1000, token: 'wrong', features: ['FINANCE'] }, attendance: { expiresAt: Date.now() + 1000, token: 'right', features: ['EMPLOYEE_ATTENDANCE'] } })).toBe('right')
    expect(selectEmployeeAttendanceGrant({ legacy: { expiresAt: Date.now() + 1000, token: 'legacy-without-feature' } })).toBeUndefined()
  })

  it('provides a mock grant token that can be tagged with attendance features', async () => {
    await expect(verifyAccessGuardGroup('attendance-group', '1234', 5, '1234')).resolves.toMatchObject({ token: 'mock-access-grant:attendance-group' })
  })
})
