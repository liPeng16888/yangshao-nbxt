import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLabTotalMonitor } from './useLabTotalMonitor'
import { useAuthStore } from '@/stores/auth'
import { useLabTotalMonitorStore } from '@/stores/labTotalMonitor'
import { getLabTotalMonitorConfig } from '@/api/labTotalMonitor'
import type { AuthUser } from '@/types/auth'
import type { SampleBlock } from '@/types/labSheet'
vi.mock('@/api/labTotalMonitor', () => ({ getLabTotalMonitorConfig: vi.fn() }))
const rule = { id: 'r1', name: '低铁', ironMin: 5, ironMax: 10, totalMin: 80.5, totalMax: 82.5, enabled: true }
const sample = { id: 'block-1', index: 1, inputs: { sequence: '001', ironRaw: 0.3, siliconRaw: 1.2, aluminumRaw: 3 }, results: { iron: 7, silicon: 14, aluminum: 60, total: 90 } } as SampleBlock
beforeEach(() => { vi.restoreAllMocks(); vi.mocked(getLabTotalMonitorConfig).mockReset(); vi.mocked(getLabTotalMonitorConfig).mockResolvedValue({ frontendUserId: 'main-1', version: 1, rules: [rule], updatedAt: null }) })
async function setup() {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null } })
  const pinia = createPinia(); useAuthStore(pinia).user = { id: 'main-1', dataOwnerId: 'main-1', permissionVersion: 1 } as AuthUser
  let monitor!: ReturnType<typeof useLabTotalMonitor>
  const wrapper = mount(defineComponent({ setup() { monitor = useLabTotalMonitor(); return () => null } }), { global: { plugins: [pinia] } })
  await flushPromises(); return { wrapper, monitor, pinia }
}
describe('mandatory total abnormality confirmation', () => {
  it.each(['report', 'sms'] as const)('cancels %s generation when the warning is dismissed, and permits explicit confirmation', async (kind) => {
    const { wrapper, monitor } = await setup()
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
    expect(await monitor.confirmGeneration([sample], kind)).toBe(false)
    expect(confirm).toHaveBeenCalledWith(expect.anything(), '合量异常', expect.objectContaining({ confirmButtonText: kind === 'report' ? '仍然生成报告' : '仍然生成短信' }))
    confirm.mockResolvedValueOnce('confirm' as never)
    expect(await monitor.confirmGeneration([sample], kind)).toBe(true); wrapper.unmount()
  })
  it('does not warn for normal, incomplete, or unselected samples', async () => {
    const { wrapper, monitor } = await setup(), confirm = vi.spyOn(ElMessageBox, 'confirm')
    expect(await monitor.confirmGeneration([{ ...sample, results: { ...sample.results, total: 81 } }], 'sms')).toBe(true)
    expect(await monitor.confirmGeneration([{ ...sample, inputs: { ...sample.inputs, siliconRaw: null } }], 'report')).toBe(true)
    expect(await monitor.confirmGeneration([], 'report')).toBe(true)
    expect(confirm).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('stops generation on failed rules loading and never uses a stale cached normal assessment', async () => {
    const { wrapper, monitor } = await setup()
    vi.mocked(getLabTotalMonitorConfig).mockRejectedValueOnce(new Error('offline'))
    const error = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as never)
    expect(await monitor.confirmGeneration([sample], 'report')).toBe(false); expect(error).toHaveBeenCalled(); wrapper.unmount()
  })
  it('invalidates a pending approval when the account or rule version changes', async () => {
    const { wrapper, monitor, pinia } = await setup()
    let resolve!: (value: any) => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const pending = monitor.confirmGeneration([sample], 'sms'); await flushPromises()
    useLabTotalMonitorStore(pinia).config!.version = 2
    vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as never)
    resolve('confirm'); expect(await pending).toBe(false); wrapper.unmount()
  })
})
