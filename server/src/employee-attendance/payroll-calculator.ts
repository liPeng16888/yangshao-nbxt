import { Prisma } from '@prisma/client'

export type PayrollDecimalInput = number | string

export interface PayrollAdjustmentInput {
  amount: PayrollDecimalInput
}

export interface PayrollCalculationInput {
  baseSalary: PayrollDecimalInput
  attendanceBonus: PayrollDecimalInput
  scheduledWorkDays: PayrollDecimalInput
  restQuotaDays: PayrollDecimalInput
  countedLeaveDays: PayrollDecimalInput
  absenceDays: PayrollDecimalInput
  overtimeMinutes: PayrollDecimalInput
  overtimeHourlyRate: PayrollDecimalInput
  commissionAmount: PayrollDecimalInput
  bonusAmount: PayrollDecimalInput
  adjustments: PayrollAdjustmentInput[]
}

export interface PayrollCalculationResult {
  dailyRate: number
  excessLeaveDays: number
  leaveDeduction: number
  absenceDeduction: number
  overtimeHours: number
  overtimePay: number
  commissionAmount: number
  bonusAmount: number
  adjustmentAmount: number
  attendanceBonus: number
  grossEarningsAmount: number
  deductionAmount: number
  payableAmount: number
  issues: string[]
}

export interface PayrollAuthoritativeTotals {
  grossEarningsAmount: number
  deductionAmount: number
}

type PayrollTotalComponents = Pick<PayrollCalculationResult,
  'attendanceBonus' | 'overtimePay' | 'commissionAmount' | 'bonusAmount' | 'leaveDeduction' | 'absenceDeduction'>

const ZERO = new Prisma.Decimal(0)
const MINUTES_PER_HOUR = new Prisma.Decimal(60)

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const baseSalary = money(input.baseSalary)
  const scheduledWorkDays = count(input.scheduledWorkDays)
  const restQuotaDays = count(input.restQuotaDays)
  const countedLeaveDays = count(input.countedLeaveDays)
  const absenceDays = count(input.absenceDays)
  const overtimeMinutes = count(input.overtimeMinutes)
  const overtimeHourlyRate = money(input.overtimeHourlyRate)
  const commissionAmount = moneyNumber(input.commissionAmount)
  const bonusAmount = moneyNumber(input.bonusAmount)
  const excessLeaveDays = Prisma.Decimal.max(countedLeaveDays.minus(restQuotaDays), ZERO)
  const issues: string[] = []

  let dailyRate = ZERO
  let leaveDeduction = ZERO
  let absenceDeduction = ZERO

  if (scheduledWorkDays.isZero()) {
    issues.push('缺少当月应出勤天数')
  } else {
    dailyRate = baseSalary.dividedBy(scheduledWorkDays)
    leaveDeduction = dailyRate.times(excessLeaveDays)
    absenceDeduction = dailyRate.times(absenceDays)
  }

  const overtimeHours = overtimeMinutes.dividedBy(MINUTES_PER_HOUR)
  const overtimePay = overtimeHours.times(overtimeHourlyRate)
  const adjustmentAmount = moneyNumber(
    (input.adjustments || []).reduce(
      (total, adjustment) => total.plus(decimal(adjustment.amount)),
      ZERO
    )
  )
  const earnedAttendanceBonus = excessLeaveDays.isZero() && absenceDays.isZero()
    ? moneyNumber(input.attendanceBonus)
    : 0

  const roundedLeaveDeduction = moneyNumber(leaveDeduction)
  const roundedAbsenceDeduction = moneyNumber(absenceDeduction)
  const roundedOvertimePay = moneyNumber(overtimePay)
  const payableAmount = moneyNumber(
    baseSalary
      .plus(earnedAttendanceBonus)
      .plus(roundedOvertimePay)
      .plus(commissionAmount)
      .plus(bonusAmount)
      .plus(adjustmentAmount)
      .minus(roundedLeaveDeduction)
      .minus(roundedAbsenceDeduction)
  )

  const totals = derivePayrollTotals(input, {
    attendanceBonus: earnedAttendanceBonus,
    overtimePay: roundedOvertimePay,
    commissionAmount,
    bonusAmount,
    leaveDeduction: roundedLeaveDeduction,
    absenceDeduction: roundedAbsenceDeduction
  })

  return {
    dailyRate: moneyNumber(dailyRate),
    excessLeaveDays: excessLeaveDays.toNumber(),
    leaveDeduction: roundedLeaveDeduction,
    absenceDeduction: roundedAbsenceDeduction,
    overtimeHours: decimalNumber(overtimeHours, 2),
    overtimePay: roundedOvertimePay,
    commissionAmount,
    bonusAmount,
    adjustmentAmount,
    attendanceBonus: earnedAttendanceBonus,
    ...totals,
    payableAmount,
    issues
  }
}

export function derivePayrollTotals(
  input: PayrollCalculationInput,
  result: PayrollTotalComponents
): PayrollAuthoritativeTotals {
  const adjustments = (input.adjustments || []).map((adjustment) => decimal(adjustment.amount))
  const positiveAdjustments = adjustments
    .filter((amount) => amount.isPositive())
    .reduce((total, amount) => total.plus(amount), ZERO)
  const negativeAdjustments = adjustments
    .filter((amount) => amount.isNegative())
    .reduce((total, amount) => total.plus(amount.abs()), ZERO)

  return {
    grossEarningsAmount: moneyNumber(
      money(input.baseSalary)
        .plus(result.attendanceBonus)
        .plus(result.overtimePay)
        .plus(result.commissionAmount)
        .plus(result.bonusAmount)
        .plus(positiveAdjustments)
    ),
    deductionAmount: moneyNumber(
      decimal(result.leaveDeduction)
        .plus(result.absenceDeduction)
        .plus(negativeAdjustments)
    )
  }
}

function count(value: PayrollDecimalInput) {
  return Prisma.Decimal.max(decimal(value), ZERO)
}

function money(value: PayrollDecimalInput) {
  return decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

function moneyNumber(value: PayrollDecimalInput | Prisma.Decimal) {
  return decimalNumber(decimal(value), 2)
}

function decimalNumber(value: Prisma.Decimal, places: number) {
  return value.toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP).toNumber()
}

function decimal(value: PayrollDecimalInput | Prisma.Decimal) {
  if (Prisma.Decimal.isDecimal(value)) return value
  try {
    const parsed = new Prisma.Decimal(value)
    return parsed.isFinite() ? parsed : ZERO
  } catch {
    return ZERO
  }
}
