import { describe, expect, it } from 'vitest'

import { desktopTargets } from './config'
import {
  createOfflinePageDataUrl,
  renderOfflinePage,
  shouldShowOfflinePage,
} from './offline-page'

describe('desktop offline fallback', () => {
  it('renders an isolated offline page with a safe retry link', () => {
    const html = renderOfflinePage(desktopTargets.internal, 'timeout')

    expect(html).toContain('网络或服务器不可用')
    expect(html).toContain('连接服务器超时')
    expect(html).toContain('href="https://www.ysjc.art/"')
    expect(html).toContain('>重试</a>')
    expect(html).toContain('href="#exit"')
    expect(html).toContain('>退出</a>')
    expect(html).toContain(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'",
    )
    expect(html).not.toContain('nodeIntegration')
    expect(html).not.toContain('<script')
  })

  it.each([
    ['load', '无法加载服务器页面'],
    ['render-process-gone', '页面运行进程已意外退出'],
    ['unresponsive', '页面暂时无响应'],
  ] as const)('shows a safe summary for %s without technical details', (reason, summary) => {
    const html = renderOfflinePage(desktopTargets.internal, reason)

    expect(html).toContain(summary)
    expect(html).not.toContain('ERR_')
    expect(html).not.toContain('stack')
  })

  it('escapes product names and retry URLs before embedding them', () => {
    const html = renderOfflinePage({
      ...desktopTargets.internal,
      productName: '<img src=x onerror=alert(1)>',
      entryUrl: 'https://www.ysjc.art/?q=" onclick="alert(1)',
    })

    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('" onclick="alert(1)')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&quot; onclick=&quot;alert(1)')
  })

  it('encodes the fallback as a self-contained data URL', () => {
    const dataUrl = createOfflinePageDataUrl(desktopTargets.backend)

    expect(dataUrl).toMatch(/^data:text\/html;charset=UTF-8,/)
    expect(decodeURIComponent(dataUrl.split(',')[1] ?? '')).toContain(
      '仰韶化验后端系统',
    )
  })

  it('shows fallback only for real main-frame failures on the approved origin', () => {
    expect(
      shouldShowOfflinePage(
        true,
        -105,
        'https://www.ysjc.art/dashboard',
        desktopTargets.internal,
      ),
    ).toBe(true)
    expect(
      shouldShowOfflinePage(
        true,
        -3,
        'https://www.ysjc.art/dashboard',
        desktopTargets.internal,
      ),
    ).toBe(false)
    expect(
      shouldShowOfflinePage(
        false,
        -105,
        'https://www.ysjc.art/api/stream',
        desktopTargets.internal,
      ),
    ).toBe(false)
    expect(
      shouldShowOfflinePage(
        true,
        -105,
        'https://evil.example/',
        desktopTargets.internal,
      ),
    ).toBe(false)
  })
})
