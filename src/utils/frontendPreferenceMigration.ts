import type { AuthUser } from '@/types/auth'
import type { FrontendPreferenceSection } from '@/types/frontendPreference'
import type { LabReportElementKey, LabReportSmsTemplate, LabReportTemplate } from '@/types/labReport'
import {
  LAB_REPORT_SAMPLE_UNIT_STORAGE_PREFIX,
  LAB_REPORT_SMS_TEMPLATE_STORAGE_KEY,
  LAB_REPORT_TEMPLATE_STORAGE_KEY,
  defaultLabReportSmsTemplate,
  defaultLabReportTemplate,
  labReportElements,
  loadLabReportSmsTemplate,
  loadLabReportTemplate
} from './labReport'

export const LAB_ELEMENT_GROUP_STORAGE_KEY = 'ys_lab_element_groups'

type LegacyPreferenceCandidates = Partial<Record<FrontendPreferenceSection, unknown>>

type LegacyElementGroup = {
  id: string
  name: string
  elementKeys: LabReportElementKey[]
}

const MIGRATION_MARKER_PREFIX = 'ys_frontend_preferences:legacy-migration:v1:'
const REPORT_FIELDS = [
  'title', 'sampleUnit', 'inspector', 'reviewer', 'address', 'phone', 'statements', 'sealImage'
] as const
const REPORT_LIMITS = {
  title: 120,
  sampleUnit: 120,
  inspector: 40,
  reviewer: 40,
  address: 200,
  phone: 120
} as const
const KNOWN_ELEMENT_KEYS = new Set(labReportElements.map((element) => element.key))
const SECTION_PERMISSIONS: Record<FrontendPreferenceSection, readonly string[]> = {
  LAB_REPORT_TEMPLATE: ['LAB_REPORT_IMAGE_TEMPLATE'],
  LAB_REPORT_SMS_TEMPLATE: ['LAB_REPORT_SMS_TEMPLATE'],
  LAB_REPORT_SAMPLE_UNITS: ['DATA_MAIN', 'LAB_REPORT_IMAGE_TEMPLATE'],
  LAB_ELEMENT_GROUPS: ['DATA_MAIN']
}

export function collectLegacyPreferenceCandidates(
  user: AuthUser | null,
  serverSections: ReadonlySet<FrontendPreferenceSection>
): LegacyPreferenceCandidates {
  const ownerId = preferenceOwnerId(user)
  if (!user || !ownerId || typeof window === 'undefined') return {}

  const candidates: LegacyPreferenceCandidates = {}
  const offer = (section: FrontendPreferenceSection, value: unknown) => {
    if (
      value === undefined ||
      serverSections.has(section) ||
      migrationFinished(ownerId, section) ||
      !canAccessSection(user, section)
    ) return
    candidates[section] = value
  }

  offer('LAB_REPORT_TEMPLATE', readReportTemplate())
  offer('LAB_REPORT_SMS_TEMPLATE', readSmsTemplate())
  offer('LAB_REPORT_SAMPLE_UNITS', readSampleUnits(user.id, ownerId))
  offer('LAB_ELEMENT_GROUPS', readElementGroups())
  return candidates
}

export function markLegacyMigrationFinished(
  ownerId: string,
  sections: readonly FrontendPreferenceSection[]
) {
  if (!ownerId || typeof window === 'undefined') return
  for (const section of new Set(sections)) {
    window.localStorage.setItem(migrationMarkerKey(ownerId, section), 'finished')
  }
}

function preferenceOwnerId(user: AuthUser | null): string {
  if (!user) return ''
  if (user.role === 'FRONTEND_SUB_USER' || user.isFrontendSubAccount) {
    return user.dataOwnerId ?? ''
  }
  if (user.role === 'FRONTEND_USER' || user.isFrontendMainAccount) {
    return user.dataOwnerId ?? user.id
  }
  return ''
}

function canAccessSection(user: AuthUser, section: FrontendPreferenceSection) {
  if (user.role === 'FRONTEND_USER' || user.isFrontendMainAccount) return true
  const assigned = new Set(user.permissions ?? [])
  return SECTION_PERMISSIONS[section].some((permission) => assigned.has(permission as never))
}

function migrationFinished(ownerId: string, section: FrontendPreferenceSection) {
  return window.localStorage.getItem(migrationMarkerKey(ownerId, section)) === 'finished'
}

function migrationMarkerKey(ownerId: string, section: FrontendPreferenceSection) {
  return `${MIGRATION_MARKER_PREFIX}${encodeURIComponent(ownerId)}:${section}`
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function readReportTemplate(): LabReportTemplate | undefined {
  const raw = readJson(LAB_REPORT_TEMPLATE_STORAGE_KEY)
  if (!isRecord(raw)) return undefined
  for (const [field, limit] of Object.entries(REPORT_LIMITS)) {
    if (field in raw && !limitedString(raw[field], limit)) return undefined
  }
  if (
    'statements' in raw && (
      !Array.isArray(raw.statements) ||
      raw.statements.length !== 4 ||
      raw.statements.some((statement) => !limitedString(statement, 500))
    )
  ) return undefined
  if ('sealImage' in raw && !validSealDataUrl(raw.sealImage)) return undefined
  const loaded = loadLabReportTemplate()
  const merged = Object.fromEntries(REPORT_FIELDS.map((field) => [field, loaded[field]])) as Record<string, unknown>
  for (const [field, limit] of Object.entries(REPORT_LIMITS)) {
    if (!limitedString(merged[field], limit)) return undefined
  }
  if (
    !Array.isArray(merged.statements) ||
    merged.statements.length !== 4 ||
    merged.statements.some((statement) => !limitedString(statement, 500))
  ) return undefined
  if (!validSealDataUrl(merged.sealImage)) return undefined

  const normalized: LabReportTemplate = {
    title: merged.title as string,
    sampleUnit: merged.sampleUnit as string,
    inspector: merged.inspector as string,
    reviewer: merged.reviewer as string,
    address: merged.address as string,
    phone: merged.phone as string,
    statements: [...merged.statements] as string[],
    sealImage: merged.sealImage as string
  }
  return jsonEqual(normalized, defaultLabReportTemplate) ? undefined : normalized
}

function readSmsTemplate(): LabReportSmsTemplate | undefined {
  const raw = readJson(LAB_REPORT_SMS_TEMPLATE_STORAGE_KEY)
  if (!isRecord(raw)) return undefined
  if ('prefix' in raw && typeof raw.prefix !== 'string') return undefined
  if ('suffix' in raw && typeof raw.suffix !== 'string') return undefined
  const loaded = loadLabReportSmsTemplate()
  const prefix = typeof loaded.prefix === 'string' ? loaded.prefix.trim() : undefined
  const suffix = typeof loaded.suffix === 'string' ? loaded.suffix.trim() : undefined
  if (
    prefix === undefined || suffix === undefined ||
    codePointLength(prefix) > 500 || codePointLength(suffix) > 500 ||
    codePointLength(prefix) + codePointLength(suffix) > 800
  ) return undefined
  const normalized = { prefix, suffix }
  return jsonEqual(normalized, defaultLabReportSmsTemplate) ? undefined : normalized
}

function readSampleUnits(actorId: string, ownerId: string): string[] | undefined {
  const units: string[] = []
  const keys = [...new Set([actorId, ownerId])]
  for (const id of keys) {
    const raw = readJson(`${LAB_REPORT_SAMPLE_UNIT_STORAGE_PREFIX}${id}`)
    if (!Array.isArray(raw)) continue
    for (const unit of raw) {
      if (typeof unit !== 'string') continue
      const normalized = unit.trim()
      if (!normalized || codePointLength(normalized) > 80 || units.includes(normalized)) continue
      units.push(normalized)
      if (units.length === 100) return units
    }
  }
  return units.length ? units : undefined
}

function readElementGroups(): LegacyElementGroup[] | undefined {
  const raw = readJson(LAB_ELEMENT_GROUP_STORAGE_KEY)
  if (!Array.isArray(raw) || raw.length > 100) return undefined
  const ids = new Set<string>()
  const names = new Set<string>()
  const groups: LegacyElementGroup[] = []
  for (const value of raw) {
    if (!isRecord(value)) return undefined
    const id = typeof value.id === 'string' ? value.id.trim() : ''
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    if (
      !id || !name || codePointLength(id) > 80 || codePointLength(name) > 40 ||
      ids.has(id) || names.has(name) || !Array.isArray(value.elementKeys)
    ) return undefined
    const requestedKeys = new Set<LabReportElementKey>()
    for (const key of value.elementKeys) {
      if (typeof key !== 'string' || !KNOWN_ELEMENT_KEYS.has(key as LabReportElementKey)) return undefined
      requestedKeys.add(key as LabReportElementKey)
    }
    const elementKeys = labReportElements.map((element) => element.key).filter((key) => requestedKeys.has(key))
    if (!elementKeys.length) return undefined
    ids.add(id)
    names.add(name)
    groups.push({ id, name, elementKeys })
  }
  return groups.length ? groups : undefined
}

function validSealDataUrl(value: unknown) {
  if (value === '') return true
  if (typeof value !== 'string') return false
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0 || decodedBase64Bytes(match[2]) > 512 * 1024) return false
  try {
    const binary = window.atob(match[2])
    if (window.btoa(binary) !== match[2]) return false
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return matchesImageMagic(match[1], bytes)
  } catch {
    return false
  }
}

function matchesImageMagic(type: string, bytes: Uint8Array) {
  if (type === 'png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((byte, index) => bytes[index] === byte)
  }
  if (type === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'webp') {
    return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP'
  }
  return false
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end))
}

function decodedBase64Bytes(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length * 3) / 4 - padding
}

function limitedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && codePointLength(value) <= maxLength
}

function codePointLength(value: string) {
  return Array.from(value).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}
