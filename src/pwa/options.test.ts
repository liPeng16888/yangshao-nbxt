// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { pwaOptions } from './options'

describe('customer PWA configuration', () => {
  it('installs as a standalone Chinese iPhone application with explicit icons', () => {
    expect(pwaOptions.registerType).toBe('prompt')
    expect(pwaOptions.manifest).toMatchObject({
      name: '仰韶化验室',
      short_name: '仰韶化验',
      lang: 'zh-CN',
      display: 'standalone',
      start_url: '/data',
      scope: '/',
      theme_color: '#10233f',
      background_color: '#eef3f8'
    })
    expect(pwaOptions.manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/pwa-192x192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/pwa-512x512.png', sizes: '512x512' }),
      expect.objectContaining({ src: '/pwa-maskable-512x512.png', purpose: 'maskable' })
    ]))
  })

  it('precaches only the static shell and forces APIs, uploads, and realtime traffic to the network', () => {
    expect(pwaOptions.workbox.globPatterns).toEqual(['**/*.{js,css,html,png,svg,ico,woff2}'])
    expect(pwaOptions.workbox.maximumFileSizeToCacheInBytes).toBe(3 * 1024 * 1024)
    const rules = pwaOptions.workbox.runtimeCaching || []
    const networkOnlyRules = rules.filter((rule) => rule.handler === 'NetworkOnly')

    expect(matchesAny(networkOnlyRules, 'https://lab.example.com/api/auth/me')).toBe(true)
    expect(matchesAny(networkOnlyRules, 'https://lab.example.com/api/lab-sheets/current/events')).toBe(true)
    expect(matchesAny(networkOnlyRules, 'https://lab.example.com/uploads/report.png')).toBe(true)
    expect(matchesAny(networkOnlyRules, 'https://lab.example.com/assets/index.js')).toBe(false)
    expect(pwaOptions.workbox.navigateFallbackDenylist).toEqual(expect.arrayContaining([
      expect.any(RegExp),
      expect.any(RegExp)
    ]))
  })
})

function matchesAny(rules: Array<Record<string, any>>, href: string) {
  const url = new URL(href)
  return rules.some((rule) => {
    if (typeof rule.urlPattern === 'function') return rule.urlPattern({ url, request: {} as Request })
    if (rule.urlPattern instanceof RegExp) return rule.urlPattern.test(href)
    return false
  })
}
