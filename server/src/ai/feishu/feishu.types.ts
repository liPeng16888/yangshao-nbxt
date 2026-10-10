import type { Prisma } from '@prisma/client'
import { BadRequestException, HttpException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'

export type Peer = { appId: string; tenantKey: string; openId: string; chatId: string }
export type FeishuInput = { kind: 'message' | 'card'; text?: string; messageId?: string; imageKey?: string; actionToken?: string }
export type Scope = { sessionId: string; revision: number; bindingId: string; bindingRevision: number; configRevision: number; hash: string }
export type Outbound = { type: 'text' | 'card'; content: string | Prisma.InputJsonObject; scope?: Scope }
export const opaque = () => randomBytes(24).toString('base64url')
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const minutes = (n: number) => new Date(Date.now() + n * 60000)
export function siteUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new BadRequestException('请输入网站 HTTPS 地址') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new BadRequestException('网站地址须为 HTTPS 根地址，例如 https://lab.example.com')
  return url.origin
}
export function publicError(error: unknown) {
  if (error instanceof HttpException) {
    const r = error.getResponse() as string | { message?: string }
    return typeof r === 'string' ? r : typeof r.message === 'string' ? r.message : '操作未完成，请核对当前账号和权限'
  }
  return '操作未完成，请检查服务配置或稍后重试；未执行新的未经确认的数据写入'
}
export function markdown(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  return text.replace(/[\\`*_{}\[\]()<>#!|]/g, '\\$&')
}
export function card(title: string, content: string, buttons: { label: string; token: string }[] = []): Outbound {
  return { type: 'card', content: { schema: '2.0', config: { update_multi: true }, header: { title: { tag: 'plain_text', content: title } }, body: { elements: [
    { tag: 'markdown', content },
    ...buttons.map(b => ({ tag: 'column_set', columns: [{ tag: 'column', width: 'weighted', weight: 1, elements: [{ tag: 'button', text: { tag: 'plain_text', content: b.label }, type: 'default', behaviors: [{ type: 'callback', value: { token: b.token } }] }] }] }))
  ] } } }
}
