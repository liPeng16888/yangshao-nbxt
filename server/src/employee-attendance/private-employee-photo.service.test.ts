import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivateEmployeePhotoService } from './private-employee-photo.service'

describe('PrivateEmployeePhotoService cleanup', () => {
  const roots: string[] = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('removes only files inside the configured private root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'employee-photo-'))
    roots.push(root)
    const file = path.join(root, 'front-1', 'employee-1.jpg')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, Buffer.from('private photo'))
    const service = new PrivateEmployeePhotoService({ get: (key: string) => key === 'PRIVATE_EMPLOYEE_PHOTO_DIR' ? root : undefined } as unknown as ConfigService)

    await expect(service.remove(file)).resolves.toBe(true)
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(service.remove(path.join(tmpdir(), 'outside.jpg'))).resolves.toBe(false)
  })

  it('rejects a private photo root nested under the public upload directory', async () => {
    const publicRoot = await mkdtemp(path.join(tmpdir(), 'public-upload-'))
    roots.push(publicRoot)
    const privateRoot = path.join(publicRoot, 'employee-photos')
    const service = new PrivateEmployeePhotoService({
      get: (key: string) => key === 'PRIVATE_EMPLOYEE_PHOTO_DIR' ? privateRoot : key === 'UPLOAD_DIR' ? publicRoot : undefined
    } as unknown as ConfigService)
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(service.save('front-1', 'employee-1', { originalname: 'photo.png', mimetype: 'image/png', size: png.length, buffer: png }))
      .rejects.toBeInstanceOf(BadRequestException)
  })

  it('detects the stored image content type when reading a private photo', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'employee-photo-'))
    roots.push(root)
    const file = path.join(root, 'front-1', 'employee-1.bin')
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, png)
    const service = new PrivateEmployeePhotoService({ get: (key: string) => key === 'PRIVATE_EMPLOYEE_PHOTO_DIR' ? root : undefined } as unknown as ConfigService)

    await expect(service.read(file)).resolves.toEqual({ buffer: png, contentType: 'image/png' })
  })
})
