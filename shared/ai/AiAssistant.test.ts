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
function fixture(audience:'frontend'|'admin'='frontend') {
  const fetchMock = vi.fn().mockImplementation(async (url: string,options:any) => ({ ok: true, json: async () => url.endsWith('/bootstrap') ? bootstrap : url.endsWith('/chat') ? { conversationId: 'c', answer: '草稿已生成', proposals: [structuredClone(proposal)] } : url.endsWith('/conversations/list')?{items:[{id:'c',title:'之前的聊天',available:true,modelId:'m',createdAt:'2026-10-11T01:00:00Z',updatedAt:'2026-10-11T02:00:00Z'}],hasMore:false}:url.endsWith('/c/read')?{id:'c',modelId:'m',entryContext:null,messages:[{id:'one',role:'user',content:'之前输入的内容'},{id:'two',role:'assistant',content:'之前的回答'}],proposals:[],hasMore:false,contextNotice:'续聊使用最近24条历史消息'}:options?.method==='DELETE'?{deleted:true}:{ status: 'APPLIED' } }))
  vi.stubGlobal('fetch', fetchMock)
  const wrapper = mount(AiAssistant, { props: { audience, actorId: 'actor' }, global: { plugins: [ElementPlus], stubs: { Bubble: { template: '<div><slot name="content" /></div>' } } } })
  const button = (text: string) => wrapper.findAll('button').find(b => b.text() === text)!
  return { wrapper, fetchMock, button }
}
afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('floating AI review UI', () => {
  it('allows local-only photo preview in demo mode and never uploads or sends it',async()=>{const f=fixture();class PreviewURL extends URL{static createObjectURL=vi.fn(()=> 'blob:local-preview');static revokeObjectURL=vi.fn()}vi.stubGlobal('URL',PreviewURL);await f.wrapper.setProps({mockMode:true});await f.wrapper.get('.ys-ai-launcher').trigger('click');await flushPromises();expect(f.button('添加照片').attributes('disabled')).toBeUndefined();const input=f.wrapper.get('input[type="file"]');Object.defineProperty(input.element,'files',{value:[new File(['synthetic-image'],'preview.png',{type:'image/png'})],configurable:true});await input.trigger('change');await flushPromises();expect(f.wrapper.get('.ys-ai-photos img').attributes('src')).toBe('blob:local-preview');expect(f.wrapper.text()).toContain('不上传、不识别、不写入');expect(f.button('发送').attributes('disabled')).toBeDefined();await f.button('发送').trigger('click');expect(f.fetchMock).not.toHaveBeenCalled();f.wrapper.unmount()})
  it('keeps the demo-mode notice visible after confirming an entry location',async()=>{const f=fixture();await f.wrapper.setProps({mockMode:true});await f.wrapper.get('.ys-ai-launcher').trigger('click');await flushPromises();await f.button('快捷录入').trigger('click');await flushPromises();const selects=f.wrapper.findAll('select');await selects[0].setValue('药品库存');await f.wrapper.get('[aria-label="二级菜单"]').setValue('药品出库');await f.button('确认录入位置').trigger('click');await flushPromises();expect(f.wrapper.text()).toContain('不上传、不识别、不写入');expect(f.button('添加照片').attributes('disabled')).toBeUndefined();expect(f.fetchMock).not.toHaveBeenCalled();f.wrapper.unmount()})
  it('explains a disabled photo button when the real model lacks vision',async()=>{const f=fixture();f.fetchMock.mockImplementation(async()=>({ok:true,json:async()=>({...bootstrap,models:[{id:'m',name:'文字模型',vision:false,tools:true}]})}));await f.wrapper.get('.ys-ai-launcher').trigger('click');await flushPromises();expect(f.button('添加照片').attributes('disabled')).toBeDefined();expect(f.wrapper.text()).toContain('当前模型未启用图片能力');f.wrapper.unmount()})
  it.each(['frontend', 'admin'] as const)('formats model replies in the %s assistant while keeping user input literal', async audience => {
    const f = fixture(audience)
    f.fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => url.endsWith('/bootstrap')
      ? { ...bootstrap, owners: [{ id: 'owner', account: 'A', username: '授权账号' }] }
      : { conversationId: 'formatted', answer: '## 📋 查询类\n\n- **样品信息**：检测结果\n\n## ⚠️ 使用须知\n\n1. 确认后写入', proposals: [] } }))
    await f.wrapper.get('.ys-ai-launcher').trigger('click'); await flushPromises()
    if (audience === 'admin') {
      f.wrapper.findAllComponents({ name: 'ElSelect' })[1].vm.$emit('update:modelValue', ['owner'])
      await flushPromises()
    }
    await f.wrapper.get('textarea').setValue('**请介绍功能**')
    await f.button('发送').trigger('click'); await flushPromises()
    expect(f.wrapper.get('.ys-ai-message--plain').text()).toBe('**请介绍功能**')
    expect(f.wrapper.findAll('.ys-ai-markdown h2').map(heading => heading.text())).toEqual(['📋 查询类', '⚠️ 使用须知'])
    expect(f.wrapper.get('.ys-ai-markdown strong').text()).toBe('样品信息')
    expect(f.wrapper.get('.ys-ai-markdown ol li').text()).toBe('确认后写入')
    expect(f.wrapper.find('.ys-ai-proposal').exists()).toBe(false)
    f.wrapper.unmount()
  })
  it('selects multiple authorized admin accounts and clears history when the selection changes',async()=>{
    const f=fixture('admin'),owners=[{id:'owner-a',account:'A',username:'授权甲'},{id:'owner-b',account:'B',username:'授权乙'}]
    f.fetchMock.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('/bootstrap')?{...bootstrap,owners}:url.endsWith('/chat')?{conversationId:'multi',answer:'多账号查询结果',proposals:[]}: {status:'APPLIED'}}))
    await f.wrapper.get('.ys-ai-launcher').trigger('click');await flushPromises()
    const select=f.wrapper.findAllComponents({name:'ElSelect'})[1]
    expect(select.props('multiple')).toBe(true);expect(select.props('multipleLimit')).toBe(20)
    select.vm.$emit('update:modelValue',['owner-a','owner-b']);select.vm.$emit('change',['owner-a','owner-b']);await flushPromises()
    expect(f.wrapper.text()).toContain('已选择 2 个授权账号');expect(f.wrapper.text()).toContain('多账号只读')
    await f.wrapper.get('textarea').setValue('同时查询两个账号');await f.button('发送').trigger('click');await flushPromises()
    const request=JSON.parse(f.fetchMock.mock.calls.find(c=>String(c[0]).endsWith('/chat'))![1].body)
    expect(request.ownerIds).toEqual(['owner-a','owner-b']);expect(request).not.toHaveProperty('ownerId')
    expect(f.wrapper.text()).toContain('多账号查询结果')
    select.vm.$emit('update:modelValue',['owner-a']);select.vm.$emit('change',['owner-a']);await flushPromises()
    expect(f.wrapper.text()).not.toContain('多账号查询结果')
    await f.wrapper.get('textarea').setValue('查询甲');await f.button('发送').trigger('click');await flushPromises()
    const last=JSON.parse(f.fetchMock.mock.calls.filter(c=>String(c[0]).endsWith('/chat')).at(-1)![1].body)
    expect(last.ownerIds).toEqual(['owner-a']);expect(last).not.toHaveProperty('conversationId')
    f.wrapper.unmount()
  })
  it('does not allow a fabricated proposal to be confirmed while multiple accounts are selected',async()=>{
    const f=fixture('admin')
    f.fetchMock.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('/bootstrap')?{...bootstrap,owners:[{id:'a',account:'A',username:'甲'},{id:'b',account:'B',username:'乙'}]}:{conversationId:'multi',answer:'请核对',proposals:[structuredClone(proposal)]}}))
    await f.wrapper.get('.ys-ai-launcher').trigger('click');await flushPromises()
    const select=f.wrapper.findAllComponents({name:'ElSelect'})[1]
    select.vm.$emit('update:modelValue',['a','b']);select.vm.$emit('change',['a','b']);await flushPromises()
    await f.wrapper.get('textarea').setValue('查询');await f.button('发送').trigger('click');await flushPromises()
    expect(f.button('确认写入').attributes('disabled')).toBeDefined()
    expect(f.wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    await f.button('确认写入').trigger('click');await flushPromises()
    expect(f.fetchMock.mock.calls.some(c=>String(c[0]).includes('/proposals/'))).toBe(false)
    f.wrapper.unmount()
  })
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
  it('keeps old server conversations available after starting a new chat and resumes the same id',async()=>{const f=fixture();await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click');await flushPromises();await f.wrapper.get('textarea').setValue('第一条问题');await f.button('发送').trigger('click');await flushPromises();await f.button('新对话').trigger('click');expect(f.wrapper.text()).not.toContain('草稿已生成');expect(f.fetchMock.mock.calls.some(call=>String(call[0]).endsWith('/conversations/list'))).toBe(false);await f.button('历史会话').trigger('click');await flushPromises();expect(f.wrapper.text()).toContain('之前的聊天');await f.button('查看并继续聊天').trigger('click');await flushPromises();expect(f.wrapper.text()).toContain('之前输入的内容');expect(f.wrapper.text()).toContain('之前的回答');await f.wrapper.get('textarea').setValue('接着之前继续');await f.button('发送').trigger('click');await flushPromises();const call=f.fetchMock.mock.calls.filter(call=>String(call[0]).endsWith('/chat')).at(-1)!;expect(JSON.parse(call[1].body)).toMatchObject({conversationId:'c',text:'接着之前继续'});expect(JSON.parse(call[1].body)).not.toHaveProperty('messages');f.wrapper.unmount()})
  it('ignores a late resumed history response after the signed-in actor changes',async()=>{const f=fixture();await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click');await flushPromises();await f.button('历史会话').trigger('click');await flushPromises();let resolve!:(value:any)=>void;f.fetchMock.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));await f.button('查看并继续聊天').trigger('click');await flushPromises();await f.wrapper.setProps({actorId:'other'});resolve({ok:true,json:async()=>({id:'c',modelId:'m',messages:[{id:'private',role:'assistant',content:'旧账号的会话'}],proposals:[],hasMore:false})});await flushPromises();await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click');await flushPromises();expect(f.wrapper.text()).not.toContain('旧账号的会话');f.wrapper.unmount()})
  it('clears the active conversation after its explicit history deletion without confirming business writes',async()=>{const f=fixture();await f.wrapper.get('[aria-label="打开 AI 助手"]').trigger('click');await flushPromises();await f.wrapper.get('textarea').setValue('查询');await f.button('发送').trigger('click');await flushPromises();await f.button('历史会话').trigger('click');await flushPromises();await f.button('删除').trigger('click');expect(f.fetchMock.mock.calls.some(call=>call[1]?.method==='DELETE')).toBe(false);await f.button('确认删除会话').trigger('click');await flushPromises();await f.button('返回当前会话').trigger('click');expect(f.wrapper.text()).not.toContain('甲（a）');expect(f.wrapper.text()).not.toContain('草稿已生成');expect(f.fetchMock.mock.calls.some(call=>String(call[0]).includes('/decision'))).toBe(false);f.wrapper.unmount()})
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
