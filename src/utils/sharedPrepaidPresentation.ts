const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
const INVALID_PHONE_MESSAGE = '会员手机号必须为中国大陆 11 位手机号'
const PREPAID_PHONE_INPUT_PATTERN = /^[0-9\t\n\v\f\r -]*$/
const PREPAID_PHONE_SEPARATOR_PATTERN = /[\t\n\v\f\r -]/g

export interface PrepaidAccountPresentation {
  account?: string | null
  username?: string | null
  displayRemark?: string | null
}

export function prepaidAccountLabel(account?: PrepaidAccountPresentation | null) {
  const accountName = String(account?.account ?? '').trim()
  const display = String(account?.displayRemark || account?.username || accountName).trim()
  if (!display) return '无信息'
  return accountName && display !== accountName ? `${display}（${accountName}）` : display
}

export function prepaidMoney(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

export function prepaidNormalizePhone(value: unknown) {
  const input = String(value ?? '')
  if (!PREPAID_PHONE_INPUT_PATTERN.test(input)) throw new Error(INVALID_PHONE_MESSAGE)
  const phone = input.replace(PREPAID_PHONE_SEPARATOR_PATTERN, '')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error(INVALID_PHONE_MESSAGE)
  return phone
}

export function prepaidNormalizePhoneSearch(value: unknown) {
  const input = String(value ?? '')
  if (!PREPAID_PHONE_INPUT_PATTERN.test(input)) throw new Error(INVALID_PHONE_MESSAGE)
  const phone = input.replace(PREPAID_PHONE_SEPARATOR_PATTERN, '')
  if (!/^\d{0,11}$/.test(phone)) throw new Error(INVALID_PHONE_MESSAGE)
  return phone
}

export function prepaidIsValidPhone(value: unknown) {
  try {
    prepaidNormalizePhone(value)
    return true
  } catch {
    return false
  }
}

export function prepaidFormatElements(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const name = record.name ?? record.element ?? record.label
        const amount = record.value ?? record.result
        return [name, amount].filter((part) => part !== undefined && part !== null && part !== '').join(': ')
      }
      return String(item)
    }).filter(Boolean).join('、') || '无信息'
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join('、')
  }
  return typeof value === 'string' && value.trim() ? value : '无信息'
}

export function prepaidPreciseDateTime(value: string | Date | null | undefined) {
  if (!value) return '无信息'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '无信息'
  return new Date(timestamp + BEIJING_UTC_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

export function prepaidIsConflict(error: unknown) {
  return (error as { response?: { status?: unknown } } | null)?.response?.status === 409
}

export function prepaidErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: unknown } }; message?: unknown } | null)?.response
  const message = response?.data?.message ?? (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

export function prepaidIsMessageBoxDismissed(error: unknown) {
  return error === 'cancel' || error === 'close'
}
