import { describe, expect, it } from 'vitest'

import { desktopTargets } from './config'
import {
  buildMainDocumentCsp,
  classifyNavigation,
  isAllowedBlobUrl,
  isAllowedNavigation,
  shouldAcceptCertificateError,
  shouldGrantPermission,
  withMainDocumentCsp,
} from './security-policy'

describe('desktop navigation security policy', () => {
  const target = desktopTargets.internal

  it('allows only exact HTTPS target-origin navigation', () => {
    expect(isAllowedNavigation('https://www.ysjc.art/', target)).toBe(true)
    expect(isAllowedNavigation('https://www.ysjc.art/dashboard?a=1#top', target)).toBe(
      true,
    )
    expect(isAllowedNavigation('https://www.ysjc.art:443/dashboard', target)).toBe(
      true,
    )

    expect(isAllowedNavigation('http://www.ysjc.art/', target)).toBe(false)
    expect(isAllowedNavigation('https://www.ysjc.art:444/', target)).toBe(false)
    expect(isAllowedNavigation('https://www.ysjc.art.evil.com/', target)).toBe(false)
    expect(isAllowedNavigation('https://www.ysjc.art@evil.com/', target)).toBe(false)
    expect(isAllowedNavigation('https://ysjc.art/', target)).toBe(false)
    expect(isAllowedNavigation('not a url', target)).toBe(false)
  })

  it('sends ordinary external HTTPS links to confirmation but blocks deceptive or unsafe URLs', () => {
    expect(classifyNavigation('https://www.electronjs.org/docs/latest/', target)).toBe(
      'external-https',
    )
    expect(classifyNavigation('https://www.ysjc.art/dashboard', target)).toBe('allow')

    expect(classifyNavigation('http://example.com', target)).toBe('block')
    expect(classifyNavigation('mailto:someone@example.com', target)).toBe('block')
    expect(classifyNavigation('file:///etc/passwd', target)).toBe('block')
    expect(classifyNavigation('javascript:alert(1)', target)).toBe('block')
    expect(classifyNavigation('https://www.ysjc.art.evil.com', target)).toBe('block')
    expect(classifyNavigation('https://www.ysjc.art@evil.com', target)).toBe('block')
    expect(classifyNavigation('https://www.ysjc.art:444', target)).toBe('block')
  })

  it('allows blob downloads only when their embedded origin is the target origin', () => {
    expect(isAllowedBlobUrl('blob:https://www.ysjc.art/5c2b', target)).toBe(true)
    expect(isAllowedBlobUrl('blob:https://www.ysjc.art:443/5c2b', target)).toBe(true)
    expect(isAllowedBlobUrl('blob:https://evil.example/5c2b', target)).toBe(false)
    expect(isAllowedBlobUrl('data:text/plain,secret', target)).toBe(false)
    expect(isAllowedBlobUrl('blob:null/5c2b', target)).toBe(false)
  })
})

describe('desktop permission, certificate and CSP policy', () => {
  it('allows sanitized clipboard writes only from the approved main frame', () => {
    expect(
      shouldGrantPermission(
        'clipboard-sanitized-write',
        {
          requestingUrl: 'https://www.ysjc.art/dashboard/lab-report',
          isMainFrame: true,
        },
        desktopTargets.internal,
      ),
    ).toBe(true)

    expect(
      shouldGrantPermission(
        'clipboard-sanitized-write',
        {
          requestingUrl: 'https://www.ysjc.art.evil.com/dashboard/lab-report',
          isMainFrame: true,
        },
        desktopTargets.internal,
      ),
    ).toBe(false)
    expect(
      shouldGrantPermission(
        'clipboard-sanitized-write',
        {
          requestingUrl: 'https://www.ysjc.art/dashboard/lab-report',
          isMainFrame: false,
        },
        desktopTargets.internal,
      ),
    ).toBe(false)
  })

  it.each([
    'camera',
    'microphone',
    'geolocation',
    'notifications',
    'midi',
    'clipboard-read',
    'unknown-future-permission',
  ])('rejects renderer permission %s by default', (permission) => {
    expect(
      shouldGrantPermission(
        permission,
        { requestingUrl: 'https://www.ysjc.art/', isMainFrame: true },
        desktopTargets.internal,
      ),
    ).toBe(false)
  })

  it('never accepts a certificate error, including for an approved host', () => {
    expect(
      shouldAcceptCertificateError(
        'https://www.ysjc.art/',
        'net::ERR_CERT_DATE_INVALID',
      ),
    ).toBe(false)
  })

  it('builds a same-origin CSP with required data/blob support and no objects or frames', () => {
    const csp = buildMainDocumentCsp(desktopTargets.backend)

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("img-src 'self' data: blob:")
    expect(csp).toContain("connect-src 'self' https://www.ysjc.art https://ys.ysjc.art")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('http:')
  })

  it('replaces only the main-document CSP header and preserves other headers', () => {
    const headers = {
      'Content-Type': ['text/html'],
      'Content-Security-Policy': ["default-src * 'unsafe-eval'"],
      'X-Existing': ['keep-me'],
    }

    expect(
      withMainDocumentCsp(headers, buildMainDocumentCsp(desktopTargets.internal)),
    ).toMatchObject({
      'Content-Type': ['text/html'],
      'X-Existing': ['keep-me'],
      'Content-Security-Policy': [expect.stringContaining("default-src 'self'")],
    })
  })
})
