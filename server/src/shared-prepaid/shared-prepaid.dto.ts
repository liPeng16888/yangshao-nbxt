import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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
export const SHARED_PREPAID_ZONED_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i

const trim = (value: unknown) => typeof value === 'string' ? value.trim() : value
const queryNumber = (value: unknown) => (
  value === undefined || value === null || value === '' ? value : Number(value)
)
const queryBoolean = (value: unknown) => {
  if (value === 'true' || value === true) return true
  if (value === 'false' || value === false) return false
  return value
}
const queryUuidList = (value: unknown) => {
  if (Array.isArray(value)) return value.flatMap((item) => String(item).split(',')).map((item) => item.trim())
  if (typeof value === 'string') return value.split(',').map((item) => item.trim())
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

export function isSharedPrepaidProofUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2000) return false
  if (value.startsWith('/uploads/')) {
    if (value.includes('\\') || value.includes('?') || value.includes('#') || !/^\/[A-Za-z0-9._/-]+$/.test(value)) {
      return false
    }
    try {
      const segments = decodeURIComponent(value).split('/')
      return !segments.some((segment) => segment === '.' || segment === '..')
    } catch {
      return false
    }
  }
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

function IsSharedPrepaidProofUrl(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy({
    name: 'isSharedPrepaidProofUrl',
    validator: {
      validate: isSharedPrepaidProofUrl,
      defaultMessage: () => '转账凭证必须为上传地址或 HTTP(S) 地址'
    }
  }, validationOptions)
}

export class SharedPrepaidSettlementSelectionDto {
  @Transform(({ value }) => Array.isArray(value) ? value.map((item) => trim(item)) : value)
  @IsArray({ message: '应转款明细必须为数组' })
  @ArrayNotEmpty({ message: '请选择待结算的应转款明细' })
  @ArrayMaxSize(1000, { message: '单次最多结算 1000 条明细' })
  @ArrayUnique({ message: '应转款明细不能重复' })
  @IsUUID('4', { each: true, message: '应转款明细编号格式错误' })
  payableIds!: string[]
}

export class SharedPrepaidSettlementPaymentDto {
  @Transform(({ value }) => trim(value))
  @IsString({ message: '实际转账时间必须为文本' })
  @Matches(SHARED_PREPAID_ZONED_DATE_TIME_PATTERN, { message: '实际转账时间必须包含时区' })
  @IsISO8601({ strict: true, strictSeparator: true }, { message: '实际转账时间格式错误' })
  actualTransferredAt!: string

  @Transform(({ value }) => Array.isArray(value) ? value.map((item) => trim(item)) : value)
  @IsOptional()
  @IsArray({ message: '转账凭证必须为数组' })
  @ArrayMaxSize(10, { message: '转账凭证最多 10 张' })
  @ArrayUnique({ message: '转账凭证不能重复' })
  @IsSharedPrepaidProofUrl({ each: true })
  proofUrls?: string[]

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString({ message: '备注必须为文本' })
  @MaxLength(500, { message: '备注不能超过 500 个字符' })
  remark?: string
}

export class SharedPrepaidSettlementRejectDto {
  @Transform(({ value }) => trim(value))
  @IsString({ message: '驳回原因必须为文本' })
  @IsNotEmpty({ message: '请填写驳回原因' })
  @MaxLength(500, { message: '驳回原因不能超过 500 个字符' })
  reason!: string
}

export class SharedPrepaidSettlementIdParamsDto {
  @Transform(({ value }) => trim(value))
  @IsUUID('4', { message: '结算单编号格式错误' })
  id!: string
}

export class SharedPrepaidIdempotencyHeadersDto {
  @Transform(({ value }) => trim(value))
  @IsString({ message: '幂等请求编号必须为文本' })
  @IsNotEmpty({ message: '缺少幂等请求编号' })
  @MaxLength(200, { message: '幂等请求编号过长' })
  'x-idempotency-key'!: string
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

export class SharedPrepaidConsumptionQueryDto extends SharedPrepaidMemberQueryDto {
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString({ message: '充值来源账号必须为文本' })
  @IsNotEmpty({ message: '充值来源账号不能为空' })
  sourceOwnerId?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString({ message: '消费账号必须为文本' })
  @IsNotEmpty({ message: '消费账号不能为空' })
  consumingFrontendUserId?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '开始日期必须为 YYYY-MM-DD 格式' })
  startDate?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '结束日期必须为 YYYY-MM-DD 格式' })
  endDate?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsIn(['ACTIVE', 'REVERSED'], { message: '消费状态参数错误' })
  status?: 'ACTIVE' | 'REVERSED'

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsIn(['PENDING', 'HELD', 'COMPLETED', 'REVERSED'], { message: '结算状态参数错误' })
  payableStatus?: 'PENDING' | 'HELD' | 'COMPLETED' | 'REVERSED'
}

export class SharedPrepaidSettlementPayableQueryDto extends SharedPrepaidMemberQueryDto {
  @Transform(({ value }) => queryUuidList(value))
  @IsOptional()
  @IsArray({ message: '应转款明细筛选必须为数组' })
  @ArrayNotEmpty({ message: '应转款明细筛选不能为空' })
  @ArrayMaxSize(100, { message: '单次最多刷新 100 条应转款明细' })
  @ArrayUnique({ message: '应转款明细筛选不能重复' })
  @IsUUID('4', { each: true, message: '应转款明细编号格式错误' })
  payableIds?: string[]

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsUUID('4', { message: '对方主账号编号格式错误' })
  counterpartyFrontendUserId?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsIn(['OUTGOING', 'INCOMING'], { message: '应转方向参数错误' })
  direction?: 'OUTGOING' | 'INCOMING'

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsIn(['PENDING', 'HELD', 'COMPLETED', 'REVERSED'], { message: '应转状态参数错误' })
  status?: 'PENDING' | 'HELD' | 'COMPLETED' | 'REVERSED'

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
  @IsBoolean({ message: '仅可结算筛选必须为布尔值' })
  eligibleOnly?: boolean
}

export class SharedPrepaidSettlementQueryDto {
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
  @IsUUID('4', { message: '对方主账号编号格式错误' })
  counterpartyFrontendUserId?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsIn(['AWAITING_PAYMENT', 'AWAITING_RECEIPT', 'COMPLETED', 'REJECTED', 'CANCELLED'], { message: '结算单状态参数错误' })
  status?: 'AWAITING_PAYMENT' | 'AWAITING_RECEIPT' | 'COMPLETED' | 'REJECTED' | 'CANCELLED'

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '开始日期必须为 YYYY-MM-DD 格式' })
  startDate?: string

  @Transform(({ value }) => trim(value))
  @IsOptional()
  @Matches(BUSINESS_DATE_PATTERN, { message: '结束日期必须为 YYYY-MM-DD 格式' })
  endDate?: string
}
