import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AiAssistant from './AiAssistant.vue'
vi.mock('./bubble', async () => {
  const { defineComponent, h } = await import('vue')
  return { Bubble: defineComponent({ setup(_props, { slots }) { return () => h('div', slots.content?.()) } }) }
})
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

const bootstrap = { enabled: true, models: [{ id: 'm', name: '测试模型', vision: true, tools: true }], owners: [], adminReadOnly: false, dailyRequestLimit: 50 }
const proposal = { id: 'p', resource: 'samples', status: 'PENDING', expiresAt: '2099-01-01', preview: { title: '修改样品数据', account: '甲（a）', location: '数据计算/2026-10-09/第1个样品', fields: [{ key: 'ironRaw', label: '铁原始值', before: 1, after: 2 }], warnings: ['请逐项核对'] } }
function fixture() {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.endsWith('/bootstrap') ? bootstrap : url.endsWith('/chat') ? { conversationId: 'c', answer: '草稿已生成', proposals: [structuredClone(proposal)] } : { status: 'APPLIED' } }))
  vi.stubGlobal('fetch', fetchMock)
  const wrapper = mount(AiAssistant, { props: { audience: 'frontend', actorId: 'actor' }, global: { plugins: [ElementPlus], stubs: { Bubble: { template: '<div><slot name="content" /></div>' } } } })
  const button = (text: string) => wrapper.findAll('button').find(b => b.text() === text)!
  return { wrapper, fetchMock, button }
}
afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('floating AI review UI', () => {
  it('shows the launcher on demand and never sends mock account data', async () => { const f = fixture(); await f.wrapper.setProps({ mockMode: true }); await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click'); await flushPromises(); expect(f.wrapper.text()).toContain('本地演示账号'); expect(f.fetchMock).not.toHaveBeenCalled(); f.wrapper.unmount() })
  it('requires a separate checked review and never includes altered values in the confirmation request', async () => {
    const f = fixture(); await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click'); await flushPromises(); await f.wrapper.get('textarea').setValue('把第一条样品的铁原始值改成2'); await f.button('发送').trigger('click'); await flushPromises()
    expect(f.wrapper.text()).toContain('甲（a）'); expect(f.wrapper.text()).toContain('第1个样品'); expect(f.button('确认写入').attributes('disabled')).toBeDefined()
    await f.wrapper.get('input[type="checkbox"]').setValue(true); expect(f.button('确认写入').attributes('disabled')).toBeUndefined(); await f.button('确认写入').trigger('click'); await flushPromises()
    const request = f.fetchMock.mock.calls.find(call => String(call[0]).includes('/proposals/'))!
    expect(JSON.parse(request[1].body)).toEqual({ decision: 'confirm', grants: {} }); expect(f.wrapper.text()).toContain('已写入'); f.wrapper.unmount()
  })
  it('escapes provider text instead of running returned HTML', async () => { const f = fixture(); f.fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => url.endsWith('/bootstrap') ? bootstrap : { conversationId: 'c', answer: '<img src=x onerror="alert(1)">', proposals: [] } })); await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click'); await flushPromises(); await f.wrapper.get('textarea').setValue('你好'); await f.button('发送').trigger('click'); await flushPromises(); expect(f.wrapper.text()).toContain('<img src=x'); expect(f.wrapper.find('img[src="x"]').exists()).toBe(false); expect(f.wrapper.find('[onerror]').exists()).toBe(false); f.wrapper.unmount() })
  it('clears local messages and proposals when the authenticated actor changes', async () => { const f = fixture(); await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click'); await flushPromises(); await f.wrapper.get('textarea').setValue('查询'); await f.button('发送').trigger('click'); await flushPromises(); await f.wrapper.setProps({ actorId: 'different-actor' }); expect(f.wrapper.find('[role="dialog"]').exists()).toBe(false); await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click'); await flushPromises(); expect(f.wrapper.text()).not.toContain('草稿已生成'); expect(f.wrapper.text()).not.toContain('甲（a）'); f.wrapper.unmount() })
})

function mockFloatingGeometry() {
  vi.stubGlobal('innerWidth', 1200); vi.stubGlobal('innerHeight', 900)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const expanded = !!this.querySelector('.ys-ai-panel')
    const width = expanded ? 460 : 84, height = expanded ? 740 : 116
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} }
  })
}
function pointer(target: Element, type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true }, pointerType: { value: 'touch' } })
  target.dispatchEvent(event)
}
describe('floating AI mascot interactions', () => {
  beforeEach(mockFloatingGeometry)
  it('uses the approved mascot and the exact AI助手 name', async () => {
    const f = fixture(); await flushPromises()
    expect(f.wrapper.get('.ys-ai-launcher').text()).toBe('AI助手')
    expect(f.wrapper.get('.ys-ai-mascot').attributes('src')).toContain('ai-assistant-mascot.png')
    expect(f.wrapper.get('.ys-ai-mascot').attributes('draggable')).toBe('false')
    await f.wrapper.get('.ys-ai-launcher').trigger('click'); await flushPromises()
    expect(f.wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('AI助手')
    expect(f.wrapper.text()).not.toContain('仰韶助手'); f.wrapper.unmount()
  })
  it('drags with a touch pointer, snaps left, persists, and suppresses the release click', async () => {
    const f = fixture(); await flushPromises()
    const handle = f.wrapper.get('.ys-ai-launcher')
    pointer(handle.element, 'pointerdown', 1150, 800)
    pointer(handle.element, 'pointermove', 260, 380)
    pointer(handle.element, 'pointerup', 260, 380)
    handle.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await flushPromises()
    expect(f.wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(f.fetchMock).not.toHaveBeenCalled()
    expect(f.wrapper.get('.ys-ai').attributes('data-dock')).toBe('left')
    expect(f.wrapper.get('.ys-ai').attributes('style')).toContain('left: 12px')
    const saved = JSON.parse(window.localStorage.getItem('ys-ai-dock:frontend:actor')!)
    expect(saved.side).toBe('left'); expect(saved.verticalRatio).toBeGreaterThan(0)
    f.wrapper.unmount()
    const reloaded = fixture(); await flushPromises()
    expect(reloaded.wrapper.get('.ys-ai').attributes('data-dock')).toBe('left')
    // Keyboard activation is unaffected by drag click suppression.
    await reloaded.wrapper.get('.ys-ai-launcher').trigger('click'); await flushPromises()
    expect(reloaded.wrapper.find('[role="dialog"]').exists()).toBe(true); reloaded.wrapper.unmount()
  })
  it('does not treat slight movement as a drag and restores cancelled drags', async () => {
    const f = fixture(); await flushPromises()
    const handle = f.wrapper.get('.ys-ai-launcher')
    pointer(handle.element, 'pointerdown', 1150, 800)
    pointer(handle.element, 'pointermove', 300, 20)
    pointer(handle.element, 'pointercancel', 300, 20)
    await flushPromises()
    expect(f.wrapper.get('.ys-ai').attributes('data-dock')).toBe('right')
    expect(window.localStorage.getItem('ys-ai-dock:frontend:actor')).toBeNull()
    pointer(handle.element, 'pointerdown', 1150, 800)
    pointer(handle.element, 'pointermove', 1152, 801)
    pointer(handle.element, 'pointerup', 1152, 801)
    handle.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await flushPromises()
    expect(f.wrapper.find('[role="dialog"]').exists()).toBe(true); f.wrapper.unmount()
  })
  it('allows keyboard docking, keeps the dialog visible, and preserves launcher position on close', async () => {
    const f = fixture(); await flushPromises()
    const handle = f.wrapper.get('.ys-ai-launcher')
    await handle.trigger('keydown', { key: 'ArrowLeft' })
    await handle.trigger('keydown', { key: 'ArrowUp' })
    const launcherStyle = f.wrapper.get('.ys-ai').attributes('style')
    await handle.trigger('click'); await flushPromises()
    expect(f.wrapper.get('.ys-ai').attributes('style')).toContain('left: 12px')
    expect(f.wrapper.get('.ys-ai').attributes('style')).toContain('top: 136px')
    await f.wrapper.get('[aria-label="关闭 AI 对话框"]').trigger('click'); await flushPromises()
    expect(f.wrapper.get('.ys-ai').attributes('style')).toBe(launcherStyle)
    f.wrapper.unmount()
  })
  it('drags the dialog only by its header and leaves close controls usable', async () => {
    const f = fixture(); await flushPromises()
    await f.wrapper.get('.ys-ai-launcher').trigger('click'); await flushPromises()
    const header = f.wrapper.get('.ys-ai-header')
    pointer(header.element, 'pointerdown', 800, 160)
    pointer(header.element, 'pointermove', 150, 0)
    pointer(header.element, 'pointerup', 150, 0); await flushPromises()
    expect(f.wrapper.get('.ys-ai').attributes('data-dock')).toBe('left')
    expect(f.wrapper.get('.ys-ai').attributes('style')).toContain('top: 12px')
    const close = f.wrapper.get('[aria-label="关闭 AI 对话框"]')
    pointer(close.element, 'pointerdown', 450, 25)
    pointer(close.element, 'pointermove', 1150, 100)
    pointer(close.element, 'pointerup', 1150, 100)
    await close.trigger('click'); await flushPromises()
    expect(f.wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(f.wrapper.get('.ys-ai').attributes('data-dock')).toBe('left'); f.wrapper.unmount()
  })
  it('reclamps on window resize and isolates placement preferences by account', async () => {
    const f = fixture(); await flushPromises()
    await f.wrapper.get('.ys-ai-launcher').trigger('keydown', { key: 'ArrowLeft' })
    vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 500)
    window.dispatchEvent(new Event('resize')); await flushPromises()
    expect(f.wrapper.get('.ys-ai').attributes('style')).toContain('top: 360px')
    await f.wrapper.setProps({ actorId: 'other' }); await flushPromises()
    expect(f.wrapper.get('.ys-ai').attributes('data-dock')).toBe('right')
    expect(f.wrapper.get('.ys-ai').attributes('style')).toContain('left: 294px')
    f.wrapper.unmount()
  })
})
