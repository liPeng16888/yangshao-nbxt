import { BadRequestException } from '@nestjs/common'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadsService, type UploadedImageFile } from './uploads.service'

const roots: string[] = []

function image(overrides: Partial<UploadedImageFile> = {}): UploadedImageFile {
  return {
    originalname: 'evidence.png',
    mimetype: 'image/png',
    size: 3,
    buffer: Buffer.from('png'),
    ...overrides
  }
}

describe('UploadsService image safety', () => {
  let create: ReturnType<typeof vi.fn>
  let service: UploadsService

  beforeEach(async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'blacklist-upload-'))
    roots.push(root)
    create = vi.fn().mockResolvedValue({})
    service = new UploadsService(
      { uploadedFile: { create } } as never,
      { get: (key: string) => key === 'UPLOAD_DIR' ? root : undefined } as never
    )
  })

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it.each(['image/svg+xml', 'image/bmp', 'application/octet-stream'])(
    'rejects unsupported image MIME %s before persisting it',
    async (mimetype) => {
      await expect(service.saveImages([image({ mimetype })])).rejects.toBeInstanceOf(BadRequestException)
      expect(create).not.toHaveBeenCalled()
    }
  )

  it('rejects an image larger than 5 MB before persisting it', async () => {
    await expect(service.saveImages([image({ size: 5 * 1024 * 1024 + 1 })])).rejects.toBeInstanceOf(BadRequestException)
    expect(create).not.toHaveBeenCalled()
  })

  it('uses the approved MIME type for the persisted extension, not the original filename', async () => {
    const [url] = await service.saveImages([image({ originalname: 'misleading.svg', mimetype: 'image/png' })])
    expect(url).toMatch(/\.png$/)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mimeType: 'image/png', url: expect.stringMatching(/\.png$/) })
    }))
  })
})
