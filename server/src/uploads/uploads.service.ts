import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { currentMonthInBeijing } from '../common/date'

export interface UploadedImageFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export const UPLOAD_IMAGE_MAX_COUNT = 10
export const UPLOAD_IMAGE_MAX_BYTES = 5 * 1024 * 1024

const RASTER_FORMATS = {
  'image/jpeg': { extension: '.jpg', matches: (buffer: Buffer) => (
    buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  ) },
  'image/png': { extension: '.png', matches: (buffer: Buffer) => (
    buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) },
  'image/webp': { extension: '.webp', matches: (buffer: Buffer) => (
    buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) },
  'image/gif': { extension: '.gif', matches: (buffer: Buffer) => (
    buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  ) }
} as const

type AllowedRasterMime = keyof typeof RASTER_FORMATS

export function isAllowedUploadedImageMime(value: string): value is AllowedRasterMime {
  return Object.hasOwn(RASTER_FORMATS, value)
}

export const rasterUploadStaticOptions = {
  dotfiles: 'deny' as const,
  index: false,
  setHeaders(response: { setHeader: (name: string, value: string) => void }) {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  }
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async saveImages(files: UploadedImageFile[]) {
    if (!files?.length) throw new BadRequestException('请选择要上传的图片')
    if (files.length > UPLOAD_IMAGE_MAX_COUNT) throw new BadRequestException('单次最多上传 10 张图片')
    const prepared = files.map((file) => this.prepareImage(file))
    const uploadRoot = this.config.get<string>('UPLOAD_DIR') || path.resolve(process.cwd(), '../uploads')
    const monthDir = currentMonthInBeijing()
    const targetDir = path.resolve(uploadRoot, monthDir)
    await mkdir(targetDir, { recursive: true })
    const records = prepared.map(({ file, mimeType, extension }) => {
      const fileName = `${randomUUID()}${extension}`
      return {
        originalName: file.originalname,
        mimeType,
        size: file.buffer.length,
        path: path.join(targetDir, fileName),
        url: `/uploads/${monthDir}/${fileName}`,
        buffer: file.buffer
      }
    })
    try {
      for (const record of records) {
        await writeFile(record.path, record.buffer, { flag: 'wx' })
      }
      await this.prisma.uploadedFile.createMany({
        data: records.map(({ buffer: _buffer, ...record }) => record)
      })
      return records.map((record) => record.url)
    } catch (error) {
      await Promise.allSettled(records.map((record) => unlink(record.path)))
      throw error
    }
  }

  private prepareImage(file: UploadedImageFile) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('图片内容为空')
    }
    if (
      file.buffer.length > UPLOAD_IMAGE_MAX_BYTES ||
      !Number.isSafeInteger(file.size) || file.size !== file.buffer.length
    ) {
      throw new BadRequestException('单张图片不能超过 5 MB')
    }
    if (!isAllowedUploadedImageMime(file.mimetype)) {
      throw new BadRequestException('只允许上传 JPEG、PNG、WebP 或 GIF 图片')
    }
    const format = RASTER_FORMATS[file.mimetype]
    if (!format.matches(file.buffer)) {
      throw new BadRequestException('图片内容与声明格式不一致')
    }
    return { file, mimeType: file.mimetype, extension: format.extension }
  }
}
