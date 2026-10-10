import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginRegister from '../src/views/auth/LoginRegister.vue'
import AdminLogin from '../admin/src/views/LoginPage.vue'
import { useRememberedLogin } from './useRememberedLogin'

const mocks = vi.hoisted(() => ({
  login: vi.fn(), adminLogin: vi.fn(), navigate: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn()
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ loading: false, loginWithPassword: mocks.login }) }))
vi.mock('@/utils/request', () => ({ useMocks: true }))
vi.mock('../admin/src/api', () => ({ adminLogin: mocks.adminLogin, useAdminMocks: true }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.navigate, push: mocks.navigate }) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: { success: mocks.success, error: mocks.error, warning: mocks.warning } }
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => values.delete(key), setItem: (key, value) => { values.set(key, value) }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  mocks.login.mockResolvedValue({})
  mocks.adminLogin.mockResolvedValue({})
  mocks.navigate.mockResolvedValue(undefined)
})

const cases = [
  { name: '前端', component: LoginRegister, area: 'frontend' as const, login: mocks.login, key: 'ys_remembered_login_v1' },
  { name: '后台', component: AdminLogin, area: 'admin' as const, login: mocks.adminLogin, key: 'ys_admin_remembered_login_v1' }
]

function button(wrapper: VueWrapper, text: string) {
  const result = wrapper.findAll('button').find(item => item.text() === text)
  if (!result) throw new Error(`Missing button: ${text}`)
  return result
}

for (const scenario of cases) {
  describe(`${scenario.name}记住登录信息`, () => {
    const render = () => mount(scenario.component, { global: { plugins: [ElementPlus] } })
    const fill = async (wrapper: VueWrapper) => {
      const inputs = wrapper.findAll('.el-input input')
      await inputs[0].setValue('demo-account')
      await inputs[1].setValue('demo-password')
    }

    it('默认不保存；成功登录后恢复凭据，快捷登录仍调用认证接口', async () => {
      let wrapper = render()
      expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
      expect((wrapper.find('.el-input input').element as HTMLInputElement).value).toBe('')
      await fill(wrapper)
      await wrapper.find('input[type="checkbox"]').setValue(true)
      await button(wrapper, '登录').trigger('click')
      await flushPromises()
      expect(scenario.login).toHaveBeenCalledWith({ account: 'demo-account', password: 'demo-password' })
      expect(localStorage.getItem(scenario.key)).toContain('demo-account')
      wrapper.unmount()

      wrapper = render()
      expect((wrapper.find('.el-input input').element as HTMLInputElement).value).toBe('demo-account')
      expect((wrapper.findAll('.el-input input')[1].element as HTMLInputElement).value).toBe('demo-password')
      expect(wrapper.findAll('.el-input input')[1].attributes('type')).toBe('password')
      // Quick login must use the saved pair even if the user has edited the inputs.
      await wrapper.findAll('.el-input input')[1].setValue('unsaved-password')
      await button(wrapper, '快捷登录').trigger('click')
      await flushPromises()
      expect(scenario.login).toHaveBeenLastCalledWith({ account: 'demo-account', password: 'demo-password' })
      expect(scenario.login).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    })

    it('登录失败不保存或覆盖以前成功的凭据', async () => {
      const saved = useRememberedLogin(scenario.area)
      saved.rememberCredentials.value = true
      saved.saveAfterLogin({ account: 'old-account', password: 'old-password' })
      const original = localStorage.getItem(scenario.key)
      scenario.login.mockRejectedValueOnce(new Error('账号或密码错误'))
      const wrapper = render()
      await fill(wrapper)
      await button(wrapper, '登录').trigger('click')
      await flushPromises()
      expect(localStorage.getItem(scenario.key)).toBe(original)
      expect(mocks.navigate).not.toHaveBeenCalled()
      expect(mocks.error).toHaveBeenCalledWith('账号或密码错误')
      wrapper.unmount()
    })

    it('未勾选时不保存；取消勾选立即删除已记住信息', async () => {
      let wrapper = render()
      await fill(wrapper)
      await button(wrapper, '登录').trigger('click')
      await flushPromises()
      expect(localStorage.getItem(scenario.key)).toBeNull()
      wrapper.unmount()
      const saved = useRememberedLogin(scenario.area)
      saved.rememberCredentials.value = true
      saved.saveAfterLogin({ account: 'old-account', password: 'old-password' })
      wrapper = render()
      await wrapper.find('input[type="checkbox"]').setValue(false)
      expect(localStorage.getItem(scenario.key)).toBeNull()
      expect(wrapper.text()).not.toContain('快捷登录')
      wrapper.unmount()
    })

    it('清除按钮删除保存的凭据和表单中的密码', async () => {
      const saved = useRememberedLogin(scenario.area)
      saved.rememberCredentials.value = true
      saved.saveAfterLogin({ account: 'old-account', password: 'old-password' })
      const wrapper = render()
      await button(wrapper, '清除已记住信息').trigger('click')
      expect(localStorage.getItem(scenario.key)).toBeNull()
      expect((wrapper.findAll('.el-input input')[1].element as HTMLInputElement).value).toBe('')
      expect(wrapper.text()).not.toContain('快捷登录')
      wrapper.unmount()
    })

    it('浏览器拒绝保存时仍可完成正常登录', async () => {
      const wrapper = render()
      await fill(wrapper)
      await wrapper.find('input[type="checkbox"]').setValue(true)
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
      await button(wrapper, '登录').trigger('click')
      await flushPromises()
      expect(mocks.navigate).toHaveBeenCalledWith('/data')
      expect(mocks.warning).toHaveBeenCalled()
      wrapper.unmount()
    })
  })
}

it('前端和后台分别保存；损坏的记录不会阻止手动登录', () => {
  const frontend = useRememberedLogin('frontend')
  frontend.rememberCredentials.value = true
  frontend.saveAfterLogin({ account: 'front-user', password: 'front-password' })
  expect(useRememberedLogin('admin').savedCredentials.value).toBeNull()
  const admin = useRememberedLogin('admin')
  admin.rememberCredentials.value = true
  admin.saveAfterLogin({ account: 'admin-user', password: 'admin-password' })
  admin.forgetCredentials()
  expect(useRememberedLogin('frontend').savedCredentials.value?.account).toBe('front-user')
  for (const raw of ['{broken', 'null', '{"version":1,"account":false,"password":"pw"}', '{"version":1,"account":"user","password":""}']) {
    localStorage.setItem('ys_admin_remembered_login_v1', raw)
    expect(useRememberedLogin('admin').savedCredentials.value).toBeNull()
  }
})
