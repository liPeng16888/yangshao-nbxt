import { z } from 'zod'
import { menuCatalog, sampleWritable, type Resource } from './ai-menu-catalog'
export { sampleFields, sampleWritable, resultFields, type Resource } from './ai-menu-catalog'

export const catalog = menuCatalog
export type Rule = { resource: Resource; readFields: string[]; writeFields: string[] }
export type Grants = Record<string, string>
export const resourceSchema = z.enum(catalog.map(c => c.key) as [Resource, ...Resource[]])
export const ruleSchema = z.object({ resource: resourceSchema, readFields: z.array(z.string()).max(60), writeFields: z.array(z.string()).max(60) }).strict()
export const policySchema = z.object({ enabled: z.boolean(), rules: z.array(ruleSchema).max(catalog.length) }).strict()
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}, '日期无效')
export const modelSchema = z.object({ name: z.string().trim().min(1).max(60), modelId: z.string().trim().min(1).max(150),
  baseUrl: z.string().url().max(500), apiKey: z.string().max(500).optional(), enabled: z.boolean(), vision: z.boolean(), tools: z.boolean(),
  allowedUserIds: z.array(z.string().min(1).max(100)).max(1000) }).strict()
export const chatSchema = z.object({ conversationId: z.string().max(100).optional(), modelId: z.string().min(1).max(100), ownerId: z.string().max(100).optional(),
  text: z.string().trim().max(6000), attachmentIds: z.array(z.string().max(100)).max(3).default([]), grants: z.record(z.string(), z.string().max(2000)).default({}) }).strict().refine(x => x.text.length > 0 || x.attachmentIds.length > 0, '请输入消息或上传照片')
export const confirmationSchema = z.object({ decision: z.enum(['confirm', 'reject']), grants: z.record(z.string(), z.string().max(2000)).default({}) }).strict()
export const expenseSchema = z.object({ paymentDate: dateSchema, item: z.string().trim().min(1).max(200), amount: z.number().positive().max(9999999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, '金额最多两位小数'), paymentMethod: z.enum(['cash', 'online']), remark: z.string().max(500).optional() }).strict()
export const customerSchema = z.object({ name: z.string().trim().min(1).max(100), phone: z.string().max(60).optional(), wechat: z.string().max(100).optional(), wechatNickname: z.string().max(100).optional() }).strict()
export const samplePatchSchema = z.object({ blockId: z.string().min(1).max(100), changes: z.record(z.string(), z.union([z.number().finite().min(-1000000000).max(1000000000), z.string().max(500), z.null()])).refine(v => Object.keys(v).length > 0 && Object.keys(v).every(k => sampleWritable.includes(k)), '存在不允许修改的字段') }).strict()

export function projectedRow(row: Record<string, unknown>, fields: string[]) {
  const safe: Record<string, unknown> = {}
  for (const field of fields) {
    const parts = field.split('.')
    if (parts.length === 2) {
      const source = row[parts[0]]
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        const value = (source as Record<string, unknown>)[parts[1]]
        if (value !== undefined && !safe[parts[0]]) safe[parts[0]] = {}
        if (value !== undefined) (safe[parts[0]] as Record<string, unknown>)[parts[1]] = value
      }
    } else if (row[field] !== undefined) safe[field] = row[field]
  }
  return safe
}

export function validateRules(rules: Rule[]) {
  if (new Set(rules.map(r => r.resource)).size !== rules.length) throw new Error('同一菜单不能重复配置')
  for (const rule of rules) {
    const fields = catalog.find(c => c.key === rule.resource)!.fields
    if (rule.readFields.some(k => !fields.some(f => f.key === k)) || rule.writeFields.some(k => !fields.some(f => f.key === k && f.writable) || !rule.readFields.includes(k))) {
      throw new Error('写入字段必须同时允许读取，且只能选择已支持的业务字段')
    }
  }
}
