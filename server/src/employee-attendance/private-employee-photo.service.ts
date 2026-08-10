import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface EmployeePhotoFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

@Injectable()
export class PrivateEmployeePhotoService {
  private static readonly maxBytes = 5 * 1024 * 1024
  private static readonly extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  }

  constructor(private readonly config: ConfigService) {}

  async save(frontendUserId: string, employeeId: string, file?: EmployeePhotoFile) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择员工照片')
    if (file.size <= 0 || file.size > PrivateEmployeePhotoService.maxBytes || file.buffer.length > PrivateEmployeePhotoService.maxBytes) throw new BadRequestException('员工照片不能超过 5MB')
    const extension = PrivateEmployeePhotoService.extensions[file.mimetype]
    if (!extension) throw new BadRequestException('员工照片仅支持 JPG、PNG 或 WebP')
    if (!this.matchesImageSignature(file.mimetype, file.buffer)) throw new BadRequestException('员工照片文件内容与类型不符')
    const root = this.root()
    const directory = path.join(root, this.safeSegment(frontendUserId))
    await mkdir(directory, { recursive: true })
    const filename = `${this.safeSegment(employeeId)}-${Date.now()}-${randomBytes(6).toString('hex')}${extension}`
    const absolutePath = path.join(directory, filename)
    await writeFile(absolutePath, file.buffer, { mode: 0o600 })
    return absolutePath
  }

  async read(absolutePath: string) {
    const resolved = path.resolve(absolutePath)
    const root = this.root()
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new NotFoundException('员工照片不存在')
    try {
      return await readFile(resolved)
    } catch {
      throw new NotFoundException('员工照片不存在')
    }
  }

  private root() {
    return path.resolve(this.config.get<string>('PRIVATE_EMPLOYEE_PHOTO_DIR') || path.join(process.cwd(), 'private-uploads', 'employee-photos'))
  }

  private safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  private matchesImageSignature(mimeType: string, buffer: Buffer) {
    if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
    return false
  }
}
