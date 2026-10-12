import { z } from 'zod'
// Pure validation metadata can also be used by the browser's local preview.
export const MAX_AI_OWNERS=20
export const ownerIdsSchema=z.array(z.string().trim().min(1).max(100)).min(1).max(MAX_AI_OWNERS).refine(ids=>new Set(ids).size===ids.length,'账号不能重复')
export const ownerSelectionSchema=z.object({ownerId:z.string().trim().min(1).max(100).optional(),ownerIds:ownerIdsSchema.optional()}).strict().refine(value=>!(value.ownerId&&value.ownerIds),'不能同时指定单账号和多账号')
