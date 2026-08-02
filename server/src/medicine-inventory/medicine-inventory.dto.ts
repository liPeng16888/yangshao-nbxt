import { MedicineUnit } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsArray, IsDefined, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'
import type { MedicineQuantityInput } from './medicine-inventory.types'

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

export function parseMedicineMultiValue(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return Array.from(
    new Set(
      values
        .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  )
}

export class CreateMedicineInboundDto {
  @Transform(({ value }) => trimString(value))
  @IsString({ message: '入库日期必须是字符串' })
  @Matches(BUSINESS_DATE_PATTERN, { message: '入库日期必须为 YYYY-MM-DD 格式' })
  occurredOn!: string

  @Transform(({ value }) => trimString(value))
  @IsString({ message: '药品名称必须是字符串' })
  @IsNotEmpty({ message: '请填写药品名称' })
  name!: string

  @IsEnum(MedicineUnit, { message: '药品单位无效' })
  unit!: MedicineUnit

  @IsDefined({ message: '请填写入库数量' })
  quantity!: MedicineQuantityInput

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  remark?: string
}

export class CreateMedicineOutboundDto {
  @Transform(({ value }) => trimString(value))
  @IsString({ message: '出库日期必须是字符串' })
  @Matches(BUSINESS_DATE_PATTERN, { message: '出库日期必须为 YYYY-MM-DD 格式' })
  occurredOn!: string

  @Transform(({ value }) => trimString(value))
  @IsString({ message: '药品库存项标识必须是字符串' })
  @IsNotEmpty({ message: '请选择出库药品' })
  medicineItemId!: string

  @IsDefined({ message: '请填写出库数量' })
  quantity!: MedicineQuantityInput

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString({ message: '备注必须是字符串' })
  remark?: string
}

export class CreateMedicineCorrectionDto {
  @Transform(({ value }) => trimString(value))
  @IsString({ message: '更正原因必须是字符串' })
  @IsNotEmpty({ message: '请填写更正原因' })
  reason!: string
}

export class MedicineMovementQueryDto {
  @Transform(({ value }) => parseMedicineMultiValue(value))
  @IsOptional()
  @IsArray({ message: '前台账号筛选格式无效' })
  @IsString({ each: true, message: '前台账号筛选格式无效' })
  frontendUserIds?: string[]

  @Transform(({ value }) => parseMedicineMultiValue(value))
  @IsOptional()
  @IsArray({ message: '药品筛选格式无效' })
  @IsString({ each: true, message: '药品筛选格式无效' })
  medicineItemIds?: string[]

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '开始日期必须为 YYYY-MM-DD 格式' })
  startDate?: string

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '结束日期必须为 YYYY-MM-DD 格式' })
  endDate?: string
}
