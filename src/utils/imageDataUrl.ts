const MAX_SEAL_BYTES = 512 * 1024
const ALLOWED_SEAL_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function resizeSealImage(file: File): Promise<string> {
  if (!ALLOWED_SEAL_TYPES.has(file.type)) {
    throw new Error('电子公章只支持 PNG、JPEG 或 WebP')
  }

  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    if (!Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error('电子公章内容无效')
    }
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1024 / bitmap.width, 1024 / bitmap.height)
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('电子公章处理失败')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    let webpSupported = false
    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const encoded = canvas.toDataURL('image/webp', quality)
      if (!encoded.startsWith('data:image/webp;base64,')) break
      webpSupported = true
      if (validatedDataUrlBytes(encoded) <= MAX_SEAL_BYTES) return encoded
    }

    if (webpSupported) throw new Error('电子公章不能超过 512 KiB')

    const png = canvas.toDataURL('image/png')
    if (validatedDataUrlBytes(png) <= MAX_SEAL_BYTES) return png
    throw new Error('电子公章不能超过 512 KiB')
  } finally {
    bitmap?.close()
  }
}

function validatedDataUrlBytes(dataUrl: string) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[2].length % 4 !== 0) throw new Error('电子公章内容无效')
  const base64 = match[2]
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length * 3) / 4 - padding
}
