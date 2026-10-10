<template>
  <div class="feishu-settings">
    <div class="feishu-heading"><div><h4>飞书机器人接入</h4><p>私聊机器人，使用已绑定网站账号的模型与业务权限。</p></div><el-tag :type="state === 'connected' ? 'success' : state === 'error' ? 'danger' : 'info'">{{ stateLabel }}</el-tag></div>
    <el-alert v-if="error || connection?.status?.lastError" :title="error || connection?.status?.lastError || ''" type="error" :closable="false" show-icon />
    <div class="feishu-grid">
      <section class="feishu-card"><h4>连接配置</h4><el-form label-position="top"><el-form-item label="App ID"><el-input v-model="form.appId" placeholder="飞书企业自建应用的 App ID" :disabled="mocks" /></el-form-item><el-form-item :label="connection?.hasSecret ? 'App Secret（留空保留已保存密钥）' : 'App Secret'"><el-input v-model="form.appSecret" type="password" show-password autocomplete="new-password" :disabled="mocks" /></el-form-item><el-form-item label="网站 HTTPS 地址"><el-input v-model="form.publicSiteUrl" placeholder="https://lab.example.com" :disabled="mocks" /></el-form-item><el-form-item><el-switch v-model="form.enabled" active-text="启用飞书接入" :disabled="mocks" /></el-form-item></el-form><div class="feishu-actions"><el-button type="primary" :disabled="mocks" :loading="saving" @click="save">保存连接配置</el-button><el-button :disabled="mocks || !connection?.enabled" :loading="testing" @click="test">测试连接</el-button></div><p class="feishu-help">更换 App ID 后需要重新绑定账号。停用接入会使旧飞书会话与卡片失效。</p><div v-if="connection?.status" class="feishu-times">最近接收：{{ time(connection.status.lastReceivedAt) }}<br>最近发送：{{ time(connection.status.lastSentAt) }}</div></section>
      <section class="feishu-card"><h4>接入步骤</h4><ol><li>在飞书开放平台创建企业自建应用，开启机器人。</li><li>申请消息权限 <code>im:message</code> 和图片权限 <code>im:resource</code>。</li><li>在左侧保存凭据并启用连接。</li><li>在飞书选择长连接，订阅 <code>im.message.receive_v1</code> 和 <code>card.action.trigger</code>，发布应用并设置可用人员。</li><li>在下方选择网站账号和默认模型，生成绑定指令。</li><li>本人私聊机器人发送指令，登录指定网站账号确认绑定。</li></ol><a href="https://open.feishu.cn/app" target="_blank" rel="noopener noreferrer">打开飞书开放平台 ↗</a><p class="feishu-help">绑定后发送“状态”“切换身份”“切换账号”“新建对话”或“访问验证”。首次支持私聊文字与图片；写入需核对卡片并确认。</p></section>
    </div>
    <section class="feishu-card feishu-invite"><h4>邀请账号绑定</h4><div class="feishu-invite-form"><el-select v-model="inviteUser" filterable placeholder="选择网站账号" :disabled="mocks" @change="inviteModel = ''"><el-option v-for="a in config?.accounts || []" :key="a.id" :value="a.id" :label="accountLabel(a)" /></el-select><el-select v-model="inviteModel" filterable placeholder="选择此账号的默认模型" :disabled="mocks || !inviteUser"><el-option v-for="m in modelsFor(inviteUser)" :key="m.id" :value="m.id" :label="`${m.name}${m.vision ? ' · 图片' : ''}`" /></el-select><el-button type="primary" :disabled="mocks || !connection?.enabled || !inviteUser || !inviteModel" :loading="saving" @click="invite">生成绑定指令</el-button></div><p class="feishu-help">一位飞书使用者可以绑定多个网站身份；每个网站账号只绑定一人。邀请有效期 10 分钟，生成新邀请会使旧邀请失效。</p><div v-if="invitation" class="feishu-instruction"><el-input :model-value="invitation.command" readonly /><el-button @click="copy">复制指令</el-button><span>有效至 {{ time(invitation.expiresAt) }}</span></div></section>
    <div class="feishu-heading"><h4>账号绑定</h4><el-button :disabled="mocks" :loading="loading" @click="load">刷新状态与绑定</el-button></div>
    <el-table :data="bindings" empty-text="暂无绑定，请先生成绑定指令"><el-table-column label="网站账号" min-width="190"><template #default="{ row }">{{ row.user ? accountLabel(row.user) : '账号已不存在' }}</template></el-table-column><el-table-column prop="openId" label="飞书使用者 ID" min-width="200" /><el-table-column label="默认模型" min-width="210"><template #default="{ row }"><el-select v-model="row.defaultModelId" :disabled="mocks || !!row.revokedAt"><el-option v-for="m in modelsFor(row.userId)" :key="m.id" :value="m.id" :label="m.name" /></el-select></template></el-table-column><el-table-column label="启用" width="90"><template #default="{ row }"><el-switch v-model="row.enabled" :disabled="mocks || !!row.revokedAt" /></template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }">{{ row.revokedAt ? '已解绑' : row.user?.disabled || row.user?.deletedAt ? '账号停用' : row.enabled ? '已绑定' : '已停用' }}</template></el-table-column><el-table-column label="操作" width="150"><template #default="{ row }"><el-button link type="primary" :disabled="mocks || !!row.revokedAt || saving" @click="update(row)">保存</el-button><el-button link type="danger" :disabled="mocks || !!row.revokedAt || saving" @click="unbind(row)">解绑</el-button></template></el-table-column></el-table>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { aiClient } from '../../../shared/ai/client'
import type { AiAccount, AiConfig, FeishuBinding, FeishuConfig } from '../../../shared/ai/types'
const props = defineProps<{ config: AiConfig | null; mocks: boolean }>()
const request = aiClient('admin', import.meta.env.VITE_ADMIN_API_BASE_URL || '/api')
const connection = ref<FeishuConfig | null>(null), bindings = ref<FeishuBinding[]>([]), error = ref(''), loading = ref(false), saving = ref(false), testing = ref(false)
const form = reactive({ appId: '', appSecret: '', publicSiteUrl: '', enabled: false }), inviteUser = ref(''), inviteModel = ref('')
const invitation = ref<{ command: string; expiresAt: string } | null>(null)
const state = computed(() => connection.value?.status?.state || 'disabled')
const stateLabel = computed(() => ({ disabled: '未连接', connecting: '连接中', connected: '已连接', reconnecting: '重连中', error: '连接异常' } as Record<string, string>)[state.value] || state.value)
const modelsFor = (id: string) => (props.config?.models || []).filter(m => m.enabled && m.tools && (!m.allowedUserIds.length || m.allowedUserIds.includes(id)))
const accountLabel = (a: AiAccount) => `${a.username}（${a.account} · ${a.role.includes('ADMIN') ? '后台' : a.role === 'FRONTEND_SUB_USER' ? '前台子账号' : '前台主账号'}）`
const time = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'
async function load() {
  if (props.mocks) return
  loading.value = true; error.value = ''
  try { const [c, b] = await Promise.all([request<FeishuConfig>('/admin/ai/feishu/config'), request<FeishuBinding[]>('/admin/ai/feishu/bindings')]); connection.value = c; bindings.value = b; Object.assign(form, { appId: c.appId, publicSiteUrl: c.publicSiteUrl, enabled: c.enabled, appSecret: '' }) }
  catch (e) { error.value = (e as Error).message } finally { loading.value = false }
}
async function perform(fn: () => Promise<void>) { if (props.mocks || saving.value) return; saving.value = true; error.value = ''; try { await fn() } catch (e) { error.value = (e as Error).message } finally { saving.value = false } }
async function save() {
  if (connection.value?.appId && form.appId !== connection.value.appId) { try { await ElMessageBox.confirm('更换 App ID 会使已有绑定失效，需要重新邀请所有账号。', '更换飞书应用') } catch { return } }
  await perform(async () => { await request('/admin/ai/feishu/config', { method: 'PUT', body: { ...form } }); form.appSecret = ''; invitation.value = null; await load(); ElMessage.success('飞书连接配置已保存') })
}
async function test() { if (props.mocks || testing.value) return; testing.value = true; error.value = ''; try { const result = await request<{ ok: boolean }>('/admin/ai/feishu/test', { method: 'POST' }); if (result.ok) ElMessage.success('飞书长连接成功，请继续完成事件订阅并发布应用'); else error.value = '尚未建立连接，请核对应用凭据与网络'; await load() } catch (e) { error.value = (e as Error).message } finally { testing.value = false } }
function invite() { return perform(async () => { invitation.value = await request('/admin/ai/feishu/invitations', { method: 'POST', body: { userId: inviteUser.value, defaultModelId: inviteModel.value } }) }) }
function update(row: FeishuBinding) { return perform(async () => { await request(`/admin/ai/feishu/bindings/${row.id}`, { method: 'PATCH', body: { enabled: row.enabled, defaultModelId: row.defaultModelId } }); await load(); ElMessage.success('绑定设置已保存，旧飞书会话已失效') }) }
async function unbind(row: FeishuBinding) { try { await ElMessageBox.confirm('解绑后此身份及旧确认卡片失效，需重新邀请并由本人确认。', '解除账号绑定') } catch { return }; await perform(async () => { await request(`/admin/ai/feishu/bindings/${row.id}`, { method: 'DELETE' }); await load() }) }
async function copy() { try { await navigator.clipboard.writeText(invitation.value!.command); ElMessage.success('已复制，请交给指定账号使用者') } catch { ElMessage.info('请选中输入框内的指令进行复制') } }
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { void load(); if (!props.mocks) timer = setInterval(async () => { try { connection.value = await request('/admin/ai/feishu/config') } catch {} }, 5000) })
onUnmounted(() => clearInterval(timer))
</script>
<style scoped>
.feishu-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:12px 0}.feishu-heading h4{margin:0;font-size:17px}.feishu-heading p,.feishu-help,.feishu-times{color:var(--ui-text-muted);font-size:13px;line-height:1.8}.feishu-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;margin:20px 0}.feishu-card{border:1px solid var(--ui-border,#e1e7ee);border-radius:12px;padding:20px}.feishu-card h4{margin:0 0 18px;font-size:16px}.feishu-card ol{padding-left:22px;line-height:1.9;font-size:14px}.feishu-card li{margin-bottom:10px}.feishu-card a{font-size:14px;color:var(--ui-accent,#536f83)}.feishu-actions,.feishu-instruction{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.feishu-invite{margin-bottom:24px}.feishu-invite-form{display:flex;gap:12px;flex-wrap:wrap}.feishu-invite-form .el-select{width:280px}.feishu-instruction .el-input{width:min(430px,100%)}.feishu-instruction span{font-size:12px;color:var(--ui-text-muted)}code{font-size:12px;overflow-wrap:anywhere}@media(max-width:900px){.feishu-grid{grid-template-columns:1fr}}
</style>
