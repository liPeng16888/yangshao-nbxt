import { BadRequestException } from '@nestjs/common'
import type { FrontendPreferenceSection } from '@prisma/client'

export const LAB_REPORT_ELEMENT_KEYS = [
  'aluminum', 'silicon', 'iron', 'aluminumSiliconRatio', 'sulfur', 'carbon',
  'moisture', 'calcium', 'magnesium', 'whiteness', 'density', 'titanium', 'burnLoss'
] as const

export const MAX_SEAL_BYTES = 512 * 1024

type LabReportElementKey = (typeof LAB_REPORT_ELEMENT_KEYS)[number]

export interface FrontendReportTemplateValue {
  title: string
  sampleUnit: string
  inspector: string
  reviewer: string
  address: string
  phone: string
  statements: [string, string, string, string]
  sealImage: string
}

export interface FrontendSmsTemplateValue {
  prefix: string
  suffix: string
}

export interface FrontendElementGroupValue {
  id: string
  name: string
  elementKeys: LabReportElementKey[]
}

export type FrontendPreferenceValue =
  | FrontendReportTemplateValue
  | FrontendSmsTemplateValue
  | string[]
  | FrontendElementGroupValue[]

const REPORT_FIELDS = ['title', 'sampleUnit', 'inspector', 'reviewer', 'address', 'phone', 'statements', 'sealImage'] as const
const SMS_FIELDS = ['prefix', 'suffix'] as const
const GROUP_FIELDS = ['id', 'name', 'elementKeys'] as const
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,/
const KNOWN_ELEMENT_KEYS = new Set<string>(LAB_REPORT_ELEMENT_KEYS)

export function normalizeFrontendPreferenceValue(
  section: FrontendPreferenceSection,
  value: unknown
): FrontendPreferenceValue {
  switch (section) {
    case 'LAB_REPORT_TEMPLATE': return normalizeReportTemplate(value)
    case 'LAB_REPORT_SMS_TEMPLATE': return normalizeSmsTemplate(value)
    case 'LAB_REPORT_SAMPLE_UNITS': return normalizeUnits(value)
    case 'LAB_ELEMENT_GROUPS': return normalizeGroups(value)
    default: throw new BadRequestException('配置分区无效')
  }
}

function normalizeReportTemplate(value: unknown): FrontendReportTemplateValue {
  const template = exactObject(value, REPORT_FIELDS, '报告模板字段无效')
  const statements = template.statements
  if (!Array.isArray(statements) || statements.length !== 4) {
    throw new BadRequestException('报告声明必须恰好包含 4 条')
  }

  return {
    title: limitedString(template.title, 120, '报告标题'),
    sampleUnit: limitedString(template.sampleUnit, 120, '来样单位'),
    inspector: limitedString(template.inspector, 40, '检验员'),
    reviewer: limitedString(template.reviewer, 40, '审核人'),
    address: limitedString(template.address, 200, '地址'),
    phone: limitedString(template.phone, 120, '电话'),
    statements: statements.map((statement) => limitedString(statement, 500, '报告声明')) as [string, string, string, string],
    sealImage: normalizeSealImage(template.sealImage)
  }
}

function normalizeSmsTemplate(value: unknown): FrontendSmsTemplateValue {
  const template = exactObject(value, SMS_FIELDS, '短信模板字段无效')
  const prefix = trimmedLimitedString(template.prefix, 500, '短信前缀')
  const suffix = trimmedLimitedString(template.suffix, 500, '短信后缀')
  if (codePointLength(prefix) + codePointLength(suffix) > 800) {
    throw new BadRequestException('短信模板总长度不能超过 800 个字符')
  }
  return { prefix, suffix }
}

function normalizeUnits(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new BadRequestException('来样单位最多 100 个')
  }
  const units: string[] = []
  const seen = new Set<string>()
  for (const unit of value) {
    const normalized = trimmedLimitedString(unit, 80, '来样单位')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    units.push(normalized)
  }
  return units
}

function normalizeGroups(value: unknown): FrontendElementGroupValue[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new BadRequestException('化验元素组合最多 100 组')
  }
  const ids = new Set<string>()
  const names = new Set<string>()
  return value.map((group) => {
    const record = exactObject(group, GROUP_FIELDS, '化验元素组合字段无效')
    const id = nonEmptyString(record.id, 80, '化验元素组合 ID')
    const name = nonEmptyString(record.name, 40, '化验元素组合名称')
    if (ids.has(id)) throw new BadRequestException('化验元素组合 ID 重复')
    if (names.has(name)) throw new BadRequestException('化验元素组合名称重复')
    ids.add(id)
    names.add(name)

    if (!Array.isArray(record.elementKeys)) {
      throw new BadRequestException('化验元素无效')
    }
    const keys = new Set<LabReportElementKey>()
    for (const elementKey of record.elementKeys) {
      if (typeof elementKey !== 'string' || !KNOWN_ELEMENT_KEYS.has(elementKey)) {
        throw new BadRequestException('化验元素无效')
      }
      keys.add(elementKey as LabReportElementKey)
    }
    if (!keys.size) throw new BadRequestException('化验元素不能为空')
    return { id, name, elementKeys: LAB_REPORT_ELEMENT_KEYS.filter((key) => keys.has(key)) }
  })
}

function normalizeSealImage(value: unknown): string {
  if (value === '') return ''
  if (typeof value !== 'string') throw new BadRequestException('电子公章无效')
  const match = DATA_URL_PATTERN.exec(value)
  if (!match) throw new BadRequestException('电子公章只支持 PNG、JPEG 或 WebP')
  const base64 = value.slice(match[0].length)
  if (!isCanonicalBase64(base64)) throw new BadRequestException('电子公章内容无效')
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length > MAX_SEAL_BYTES) throw new BadRequestException('电子公章不能超过 512 KiB')
  if (!matchesImageMagic(match[1]!, bytes)) throw new BadRequestException('电子公章内容与格式不一致')
  return value
}

function exactObject(value: unknown, fields: readonly string[], message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(message)
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)) || fields.some((field) => !(field in record))) {
    throw new BadRequestException(message)
  }
  return record
}

function limitedString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== 'string') throw new BadRequestException(`${label}无效`)
  if (codePointLength(value) > maxLength) throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`)
  return value
}

function nonEmptyString(value: unknown, maxLength: number, label: string): string {
  const normalized = trimmedLimitedString(value, maxLength, label)
  if (!normalized) throw new BadRequestException(`${label}不能为空`)
  return normalized
}

function trimmedLimitedString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== 'string') throw new BadRequestException(`${label}无效`)
  const normalized = value.trim()
  if (codePointLength(normalized) > maxLength) throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`)
  return normalized
}

function isCanonicalBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, 'base64').toString('base64') === value
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

function matchesImageMagic(type: string, bytes: Buffer): boolean {
  switch (type) {
    case 'png':
      return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'webp':
      return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    default:
      return false
  }
}
