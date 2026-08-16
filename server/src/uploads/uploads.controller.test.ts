import { INTERCEPTORS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { UploadsController } from './uploads.controller'

describe('UploadsController', () => {
  it('limits every buffered image to 5 MB at the Multer interceptor', () => {
    const [Interceptor] = Reflect.getMetadata(INTERCEPTORS_METADATA, UploadsController.prototype.uploadImages)
    const instance = new Interceptor() as { multer: { limits: { fileSize: number } } }
    expect(instance.multer.limits.fileSize).toBe(5 * 1024 * 1024)
  })
})
