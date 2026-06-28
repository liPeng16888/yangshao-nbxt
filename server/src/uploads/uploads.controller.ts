import { Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { UploadedImageFile, UploadsService } from './uploads.service'

@Controller('uploads')
@UseGuards(AuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('images')
  @Roles(UserRole.FRONTEND_USER, UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  @UseInterceptors(FilesInterceptor('images', 10))
  uploadImages(@UploadedFiles() files: UploadedImageFile[]) {
    return this.uploads.saveImages(files)
  }
}
