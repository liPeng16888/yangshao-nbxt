import { afterEach, describe, expect, it, vi } from 'vitest'
import { resizeSealImage } from './imageDataUrl'

function installCanvasMock(result: string | ((type?: string, quality?: number) => string)) {
  const originalCreateElement = document.createElement.bind(document)
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    toDataURL: vi.fn((type?: string, quality?: number) => (
      typeof result === 'function' ? result(type, quality) : result
    ))
  }
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => (
    tagName.toLowerCase() === 'canvas'
      ? canvas as unknown as HTMLCanvasElement
      : originalCreateElement(tagName)
  )) as typeof document.createElement)
  return canvas
}

describe('resizeSealImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('scales a 1600x1200 seal to a 1024x768 canvas', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1600, height: 1200, close }))
    const canvas = installCanvasMock('data:image/webp;base64,aGVsbG8=')

    const result = await resizeSealImage(new File(['png'], 'seal.png', { type: 'image/png' }))

    expect(canvas.width).toBe(1024)
    expect(canvas.height).toBe(768)
    expect(result).toMatch(/^data:image\/(webp|png|jpeg);base64,/)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it.each(['image/svg+xml', 'image/gif'])('rejects unsupported %s seals', async (type) => {
    await expect(resizeSealImage(new File(['image'], 'seal', { type })))
      .rejects.toThrow('电子公章只支持 PNG、JPEG 或 WebP')
  })

  it('reduces WebP quality until the encoded seal fits', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 20, height: 20, close: vi.fn() }))
    const tooLarge = `data:image/webp;base64,${Buffer.alloc(512 * 1024 + 1).toString('base64')}`
    const canvas = installCanvasMock((_type, quality) => (
      (quality ?? 1) > 0.7 ? tooLarge : 'data:image/webp;base64,aGVsbG8='
    ))

    await expect(resizeSealImage(new File(['png'], 'seal.png', { type: 'image/png' })))
      .resolves.toBe('data:image/webp;base64,aGVsbG8=')
    expect(canvas.toDataURL.mock.calls.map((call) => call[1])).toEqual([0.9, 0.8, 0.7])
  })

  it('falls back to PNG when canvas cannot encode WebP', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 20, height: 20, close: vi.fn() }))
    const canvas = installCanvasMock((type) => (
      type === 'image/webp'
        ? 'data:image/png;base64,aGVsbG8='
        : 'data:image/png;base64,aGVsbG8='
    ))

    await expect(resizeSealImage(new File(['jpeg'], 'seal.jpeg', { type: 'image/jpeg' })))
      .resolves.toBe('data:image/png;base64,aGVsbG8=')
    expect(canvas.toDataURL).toHaveBeenLastCalledWith('image/png')
  })

  it('rejects an encoded result above 512 KiB and still closes the bitmap', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 20, height: 20, close }))
    installCanvasMock(`data:image/png;base64,${Buffer.alloc(512 * 1024 + 1).toString('base64')}`)

    await expect(resizeSealImage(new File(['png'], 'seal.png', { type: 'image/png' })))
      .rejects.toThrow('电子公章不能超过 512 KiB')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not switch to PNG after supported WebP remains oversized at minimum quality', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 20, height: 20, close: vi.fn() }))
    const tooLarge = `data:image/webp;base64,${Buffer.alloc(512 * 1024 + 1).toString('base64')}`
    const canvas = installCanvasMock((type) => (
      type === 'image/webp' ? tooLarge : 'data:image/png;base64,aGVsbG8='
    ))

    await expect(resizeSealImage(new File(['png'], 'seal.png', { type: 'image/png' })))
      .rejects.toThrow('电子公章不能超过 512 KiB')
    expect(canvas.toDataURL).not.toHaveBeenCalledWith('image/png')
  })
})
