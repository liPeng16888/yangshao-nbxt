import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import FeishuVerifyPage from './FeishuVerifyPage.vue'
const proof = 'a'.repeat(32)
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
afterEach(() => vi.unstubAllGlobals())
async function page(mocks: boolean) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/ai/feishu/bind', component: FeishuVerifyPage }] })
  await router.push(`/ai/feishu/bind#proof=${proof}`); await router.isReady()
  const wrapper = mount(FeishuVerifyPage, { props: { audience: 'frontend', mocks, apiBase: '/api' }, global: { plugins: [router, ElementPlus] } })
  await flushPromises(); return wrapper
}
describe('Feishu owner verification UI', () => {
  it('does not submit bindings under a demo login', async () => { const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const wrapper = await page(true); expect(wrapper.text()).toContain('演示登录不能完成真实飞书绑定'); expect(fetch).not.toHaveBeenCalled(); wrapper.unmount() })
  it('confirms only the proof after displaying the server-verified identity', async () => {
    const fetch = vi.fn().mockImplementation(async url => new Response(JSON.stringify(String(url).endsWith('/resolve') ? { account: 'a', username: '账号甲', feishuUser: 'operator', model: '授权模型' } : { ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetch); const wrapper = await page(false)
    expect(wrapper.text()).toContain('账号甲（a）'); expect(wrapper.text()).toContain('operator')
    await wrapper.findAll('button').find(b => b.text() === '确认绑定此账号')!.trigger('click'); await flushPromises()
    const call = fetch.mock.calls.find(c => String(c[0]).endsWith('/confirm'))!
    expect(JSON.parse(call[1].body)).toEqual({ proof }); expect(wrapper.text()).toContain('绑定成功'); wrapper.unmount()
  })
  it('offers no confirmation when logged into a different website identity', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: '请登录管理员指定的网站账号确认绑定' }), { status: 403 }))); const wrapper = await page(false); expect(wrapper.text()).toContain('请登录管理员指定的网站账号'); expect(wrapper.findAll('button').some(b => b.text() === '确认绑定此账号')).toBe(false); wrapper.unmount() })
})
