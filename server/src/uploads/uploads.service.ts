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

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async saveImages(files: UploadedImageFile[]) {
    if (!files?.length) throw new BadRequestException('请选择要上传的图片')
    if (files.length > 10) throw new BadRequestException('单次最多上传 10 张图片')
    const uploadRoot = this.config.get<string>('UPLOAD_DIR') || path.resolve(process.cwd(), '../uploads')
    const monthDir = currentMonthInBeijing()
    const targetDir = path.resolve(uploadRoot, monthDir)
    await mkdir(targetDir, { recursive: true })
    const urls: string[] = []
    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) throw new BadRequestException('只能上传图片文件')
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
    const parsed = path.extname(file.originalname || '').toLowerCase()
    if (parsed && /^[a-z0-9.]+$/.test(parsed)) return parsed
    if (file.mimetype === 'image/png') return '.png'
    if (file.mimetype === 'image/webp') return '.webp'
    return '.jpg'
  }
}
