import { describe, expect, it } from 'vitest'
import { calculatePayroll, type PayrollCalculationInput } from './payroll-calculator'

const baseInput: PayrollCalculationInput = {
  baseSalary: 10_000,
  attendanceBonus: 300,
  scheduledWorkDays: 22,
  restQuotaDays: 1.5,
  countedLeaveDays: 0,
  absenceDays: 0,
  overtimeMinutes: 0,
  overtimeHourlyRate: 30,
  commissionAmount: 0,
  bonusAmount: 0,
  adjustments: []
}

describe('calculatePayroll', () => {
  it('combines hourly, half-day and full-day leave and deducts only the quota excess', () => {
    const result = calculatePayroll({
      ...baseInput,
      countedLeaveDays: '1.75', // 2 hours (0.25 day) + half day + full day
      overtimeMinutes: 90,
      commissionAmount: '37.05',
      bonusAmount: '100.105',
      adjustments: [{ amount: '50.005' }, { amount: '-20.004' }]
    })

    expect(result).toEqual({
      dailyRate: 454.55,
      excessLeaveDays: 0.25,
      leaveDeduction: 113.64,
      absenceDeduction: 0,
      overtimeHours: 1.5,
      overtimePay: 45,
      commissionAmount: 37.05,
      bonusAmount: 100.11,
      adjustmentAmount: 30,
      attendanceBonus: 0,
      payableAmount: 10098.52,
      issues: []
    })
  })

  it.each([
    ['hourly leave', '0.25'],
    ['half-day leave', '0.5'],
    ['full-day leave', '1']
  ])('keeps the attendance bonus when %s is inside the rest quota', (_label, countedLeaveDays) => {
    const result = calculatePayroll({
      ...baseInput,
      baseSalary: '5000',
      attendanceBonus: '200',
      scheduledWorkDays: '20',
      restQuotaDays: '1',
      countedLeaveDays
    })

    expect(result.attendanceBonus).toBe(200)
    expect(result.excessLeaveDays).toBe(0)
    expect(result.leaveDeduction).toBe(0)
    expect(result.payableAmount).toBe(5200)
  })

  it('cancels the attendance bonus and deducts absence at the daily rate', () => {
    const result = calculatePayroll({
      ...baseInput,
      baseSalary: 6000,
      attendanceBonus: 300,
      scheduledWorkDays: 20,
      restQuotaDays: 0,
      absenceDays: '0.5'
    })

    expect(result.dailyRate).toBe(300)
    expect(result.absenceDeduction).toBe(150)
    expect(result.attendanceBonus).toBe(0)
    expect(result.payableAmount).toBe(5850)
  })

  it('returns a blocking issue and zero rate-based deductions when scheduled days are missing', () => {
    const result = calculatePayroll({
      ...baseInput,
      baseSalary: 6000,
      attendanceBonus: 300,
      scheduledWorkDays: 0,
      restQuotaDays: 0,
      countedLeaveDays: 5,
      absenceDays: 2,
      overtimeMinutes: 60,
      commissionAmount: 10,
      bonusAmount: 20,
      adjustments: [{ amount: -5 }]
    })

    expect(result).toEqual({
      dailyRate: 0,
      excessLeaveDays: 5,
      leaveDeduction: 0,
      absenceDeduction: 0,
      overtimeHours: 1,
      overtimePay: 30,
      commissionAmount: 10,
      bonusAmount: 20,
      adjustmentAmount: -5,
      attendanceBonus: 0,
      payableAmount: 6055,
      issues: ['缺少当月应出勤天数']
    })
  })

  it('clamps negative count inputs while preserving signed adjustments', () => {
    const result = calculatePayroll({
      ...baseInput,
      scheduledWorkDays: '-22',
      restQuotaDays: '-1',
      countedLeaveDays: '-2',
      absenceDays: '-3',
      overtimeMinutes: '-60',
      adjustments: [{ amount: '-10.005' }]
    })

    expect(result.excessLeaveDays).toBe(0)
    expect(result.absenceDeduction).toBe(0)
    expect(result.overtimeHours).toBe(0)
    expect(result.adjustmentAmount).toBe(-10.01)
    expect(result.attendanceBonus).toBe(300)
    expect(result.payableAmount).toBe(10289.99)
    expect(result.issues).toEqual(['缺少当月应出勤天数'])
  })

  it('uses decimal half-up rounding for money and minute-derived overtime', () => {
    const result = calculatePayroll({
      ...baseInput,
      baseSalary: '0.1',
      attendanceBonus: 0,
      scheduledWorkDays: 3,
      overtimeMinutes: 1,
      overtimeHourlyRate: '0.3',
      commissionAmount: '1.005',
      bonusAmount: '10.075'
    })

    expect(result.dailyRate).toBe(0.03)
    expect(result.overtimeHours).toBe(0.02)
    expect(result.overtimePay).toBe(0.01)
    expect(result.commissionAmount).toBe(1.01)
    expect(result.bonusAmount).toBe(10.08)
    expect(result.payableAmount).toBe(11.2)
  })
})
