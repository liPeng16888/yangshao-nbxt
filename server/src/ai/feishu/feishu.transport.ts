import { Injectable } from '@nestjs/common'
import * as lark from '@larksuiteoapi/node-sdk'
import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { FeishuInput, Outbound, Peer } from './feishu.types'
import { digest } from './feishu.types'

export type Ingest = (peer: Peer, key: string, input: FeishuInput) => Promise<void>

@Injectable()
export class FeishuTransport {
  constructor(private readonly prisma: PrismaService) {}
  private client?: lark.Client
  private ws?: lark.WSClient
  private generation = 0
  private status = { state: 'disabled', lastError: '', connectedAt: null as string | null, lastReceivedAt: null as string | null, lastSentAt: null as string | null }
  snapshot() {
    const live = this.ws?.getConnectionStatus().state
    return { ...this.status, state: live === 'failed' ? 'error' : live && live !== 'idle' ? live : this.status.state }
  }
  error(message: string) { this.status.lastError = message }
  async stop() {
    ++this.generation
    this.ws?.close({ force: true })
    this.ws = undefined; this.client = undefined
    this.status.state = 'disabled'; this.status.connectedAt = null
  }
  async connect(appId: string, appSecret: string, ingest: Ingest) {
    await this.stop()
    const generation = this.generation
    this.status.state = 'connecting'; this.status.lastError = ''
    // SDK logs can contain headers/credentials. Never forward raw SDK logs.
    const logger = {
      trace: (..._args: unknown[]) => {}, debug: (..._args: unknown[]) => {}, info: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => { if (generation === this.generation) this.status.state = 'reconnecting' },
      error: (..._args: unknown[]) => { if (generation === this.generation) { this.status.state = 'error'; this.status.lastError = '飞书连接失败，请检查应用凭据和网络' } }
    }
    let resolveReady: () => void = () => {}, rejectReady: () => void = () => {}
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = () => reject(new Error('FEISHU_HANDSHAKE_FAILED')) })
    const timeout = setTimeout(rejectReady, 15000)
    const client = new lark.Client({ appId, appSecret, logger }), ws = new lark.WSClient({ appId, appSecret, logger, handshakeTimeoutMs: 15000,
      onReady: () => { if (generation === this.generation) { this.status.state = 'connected'; this.status.connectedAt = new Date().toISOString(); resolveReady() } },
      onError: rejectReady, onReconnecting: () => { this.status.state = 'reconnecting' }, onReconnected: () => { this.status.state = 'connected' }
    })
    this.client = client; this.ws = ws
    const deliver: Ingest = async (peer, key, input) => {
      if (generation !== this.generation) return
      await ingest(peer, key, input)
      this.status.lastReceivedAt = new Date().toISOString()
      this.status.state = 'connected'
    }
    const dispatcher = new lark.EventDispatcher({ logger }).register({
      'im.message.receive_v1': async (data: any) => {
        if (data.message?.chat_type !== 'p2p' || data.sender?.sender_type !== 'user') return
        const openId = data.sender?.sender_id?.open_id, tenantKey = data.sender?.tenant_key, chatId = data.message?.chat_id, messageId = data.message?.message_id
        if (!openId || !tenantKey || !chatId || !messageId) return
        let content: { text?: string; image_key?: string } = {}
        try { content = JSON.parse(data.message.content) } catch {}
        await deliver({ appId, tenantKey, openId, chatId }, `message:${messageId}`, { kind: 'message', messageId, text: data.message.message_type === 'text' ? content.text || '' : '', imageKey: data.message.message_type === 'image' ? content.image_key : undefined })
      },
      'card.action.trigger': async (data: any) => {
        const openId = data.operator?.open_id, chatId = data.context?.open_chat_id, token = data.action?.value?.token
        if (!openId || !chatId || typeof token !== 'string') return { toast: { type: 'error', content: '卡片身份信息不完整' } }
        const a = await this.prisma.aiFeishuAction.findUnique({ where: { tokenHash: digest(token) } })
        const session = a ? await this.prisma.aiFeishuSession.findUnique({ where: { id: a.sessionId } }) : null
        if (!session || session.appId !== appId || session.openId !== openId || session.chatId !== chatId) return { toast: { type: 'error', content: '卡片不属于当前身份或会话' } }
        const tenantKey = session.tenantKey
        // A forwarded card's operator/chat will not match its saved action session.
        const key = `card:${data.token || digest(JSON.stringify({ openId, chatId, token }))}`
        await deliver({ appId, tenantKey, openId, chatId }, key, { kind: 'card', actionToken: token })
        return { toast: { type: 'info', content: '已收到，处理结果将发送到当前会话' } }
      }
    })
    try {
      await ws.start({ eventDispatcher: dispatcher })
      await ready
      clearTimeout(timeout)
    } catch {
      clearTimeout(timeout); ws.close({ force: true })
      if (generation === this.generation) { this.status.state = 'error'; this.status.lastError = '飞书连接失败，请检查 App ID、App Secret 和外网连接' }
      throw new BadRequestException('飞书连接测试失败，请检查应用凭据和网络')
    }
  }
  async send(chatId: string, output: Outbound, idempotencyKey: string) {
    if (!this.client) throw new Error('FEISHU_DISCONNECTED')
    const response = await this.client.im.message.create({ params: { receive_id_type: 'chat_id' }, data: { receive_id: chatId, msg_type: output.type === 'card' ? 'interactive' : 'text', content: output.type === 'card' ? JSON.stringify(output.content) : JSON.stringify({ text: output.content }), uuid: digest(idempotencyKey).slice(0, 32) } })
    if (response.code !== 0) throw new Error('FEISHU_SEND_FAILED')
    this.status.lastSentAt = new Date().toISOString(); this.status.lastError = ''
  }
  async image(messageId: string, imageKey: string) {
    if (!this.client) throw new BadRequestException('飞书连接不可用')
    const response = await this.client.im.messageResource.get({ path: { message_id: messageId, file_key: imageKey }, params: { type: 'image' } })
    const stream = response.getReadableStream(), chunks: Buffer[] = []
    let size = 0
    const deadline = setTimeout(() => stream.destroy(new BadRequestException('图片下载超时，请重新发送')), 20000)
    deadline.unref()
    try {
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk); size += bytes.length
      if (size > 5 * 1024 * 1024) { stream.destroy(); throw new BadRequestException('图片不能超过 5MB') }
      chunks.push(bytes)
    }
    } finally { clearTimeout(deadline) }
    const bytes = Buffer.concat(chunks)
    const mime = bytes[0] === 0xff ? 'image/jpeg' : bytes[0] === 137 ? 'image/png' : 'image/webp'
    return { bytes, mime }
  }
}
