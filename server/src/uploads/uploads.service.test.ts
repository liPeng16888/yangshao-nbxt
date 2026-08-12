import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { UserRole, type FrontendMenuPermission } from '@prisma/client'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '../auth/current-user'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { RolesGuard } from '../auth/roles.guard'
import { UploadsController } from './uploads.controller'
import { type UploadedImageFile, UploadsService } from './uploads.service'
import * as uploadModule from './uploads.service'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9])
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function image(buffer: Buffer, mimetype: string, originalname = 'attacker.svg'): UploadedImageFile {
  return { buffer, mimetype, originalname, size: buffer.length }
}

async function setup(options: { failDatabase?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ys-upload-test-'))
  tempRoots.push(root)
  const rows: Array<Record<string, unknown>> = []
  const uploadedFile = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (options.failDatabase) throw new Error('database unavailable')
      rows.push(data)
      return data
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      if (options.failDatabase) throw new Error('database unavailable')
      rows.push(...data)
      return { count: data.length }
    }),
    deleteMany: vi.fn(async () => ({ count: rows.splice(0).length }))
  }
  const config = new ConfigService({ UPLOAD_DIR: root })
  return { root, rows, service: new UploadsService({ uploadedFile } as never, config) }
}

function frontendUser(role: UserRole, permissions: FrontendMenuPermission[] = []): CurrentUser {
  const isMain = role === UserRole.FRONTEND_USER
  return {
    id: isMain ? 'front-1' : 'sub-1',
    account: isMain ? 'owner-a' : 'sub-a',
    username: isMain ? '主账号' : '子账号',
    role,
    dataOwnerId: 'front-1',
    permissionVersion: 1,
    permissions,
    requiresAccessGuardPassword: true,
    isFrontendMainAccount: isMain,
    isFrontendSubAccount: !isMain
  }
}

async function authorizedUpload(
  controller: UploadsController,
  user: CurrentUser,
  files: UploadedImageFile[]
) {
  const reflector = new Reflector()
  const context = {
    getHandler: () => UploadsController.prototype.uploadImages,
    getClass: () => UploadsController,
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  }
  new RolesGuard(reflector).canActivate(context as never)
  new FrontendPermissionGuard(reflector).canActivate(context as never)
  return controller.uploadImages(files)
}

describe('UploadsService raster image hardening', () => {
  it.each([
    { mimetype: 'image/png', buffer: PNG, extension: '.png' },
    { mimetype: 'image/jpeg', buffer: JPEG, extension: '.jpg' },
    { mimetype: 'image/webp', buffer: WEBP, extension: '.webp' }
  ])('accepts valid $mimetype bytes and chooses its own $extension filename', async ({ mimetype, buffer, extension }) => {
    const { root, rows, service } = await setup()

    const [url] = await service.saveImages([image(buffer, mimetype)])

    expect(url).toMatch(new RegExp(`^/uploads/\\d{4}-\\d{2}/[a-f0-9-]+\\${extension}$`))
    expect(rows).toEqual([expect.objectContaining({
      originalName: 'attacker.svg', mimeType: mimetype,
      size: buffer.length, url
    })])
    const stored = await readFile(path.join(root, url!.replace('/uploads/', '')))
    expect(stored).toEqual(buffer)
  })

  it.each([
    ['spoofed PNG MIME with HTML bytes', image(Buffer.from('<html><script>1</script></html>'), 'image/png', 'proof.png')],
    ['SVG', image(Buffer.from('<svg onload="alert(1)"/>'), 'image/svg+xml', 'proof.svg')],
    ['HTML', image(Buffer.from('<html>proof</html>'), 'text/html', 'proof.html')],
    ['mismatched raster MIME', image(JPEG, 'image/png', 'proof.png')]
  ])('rejects %s before writing any file', async (_label, file) => {
    const { root, rows, service } = await setup()

    await expect(service.saveImages([file])).rejects.toBeInstanceOf(BadRequestException)

    expect(rows).toHaveLength(0)
    expect(await readdir(root)).toEqual([])
  })

  it('removes every buffered file when persistence fails after disk writes', async () => {
    const { root, service } = await setup({ failDatabase: true })

    await expect(service.saveImages([
      image(PNG, 'image/png', 'one.png'),
      image(JPEG, 'image/jpeg', 'two.jpg')
    ])).rejects.toThrow('database unavailable')

    const [month] = await readdir(root)
    expect(month ? await readdir(path.join(root, month)) : []).toEqual([])
  })

  it('enforces the same exact count and per-file size limits at the Multer boundary', () => {
    const [Interceptor] = Reflect.getMetadata(INTERCEPTORS_METADATA, UploadsController.prototype.uploadImages)
    const instance = new Interceptor() as {
      multer: {
        limits: { files: number; fileSize: number }
        fileFilter: (request: unknown, file: { mimetype: string }, callback: (error: Error | null, accepted: boolean) => void) => void
      }
    }

    expect(instance.multer.limits).toEqual(expect.objectContaining({ files: 10, fileSize: 5 * 1024 * 1024 }))
    const callback = vi.fn()
    instance.multer.fileFilter({}, { mimetype: 'image/svg+xml' }, callback)
    expect(callback).toHaveBeenCalledWith(expect.any(BadRequestException), false)
  })

  it('rejects more than ten files even when the service is called outside Multer', async () => {
    const { service } = await setup()
    await expect(service.saveImages(Array.from({ length: 11 }, () => image(PNG, 'image/png'))))
      .rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects an oversized raster buffer before creating a month directory or database row', async () => {
    const oversizedPng = Buffer.alloc(5 * 1024 * 1024 + 1)
    PNG.copy(oversizedPng)
    const { root, rows, service } = await setup()

    await expect(service.saveImages([image(oversizedPng, 'image/png', 'large.png')]))
      .rejects.toBeInstanceOf(BadRequestException)

    expect(rows).toHaveLength(0)
    expect(await readdir(root)).toEqual([])
  })

  it('serves uploaded raster files with browser content-sniffing and active-content isolation disabled', () => {
    const setHeaders = (uploadModule as unknown as {
      rasterUploadStaticOptions?: { setHeaders?: (response: { setHeader: (name: string, value: string) => void }) => void }
    }).rasterUploadStaticOptions?.setHeaders
    const setHeader = vi.fn()

    expect(setHeaders).toBeTypeOf('function')
    setHeaders!({ setHeader })

    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff')
    expect(setHeader).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'none'; sandbox")
    expect(setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'same-origin')
  })
})

describe('UploadsController frontend authority', () => {
  it('denies a PREPAID_SETTLEMENTS-only subaccount before any file or database row is persisted', async () => {
    const { root, rows, service } = await setup()
    const controller = new UploadsController(service)
    const settlementOnlySub = frontendUser(UserRole.FRONTEND_SUB_USER, ['PREPAID_SETTLEMENTS'])

    await expect(authorizedUpload(controller, settlementOnlySub, [image(PNG, 'image/png', 'proof.png')]))
      .rejects.toBeInstanceOf(ForbiddenException)

    expect(rows).toHaveLength(0)
    expect(await readdir(root)).toEqual([])
  })

  it('keeps main-account proof uploads and existing generic leaf-permission uploads working', async () => {
    const mainSetup = await setup()
    const genericSetup = await setup()

    await expect(authorizedUpload(
      new UploadsController(mainSetup.service),
      frontendUser(UserRole.FRONTEND_USER),
      [image(PNG, 'image/png', 'proof.png')]
    )).resolves.toEqual([expect.stringMatching(/^\/uploads\//)])
    await expect(authorizedUpload(
      new UploadsController(genericSetup.service),
      frontendUser(UserRole.FRONTEND_SUB_USER, ['DATA_MAIN']),
      [image(JPEG, 'image/jpeg', 'lab.jpg')]
    )).resolves.toEqual([expect.stringMatching(/^\/uploads\//)])

    expect(mainSetup.rows).toHaveLength(1)
    expect(genericSetup.rows).toHaveLength(1)
  })
})
