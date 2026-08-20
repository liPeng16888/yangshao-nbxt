import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { request } from '../api'
import type { AdminSampleRetest } from '../types'
import SampleRetestReadOnlyPanel from './SampleRetestReadOnlyPanel.vue'

function makeAdminRetests(): AdminSampleRetest[] {
  return [
    {
      id: 'retest-1', sampleBlockId: 'block-1', sequence: 1, status: 'ACTIVE',
      everFilled: true, readonly: true, sensitiveFieldsHidden: false,
      inputs: { ironRaw: 1.25, siliconRaw: null },
      results: { iron: 13.31, silicon: null },
      parameterSnapshot: { ironBlank: 0.04, ironFactor: 11 },
      voidReason: null, createdById: 'front-1', updatedById: 'front-1', voidedById: null,
      createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-20T08:30:00+08:00', voidedAt: null
    },
    {
      id: 'retest-2', sampleBlockId: 'block-1', sequence: 2, status: 'VOID',
      everFilled: true, readonly: true, sensitiveFieldsHidden: false,
      inputs: { ironRaw: 1.4 }, results: { iron: 14.96 },
      parameterSnapshot: { ironBlank: 0.04, ironFactor: 11 },
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
  it('returns ordered active and void fixtures from the existing GET endpoint', async () => {
    const sheets = await request.get('/admin/data-statistics/lab-sheets', {
      params: { frontendUserIds: 'front-1', date: '2026-08-20' }
    }) as Array<{ sampleBlocks: Array<{ retests: AdminSampleRetest[] }> }>

    expect(sheets[0].sampleBlocks[0].retests.map((row) => [row.sequence, row.status])).toEqual([
      [1, 'ACTIVE'],
      [2, 'VOID']
    ])
  })

  it.each(['post', 'put', 'patch', 'delete'] as const)('rejects %s writes to admin retest data', async (method) => {
    await expect(request[method]('/admin/data-statistics/lab-sheets/sheet-1/sample-retests/retest-1'))
      .rejects.toThrow('后台复样数据只读')
  })

  it('keeps unrelated existing admin writes available in mock mode', async () => {
    await expect(request.post('/admin/accounts/invite-codes')).resolves.toEqual({
      code: expect.stringMatching(/^YS-/)
    })
  })
})
