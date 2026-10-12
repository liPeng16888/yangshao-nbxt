import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElSelect } from 'element-plus'
import FeishuSettingsPanel from './FeishuSettingsPanel.vue'
import type { AiConfig, FeishuBot } from '../../../shared/ai/types'
const config: AiConfig = { settings: { enabled: true, dailyRequestLimit: 50, blockedFields: {}, revision: 1 }, models: [{ id: 'model', name: '测试模型', modelId: 'fixture', baseUrl: 'https://model.example.com', enabled: true, tools: true, vision: true, allowedUserIds: [], hasApiKey: true }], accounts: [{ id: 'front', account: 'front', username: '前台账号', role: 'FRONTEND_USER' }, { id: 'sub', account: 'sub', username: '前台子账号', role: 'FRONTEND_SUB_USER' }, { id: 'root', account: 'root', username: '后台账号', role: 'ROOT_ADMIN' }], policies: [], catalog: [] }
const cfg = (bot: FeishuBot) => ({ bot, appId: bot + '-app', hasSecret: true, publicSiteUrl: bot === 'frontend' ? 'https://lab.example.com' : 'https://admin.example.com', enabled: true, revision: 1, status: { state: 'connected', lastError: '', connectedAt: null, lastReceivedAt: null, lastSentAt: null } })
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return { get length() { return values.size }, clear: () => values.clear(), getItem: key => values.get(key) ?? null, key: index => Array.from(values.keys())[index] ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, String(value)) }
}
function mockApi() {
  const fetch = vi.fn().mockImplementation(async (url, options) => {
    const path = String(url), bot: FeishuBot = path.includes('/configs/admin') ? 'admin' : 'frontend'
    const value = path.endsWith('/bindings') ? [] : path.endsWith('/invitations') ? { command: '绑定 synthetic-invitation-code', expiresAt: '2026-10-12T00:00:00Z' } : cfg(bot)
    return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const mountPanel = (mocks = false) => mount(FeishuSettingsPanel, { props: { config, mocks }, global: { plugins: [ElementPlus] } })
async function chooseAdmin(wrapper: ReturnType<typeof mountPanel>) { await wrapper.findAll('.feishu-bot')[1].trigger('click'); await flushPromises() }
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); localStorage.setItem('ys_admin_token', 'fixture-token') })
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
describe('Independent Feishu robot settings', () => {
  it('shows both audiences and blocks real operations in demo mode', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const wrapper = mountPanel(true); await flushPromises()
    expect(wrapper.findAll('.feishu-bot')).toHaveLength(2)
    expect(wrapper.text()).toContain('card.action.trigger'); expect(wrapper.text()).toContain('im:message.p2p_msg:readonly')
    expect(wrapper.text()).toContain('多账号查询'); expect(wrapper.text()).toContain('全选账号'); expect(wrapper.text()).toContain('20 个授权账号')
    for (const button of wrapper.findAll('button').filter(b => ['保存连接配置', '测试连接', '生成绑定指令'].includes(b.text()))) expect(button.attributes('disabled')).toBeDefined()
    await chooseAdmin(wrapper)
    expect(wrapper.text()).toContain('后台网站 HTTPS 根地址')
    expect(fetch).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('loads two independent configurations and saves credentials only for the selected robot', async () => {
    const fetch = mockApi(), wrapper = mountPanel(); await flushPromises()
    expect(fetch.mock.calls.some(c => String(c[0]).endsWith('/configs/frontend'))).toBe(true)
    expect(fetch.mock.calls.some(c => String(c[0]).endsWith('/configs/admin'))).toBe(true)
    expect(wrapper.text()).toContain('留空保留此机器人已保存密钥')
    await wrapper.get('input[type="password"]').setValue('fixture-front-secret')
    await wrapper.findAll('button').find(b => b.text() === '保存连接配置')!.trigger('click'); await flushPromises()
    const call = fetch.mock.calls.find(c => c[1]?.method === 'PUT')!
    expect(String(call[0])).toMatch(/\/configs\/frontend$/)
    expect(JSON.parse(call[1].body)).toEqual({ appId: 'frontend-app', appSecret: 'fixture-front-secret', publicSiteUrl: 'https://lab.example.com', enabled: true })
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('')
    await chooseAdmin(wrapper)
    expect((wrapper.get('input[placeholder="填写后台机器人的 App ID"]').element as HTMLInputElement).value).toBe('admin-app')
    expect(wrapper.text()).not.toContain('fixture-front-secret')
    expect(fetch.mock.calls.filter(c => c[1]?.method === 'PUT')).toHaveLength(1); wrapper.unmount()
  })
  it('retains separate unsaved forms when switching between robots', async () => {
    mockApi(); const wrapper = mountPanel(); await flushPromises()
    await wrapper.get('input[type="password"]').setValue('front-draft')
    await chooseAdmin(wrapper)
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('')
    await wrapper.get('input[type="password"]').setValue('admin-draft')
    await wrapper.findAll('.feishu-bot')[0].trigger('click'); await flushPromises()
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('front-draft')
    wrapper.unmount()
  })
  it('filters eligible identities by robot audience and generates the full command on that robot', async () => {
    const fetch = mockApi(), wrapper = mountPanel(); await flushPromises()
    expect((wrapper.vm as any).accountsForBot.map((a: any) => a.id)).toEqual(['front', 'sub'])
    await chooseAdmin(wrapper)
    expect((wrapper.vm as any).accountsForBot.map((a: any) => a.id)).toEqual(['root'])
    const selects = wrapper.findAllComponents(ElSelect)
    selects[0].vm.$emit('update:modelValue', 'root'); selects[1].vm.$emit('update:modelValue', 'model'); await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === '生成绑定指令')!.trigger('click'); await flushPromises()
    const call = fetch.mock.calls.find(c => String(c[0]).endsWith('/invitations'))!
    expect(String(call[0])).toMatch(/\/configs\/admin\/invitations$/)
    expect(JSON.parse(call[1].body)).toEqual({ userId: 'root', defaultModelId: 'model' })
    expect((wrapper.get('.feishu-instruction input').element as HTMLInputElement).value).toBe('绑定 synthetic-invitation-code')
    await wrapper.findAll('.feishu-bot')[0].trigger('click'); await flushPromises()
    expect(wrapper.find('.feishu-instruction').exists()).toBe(false); wrapper.unmount()
  })
})
