// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElUpload } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlacklistUploadForm from './BlacklistUploadForm.vue'

const mocks = vi.hoisted(() => ({ uploadImages: vi.fn() }))
vi.mock('@/api/upload', () => ({ uploadImages: mocks.uploadImages }))

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
    const upload = wrapper.findComponent(ElUpload)
    await (upload.props('onChange') as Function)({ name: file.name, raw: file }, [{ name: file.name, raw: file }])

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
  })
})
