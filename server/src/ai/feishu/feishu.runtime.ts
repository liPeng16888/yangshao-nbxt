import { Injectable, type OnApplicationBootstrap, type BeforeApplicationShutdown, BadRequestException, HttpException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { FeishuService } from './feishu.service'
import { FeishuTransport, FeishuTransportFactory } from './feishu.transport'
import { encryptAiKey, decryptAiKey } from '../ai.security'
import { feishuBot, publicError, type FeishuBot, type FeishuInput, type Outbound, type Peer } from './feishu.types'
import type { CurrentUser } from '../../auth/current-user'

type BotWorker = { transport: FeishuTransport; fingerprint: string; retryAt: number; ready: boolean; running?: Promise<void>; heartbeat?: ReturnType<typeof setInterval>; connecting?: Promise<void> }
const bots: FeishuBot[] = ['frontend', 'admin']

@Injectable()
export class FeishuRuntime implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>
  private closing = false
  private readonly workerId = randomUUID()
  private readonly workers: Record<FeishuBot, BotWorker>
  constructor(private readonly prisma: PrismaService, private readonly service: FeishuService, factory: FeishuTransportFactory) {
    const create = (): BotWorker => ({ transport: factory.create(), fingerprint: '', retryAt: 0, ready: false })
    this.workers = { frontend: create(), admin: create() }
  }
  onApplicationBootstrap() {
    this.timer = setInterval(() => { for (const bot of bots) void this.run(bot) }, 1000)
    this.timer.unref()
  }
  private run(bot: FeishuBot) {
    const w = this.workers[bot]
    if (this.closing) return Promise.resolve()
    // One robot's failed handshake must not block the other.
    if (!w.running) w.running = this.tickOnce(bot).catch(() => w.transport.error('飞书处理暂停，请检查数据库、迁移和加密配置')).finally(() => { w.running = undefined })
    return w.running
  }
  async beforeApplicationShutdown() {
    this.closing = true
    clearInterval(this.timer)
    for (const bot of bots) clearInterval(this.workers[bot].heartbeat)
    await Promise.all(bots.map(bot => this.workers[bot].transport.stop()))
    await Promise.all(bots.map(bot => this.workers[bot].running))
    await Promise.all(bots.map(bot => this.workers[bot].transport.stop()))
    for (const bot of bots) clearInterval(this.workers[bot].heartbeat)
    await this.prisma.aiFeishuConfig.updateMany({ where: { workerId: this.workerId }, data: { workerId: null, workerUntil: null } }).catch(() => {})
  }
  status(bot: FeishuBot) { return this.workers[feishuBot(bot)].transport.snapshot() }
  async test(user: CurrentUser, bot: FeishuBot) {
    await this.service.getConfig(user, bot)
    const c = await this.service.settings(bot)
    if (!c.enabled || !c.appSecretCipher) throw new BadRequestException('请保存此机器人的凭据并启用接入后测试')
    const w = this.workers[bot]
    w.fingerprint = ''; w.retryAt = 0
    await this.run(bot)
    return { ok: this.status(bot).state === 'connected', ...this.status(bot) }
  }
  async ingest(peer: Peer, key: string, input: FeishuInput) {
    const c = await this.service.settings(peer.configId)
    if (!c.enabled || c.appId !== peer.appId) return
    await this.prisma.aiFeishuEvent.createMany({ data: { ...peer, eventKey: key, configRevision: c.revision, inputCipher: encryptAiKey(JSON.stringify(input)) }, skipDuplicates: true })
  }
  private async stop(bot: FeishuBot) {
    const w = this.workers[bot]
    await w.transport.stop(); w.fingerprint = ''; w.ready = false
    clearInterval(w.heartbeat); w.heartbeat = undefined
    await this.prisma.aiFeishuConfig.updateMany({ where: { id: bot, workerId: this.workerId }, data: { workerId: null, workerUntil: null } })
  }
  private async lease(bot: FeishuBot) {
    const w = this.workers[bot]
    const claim = await this.prisma.aiFeishuConfig.updateMany({ where: { id: bot, OR: [{ workerId: this.workerId }, { workerUntil: null }, { workerUntil: { lt: new Date() } }] }, data: { workerId: this.workerId, workerUntil: new Date(Date.now() + 90000) } })
    if (!claim.count) { await this.stop(bot); return false }
    if (!w.ready) {
      await this.prisma.aiFeishuEvent.updateMany({ where: { configId: bot, status: 'PROCESSING' }, data: { status: 'READY', lastError: 'INTERRUPTED', outputCipher: encryptAiKey(JSON.stringify([{ type: 'text', content: '上次处理因服务重启中断，未自动重跑。请查询当前数据或重新核对草稿后再确认。' }])) } })
      await this.prisma.aiFeishuEvent.updateMany({ where: { configId: bot, status: 'SENDING' }, data: { status: 'READY' } })
      w.ready = true
      w.heartbeat = setInterval(() => { void this.prisma.aiFeishuConfig.updateMany({ where: { id: bot, workerId: this.workerId }, data: { workerUntil: new Date(Date.now() + 90000) } }).catch(() => {}) }, 10000)
      w.heartbeat.unref()
    }
    return true
  }
  private async connect(bot: FeishuBot) {
    const w = this.workers[bot]
    if (w.connecting) return w.connecting
    if (Date.now() < w.retryAt) return
    w.connecting = (async () => {
      const c = await this.service.settings(bot), fingerprint = `${c.revision}:${c.enabled}`
      if (fingerprint === w.fingerprint || this.closing) return
      w.fingerprint = fingerprint
      if (!c.enabled) { await this.stop(bot); return }
      try { await w.transport.connect(bot, c.appId, decryptAiKey(c.appSecretCipher), (peer, key, input) => this.ingest(peer, key, input)) }
      catch { w.fingerprint = ''; w.retryAt = Date.now() + 30000; w.transport.error('飞书连接失败，请检查此机器人的凭据、网络及应用事件配置') }
    })().finally(() => { w.connecting = undefined })
    return w.connecting
  }
  // Isolated queue verification and scheduled calls share the same mutex.
  tick(bot: FeishuBot = 'frontend') { return this.run(feishuBot(bot)) }
  private async tickOnce(bot: FeishuBot) {
    const w = this.workers[bot]
    let c = await this.service.settings(bot)
    if (!c.enabled) { await this.stop(bot); return }
    if (!await this.lease(bot)) return
    await this.connect(bot)
    if (this.closing || this.status(bot).state !== 'connected') return
    c = await this.service.settings(bot)
    if (!c.enabled || w.fingerprint !== `${c.revision}:${c.enabled}`) return
    const event = await this.prisma.aiFeishuEvent.findFirst({ where: { configId: bot, status: { in: ['READY', 'PENDING'] } }, orderBy: { sequence: 'asc' } })
    if (!event || event.nextAttemptAt > new Date()) return
    if (event.configRevision !== c.revision || event.appId !== c.appId) { await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: 'FAILED', lastError: 'CONFIG_CHANGED' } }); return }
    const peer: Peer = { configId: bot, appId: event.appId, tenantKey: event.tenantKey, openId: event.openId, chatId: event.chatId }
    if (event.status === 'PENDING') {
      const claim = await this.prisma.aiFeishuEvent.updateMany({ where: { id: event.id, status: 'PENDING' }, data: { status: 'PROCESSING', startedAt: new Date() } })
      if (!claim.count) return
      let outputs: Outbound[]
      try {
        const input = JSON.parse(decryptAiKey(event.inputCipher)) as FeishuInput
        outputs = await this.service.handle(peer, input, input.imageKey ? () => w.transport.image(input.messageId!, input.imageKey!) : undefined)
      } catch (e) { outputs = [{ type: 'text', content: publicError(e) }] }
      await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: 'READY', outputCipher: encryptAiKey(JSON.stringify(outputs)) } })
      return
    }
    const claim = await this.prisma.aiFeishuEvent.updateMany({ where: { id: event.id, status: 'READY' }, data: { status: 'SENDING' } })
    if (!claim.count) return
    try {
      const latest = await this.service.settings(bot)
      if (!latest.enabled || latest.revision !== event.configRevision || latest.appId !== event.appId) throw new BadRequestException('机器人配置已变化')
      const outputs = JSON.parse(decryptAiKey(event.outputCipher!)) as Outbound[]
      for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i]
        if (output.scope) await this.service.assertScope(output.scope)
        await w.transport.send(peer.chatId, output, `${event.id}:${i}`)
      }
      await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: 'SENT', lastError: null } })
    } catch (e) {
      const isAuthority = e instanceof HttpException
      await this.prisma.aiFeishuEvent.update({ where: { id: event.id }, data: { status: isAuthority || event.attempts >= 5 ? 'FAILED' : 'READY', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** event.attempts)), lastError: isAuthority ? 'AUTHORITY_CHANGED' : 'DELIVERY_FAILED' } })
      w.transport.error(isAuthority ? '权限或机器人配置变化，已阻止发送旧会话结果' : '回复发送失败，正在重试已保存的结果')
    }
  }
}
