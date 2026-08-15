// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LabReportPage from './LabReportPage.vue'
import { defaultLabReportSmsTemplate } from '@/utils/labReport'

const mocks = vi.hoisted(() => ({
  route: undefined as unknown as { path: string },
  mobile: undefined as unknown as ReturnType<typeof ref<boolean>>,
  routerPush: vi.fn(),
  saveReport: vi.fn(),
  saveSms: vi.fn(),
  confirm: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageWarning: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.routerPush })
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.mobile })
}))

vi.mock('@/utils/labReport', async () => {
  const actual = await vi.importActual<typeof import('@/utils/labReport')>('@/utils/labReport')
  return {
    ...actual,
    loadLabReportTemplate: () => structuredClone(actual.defaultLabReportTemplate),
    loadLabReportSmsTemplate: () => structuredClone(actual.defaultLabReportSmsTemplate),
    saveLabReportTemplate: mocks.saveReport,
    saveLabReportSmsTemplate: mocks.saveSms
  }
})

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessageBox: { confirm: mocks.confirm },
  ElMessage: {
    success: mocks.messageSuccess,
    error: mocks.messageError,
    warning: mocks.messageWarning,
    info: vi.fn()
  }
}))

const ElButtonStub = defineComponent({
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () => h('button', { ...attrs, type: 'button', onClick: () => emit('click') }, slots.default?.())
  }
})

const ElInputStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: [String, Number], default: '' },
    type: { type: String, default: 'text' }
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h(props.type === 'textarea' ? 'textarea' : 'input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)
    })
  }
})

function mountPage(path: string, mobile: boolean) {
  mocks.route = reactive({ path })
  mocks.mobile = ref(mobile)
  return mount(LabReportPage, {
    global: {
      stubs: {
        ElAlert: defineComponent({ props: ['title'], template: '<div role="alert">{{ title }}<slot /></div>' }),
        ElButton: ElButtonStub,
        ElInput: ElInputStub,
        ElTag: { template: '<span><slot /></span>' }
      }
    }
  })
}

async function setInput(wrapper: ReturnType<typeof mountPage>, testId: string, value: string) {
  const input = wrapper.get(`[data-testid="${testId}"]`)
  await input.setValue(value)
  await flushPromises()
}

describe('mobile lab report template routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveReport.mockReset()
    mocks.saveSms.mockReset()
    mocks.confirm.mockResolvedValue(undefined)
  })

  it('renders only the route-owned mobile image panel and keeps desktop tabs absent', () => {
    const wrapper = mountPage('/lab-report/image-template', true)

    expect(wrapper.find('[data-testid="mobile-report-template"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-sms-template"]').exists()).toBe(false)
    expect(wrapper.find('.report-section-tabs').exists()).toBe(false)
  })

  it('switches the exclusive mobile panel when the child route changes', async () => {
    const wrapper = mountPage('/lab-report/image-template', true)

    mocks.route.path = '/lab-report/sms-template'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="mobile-report-template"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-sms-template"]').exists()).toBe(true)
    expect(wrapper.find('.report-section-tabs').exists()).toBe(false)
  })

  it('preserves the desktop tabs and desktop image panel', () => {
    const wrapper = mountPage('/lab-report/image-template', false)

    expect(wrapper.find('.report-section-tabs').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'LabReportTemplatePanel' }).exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-report-template"]').exists()).toBe(false)
  })

  it('groups mobile image settings in three initially collapsed sections with a bounded preview', () => {
    const wrapper = mountPage('/lab-report/image-template', true)
    const groups = wrapper.findAll('[data-testid="mobile-report-template"] details')

    expect(groups.map((group) => group.get('summary').text())).toEqual(['固定文本', '元素顺序', '显示选项'])
    expect(groups.every((group) => group.attributes('open') === undefined)).toBe(true)
    expect(wrapper.get('[data-testid="mobile-report-preview"]').attributes('aria-label')).toBe('化验报告模板预览')
    expect(getComputedStyle(wrapper.get('[data-testid="mobile-report-preview"]').element).maxWidth).toBe('100%')
  })

  it('previews the inspector and reviewer under their own report labels', () => {
    const wrapper = mountPage('/lab-report/image-template', true)
    const previewRows = wrapper.get('[data-testid="mobile-report-preview"]').findAll('dl > div')
      .map((row) => [row.get('dt').text(), row.get('dd').text()])

    expect(previewRows).toContainEqual(['检验员', '检验员'])
    expect(previewRows).toContainEqual(['审核/签名', '张文'])
  })

  it('keeps the edited report model and offers retry when local saving fails', async () => {
    mocks.saveReport.mockImplementation(() => { throw new Error('quota exceeded') })
    const wrapper = mountPage('/lab-report/image-template', true)

    await setInput(wrapper, 'mobile-report-title', '未丢失的报告标题')

    expect((wrapper.get('[data-testid="mobile-report-title"]').element as HTMLInputElement).value).toBe('未丢失的报告标题')
    expect(wrapper.get('[data-testid="template-save-error"]').text()).toContain('自动保存失败')
    expect(wrapper.get('[data-testid="retry-template-save"]').text()).toContain('重试')

    mocks.saveReport.mockImplementation(() => undefined)
    await wrapper.get('[data-testid="retry-template-save"]').trigger('click')
    expect(mocks.saveReport).toHaveBeenLastCalledWith(expect.objectContaining({ title: '未丢失的报告标题' }))
    expect(wrapper.find('[data-testid="template-save-error"]').exists()).toBe(false)
  })
})

describe('mobile SMS template', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveReport.mockReset()
    mocks.saveSms.mockReset()
    mocks.confirm.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'execCommand')
  })

  it('uses the existing SMS normalization semantics for its live preview', async () => {
    const wrapper = mountPage('/lab-report/sms-template', true)

    await setInput(wrapper, 'mobile-sms-prefix', '  您好：  ')
    await setInput(wrapper, 'mobile-sms-suffix', '  谢谢  ')

    expect(wrapper.get('[data-testid="mobile-sms-preview"]').text()).toBe('您好：\n谢谢')
  })

  it('falls back to a temporary selection when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    const wrapper = mountPage('/lab-report/sms-template', true)
    await setInput(wrapper, 'mobile-sms-prefix', '您好')

    await wrapper.get('[data-testid="copy-mobile-sms-preview"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('您好')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(mocks.messageSuccess).toHaveBeenCalledWith('短信模板内容已复制')
  })

  it('restores the exact existing SMS defaults only after confirmation', async () => {
    const wrapper = mountPage('/lab-report/sms-template', true)
    await setInput(wrapper, 'mobile-sms-prefix', '自定义前缀')
    await setInput(wrapper, 'mobile-sms-suffix', '自定义后缀')

    await wrapper.get('[data-testid="restore-mobile-sms-defaults"]').trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect((wrapper.get('[data-testid="mobile-sms-prefix"]').element as HTMLTextAreaElement).value).toBe(defaultLabReportSmsTemplate.prefix)
    expect((wrapper.get('[data-testid="mobile-sms-suffix"]').element as HTMLTextAreaElement).value).toBe(defaultLabReportSmsTemplate.suffix)
    expect(mocks.saveSms).toHaveBeenLastCalledWith(defaultLabReportSmsTemplate)
  })

  it('retains SMS inputs and exposes retry after a save failure', async () => {
    mocks.saveSms.mockImplementation(() => { throw new Error('storage unavailable') })
    const wrapper = mountPage('/lab-report/sms-template', true)

    await setInput(wrapper, 'mobile-sms-prefix', '保留此前缀')

    expect((wrapper.get('[data-testid="mobile-sms-prefix"]').element as HTMLTextAreaElement).value).toBe('保留此前缀')
    expect(wrapper.get('[data-testid="template-save-error"]').text()).toContain('自动保存失败')

    mocks.saveSms.mockImplementation(() => undefined)
    await wrapper.get('[data-testid="retry-template-save"]').trigger('click')
    expect(mocks.saveSms).toHaveBeenLastCalledWith(expect.objectContaining({ prefix: '保留此前缀' }))
  })

  it('keeps image and SMS save failures independent and retries each latest live model', async () => {
    mocks.saveReport.mockImplementation(() => { throw new Error('image storage unavailable') })
    mocks.saveSms.mockImplementation(() => { throw new Error('sms storage unavailable') })
    const wrapper = mountPage('/lab-report/image-template', true)

    await setInput(wrapper, 'mobile-report-title', '图片失败时的旧标题')
    expect(wrapper.find('[data-testid="template-save-error"]').exists()).toBe(true)

    mocks.route.path = '/lab-report/sms-template'
    await wrapper.vm.$nextTick()
    await setInput(wrapper, 'mobile-sms-prefix', '短信失败时的前缀')
    expect(wrapper.find('[data-testid="template-save-error"]').exists()).toBe(true)

    mocks.saveSms.mockImplementation(() => undefined)
    await wrapper.get('[data-testid="retry-template-save"]').trigger('click')
    expect(mocks.saveSms).toHaveBeenLastCalledWith(expect.objectContaining({ prefix: '短信失败时的前缀' }))
    expect(wrapper.find('[data-testid="template-save-error"]').exists()).toBe(false)

    mocks.route.path = '/lab-report/image-template'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="template-save-error"]').exists()).toBe(true)

    await setInput(wrapper, 'mobile-report-title', '图片失败后继续编辑的新标题')
    mocks.saveReport.mockImplementation(() => undefined)
    await wrapper.get('[data-testid="retry-template-save"]').trigger('click')

    expect(mocks.saveReport).toHaveBeenLastCalledWith(expect.objectContaining({ title: '图片失败后继续编辑的新标题' }))
    expect(wrapper.find('[data-testid="template-save-error"]').exists()).toBe(false)

    mocks.route.path = '/lab-report/sms-template'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="template-save-error"]').exists()).toBe(false)
  })
})
