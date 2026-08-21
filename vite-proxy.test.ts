// @vitest-environment node
import { describe, expect, it } from 'vitest'
import config from './vite.config'

describe('customer frontend development server', () => {
  it('proxies real API requests to the local Nest server when mocks are disabled', () => {
    expect(typeof config).toBe('object')
    const resolved = config as Exclude<typeof config, Function>
    expect(resolved.server?.proxy?.['/api']).toMatchObject({
      target: 'http://127.0.0.1:3000',
      changeOrigin: true
    })
    expect(resolved.server?.proxy?.['/uploads']).toMatchObject({
      target: 'http://127.0.0.1:3000',
      changeOrigin: true
    })
  })
})
