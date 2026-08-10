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
    const service = new PrivateEmployeePhotoService({ get: () => root } as unknown as ConfigService)

    await expect(service.remove(file)).resolves.toBe(true)
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(service.remove(path.join(tmpdir(), 'outside.jpg'))).resolves.toBe(false)
  })
})
