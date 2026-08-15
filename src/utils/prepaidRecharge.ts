import type { PrepaidRechargePayload } from '@/types/financeBills'

export interface PrepaidRechargeDraft {
  rechargeDate: unknown
  customer: unknown
  amount: unknown
  usableTimes: unknown
  remark?: unknown
}

export function validatePrepaidRechargeDate(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
  if (!match) return '请选择有效的充值日期'

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return '请选择有效的充值日期'
  }
  return ''
}

export function validatePrepaidAmount(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '预存金额必须大于 0'
  const cents = amount * 100
  if (!Number.isSafeInteger(Math.round(cents)) || Math.abs(cents - Math.round(cents)) > 1e-8) {
    return '预存金额最多保留 2 位小数'
  }
  return ''
}

export function validatePrepaidUsableTimes(value: unknown): string {
  const usableTimes = Number(value)
  return Number.isSafeInteger(usableTimes) && usableTimes > 0 ? '' : '可使用次数必须是大于 0 的安全整数'
}

export function buildPrepaidRechargePayload(draft: PrepaidRechargeDraft): { payload: PrepaidRechargePayload | null; error: string } {
  const rechargeDateError = validatePrepaidRechargeDate(draft.rechargeDate)
  if (rechargeDateError) return { payload: null, error: rechargeDateError }

  const customer = String(draft.customer ?? '').trim()
  if (!customer) return { payload: null, error: '请选择或输入客户名称' }

  const amountError = validatePrepaidAmount(draft.amount)
  if (amountError) return { payload: null, error: amountError }
  const usableTimesError = validatePrepaidUsableTimes(draft.usableTimes)
  if (usableTimesError) return { payload: null, error: usableTimesError }

  return {
    payload: {
      rechargeDate: String(draft.rechargeDate),
      customer,
      amount: Number(draft.amount),
      usableTimes: Number(draft.usableTimes),
      remark: String(draft.remark ?? '')
    },
    error: ''
  }
}
