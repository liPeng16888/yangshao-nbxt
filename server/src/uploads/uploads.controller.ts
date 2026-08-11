import { Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { UploadedImageFile, UploadsService } from './uploads.service'

@Controller('uploads')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('images')
  @Roles(UserRole.FRONTEND_USER, UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  @FrontendPermission('DATA_MAIN', 'LAB_REPORT_IMAGE_TEMPLATE', 'BLACKLIST')
  @UseInterceptors(FilesInterceptor('images', 10))
  uploadImages(@UploadedFiles() files: UploadedImageFile[]) {
    return this.uploads.saveImages(files)
  }
}
