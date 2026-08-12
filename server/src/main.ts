import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import express from 'express'
import { join, resolve } from 'node:path'
import { AppModule } from './app.module'
import { rasterUploadStaticOptions } from './uploads/uploads.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api')
  app.enableCors()
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  )
  const uploadDir = resolve(process.env.UPLOAD_DIR || 'uploads')
  app.use('/uploads', express.static(join(uploadDir), rasterUploadStaticOptions))
  await app.listen(Number(process.env.SERVER_PORT || 3000))
}

void bootstrap()
