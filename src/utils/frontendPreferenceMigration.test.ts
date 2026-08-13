import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthUser } from '@/types/auth'
import {
  collectLegacyPreferenceCandidates,
  markLegacyMigrationFinished
} from './frontendPreferenceMigration'
import {
  defaultLabReportSmsTemplate,
  defaultLabReportTemplate
} from './labReport'

function subUser(id: string, ownerId: string, permissions: AuthUser['permissions'] = [
  'DATA_MAIN',
  'LAB_REPORT_IMAGE_TEMPLATE',
  'LAB_REPORT_SMS_TEMPLATE'
]): AuthUser {
  return {
    id,
    account: id,
    username: id,
    role: 'FRONTEND_SUB_USER',
    dataOwnerId: ownerId,
    permissions,
    isFrontendMainAccount: false,
    isFrontendSubAccount: true
  }
}

describe('legacy frontend preference migration', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() { return values.size }
      }
    })
  })

  it('offers old local values only when the server section is absent', () => {
    localStorage.setItem('yangshao-lab-report-sms-template', JSON.stringify({ prefix: '旧前缀', suffix: '' }))

    expect(collectLegacyPreferenceCandidates(subUser('sub-1', 'main-1'), new Set()))
      .toMatchObject({ LAB_REPORT_SMS_TEMPLATE: { prefix: '旧前缀', suffix: '' } })
    expect(collectLegacyPreferenceCandidates(
      subUser('sub-1', 'main-1'),
      new Set(['LAB_REPORT_SMS_TEMPLATE'])
    )).not.toHaveProperty('LAB_REPORT_SMS_TEMPLATE')
  })

  it('checks both actor and owner sample-unit legacy keys but never another owner', () => {
    localStorage.setItem('yangshao-lab-report-sample-units:v1:sub-1', '["子账号本机"]')
    localStorage.setItem('yangshao-lab-report-sample-units:v1:main-1', '["主账号本机"]')
    localStorage.setItem('yangshao-lab-report-sample-units:v1:main-2', '["其他客户"]')

    expect(collectLegacyPreferenceCandidates(subUser('sub-1', 'main-1'), new Set()).LAB_REPORT_SAMPLE_UNITS)
      .toEqual(['子账号本机', '主账号本机'])
  })

  it('ignores exact template defaults after removing updatedAt and ignores malformed known fields', () => {
    localStorage.setItem('yangshao-lab-report-template', JSON.stringify({
      ...defaultLabReportTemplate,
      updatedAt: '2026-08-13T00:00:00.000Z',
      ignoredLegacyField: true
    }))
    localStorage.setItem('yangshao-lab-report-sms-template', JSON.stringify({
      ...defaultLabReportSmsTemplate,
      prefix: 123,
      ignoredLegacyField: true
    }))

    const candidates = collectLegacyPreferenceCandidates(subUser('sub-1', 'main-1'), new Set())

    expect(candidates).not.toHaveProperty('LAB_REPORT_TEMPLATE')
    expect(candidates).not.toHaveProperty('LAB_REPORT_SMS_TEMPLATE')
  })

  it('does not replace an explicitly invalid known field with its default', () => {
    localStorage.setItem('yangshao-lab-report-sms-template', JSON.stringify({
      prefix: null,
      suffix: '旧后缀',
      ignoredLegacyField: true
    }))

    expect(collectLegacyPreferenceCandidates(subUser('sub-1', 'main-1'), new Set()))
      .not.toHaveProperty('LAB_REPORT_SMS_TEMPLATE')
  })

  it('accepts valid known template fields while dropping legacy metadata and extra keys', () => {
    localStorage.setItem('yangshao-lab-report-template', JSON.stringify({
      ...defaultLabReportTemplate,
      title: '旧报告标题',
      updatedAt: '2026-08-13T00:00:00.000Z',
      ignoredLegacyField: true
    }))

    expect(collectLegacyPreferenceCandidates(subUser('sub-1', 'main-1'), new Set()).LAB_REPORT_TEMPLATE)
      .toEqual({ ...defaultLabReportTemplate, title: '旧报告标题' })
  })

  it('ignores a legacy seal whose declared image type does not match its file header', () => {
    localStorage.setItem('yangshao-lab-report-template', JSON.stringify({
      ...defaultLabReportTemplate,
      title: '旧报告标题',
      sealImage: 'data:image/png;base64,aGVsbG8='
    }))

    expect(collectLegacyPreferenceCandidates(subUser('sub-1', 'main-1'), new Set()))
      .not.toHaveProperty('LAB_REPORT_TEMPLATE')
  })

  it('validates and normalizes legacy groups and omits unauthorized sections', () => {
    localStorage.setItem('ys_lab_element_groups', JSON.stringify([
      { id: 'group-1', name: ' 铝硅 ', elementKeys: ['silicon', 'aluminum', 'aluminum'], extra: true }
    ]))
    const allowed = collectLegacyPreferenceCandidates(
      subUser('sub-1', 'main-1', ['DATA_MAIN']),
      new Set()
    )
    const forbidden = collectLegacyPreferenceCandidates(
      subUser('sub-1', 'main-1', ['LAB_REPORT_SMS_TEMPLATE']),
      new Set()
    )

    expect(allowed.LAB_ELEMENT_GROUPS).toEqual([
      { id: 'group-1', name: '铝硅', elementKeys: ['aluminum', 'silicon'] }
    ])
    expect(forbidden).not.toHaveProperty('LAB_ELEMENT_GROUPS')
  })

  it('records decisions only for the exact owner and sections', () => {
    localStorage.setItem('yangshao-lab-report-sms-template', JSON.stringify({ prefix: '旧前缀', suffix: '' }))
    const user = subUser('sub-1', 'main-1')

    markLegacyMigrationFinished('main-1', ['LAB_REPORT_SMS_TEMPLATE'])

    expect(collectLegacyPreferenceCandidates(user, new Set())).not.toHaveProperty('LAB_REPORT_SMS_TEMPLATE')
    expect(collectLegacyPreferenceCandidates(subUser('sub-2', 'main-2'), new Set()))
      .toHaveProperty('LAB_REPORT_SMS_TEMPLATE')
  })
})
