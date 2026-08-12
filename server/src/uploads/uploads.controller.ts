import { BadRequestException, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import {
  isAllowedUploadedImageMime,
  UPLOAD_IMAGE_MAX_BYTES,
  UPLOAD_IMAGE_MAX_COUNT,
  UploadedImageFile,
  UploadsService
} from './uploads.service'

@Controller('uploads')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('images')
  @Roles(UserRole.FRONTEND_USER, UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  @FrontendPermission('DATA_MAIN', 'LAB_REPORT_IMAGE_TEMPLATE', 'BLACKLIST')
  @UseInterceptors(FilesInterceptor('images', UPLOAD_IMAGE_MAX_COUNT, {
    storage: memoryStorage(),
    limits: { files: UPLOAD_IMAGE_MAX_COUNT, fileSize: UPLOAD_IMAGE_MAX_BYTES },
    fileFilter: (_request, file, callback) => {
      if (!isAllowedUploadedImageMime(file.mimetype)) {
        callback(new BadRequestException('只允许上传 JPEG、PNG 或 WebP 图片'), false)
        return
      }
      callback(null, true)
    }
  }))
  uploadImages(@UploadedFiles() files: UploadedImageFile[]) {
    return this.uploads.saveImages(files)
  }
}
