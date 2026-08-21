import type { BlacklistPayload } from '@/types/blacklist'
import type { FinancePayload } from '@/types/finance'

export function isPositiveInteger(value: unknown) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0
  if (typeof value !== 'string') return false
  return /^[1-9]\d*$/.test(value.trim())
}

export function isValidNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return false
  const numeric = Number(value)
  return Number.isFinite(numeric)
}

export function validateFinancePayload(payload: FinancePayload) {
  const errors: string[] = []
  if (!payload.paymentDate) errors.push('支付日期必填')
  if (!payload.item?.trim()) errors.push('开支项目必填')
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) errors.push('开支金额必须大于 0')
  if (!payload.paymentMethod) errors.push('支付方式必填')
  return errors
}

export function validateBlacklistPayload(payload: BlacklistPayload) {
  const errors: string[] = []
  const hasNonImageInfo = Boolean(
    payload.phone?.trim() ||
      payload.wechat?.trim() ||
      payload.wechatNickname?.trim() ||
      payload.other?.trim() ||
      payload.note?.trim() ||
      Number.isFinite(payload.amount)
  )

  if (!hasNonImageInfo) errors.push('必须至少填写一项非图片信息')
  if (payload.images.length > 2) errors.push('图片最多上传 2 张')
  if (payload.amount !== null && payload.amount !== undefined && !Number.isFinite(payload.amount)) {
    errors.push('金额必须是有效数字')
  } else if (payload.amount !== null && payload.amount !== undefined) {
    if (payload.amount < 0) errors.push('金额不能小于 0')
    const cents = payload.amount * 100
    if (Math.abs(cents - Math.round(cents)) > 1e-8) errors.push('金额最多保留两位小数')
  }

  return errors
}
