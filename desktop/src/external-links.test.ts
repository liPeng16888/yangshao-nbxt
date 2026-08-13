import { describe, expect, it, vi } from 'vitest'

import { desktopTargets } from './config'
import { confirmAndOpenExternalLink } from './external-links'

describe('external link confirmation', () => {
  it('opens an ordinary HTTPS link in the system browser after confirmation', async () => {
    const confirm = vi.fn().mockResolvedValue(true)
    const openExternal = vi.fn().mockResolvedValue(undefined)

    await expect(
      confirmAndOpenExternalLink(
        'https://www.electronjs.org/docs/latest/',
        desktopTargets.internal,
        confirm,
        openExternal,
      ),
    ).resolves.toBe('opened')
    expect(confirm).toHaveBeenCalledWith('https://www.electronjs.org')
    expect(openExternal).toHaveBeenCalledWith(
      'https://www.electronjs.org/docs/latest/',
    )
  })

  it('does not open an external HTTPS link when confirmation is canceled', async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    const openExternal = vi.fn().mockResolvedValue(undefined)

    await expect(
      confirmAndOpenExternalLink(
        'https://example.com/help',
        desktopTargets.internal,
        confirm,
        openExternal,
      ),
    ).resolves.toBe('cancelled')
    expect(openExternal).not.toHaveBeenCalled()
  })

  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'mailto:user@example.com',
    'https://www.ysjc.art.evil.com/phishing',
    'https://www.ysjc.art@evil.com/phishing',
  ])('blocks unsafe or deceptive external URL %s without prompting', async (url) => {
    const confirm = vi.fn().mockResolvedValue(true)
    const openExternal = vi.fn().mockResolvedValue(undefined)

    await expect(
      confirmAndOpenExternalLink(
        url,
        desktopTargets.internal,
        confirm,
        openExternal,
      ),
    ).resolves.toBe('blocked')
    expect(confirm).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })
})
