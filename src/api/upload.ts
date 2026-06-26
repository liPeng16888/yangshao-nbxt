import request, { useMocks } from '@/utils/request'
import { mockUploadImages } from '@/mocks/db'

export async function uploadImages(files: File[]): Promise<string[]> {
  if (useMocks) return mockUploadImages(files)
  const form = new FormData()
  files.forEach((file) => form.append('images', file))
  return request.post('/uploads/images', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
