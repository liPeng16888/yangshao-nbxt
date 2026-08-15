import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import BlacklistImagePreview from './BlacklistImagePreview.vue'

describe('BlacklistImagePreview', () => {
  it('renders only web, relative, owned blob, and raster data image URLs', () => {
    const ElImageStub = defineComponent({
      props: { src: String },
      template: '<img :src="src" />'
    })
    const wrapper = mount(BlacklistImagePreview, {
      props: {
        images: [
          'https://example.com/evidence.png',
          '/api/uploads/evidence.jpg',
          'blob:owned-preview',
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
      'blob:owned-preview',
      'data:image/png;base64,AA=='
    ])
  })
})
