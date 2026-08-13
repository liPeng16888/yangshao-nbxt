import type { DesktopTargetConfig } from './config.js'

export type NavigationDecision = 'allow' | 'external-https' | 'block'
export type ResponseHeaders = Record<string, string[]>

function parseUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(rawUrl)
  } catch {
    return undefined
  }
}

function hasSafeHttpsAuthority(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === ''
  )
}

export function isAllowedNavigation(
  rawUrl: string,
  target: DesktopTargetConfig,
): boolean {
  const url = parseUrl(rawUrl)
  return Boolean(url && hasSafeHttpsAuthority(url) && url.origin === target.allowedOrigin)
}

export function classifyNavigation(
  rawUrl: string,
  target: DesktopTargetConfig,
): NavigationDecision {
  if (isAllowedNavigation(rawUrl, target)) {
    return 'allow'
  }

  const url = parseUrl(rawUrl)
  if (!url || !hasSafeHttpsAuthority(url)) {
    return 'block'
  }

  const allowedHost = new URL(target.allowedOrigin).hostname
  if (url.hostname.startsWith(`${allowedHost}.`)) {
    return 'block'
  }

  return 'external-https'
}

export function isAllowedBlobUrl(
  rawUrl: string,
  target: DesktopTargetConfig,
): boolean {
  const url = parseUrl(rawUrl)
  return Boolean(
    url &&
      url.protocol === 'blob:' &&
      url.origin === target.allowedOrigin &&
      url.username === '' &&
      url.password === '',
  )
}

export function shouldGrantPermission(_permission: string): false {
  return false
}

export function shouldAcceptCertificateError(
  _url: string,
  _error: string,
): false {
  return false
}

export function buildMainDocumentCsp(_target: DesktopTargetConfig): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.ysjc.art https://ys.ysjc.art",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export function withMainDocumentCsp(
  responseHeaders: ResponseHeaders,
  csp: string,
): ResponseHeaders {
  const nextHeaders = Object.fromEntries(
    Object.entries(responseHeaders).filter(
      ([name]) => name.toLowerCase() !== 'content-security-policy',
    ),
  )

  return {
    ...nextHeaders,
    'Content-Security-Policy': [csp],
  }
}
