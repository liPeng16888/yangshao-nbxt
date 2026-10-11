<template>
  <div class="feishu-settings">
    <div class="feishu-heading"><div><h4>飞书机器人接入</h4><p>两台机器人独立连接、独立绑定。修改或停用一台，不影响另一台。</p></div></div>
    <div class="feishu-bots" role="group" aria-label="选择要配置的机器人">
      <button v-for="bot in bots" :key="bot" type="button" class="feishu-bot" :class="{ active: activeBot === bot }" :aria-pressed="activeBot === bot" @click="selectBot(bot)">
        <span class="feishu-bot-title">{{ botLabel(bot) }}<el-tag :type="stateType(bot)">{{ stateLabel(bot) }}</el-tag></span>
        <span>{{ bot === 'frontend' ? '绑定前端主账号、子账号' : '绑定后台主管理员、子管理员' }}</span>
      </button>
    </div>
    <el-alert :title="`${botLabel(activeBot)}：只管理对应身份的绑定和会话；AI 数据权限、访问验证及写入确认规则不变。`" type="info" :closable="false" show-icon />
    <el-alert v-if="error || connection?.status?.lastError" :title="error || connection?.status?.lastError || ''" type="error" :closable="false" show-icon />
    <div class="feishu-grid">
      <section class="feishu-card"><h4>{{ botLabel(activeBot) }} · 连接配置</h4>
        <el-form label-position="top">
          <el-form-item label="App ID"><el-input v-model="form.appId" :placeholder="`填写${botLabel(activeBot)}的 App ID`" :disabled="mocks || !!savingBot" /></el-form-item>
          <el-form-item :label="connection?.hasSecret ? 'App Secret（留空保留此机器人已保存密钥）' : 'App Secret'"><el-input v-model="form.appSecret" type="password" show-password autocomplete="new-password" :disabled="mocks || !!savingBot" /></el-form-item>
          <el-form-item :label="activeBot === 'frontend' ? '前端网站 HTTPS 根地址' : '后台网站 HTTPS 根地址'"><el-input v-model="form.publicSiteUrl" :placeholder="activeBot === 'frontend' ? 'https://www.ysjc.art' : 'https://ys.ysjc.art'" :disabled="mocks || !!savingBot" /></el-form-item>
          <el-form-item><el-switch v-model="form.enabled" :active-text="`启用${botLabel(activeBot)}`" :disabled="mocks || !!savingBot" /></el-form-item>
        </el-form>
        <div class="feishu-actions"><el-button type="primary" :disabled="mocks || !!savingBot" :loading="savingBot === activeBot" @click="save">保存连接配置</el-button><el-button :disabled="mocks || !connection?.enabled || !!savingBot" :loading="testingBot === activeBot" @click="test">测试连接</el-button></div>
        <p class="feishu-help">两台机器人须使用不同的 App ID。更换本台 App ID 只撤销本台绑定；仅修改网址或同一应用的密钥不会解绑。不要填写 /admin 或 /api 路径。</p>
        <div v-if="connection?.status" class="feishu-times">最近接收：{{ time(connection.status.lastReceivedAt) }}<br>最近发送：{{ time(connection.status.lastSentAt) }}</div>
      </section>
      <section class="feishu-card"><h4>接入步骤</h4><ol>
        <li>在飞书开放平台分别创建前端、后台企业自建应用，开启机器人。</li>
        <li>为当前应用开启单聊读取权限 <code>im:message.p2p_msg:readonly</code>、消息发送权限和图片资源权限。</li>
        <li>在左侧保存当前机器人的 App ID、App Secret 和对应网站根地址，启用连接。</li>
        <li>在飞书选择长连接，订阅 <code>im.message.receive_v1</code> 和 <code>card.action.trigger</code>，发布应用并设置可用人员。</li>
        <li>在下方选择对应网站账号和默认模型，生成绑定指令。</li>
        <li>本人私聊<strong>当前机器人</strong>，发送完整的“绑定 随机码”，登录指定网站账号确认绑定。</li>
      </ol><a href="https://open.feishu.cn/app" target="_blank" rel="noopener noreferrer">打开飞书开放平台 ↗</a><p class="feishu-help">绑定后发送“状态”“切换身份”“切换账号”“新建对话”或“访问验证”。私聊支持文字与图片；写入须核对卡片并确认。请勿在聊天中发送密码。</p></section>
    </div>
    <section class="feishu-card feishu-invite"><h4>{{ botLabel(activeBot) }} · 邀请账号绑定</h4>
      <div class="feishu-invite-form"><el-select v-model="inviteUser" filterable :placeholder="activeBot === 'frontend' ? '选择前端网站账号' : '选择后台网站账号'" :disabled="mocks || !!savingBot" @change="inviteModel = ''"><el-option v-for="a in accountsForBot" :key="a.id" :value="a.id" :label="accountLabel(a)" /></el-select><el-select v-model="inviteModel" filterable placeholder="选择此账号的默认模型" :disabled="mocks || !inviteUser || !!savingBot"><el-option v-for="m in modelsFor(inviteUser)" :key="m.id" :value="m.id" :label="`${m.name}${m.vision ? ' · 图片' : ''}`" /></el-select><el-button type="primary" :disabled="mocks || !connection?.enabled || !inviteUser || !inviteModel || !!savingBot" :loading="savingBot === activeBot" @click="invite">生成绑定指令</el-button></div>
      <p class="feishu-help">请把指令发送给{{ botLabel(activeBot) }}，不能发送给另一台。每个网站账号只绑定一人；同一飞书使用者可绑定多个对应身份。邀请有效期 10 分钟。</p>
      <div v-if="invitation && invitation.bot === activeBot" class="feishu-instruction"><el-input :model-value="invitation.command" readonly /><el-button @click="copy">复制完整指令</el-button><span>有效至 {{ time(invitation.expiresAt) }}</span></div>
    </section>
    <div class="feishu-heading"><h4>{{ botLabel(activeBot) }} · 账号绑定</h4><el-button :disabled="mocks || !!savingBot" :loading="loading" @click="load(activeBot)">刷新状态与绑定</el-button></div>
    <el-table :data="bindings" empty-text="当前机器人暂无绑定，请先生成绑定指令"><el-table-column label="网站账号" min-width="190"><template #default="{ row }">{{ row.user ? accountLabel(row.user) : '账号已不存在' }}</template></el-table-column><el-table-column prop="openId" label="飞书使用者 ID" min-width="200" /><el-table-column label="默认模型" min-width="210"><template #default="{ row }"><el-select v-model="row.defaultModelId" :disabled="mocks || !!row.revokedAt || !!savingBot"><el-option v-for="m in modelsFor(row.userId)" :key="m.id" :value="m.id" :label="m.name" /></el-select></template></el-table-column><el-table-column label="启用" width="90"><template #default="{ row }"><el-switch v-model="row.enabled" :disabled="mocks || !!row.revokedAt || !!savingBot" /></template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }">{{ row.revokedAt ? '已解绑' : row.user?.disabled || row.user?.deletedAt ? '账号停用' : row.enabled ? '已绑定' : '已停用' }}</template></el-table-column><el-table-column label="操作" width="150"><template #default="{ row }"><el-button link type="primary" :disabled="mocks || !!row.revokedAt || !!savingBot" @click="update(row)">保存</el-button><el-button link type="danger" :disabled="mocks || !!row.revokedAt || !!savingBot" @click="unbind(row)">解绑</el-button></template></el-table-column></el-table>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { aiClient } from '../../../shared/ai/client'
import type { AiAccount, AiConfig, FeishuBinding, FeishuBot, FeishuConfig } from '../../../shared/ai/types'
const props = defineProps<{ config: AiConfig | null; mocks: boolean }>()
const request = aiClient('admin', import.meta.env.VITE_ADMIN_API_BASE_URL || '/api')
const bots: FeishuBot[] = ['frontend', 'admin'], activeBot = ref<FeishuBot>('frontend')
const connections = reactive<Partial<Record<FeishuBot, FeishuConfig>>>({})
const allBindings = reactive<Record<FeishuBot, FeishuBinding[]>>({ frontend: [], admin: [] })
const emptyForm = () => ({ appId: '', appSecret: '', publicSiteUrl: '', enabled: false })
const forms = reactive({ frontend: emptyForm(), admin: emptyForm() })
const connection = computed(() => connections[activeBot.value]), form = computed(() => forms[activeBot.value]), bindings = computed(() => allBindings[activeBot.value])
const error = ref(''), loading = ref(false), savingBot = ref<FeishuBot | null>(null), testingBot = ref<FeishuBot | null>(null), inviteUser = ref(''), inviteModel = ref('')
const invitation = ref<{ bot: FeishuBot; command: string; expiresAt: string } | null>(null)
const botLabel = (bot: FeishuBot) => bot === 'frontend' ? '前端机器人' : '后台机器人'
const endpoint = (bot: FeishuBot) => `/admin/ai/feishu/configs/${bot}`
const state = (bot: FeishuBot) => connections[bot]?.status?.state || 'disabled'
const stateLabel = (bot: FeishuBot) => ({ disabled: '未连接', connecting: '连接中', connected: '已连接', reconnecting: '重连中', error: '连接异常' } as Record<string, string>)[state(bot)] || state(bot)
const stateType = (bot: FeishuBot) => state(bot) === 'connected' ? 'success' : state(bot) === 'error' ? 'danger' : 'info'
const accountsForBot = computed(() => (props.config?.accounts || []).filter(a => (a.role.includes('ADMIN') ? 'admin' : 'frontend') === activeBot.value))
const modelsFor = (id: string) => (props.config?.models || []).filter(m => m.enabled && m.tools && (!m.allowedUserIds.length || m.allowedUserIds.includes(id)))
const accountLabel = (a: AiAccount) => `${a.username}（${a.account} · ${a.role.includes('ADMIN') ? '后台' : a.role === 'FRONTEND_SUB_USER' ? '前台子账号' : '前台主账号'}）`
const time = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'
function selectBot(bot: FeishuBot) { activeBot.value = bot; inviteUser.value = ''; inviteModel.value = ''; error.value = '' }
async function load(bot: FeishuBot, syncForm = false) {
  if (props.mocks) return
  loading.value = true
  try {
    const [c, b] = await Promise.all([request<FeishuConfig>(endpoint(bot)), request<FeishuBinding[]>(`${endpoint(bot)}/bindings`)])
    connections[bot] = c; allBindings[bot] = b
    if (syncForm) Object.assign(forms[bot], { appId: c.appId, publicSiteUrl: c.publicSiteUrl, enabled: c.enabled, appSecret: '' })
  } catch (e) { error.value = (e as Error).message } finally { loading.value = false }
}
async function perform(bot: FeishuBot, fn: () => Promise<void>) { if (props.mocks || savingBot.value) return; savingBot.value = bot; error.value = ''; try { await fn() } catch (e) { error.value = (e as Error).message } finally { savingBot.value = null } }
async function save() {
  const bot = activeBot.value, body = { ...forms[bot] }
  if (props.mocks || !connections[bot] || savingBot.value) return
  if (connections[bot]?.appId && body.appId.trim() !== connections[bot]?.appId) { try { await ElMessageBox.confirm(`更换${botLabel(bot)}的 App ID 会撤销本台已有绑定，需重新邀请；另一台机器人不受影响。`, '更换飞书应用') } catch { return } }
  await perform(bot, async () => { await request(endpoint(bot), { method: 'PUT', body }); forms[bot].appSecret = ''; if (invitation.value?.bot === bot) invitation.value = null; await load(bot, true); ElMessage.success(`${botLabel(bot)}配置已保存`) })
}
async function test() { const bot = activeBot.value; if (props.mocks || testingBot.value) return; testingBot.value = bot; error.value = ''; try { const result = await request<{ ok: boolean }>(`${endpoint(bot)}/test`, { method: 'POST' }); if (result.ok) ElMessage.success(`${botLabel(bot)}长连接成功，请完成事件订阅并发布应用`); else error.value = '尚未建立连接，请核对当前机器人的凭据与网络'; await load(bot) } catch (e) { error.value = (e as Error).message } finally { testingBot.value = null } }
function invite() { const bot = activeBot.value, body = { userId: inviteUser.value, defaultModelId: inviteModel.value }; return perform(bot, async () => { invitation.value = { ...await request<{ command: string; expiresAt: string }>(`${endpoint(bot)}/invitations`, { method: 'POST', body }), bot } }) }
function update(row: FeishuBinding) { const bot = activeBot.value; return perform(bot, async () => { await request(`${endpoint(bot)}/bindings/${row.id}`, { method: 'PATCH', body: { enabled: row.enabled, defaultModelId: row.defaultModelId } }); await load(bot); ElMessage.success('绑定设置已保存，本台旧飞书会话已失效') }) }
async function unbind(row: FeishuBinding) { const bot = activeBot.value; try { await ElMessageBox.confirm('此身份及旧确认卡片将失效，其他绑定和另一台机器人不受影响，是否解绑？', '解除账号绑定') } catch { return }; await perform(bot, async () => { await request(`${endpoint(bot)}/bindings/${row.id}`, { method: 'DELETE' }); await load(bot) }) }
async function copy() { if (!invitation.value) return; try { await navigator.clipboard.writeText(invitation.value.command); ElMessage.success(`已复制完整指令，请私聊${botLabel(invitation.value.bot)}发送`) } catch { ElMessage.info('请选中完整指令复制，包括“绑定”与后面的随机码') } }
let timer: ReturnType<typeof setInterval> | undefined, polling = false
onMounted(() => {
  void Promise.all(bots.map(bot => load(bot, true)))
  if (!props.mocks) timer = setInterval(async () => {
    if (polling) return
    polling = true
    try { await Promise.all(bots.map(async bot => { connections[bot] = await request<FeishuConfig>(endpoint(bot)) })) } catch {} finally { polling = false }
  }, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>
<style scoped>
.feishu-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:12px 0}.feishu-heading h4{margin:0;font-size:17px}.feishu-heading p,.feishu-help,.feishu-times{color:var(--ui-text-muted);font-size:13px;line-height:1.8}.feishu-bots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:20px 0}.feishu-bot{font:inherit;display:flex;flex-direction:column;gap:12px;text-align:left;padding:18px 20px;border:1px solid var(--ui-border,#e1e7ee);border-radius:12px;background:var(--ui-surface,#fff);color:var(--ui-text-muted);cursor:pointer}.feishu-bot.active{border-color:var(--ui-accent,#536f83);background:var(--ui-accent-soft,#eef3f5)}.feishu-bot:focus-visible{outline:2px solid var(--ui-accent,#536f83);outline-offset:3px}.feishu-bot-title{display:flex;justify-content:space-between;align-items:center;font-weight:600;color:var(--ui-text,#26323e)}.feishu-settings>.el-alert{margin:12px 0}.feishu-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;margin:20px 0}.feishu-card{border:1px solid var(--ui-border,#e1e7ee);border-radius:12px;padding:20px}.feishu-card h4{margin:0 0 18px}.feishu-card ol{padding-left:22px;line-height:1.9;font-size:14px}.feishu-card li{margin-bottom:10px}.feishu-card a{font-size:14px;color:var(--ui-accent,#536f83)}.feishu-actions,.feishu-instruction{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.feishu-invite{margin-bottom:24px}.feishu-invite-form{display:flex;gap:12px;flex-wrap:wrap}.feishu-invite-form .el-select{width:280px}.feishu-instruction .el-input{width:min(430px,100%)}.feishu-instruction span{font-size:12px;color:var(--ui-text-muted)}code{font-size:12px;overflow-wrap:anywhere}@media(max-width:900px){.feishu-grid{grid-template-columns:1fr}}@media(max-width:520px){.feishu-bots{grid-template-columns:1fr}.feishu-bot{padding:14px}}
</style>
