import { BadRequestException, ConflictException } from '@nestjs/common'

export function requiredBaseUpdatedAt(value?: string) {
  const parsed = new Date(String(value || ''))
  if (!value || Number.isNaN(parsed.getTime())) throw new BadRequestException('缺少有效的数据版本，请刷新后重试')
  return parsed
}

export function staleWrite(current: unknown, message = '数据已被其他账号修改，请保留当前输入并刷新后重试'): never {
  throw new ConflictException({ code: 'STALE_WRITE', message, current })
}
