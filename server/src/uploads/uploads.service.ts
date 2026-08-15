import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { currentMonthInBeijing } from '../common/date'

export interface UploadedImageFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async saveImages(files: UploadedImageFile[]) {
    if (!files?.length) throw new BadRequestException('请选择要上传的图片')
    if (files.length > 10) throw new BadRequestException('单次最多上传 10 张图片')
    for (const file of files) {
      if (!IMAGE_EXTENSIONS[file.mimetype.toLowerCase()]) throw new BadRequestException('只能上传 PNG、JPEG、WebP 或 GIF 图片')
      if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('单张图片不能超过 5 MB')
    }
    const uploadRoot = this.config.get<string>('UPLOAD_DIR') || path.resolve(process.cwd(), '../uploads')
    const monthDir = currentMonthInBeijing()
    const targetDir = path.resolve(uploadRoot, monthDir)
    await mkdir(targetDir, { recursive: true })
    const urls: string[] = []
    for (const file of files) {
      const ext = this.extFromFile(file)
      const fileName = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`
      const absolutePath = path.join(targetDir, fileName)
      await writeFile(absolutePath, file.buffer)
      const url = `/uploads/${monthDir}/${fileName}`
      await this.prisma.uploadedFile.create({
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: absolutePath,
          url
        }
      })
      urls.push(url)
    }
    return urls
  }

  private extFromFile(file: UploadedImageFile) {
    return IMAGE_EXTENSIONS[file.mimetype.toLowerCase()]
  }
}
