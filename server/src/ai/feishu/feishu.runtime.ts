import { Injectable, type OnApplicationBootstrap, type BeforeApplicationShutdown, BadRequestException, HttpException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { FeishuService } from './feishu.service'
import { FeishuTransport } from './feishu.transport'
import { encryptAiKey, decryptAiKey } from '../ai.security'
import { publicError, type FeishuInput, type Outbound, type Peer } from './feishu.types'
import type { CurrentUser } from '../../auth/current-user'

@Injectable()
export class FeishuRuntime implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>
  private heartbeat?: ReturnType<typeof setInterval>
  private running?: Promise<void>
  private closing = false
  private readonly workerId = randomUUID()
  private fingerprint = ''
  private connecting?: Promise<void>
  private retryAt = 0
  private ready = false
  constructor(private readonly prisma: PrismaService, private readonly service: FeishuService, private readonly transport: FeishuTransport) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => { if (!this.running && !this.closing) { this.running = this.tick().catch(() => this.transport.error('飞书处理暂停，请检查数据库、迁移和加密配置')).finally(() => { this.running = undefined }) } }, 1000)
    this.timer.unref()
  }
  async beforeApplicationShutdown() {
    this.closing = true
    clearInterval(this.timer); clearInterval(this.heartbeat)
    await this.transport.stop()
    await this.running
    await this.prisma.aiFeishuConfig.updateMany({ where: { workerId: this.workerId }, data: { workerId: null, workerUntil: null } }).catch(() => {})
  }
  status() { return this.transport.snapshot() }
  async test(user: CurrentUser) {
    await this.service.getConfig(user)
    const c = await this.service.settings()
    if (!c.enabled || !c.appSecretCipher) throw new BadRequestException('请保存凭据并启用飞书接入后测试')
    this.fingerprint = ''; this.retryAt = 0
    await this.tickConnection()
    return { ok: this.status().state === 'connected', ...this.status() }
  }
  async ingest(peer: Peer, key: string, input: FeishuInput) {
    const c = await this.service.settings()
    if (!c.enabled || c.appId !== peer.appId) return
    // Dedup is durable, ahead of the SDK acknowledgement. No model/network work here.
    await this.prisma.aiFeishuEvent.createMany({ data: { ...peer, eventKey: key, configRevision: c.revision, inputCipher: encryptAiKey(JSON.stringify(input)) }, skipDuplicates: true })
  }
  private async lease() {
    const claim = await this.prisma.aiFeishuConfig.updateMany({ where: { id: 'global', OR: [{ workerId: this.workerId }, { workerUntil: null }, { workerUntil: { lt: new Date() } }] }, data: { workerId: this.workerId, workerUntil: new Date(Date.now() + 90000) } })
    if (!claim.count) return false
    if (!this.ready) {
      // Ambiguous AI execution is never replayed after a crash. Confirmation remains
      // idempotent in the original transaction and the user can click its card again.
      await this.prisma.aiFeishuEvent.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'READY', lastError: 'INTERRUPTED', outputCipher: encryptAiKey(JSON.stringify([{ type: 'text', content: '上次处理因服务重启中断，未自动重跑。请查询当前数据或重新核对草稿后再确认。' }])) } })
      await this.prisma.aiFeishuEvent.updateMany({ where: { status: 'SENDING' }, data: { status: 'READY' } })
      this.ready = true
      this.heartbeat = setInterval(() => { void this.prisma.aiFeishuConfig.updateMany({ where: { workerId: this.workerId }, data: { workerUntil: new Date(Date.now() + 90000) } }).catch(() => {}) }, 10000)
      this.heartbeat.unref()
    }
    return true
  }
  private async tickConnection() {
    if (this.connecting) return this.connecting
    if (Date.now() < this.retryAt) return
    this.connecting = this.connectOnce().finally(() => { this.connecting = undefined })
    return this.connecting
  }
  private async connectOnce() {
    const c = await this.service.settings(), fingerprint = `${c.revision}:${c.enabled}`
    if (fingerprint === this.fingerprint) return
    this.fingerprint = fingerprint
    if (!c.enabled) { await this.transport.stop(); return }
    try { await this.transport.connect(c.appId, decryptAiKey(c.appSecretCipher), (peer, key, input) => this.ingest(peer, key, input)) }
    catch { this.fingerprint = ''; this.retryAt = Date.now() + 30000; this.transport.error('飞书连接失败，请检查凭据、网络及应用事件配置') }
  }
  async tick() {
    const c = await this.service.settings()
    if (!c.enabled) { await this.transport.stop(); this.fingerprint = ''; return }
    if (!await this.lease()) return
    await this.tickConnection()
    if (this.status().state !== 'connected') return
    // One durable consumer; replies have priority, so the same private chat remains ordered.
    const event = await this.prisma.aiFeishuEvent.findFirst({ where: { status: { in: ['READY', 'PENDING'] } }, orderBy: { sequence: 'asc' } })
    if (!event || event.nextAttemptAt > new Date()) return
    if (event.configRevision !== c.revision || event.appId !== c.appId) { await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: 'FAILED', lastError: 'CONFIG_CHANGED' } }); return }
    const peer: Peer = { appId: event.appId, tenantKey: event.tenantKey, openId: event.openId, chatId: event.chatId }
    if (event.status === 'PENDING') {
      const claim = await this.prisma.aiFeishuEvent.updateMany({ where: { id: event.id, status: 'PENDING' }, data: { status: 'PROCESSING', startedAt: new Date() } })
      if (!claim.count) return
      let outputs: Outbound[]
      try {
        const input = JSON.parse(decryptAiKey(event.inputCipher)) as FeishuInput
        outputs = await this.service.handle(peer, input, input.imageKey ? () => this.transport.image(input.messageId!, input.imageKey!) : undefined)
      } catch (e) { outputs = [{ type: 'text', content: publicError(e) }] }
      await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: 'READY', outputCipher: encryptAiKey(JSON.stringify(outputs)) } })
      return
    }
    const claim = await this.prisma.aiFeishuEvent.updateMany({ where: { id: event.id, status: 'READY' }, data: { status: 'SENDING' } })
    if (!claim.count) return
    try {
      const outputs = JSON.parse(decryptAiKey(event.outputCipher!)) as Outbound[]
      for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i]
        if (output.scope) await this.service.assertScope(output.scope)
        // Stable UUID also deduplicates a response whose delivery acknowledgement was lost.
        await this.transport.send(peer.chatId, output, `${event.id}:${i}`)
      }
      await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: 'SENT', lastError: null } })
    } catch (e) {
      const isAuthority = e instanceof HttpException
      await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: isAuthority || event.attempts >= 5 ? 'FAILED' : 'READY', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** event.attempts)), lastError: isAuthority ? 'AUTHORITY_CHANGED' : 'DELIVERY_FAILED' } })
      this.transport.error(isAuthority ? '权限变化，已阻止发送旧会话结果' : '回复发送失败，正在重试已保存的结果')
    }
  }
}
