import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import FeishuSettingsPanel from './FeishuSettingsPanel.vue'
import type { AiConfig } from '../../../shared/ai/types'
const config: AiConfig = { settings: { enabled: true, dailyRequestLimit: 50, blockedFields: {}, revision: 1 }, models: [], accounts: [], policies: [], catalog: [] }
const c = { appId: 'app', hasSecret: true, publicSiteUrl: 'https://lab.example.com', enabled: true, revision: 1, status: { state: 'connected', lastError: '', lastReceivedAt: null, lastSentAt: null } }
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
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
describe('Feishu settings UI', () => {
  it('provides setup instructions but blocks all real operations in demo mode', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const wrapper = mount(FeishuSettingsPanel, { props: { config, mocks: true }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('card.action.trigger'); expect(wrapper.text()).toContain('本人私聊机器人')
    for (const button of wrapper.findAll('button').filter(b => ['保存连接配置', '测试连接', '生成绑定指令'].includes(b.text()))) expect(button.attributes('disabled')).toBeDefined()
    expect(fetch).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('saves explicitly entered credentials and clears the secret after saving', async () => {
    localStorage.setItem('ys_admin_token', 'fixture-token')
    const fetch = vi.fn().mockImplementation(async (url, options) => new Response(JSON.stringify(String(url).endsWith('/bindings') ? [] : c), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const wrapper = mount(FeishuSettingsPanel, { props: { config, mocks: false }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('已连接'); expect(wrapper.text()).toContain('留空保留已保存密钥')
    const secret = wrapper.get('input[type="password"]')
    await secret.setValue('fixture-secret')
    await wrapper.findAll('button').find(b => b.text() === '保存连接配置')!.trigger('click'); await flushPromises()
    const call = fetch.mock.calls.find(c => c[1]?.method === 'PUT')!
    expect(JSON.parse(call[1].body)).toEqual({ appId: 'app', appSecret: 'fixture-secret', publicSiteUrl: 'https://lab.example.com', enabled: true })
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).not.toContain('fixture-secret'); wrapper.unmount()
  })
})
