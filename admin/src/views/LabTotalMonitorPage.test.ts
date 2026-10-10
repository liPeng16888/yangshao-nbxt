import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElCheckboxGroup, ElSelect, ElSwitch } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LabTotalMonitorPage from './LabTotalMonitorPage.vue'

const api = vi.hoisted(() => ({ options: vi.fn(), get: vi.fn(), save: vi.fn(), bulk: vi.fn() }))
vi.mock('../api', () => ({ getFrontendOptions: api.options, useAdminMocks: false }))
vi.mock('../api/labTotalMonitor', () => ({ getAdminLabTotalMonitorConfig: api.get, saveAdminLabTotalMonitorConfig: api.save, bulkAppendAdminLabTotalMonitorRules: api.bulk }))
const rule = { id: 'r1', name: '低铁标准', ironMin: 5, ironMax: 10, totalMin: 80.5, totalMax: 82.5, enabled: true }
const rules = [rule, { ...rule, id: 'r2', name: '中铁标准', ironMin: 11, ironMax: 20 }]
const clickButton = async (wrapper: ReturnType<typeof mount>, text: string) => {
  const button = wrapper.findAll('button').find(node => node.text() === text)
  if (!button) throw new Error(`按钮不存在：${text}`)
  await button.trigger('click')
}
async function setup() {
  const wrapper = mount(LabTotalMonitorPage, { global: { plugins: [ElementPlus], stubs: {
    teleport: true,
    ElSelect: { name: 'ElSelect', props: ['modelValue', 'disabled'], emits: ['update:modelValue', 'change'], template: '<select :disabled="disabled"><slot /></select>' },
    ElOption: { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
    ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' }
  } } })
  await flushPromises(); return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
  api.options.mockResolvedValue([
    { id: 'main-1', account: 'main', name: '来源账号' },
    { id: 'target-1', account: 'one', name: '目标一' },
    { id: 'target-2', account: 'two', name: '目标二' }
  ])
  api.get.mockResolvedValue({ frontendUserId: 'main-1', version: 2, rules, updatedAt: null })
  api.bulk.mockResolvedValue([])
})
describe('monitor bulk account application', () => {
  it('submits only selected saved rule IDs and targets with the source version', async () => {
    const wrapper = await setup()
    await clickButton(wrapper, '批量添加到其他账号')
    wrapper.findComponent(ElCheckboxGroup).vm.$emit('update:modelValue', ['r2'])
    wrapper.findComponent<typeof ElSelect>('.monitor-bulk-select').vm.$emit('update:modelValue', ['target-1', 'target-2'])
    await flushPromises(); await clickButton(wrapper, '开始批量添加'); await flushPromises()
    expect(api.bulk).toHaveBeenCalledWith({ sourceFrontendUserId: 'main-1', sourceVersion: 2, ruleIds: ['r2'], frontendUserIds: ['target-1', 'target-2'] })
    expect(api.save).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('disables bulk application when the source has unsaved changes', async () => {
    const wrapper = await setup()
    wrapper.findComponent(ElSwitch).vm.$emit('update:modelValue', false)
    await flushPromises()
    const button = wrapper.findAll('button').find(node => node.text() === '批量添加到其他账号')!
    expect(button.attributes('disabled')).toBeDefined(); expect(button.attributes('title')).toContain('先保存')
    expect(api.bulk).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('prevents duplicate pending requests and explains each successful or skipped target', async () => {
    let resolve!: (value: unknown) => void
    api.bulk.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = await setup(); await clickButton(wrapper, '批量添加到其他账号')
    await clickButton(wrapper, '选择全部其他账号')
    await clickButton(wrapper, '开始批量添加'); await clickButton(wrapper, '开始批量添加')
    expect(api.bulk).toHaveBeenCalledTimes(1)
    resolve([
      { frontendUserId: 'target-1', status: 'applied', addedCount: 2, duplicateCount: 0, message: '已追加 2 条规则' },
      { frontendUserId: 'target-2', status: 'skipped', addedCount: 0, duplicateCount: 0, message: '铁含量范围重叠' }
    ])
    await flushPromises()
    expect(wrapper.text()).toContain('已添加 1 个账号')
    expect(wrapper.text()).toContain('目标二（two）')
    expect(wrapper.text()).toContain('铁含量范围重叠')
    wrapper.unmount()
  })
})
