import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlacklistImagePreview from './BlacklistImagePreview.vue'
import { createOwnedImagePreview, revokeOwnedImagePreview } from '@/utils/blacklistImages'

describe('BlacklistImagePreview', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValue('blob:owned-preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })
  it('does not trust arbitrary blob URLs supplied by stored records', () => {
    const ElImageStub = defineComponent({
      props: { src: String },
      template: '<img :src="src" />'
    })
    const wrapper = mount(BlacklistImagePreview, {
      props: {
        images: [
          'https://example.com/evidence.png',
          '/api/uploads/evidence.jpg',
          'blob:unowned-preview',
          'data:image/png;base64,AA==',
          'javascript:alert(1)',
          'data:image/svg+xml,<svg onload=alert(1) />'
        ]
      },
      global: { stubs: { ElImage: ElImageStub } }
    })

    expect(wrapper.findAll('img').map((image) => image.attributes('src'))).toEqual([
      'https://example.com/evidence.png',
      '/api/uploads/evidence.jpg',
      'data:image/png;base64,AA=='
    ])
  })

  it('renders a locally created owned blob preview only until it is revoked', async () => {
    const owned = createOwnedImagePreview(new File(['png'], 'preview.png', { type: 'image/png' }))
    const wrapper = mount(BlacklistImagePreview, {
      props: { images: [owned] },
      global: { stubs: { ElImage: { props: ['src'], template: '<img :src="src" />' } } }
    })
    expect(wrapper.find('img').attributes('src')).toBe('blob:owned-preview')

    revokeOwnedImagePreview(owned)
    await wrapper.setProps({ images: [owned, ''] })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
