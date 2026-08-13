import { describe, expect, it } from 'vitest'

import { desktopTargets } from './config'
import {
  createLoadingPageDataUrl,
  loadingIconDataUrls,
  renderLoadingPage,
} from './loading-page'

describe('trusted desktop loading page', () => {
  it.each([
    ['startup', '正在连接服务器'],
    ['reload', '正在刷新'],
    ['recovery', '正在重新连接服务器'],
  ] as const)('renders the %s state without executable content', (mode, message) => {
    const html = renderLoadingPage(desktopTargets.internal, mode)

    expect(html).toContain('仰韶化验内部系统')
    expect(html).toContain(message)
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("style-src 'unsafe-inline'")
    expect(html).not.toContain('<script')
    expect(html).not.toContain('preload')
  })

  it('uses each approved local product icon without widening CSP', () => {
    const internal = renderLoadingPage(desktopTargets.internal, 'startup')
    const backend = renderLoadingPage(desktopTargets.backend, 'startup')

    expect(loadingIconDataUrls.internal).toMatch(/^data:image\/png;base64,/)
    expect(loadingIconDataUrls.backend).toMatch(/^data:image\/png;base64,/)
    expect(loadingIconDataUrls.internal).not.toBe(loadingIconDataUrls.backend)
    expect(internal).toContain(`src="${loadingIconDataUrls.internal}"`)
    expect(internal).not.toContain(loadingIconDataUrls.backend)
    expect(backend).toContain(`src="${loadingIconDataUrls.backend}"`)
    expect(backend).not.toContain(loadingIconDataUrls.internal)
    expect(internal).toContain("img-src data:")
    expect(backend).toContain("img-src data:")
  })

  it('escapes product identity and returns a self-contained local data URL', () => {
    const target = {
      ...desktopTargets.internal,
      productName: '<img src=x onerror=alert(1)>',
    }

    const html = renderLoadingPage(target, 'startup')
    const dataUrl = createLoadingPageDataUrl(target, 'startup')

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(dataUrl).toMatch(/^data:text\/html;charset=UTF-8,/)
    expect(decodeURIComponent(dataUrl.split(',')[1] ?? '')).toBe(html)
  })
})
