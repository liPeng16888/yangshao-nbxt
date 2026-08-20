import { BadRequestException } from '@nestjs/common'

export const LAB_SAMPLE_CHANGE_RAW_FIELDS = [
  'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust',
  'sulfur', 'densityRaw', 'whiteness', 'calciumRaw', 'magnesiumRaw', 'carbon',
  'titaniumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample', 'moisture',
  'crucible', 'sampleWeight', 'burnedCrucibleSample'
] as const

export type LabSampleChangeRawField = (typeof LAB_SAMPLE_CHANGE_RAW_FIELDS)[number]
export type PayerCustomerChange = { customerIds: string[]; customerText: string }
export type RequestedLabSampleChanges = {
  sampleNumber?: string
  payerCustomer?: PayerCustomerChange
  price?: number | null
  paymentStatus?: '已结款' | '未结款' | '月结款' | '预存款' | ''
  elementNote?: string
} & Partial<Record<LabSampleChangeRawField, number | null>>

type CanonicalCustomer = {
  id: string
  name: string
  phone: string | null
  wechat: string | null
  wechatNickname: string | null
}

const stringFields = new Set(['sampleNumber', 'elementNote'])
const numericFields = new Set(['price', ...LAB_SAMPLE_CHANGE_RAW_FIELDS])
const allowedFields = new Set(['sampleNumber', 'payerCustomer', 'price', 'paymentStatus', 'elementNote', ...LAB_SAMPLE_CHANGE_RAW_FIELDS])
const paymentStatuses = new Set(['已结款', '未结款', '月结款', '预存款', ''])

export function normalizeRequestedChanges(value: unknown): RequestedLabSampleChanges {
  if (!isRecord(value)) throw new BadRequestException('修改内容无效')

  const changes: RequestedLabSampleChanges = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (!allowedFields.has(key)) throw new BadRequestException(`不允许修改字段: ${key}`)

    if (stringFields.has(key)) {
      if (typeof rawValue !== 'string') throw new BadRequestException(`${key} 必须是文本`)
      changes[key as 'sampleNumber' | 'elementNote'] = rawValue.trim()
      continue
    }

    if (numericFields.has(key)) {
      if (rawValue !== null && (typeof rawValue !== 'number' || !Number.isFinite(rawValue))) {
        throw new BadRequestException(`${key} 必须是有限数字或空值`)
      }
      changes[key as 'price' | LabSampleChangeRawField] = rawValue
      continue
    }

    if (key === 'paymentStatus') {
      if (typeof rawValue !== 'string' || !paymentStatuses.has(rawValue)) {
        throw new BadRequestException('付款状态无效')
      }
      changes.paymentStatus = rawValue as RequestedLabSampleChanges['paymentStatus']
      continue
    }

    changes.payerCustomer = normalizePayerCustomer(rawValue)
  }
  return changes
}

export function applyRequestedChanges(
  inputs: Record<string, unknown>,
  changes: RequestedLabSampleChanges,
  canonicalCustomers: CanonicalCustomer[]
) {
  const nextInputs: Record<string, unknown> = { ...inputs }
  for (const [field, value] of Object.entries(changes)) {
    if (field !== 'payerCustomer') nextInputs[field] = value
  }

  if (changes.payerCustomer) {
    const customerById = new Map(canonicalCustomers.map((customer) => [customer.id, customer]))
    const customers = changes.payerCustomer.customerIds
      .map((customerId) => customerById.get(customerId))
      .filter((customer): customer is CanonicalCustomer => Boolean(customer))

    nextInputs.customerId = changes.payerCustomer.customerIds[0] || null
    nextInputs.customerIds = changes.payerCustomer.customerIds
    nextInputs.customers = customers
    nextInputs.customerText = changes.payerCustomer.customerText
  }

  return nextInputs
}

export function diffChangedInputs(oldInputs: Record<string, unknown>, nextInputs: Record<string, unknown>) {
  return Array.from(new Set([...Object.keys(oldInputs), ...Object.keys(nextInputs)]))
    .filter((field) => !jsonEqual(oldInputs[field], nextInputs[field]))
}

function normalizePayerCustomer(value: unknown): PayerCustomerChange {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'customerIds' && key !== 'customerText')) {
    throw new BadRequestException('付款客户无效')
  }
  if (!Array.isArray(value.customerIds) || typeof value.customerText !== 'string') {
    throw new BadRequestException('付款客户无效')
  }

  const customerIds = Array.from(new Set(value.customerIds.map((customerId) => {
    if (typeof customerId !== 'string') throw new BadRequestException('付款客户无效')
    return customerId.trim()
  }).filter(Boolean)))

  return { customerIds, customerText: value.customerText.trim() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}
