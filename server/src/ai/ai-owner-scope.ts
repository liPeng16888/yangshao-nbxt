import { BadRequestException, ConflictException } from '@nestjs/common'
import { ownerIdsSchema } from './ai-owner-schema'
export { MAX_AI_OWNERS,ownerIdsSchema,ownerSelectionSchema } from './ai-owner-schema'
export function normalizedOwners(ids: string[]) {
  const parsed = ownerIdsSchema.safeParse(ids)
  if (!parsed.success) throw new BadRequestException('请选择 1 至 20 个不重复的授权账号')
  return [...parsed.data].sort()
}
export function conversationOwners(row: { ownerId: string; ownerIds?: unknown }) {
  if (row.ownerIds === undefined || Array.isArray(row.ownerIds) && row.ownerIds.length === 0) return [row.ownerId]
  const parsed = ownerIdsSchema.safeParse(row.ownerIds)
  if (!parsed.success || !parsed.data.includes(row.ownerId)) throw new ConflictException('对话账号范围无效，请新建对话')
  return normalizedOwners(parsed.data)
}
