import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('@/utils/request', () => ({ default: request, useMocks: false }))

import { uploadImages } from './upload'

describe('uploadImages', () => {
  beforeEach(() => {
    request.post.mockReset().mockResolvedValue(['/uploads/2026-08/evidence.png'])
  })

  it('resolves server upload paths against an absolute configured API origin', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')

    await expect(uploadImages([new File(['png'], 'evidence.png', { type: 'image/png' })]))
      .resolves.toEqual(['https://api.example.com/uploads/2026-08/evidence.png'])
  })

  it('keeps same-origin upload paths when the configured API base is relative', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')

    await expect(uploadImages([new File(['png'], 'evidence.png', { type: 'image/png' })]))
      .resolves.toEqual(['/uploads/2026-08/evidence.png'])
  })
})
