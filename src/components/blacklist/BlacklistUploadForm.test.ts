// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElUpload } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlacklistUploadForm from './BlacklistUploadForm.vue'

const mocks = vi.hoisted(() => ({ uploadImages: vi.fn() }))
vi.mock('@/api/upload', () => ({ uploadImages: mocks.uploadImages }))

async function selectRealUploadFile(wrapper: any, file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
}

describe('BlacklistUploadForm persistent images', () => {
  beforeEach(() => {
    mocks.uploadImages.mockReset().mockResolvedValue(['/uploads/persisted.png'])
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValue('blob:desktop-preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  it('awaits save, uploads raw raster files once across retry, and clears only after success', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const wrapper = mount(BlacklistUploadForm, { props: { save }, global: { plugins: [ElementPlus] } })
    await wrapper.find('input').setValue('13800000000')
    const file = new File(['png'], 'evidence.png', { type: 'image/png' })
    await selectRealUploadFile(wrapper, file)
    const button = wrapper.findAll('button').find((item) => item.text().includes('保存黑名单'))!
    await button.trigger('click')
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('13800000000')

    await button.trigger('click')
    await flushPromises()
    expect(mocks.uploadImages).toHaveBeenCalledTimes(1)
    expect(mocks.uploadImages).toHaveBeenCalledWith([file])
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ phone: '13800000000', images: ['/uploads/persisted.png'] }))
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:desktop-preview')
  })

  it('names the actual focusable picture-card trigger', () => {
    const wrapper = mount(BlacklistUploadForm, { props: { save: vi.fn() }, global: { plugins: [ElementPlus] } })
    expect(wrapper.get('.el-upload[role="button"]').text()).toContain('选择黑名单图片')
  })

  it('lets Element Plus revoke a real picture URL exactly once on removal and unmount', async () => {
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:desktop-remove').mockReturnValueOnce('blob:desktop-unmount')
    const wrapper = mount(BlacklistUploadForm, { props: { save: vi.fn() }, global: { plugins: [ElementPlus] } })
    const upload = wrapper.findComponent(ElUpload)
    const removeFile = new File(['png'], 'remove.png', { type: 'image/png' })
    await selectRealUploadFile(wrapper, removeFile)
    await (upload.vm.$.exposed as { handleRemove: (file: File) => Promise<void> }).handleRemove(removeFile)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:desktop-remove')

    const unmountFile = new File(['png'], 'unmount.png', { type: 'image/png' })
    await selectRealUploadFile(wrapper, unmountFile)
    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:desktop-unmount')
  })
})
