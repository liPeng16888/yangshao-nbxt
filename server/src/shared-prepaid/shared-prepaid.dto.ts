import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  type ValidationOptions
} from 'class-validator'

import type { CreateRechargePayload } from './shared-prepaid-ledger.service'

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const trim = (value: unknown) => typeof value === 'string' ? value.trim() : value
const queryNumber = (value: unknown) => (
  value === undefined || value === null || value === '' ? value : Number(value)
)
const queryBoolean = (value: unknown) => {
  if (value === 'true' || value === true) return true
  if (value === 'false' || value === false) return false
  return value
}

function IsMoneyScalar(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy({
    name: 'isMoneyScalar',
    validator: {
      validate: (value: unknown) => typeof value === 'string' || typeof value === 'number',
      defaultMessage: () => '金额必须为数字或数字文本'
    }
  }, validationOptions)
}

export class CreateSharedPrepaidRechargeDto implements CreateRechargePayload {
  @Transform(({ value }) => trim(value))
  @IsString({ message: '会员手机号必须为文本' })
  @IsNotEmpty({ message: '请填写会员手机号' })
  phone!: string

  @Transform(({ value }) => trim(value))
  @IsString({ message: '充值日期必须为文本' })
  @Matches(BUSINESS_DATE_PATTERN, { message: '充值日期必须为 YYYY-MM-DD 格式' })
  rechargeDate!: string

  @IsDefined({ message: '充值金额必填' })
  @IsMoneyScalar({ message: '充值金额必须为数字或数字文本' })
  paidAmount!: string | number

  @IsDefined({ message: '赠送金额必填' })
  @IsMoneyScalar({ message: '赠送金额必须为数字或数字文本' })
  giftAmount!: string | number

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: '期初余额标记必须为布尔值' })
  isOpeningBalance?: boolean

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString({ message: '备注必须为文本' })
  @MaxLength(500, { message: '备注不能超过 500 个字符' })
  remark?: string
}

export class ReverseSharedPrepaidRechargeDto {
  @Transform(({ value }) => trim(value))
  @IsString({ message: '冲正原因必须为文本' })
  @IsNotEmpty({ message: '请填写冲正原因' })
  @MaxLength(500, { message: '冲正原因不能超过 500 个字符' })
  reason!: string
}

export class SharedPrepaidMemberQueryDto {
  @Transform(({ value }) => queryNumber(value))
  @IsOptional()
  @IsInt({ message: '页码必须为正整数' })
  @Min(1, { message: '页码必须为正整数' })
  page?: number

  @Transform(({ value }) => queryNumber(value))
  @IsOptional()
  @IsInt({ message: '每页数量必须为正整数' })
  @Min(1, { message: '每页数量必须为正整数' })
  @Max(100, { message: '每页最多 100 条' })
  pageSize?: number

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString({ message: '手机号筛选必须为文本' })
  phone?: string
}

export class SharedPrepaidRechargeQueryDto extends SharedPrepaidMemberQueryDto {
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString({ message: '充值归属账号必须为文本' })
  @IsNotEmpty({ message: '充值归属账号不能为空' })
  ownerFrontendUserId?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '开始日期必须为 YYYY-MM-DD 格式' })
  startDate?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '结束日期必须为 YYYY-MM-DD 格式' })
  endDate?: string

  @Transform(({ value }) => queryBoolean(value))
  @IsOptional()
  @IsBoolean({ message: '期初余额筛选必须为布尔值' })
  isOpeningBalance?: boolean
}
