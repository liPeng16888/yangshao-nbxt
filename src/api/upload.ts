import request, { useMocks } from '@/utils/request'
import { mockUploadImages } from '@/mocks/db'

export async function uploadImages(files: File[]): Promise<string[]> {
  const urls = useMocks
    ? await mockUploadImages(files)
    : await uploadToServer(files)
  return urls.map(resolveUploadedImageUrl)
}

async function uploadToServer(files: File[]): Promise<string[]> {
  const form = new FormData()
  files.forEach((file) => form.append('images', file))
  return request.post('/uploads/images', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

function resolveUploadedImageUrl(url: string) {
  if (!url.startsWith('/')) return url
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  if (!/^https?:\/\//i.test(apiBase)) return url
  return new URL(url, new URL(apiBase).origin).toString()
}
