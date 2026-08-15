export const BLACKLIST_IMAGE_MAX_BYTES = 5 * 1024 * 1024

const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ownedBlobUrls = new Set<string>()

export function validateBlacklistImage(file: File): string | null {
  if (!allowedImageTypes.has(file.type.toLowerCase())) return '只能选择 PNG、JPEG、WebP 或 GIF 图片'
  if (file.size > BLACKLIST_IMAGE_MAX_BYTES) return '单张图片不能超过 5 MB'
  return null
}

export function createOwnedImagePreview(file: File): string {
  const url = URL.createObjectURL(file)
  ownedBlobUrls.add(url)
  return url
}

export function revokeOwnedImagePreview(url: string) {
  if (!ownedBlobUrls.delete(url)) return
  URL.revokeObjectURL(url)
}

export function isOwnedImagePreview(url: string) {
  return ownedBlobUrls.has(url)
}
