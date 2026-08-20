import { mount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminLogin, request } from '../api'
import type { AdminDataLabSheet, AdminSampleRetest } from '../types'
import SampleRetestReadOnlyPanel from './SampleRetestReadOnlyPanel.vue'

beforeAll(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  } satisfies Storage })
})

const retestInputKeys = [
  'aluminumAdjust', 'aluminumRaw', 'bottleWater', 'bottleWaterSample', 'burnedCrucibleSample',
  'calciumRaw', 'carbon', 'crucible', 'densityRaw', 'ironRaw', 'magnesiumRaw', 'moisture',
  'sampleWeight', 'siliconAdjust', 'siliconRaw', 'sulfur', 'titaniumRaw', 'waterSample', 'whiteness'
]
const retestResultKeys = [
  'aluminum', 'aluminumSiliconRatio', 'bottleDensity', 'burnLoss', 'calcium', 'density',
  'iron', 'magnesium', 'moisture', 'silicon', 'titanium', 'total'
]
const retestParameterKeys = [
  'aluminumFactor1', 'aluminumFactor2', 'calciumFactor', 'ironBlank', 'ironFactor',
  'magnesiumFactor', 'siliconBlank', 'siliconFactor', 'titaniumFactor'
]

function fullInputs(values: Partial<AdminSampleRetest['inputs']> = {}): AdminSampleRetest['inputs'] {
  return {
    ironRaw: null, siliconRaw: null, siliconAdjust: null, aluminumRaw: null, aluminumAdjust: null,
    sulfur: null, densityRaw: null, whiteness: null, calciumRaw: null, magnesiumRaw: null,
    carbon: null, titaniumRaw: null, waterSample: null, bottleWater: null, bottleWaterSample: null,
    moisture: null, crucible: null, sampleWeight: null, burnedCrucibleSample: null,
    ...values
  }
}

function fullResults(values: Partial<AdminSampleRetest['results']> = {}): AdminSampleRetest['results'] {
  return {
    iron: 0, silicon: 0, aluminum: 0, aluminumSiliconRatio: 0, total: 0, density: 0,
    calcium: 0, magnesium: 0, titanium: 0, bottleDensity: 0, moisture: 0, burnLoss: 0,
    ...values
  }
}

function fullParameters(values: Partial<AdminSampleRetest['parameterSnapshot']> = {}): AdminSampleRetest['parameterSnapshot'] {
  return {
    ironBlank: 0.04, ironFactor: 29.1, siliconBlank: 0.027, siliconFactor: 13,
    aluminumFactor1: 0.502, aluminumFactor2: 4.98, calciumFactor: 1.15,
    magnesiumFactor: 0.556, titaniumFactor: 0.57,
    ...values
  }
}

function makeAdminRetests(): AdminSampleRetest[] {
  return [
    {
      id: 'retest-1', sampleBlockId: 'block-1', sequence: 1, status: 'ACTIVE',
      everFilled: true, readonly: true, sensitiveFieldsHidden: false,
      inputs: fullInputs({ ironRaw: 1.25 }),
      results: fullResults({ iron: 13.31 }),
      parameterSnapshot: fullParameters({ ironFactor: 11 }),
      voidReason: null, createdById: 'front-1', updatedById: 'front-1', voidedById: null,
      createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-20T08:30:00+08:00', voidedAt: null
    },
    {
      id: 'retest-2', sampleBlockId: 'block-1', sequence: 2, status: 'VOID',
      everFilled: true, readonly: true, sensitiveFieldsHidden: false,
      inputs: fullInputs({ ironRaw: 1.4 }), results: fullResults({ iron: 14.96 }),
      parameterSnapshot: fullParameters({ ironFactor: 11 }),
      voidReason: '复核无效', createdById: 'front-1', updatedById: 'front-1', voidedById: 'front-1',
      createdAt: '2026-08-20T09:00:00+08:00', updatedAt: '2026-08-20T09:30:00+08:00', voidedAt: '2026-08-20T10:00:00+08:00'
    }
  ]
}

describe('SampleRetestReadOnlyPanel', () => {
  it('renders active and void audit data without editable controls or mutation events', () => {
    const wrapper = mount(SampleRetestReadOnlyPanel, { props: { retests: makeAdminRetests() } })

    expect(wrapper.text()).toContain('复样1')
    expect(wrapper.text()).toContain('有效')
    expect(wrapper.text()).toContain('复样2')
    expect(wrapper.text()).toContain('已作废')
    expect(wrapper.text()).toContain('铁原始值')
    expect(wrapper.text()).toContain('13.31')
    expect(wrapper.text()).toContain('参数快照')
    expect(wrapper.text()).toContain('铁系数')
    expect(wrapper.text()).toContain('复核无效')
    expect(wrapper.find('input, textarea, select, button').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/保存|删除|作废操作|恢复/)
    expect(wrapper.emitted()).toEqual({})
  })
})

describe('admin retest mock read-only contract', () => {
  beforeEach(() => window.localStorage.clear())

  it('returns ordered active and void fixtures from the existing GET endpoint', async () => {
    const sheets = await request.get('/admin/data-statistics/lab-sheets', {
      params: { frontendUserIds: 'front-1', date: '2026-06-25' }
    }) as AdminDataLabSheet[]

    expect(sheets[0].sampleBlocks[0].retests.map((row) => [row.sequence, row.status])).toEqual([
      [1, 'ACTIVE'],
      [2, 'VOID']
    ])
    const [active] = sheets[0].sampleBlocks[0].retests
    expect(Object.keys(active.inputs).sort()).toEqual(retestInputKeys)
    expect(Object.values(active.inputs).every((value) => value === null || typeof value === 'number')).toBe(true)
    expect(Object.keys(active.results).sort()).toEqual(retestResultKeys)
    expect(Object.values(active.results).every((value) => typeof value === 'number')).toBe(true)
    expect(Object.keys(active.parameterSnapshot).sort()).toEqual(retestParameterKeys)
    expect(Object.values(active.parameterSnapshot).every((value) => typeof value === 'number')).toBe(true)
  })

  it('uses authorized tenant scope and fixture dates without fabricating another account or date', async () => {
    await expect(request.get('/admin/data-statistics/lab-sheets', {
      params: { frontendUserIds: 'front-2', date: '2026-06-25' }
    })).resolves.toEqual([])
    await expect(request.get('/admin/data-statistics/lab-sheets', {
      params: { frontendUserIds: 'front-1', date: '2026-08-20' }
    })).resolves.toEqual([])

    await adminLogin({ account: 'sub001', password: 'sub123456' })
    const allowed = await request.get('/admin/data-statistics/lab-sheets', {
      params: { frontendUserIds: 'front-1', date: '2026-06-25' }
    }) as AdminDataLabSheet[]
    expect(allowed).toHaveLength(1)
    await expect(request.get('/admin/data-statistics/lab-sheets', {
      params: { frontendUserIds: 'front-2', date: '2026-06-25' }
    })).rejects.toThrow('没有访问部分前端账号的权限')
  })

  it.each(['post', 'put', 'patch', 'delete'] as const)('rejects %s writes to admin retest data', async (method) => {
    await expect(request[method]('/admin/data-statistics/lab-sheets/?view=readonly'))
      .rejects.toThrow('后台复样数据只读')
    await expect(request[method]('https://admin.example/lab-sheets/sheet-1/sample-retests/retest-1?view=readonly#audit'))
      .rejects.toThrow('后台复样数据只读')
  })

  it.each(['post', 'put', 'patch', 'delete'] as const)('allows %s on unrelated prefixes and query text', async (method) => {
    await expect(request[method]('/admin/data-statistics/lab-sheets-archive?next=/sample-retests'))
      .resolves.toEqual({ ok: true })
  })

  it('keeps unrelated existing admin writes available in mock mode', async () => {
    await expect(request.post('/admin/accounts/invite-codes')).resolves.toEqual({
      code: expect.stringMatching(/^YS-/)
    })
  })
})
