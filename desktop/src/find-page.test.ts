import { describe, expect, it } from 'vitest'

import { createFindPageDataUrl, renderFindPage } from './find-page'

describe('trusted local find page', () => {
  it('renders only fixed local controls under a deny-by-default CSP', () => {
    const html = renderFindPage()

    expect(html).toContain("default-src 'none'")
    expect(html).toContain("script-src 'none'")
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("form-action 'none'")
    expect(html).toContain("base-uri 'none'")
    expect(html).toContain('id="query"')
    expect(html).toContain('id="result"')
    expect(html).toContain('id="previous"')
    expect(html).toContain('id="next"')
    expect(html).toContain('id="close"')
    expect(html).not.toMatch(/<script\b/i)
    expect(html).not.toMatch(/https?:\/\//i)
  })

  it('encodes the fixed page as a data URL without adding executable content', () => {
    const dataUrl = createFindPageDataUrl()
    const html = decodeURIComponent(dataUrl.split(',', 2)[1] ?? '')

    expect(dataUrl).toMatch(/^data:text\/html;charset=UTF-8,/)
    expect(html).toBe(renderFindPage())
    expect(html).not.toMatch(/<script\b/i)
  })
})
