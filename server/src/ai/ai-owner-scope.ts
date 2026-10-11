import { BadRequestException, ConflictException } from '@nestjs/common'
import { z } from 'zod'

export const MAX_AI_OWNERS = 20
export const ownerIdsSchema = z.array(z.string().trim().min(1).max(100)).min(1).max(MAX_AI_OWNERS).refine(ids => new Set(ids).size === ids.length, '账号不能重复')
export const ownerSelectionSchema = z.object({ ownerId: z.string().trim().min(1).max(100).optional(), ownerIds: ownerIdsSchema.optional() }).strict().refine(v => !(v.ownerId && v.ownerIds), '不能同时指定单账号和多账号')
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
