<template>
  <div ref="floatingRoot" class="ys-ai" :class="{ 'ys-ai--dragging': dragging }" :style="floatingStyle" :data-dock="dockSide">
    <button v-if="!opened" class="ys-ai-launcher" type="button" aria-label="打开 AI 助手" title="点击打开 AI助手；拖动后自动吸附到左右边缘。方向键也可调整位置。"
      @click="onLauncherClick" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @keydown="moveWithKeyboard">
      <img class="ys-ai-mascot" :src="mascotUrl" alt="" draggable="false" /><span class="ys-ai-launcher__label">AI助手</span>
    </button>
    <section v-else class="ys-ai-panel" role="dialog" aria-label="AI助手" :aria-busy="busy" @keydown.esc="opened = false">
      <header class="ys-ai-header" tabindex="0" aria-label="拖动 AI助手对话框，或使用方向键调整位置" title="拖动顶部移动对话框，松手后自动贴靠左右边缘"
        @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @keydown="moveWithKeyboard">
        <div class="ys-ai-header__identity"><img :src="mascotUrl" alt="" draggable="false" /><div><strong>AI助手</strong><small>{{ audience === 'admin' ? '按授权账号操作 · 写入需确认' : '受控查询 · 确认后写入' }}</small></div></div>
        <div class="ys-ai-header__actions"><button type="button" :disabled="busy" @click="newConversation">新对话</button><button type="button" aria-label="关闭 AI 对话框" @click="opened = false">×</button></div>
      </header>
      <div class="ys-ai-selectors">
        <el-select v-model="modelId" :disabled="busy" placeholder="选择模型" aria-label="选择 AI 模型">
          <el-option v-for="model in bootstrap?.models || []" :key="model.id" :value="model.id" :label="`${model.name}${model.vision ? ' · 图片' : ''}`" />
        </el-select>
        <el-select v-if="audience === 'admin'" v-model="ownerId" :disabled="busy" placeholder="选择授权账号" aria-label="选择数据账号" @change="newConversation">
          <el-option v-for="owner in bootstrap?.owners || []" :key="owner.id" :value="owner.id" :label="`${owner.username}（${owner.account}）`" />
        </el-select>
      </div>
      <div v-if="error" class="ys-ai-error" role="alert">{{ error }} <button type="button" :disabled="busy" @click="load">重试连接</button></div>
      <div class="ys-ai-messages" ref="messageList" aria-live="polite">
        <div v-if="!messages.length" class="ys-ai-welcome">
          <img class="ys-ai-welcome__mascot" :src="mascotUrl" alt="AI助手小机器人" draggable="false" /><h3>让业务操作更轻松</h3>
          <p>询问样品数据、核对客户资料，或上传照片生成录入草稿。</p>
          <p v-if="bootstrap && !bootstrap.enabled" class="ys-ai-notice">AI 尚未启用。请在管理后台「AI API 配置」添加模型并开启服务。</p>
          <p v-else-if="bootstrap && !bootstrap.models.length" class="ys-ai-notice">暂无可用模型，请联系管理员授权。</p>
          <button type="button" @click="draft = '查询今天的数据计算样品，仅展示我有权限读取的信息'">查询今天的样品</button>
          <button v-if="audience === 'frontend'" type="button" @click="draft = '我需要录入一条支出，请先询问日期、事项、金额和付款方式，再生成待确认草稿'">协助录入支出</button>
        </div>
        <Bubble v-for="(message, index) in messages" :key="index" :placement="message.role === 'user' ? 'end' : 'start'" :variant="message.role === 'user' ? 'filled' : 'outlined'" max-width="100%">
          <template #content><p class="ys-ai-message">{{ message.content }}</p></template>
        </Bubble>
        <p v-if="busy" class="ys-ai-working" role="status">正在核对权限并处理，请稍候…</p>
        <article v-for="proposal in proposals" :key="proposal.id" class="ys-ai-proposal">
          <div class="ys-ai-proposal__heading"><strong>{{ proposal.preview.title }}</strong><el-tag :type="proposal.status === 'APPLIED' ? 'success' : 'warning'">{{ statusLabel(proposal.status) }}</el-tag></div>
          <p><b>账号：</b>{{ proposal.preview.account }}</p><p><b>位置：</b>{{ proposal.preview.location }}</p>
          <table><thead><tr><th>字段</th><th>原值</th><th>拟写入值</th></tr></thead><tbody><tr v-for="field in proposal.preview.fields" :key="field.key"><td>{{ field.label }}</td><td>{{ valueText(field.before) }}</td><td>{{ valueText(field.after) }}</td></tr></tbody></table>
          <p class="ys-ai-notice" v-for="warning in proposal.preview.warnings" :key="warning">{{ warning }}</p>
          <template v-if="proposal.status === 'PENDING'">
            <label class="ys-ai-check"><input v-model="reviewed[proposal.id]" type="checkbox" :disabled="busy" />我已核对账号、位置和每个字段的数据</label>
            <div class="ys-ai-proposal__actions"><el-button :disabled="busy" @click="decide(proposal, 'reject')">取消草稿</el-button><el-button type="primary" :disabled="busy || !reviewed[proposal.id]" @click="decide(proposal, 'confirm')">确认写入</el-button></div>
          </template>
        </article>
      </div>
      <footer class="ys-ai-composer">
        <div v-if="photos.length" class="ys-ai-photos"><div v-for="(photo, index) in photos" :key="photo.url"><img :src="photo.url" alt="待识别照片" /><button type="button" :disabled="busy" aria-label="移除照片" @click="removePhoto(index)">×</button></div></div>
        <el-input v-model="draft" type="textarea" :rows="3" :maxlength="6000" :disabled="busy" placeholder="描述需要查询或录入的信息；修改请写明日期和样品位置" aria-label="AI 消息" @keydown="onKey" />
        <div class="ys-ai-composer__actions"><input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="selectPhotos" /><el-button :disabled="busy || !selectedModel?.vision" @click="fileInput?.click()">添加照片</el-button><el-button type="primary" :loading="busy" :disabled="!canSend" @click="send">发送</el-button></div>
        <small>照片和对话会发送给所选模型；切换模型会使用本次对话上下文。写入前请逐项核对。</small>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Bubble } from './bubble'
import { aiClient, currentAiGrants } from './client'
import mascotUrl from './assets/ai-assistant-mascot.png'
import { useFloatingDock } from './useFloatingDock'
import type { AiBootstrap, AiChatResponse, AiProposal } from './types'
const props = defineProps<{ audience: 'frontend' | 'admin'; actorId: string; apiBase?: string; mockMode?: boolean }>()
const request = aiClient(props.audience, props.apiBase)
const opened = ref(false), busy = ref(false), error = ref(''), modelId = ref(''), ownerId = ref(''), draft = ref(''), conversationId = ref('')
const { floatingRoot, floatingStyle, dockSide, dragging, startDrag, moveDrag, endDrag, cancelDrag, allowClick, moveWithKeyboard } = useFloatingDock(computed(() => `ys-ai-dock:${props.audience}:${props.actorId}`), opened)
const bootstrap = ref<AiBootstrap | null>(null)
const messages = ref<{ role: string; content: string }[]>([]), proposals = ref<AiProposal[]>([])
const reviewed = reactive<Record<string, boolean>>({})
const photos = ref<{ file: File; url: string }[]>([])
const messageList = ref<HTMLElement>(), fileInput = ref<HTMLInputElement>()
const selectedModel = computed(() => bootstrap.value?.models.find(m => m.id === modelId.value))
const canSend = computed(() => !busy.value && bootstrap.value?.enabled && modelId.value && (props.audience !== 'admin' || ownerId.value) && (draft.value.trim() || photos.value.length))
let activeRequest: AbortController | undefined
function onLauncherClick(event: MouseEvent) { if (allowClick(event)) void open() }
async function open() { opened.value = true; if (!bootstrap.value) await load() }
async function load() {
  error.value = ''
  if (props.mockMode) { error.value = '当前使用本地演示账号。AI 需要连接真实后端并使用真实账号登录，演示数据不会发送给模型。'; return }
  try { bootstrap.value = await request<AiBootstrap>('/ai/bootstrap'); if (!modelId.value || !bootstrap.value.models.some(m => m.id === modelId.value)) modelId.value = bootstrap.value.models[0]?.id || '' } catch (e) { error.value = (e as Error).message }
}
function removePhoto(index: number) { URL.revokeObjectURL(photos.value[index].url); photos.value.splice(index, 1) }
function newConversation() { if (busy.value) return; messages.value = []; proposals.value = []; conversationId.value = ''; draft.value = ''; photos.value.forEach(p => URL.revokeObjectURL(p.url)); photos.value = []; error.value = ''; Object.keys(reviewed).forEach(k => delete reviewed[k]) }
function selectPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  for (const file of Array.from(input.files || [])) {
    if (photos.value.length >= 3 || file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { error.value = '最多上传 3 张照片，每张 5MB 内，支持 JPG、PNG、WebP。'; break }
    photos.value.push({ file, url: URL.createObjectURL(file) })
  }
  input.value = ''
}
function onKey(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send() } }
async function scroll() { await nextTick(); messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' }) }
async function send() {
  if (!canSend.value) return
  busy.value = true; error.value = ''; activeRequest = new AbortController()
  const text = draft.value.trim()
  try {
    const attachmentIds: string[] = []
    for (const photo of photos.value) { const form = new FormData(); form.append('file', photo.file); const response = await request<{ id: string }>('/ai/attachments', { method: 'POST', body: form, signal: activeRequest.signal }); attachmentIds.push(response.id) }
    const response = await request<AiChatResponse>('/ai/chat', { method: 'POST', body: { modelId: modelId.value, ownerId: ownerId.value || undefined, conversationId: conversationId.value || undefined, text, attachmentIds, grants: currentAiGrants(props.audience) }, signal: activeRequest.signal })
    messages.value.push({ role: 'user', content: `${text}${photos.value.length ? `\n[附加 ${photos.value.length} 张照片]` : ''}` }, { role: 'assistant', content: response.answer })
    conversationId.value = response.conversationId; proposals.value = response.proposals; draft.value = ''
    photos.value.forEach(p => URL.revokeObjectURL(p.url)); photos.value = []; await scroll()
  } catch (e) { if ((e as Error).name !== 'AbortError') error.value = (e as Error).message } finally { busy.value = false; activeRequest = undefined }
}
async function decide(proposal: AiProposal, decision: 'confirm' | 'reject') {
  if (busy.value || (decision === 'confirm' && !reviewed[proposal.id])) return
  busy.value = true; error.value = ''
  try { const result = await request<{ status: string }>(`/ai/proposals/${proposal.id}/decision`, { method: 'POST', body: { decision, grants: currentAiGrants(props.audience) } }); proposal.status = result.status; messages.value.push({ role: 'assistant', content: result.status === 'APPLIED' ? '已确认并成功写入。请在对应菜单查看，未保存的编辑内容不会被覆盖。' : `草稿已${statusLabel(result.status)}。` }); await scroll() } catch (e) { error.value = (e as Error).message } finally { busy.value = false }
}
function valueText(value: unknown) { return value === null || value === undefined || value === '' ? '—' : value === 'cash' ? '现金' : value === 'online' ? '线上' : String(value) }
function statusLabel(status: string) { return ({ PENDING: '待确认', APPLIED: '已写入', REJECTED: '已取消', EXPIRED: '已过期' } as Record<string, string>)[status] || status }
watch(() => props.actorId, () => { activeRequest?.abort(); busy.value = false; newConversation(); bootstrap.value = null; opened.value = false })
onBeforeUnmount(() => { activeRequest?.abort(); photos.value.forEach(p => URL.revokeObjectURL(p.url)) })
</script>

<style scoped>
.ys-ai { --ys-ai-bottom-gap: 24; position: fixed; right: 12px; bottom: 24px; z-index: 1800; font-family: inherit; color: var(--ui-text); transition: left .18s ease-out, top .18s ease-out; }
.ys-ai--dragging { transition: none; }
.ys-ai-launcher { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 84px; padding: 0; border: 0; border-radius: 18px; background: transparent; color: var(--ui-text-secondary); cursor: grab; font-weight: 600; touch-action: none; user-select: none; -webkit-user-select: none; }
.ys-ai-mascot { display: block; width: 80px; height: 88px; object-fit: contain; pointer-events: none; filter: drop-shadow(0 3px 5px rgba(30, 55, 75, .16)); transition: transform .15s; }
.ys-ai-launcher:hover .ys-ai-mascot { transform: translateY(-2px); }
.ys-ai-launcher__label { padding: 3px 10px; border: 1px solid var(--ui-line); border-radius: 14px; background: #fff; box-shadow: var(--ui-floating-shadow); font-size: 12px; line-height: 18px; pointer-events: none; }
.ys-ai-launcher:focus-visible,.ys-ai-header:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
.ys-ai--dragging .ys-ai-launcher,.ys-ai--dragging .ys-ai-header { cursor: grabbing; }
.ys-ai-panel { width: min(460px, calc(var(--ys-ai-viewport-width, 100vw) - 24px)); height: min(740px, calc(var(--ys-ai-viewport-height, 100dvh) - 48px)); display: flex; flex-direction: column; overflow: hidden; background: #fff; border: 1px solid var(--ui-line); border-radius: 10px; box-shadow: var(--ui-floating-shadow); }
.ys-ai-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--ui-surface-subtle); border-bottom: 1px solid var(--ui-line-soft); cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }.ys-ai-header small { display: block; font-size: 11px; color: var(--ui-text-muted); margin-top: 4px; }
.ys-ai-header__identity { display: flex; align-items: center; gap: 9px; }.ys-ai-header__identity img { width: 36px; height: 40px; object-fit: contain; pointer-events: none; }
.ys-ai-header__actions { display: flex; gap: 10px; }.ys-ai-header button,.ys-ai-error button { border: 0; background: transparent; color: var(--ui-accent); cursor: pointer; }.ys-ai-header button:last-child { font-size: 24px; }
.ys-ai-selectors { display: flex; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #edf0f5; }.ys-ai-selectors .el-select { flex: 1; min-width: 0; }
.ys-ai-error { padding: 10px 14px; background: var(--ui-danger-soft); color: var(--ui-danger); font-size: 12px; line-height: 1.6; }
.ys-ai-messages { flex: 1; overflow: auto; min-height: 120px; display: flex; flex-direction: column; gap: 16px; padding: 16px 14px; }
.ys-ai-message { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.7; }
.ys-ai-welcome { padding: 8px 4px; }.ys-ai-welcome__mascot { display: block; width: 64px; height: 70px; object-fit: contain; }.ys-ai-welcome h3 { font-size: 18px; margin: 14px 0 8px; }.ys-ai-welcome p { font-size: 13px; line-height: 1.7; color: var(--ui-text-muted); }.ys-ai-welcome button { text-align: left; display: block; width: 100%; margin-top: 8px; border: 1px solid var(--ui-line); border-radius: 8px; background: var(--ui-surface-subtle); padding: 10px; color: var(--ui-text-secondary); cursor: pointer; }
.ys-ai-working,.ys-ai-notice { font-size: 11px; line-height: 1.6; color: var(--ui-warning); }
.ys-ai-proposal { border: 1px solid var(--ui-accent-line); border-radius: 12px; padding: 12px; background: var(--ui-surface-subtle); }.ys-ai-proposal p { font-size: 12px; margin: 8px 0; overflow-wrap: anywhere; }.ys-ai-proposal__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; }
.ys-ai-proposal table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; }.ys-ai-proposal th,.ys-ai-proposal td { padding: 7px 4px; border-bottom: 1px solid var(--ui-line); text-align: left; overflow-wrap: anywhere; }.ys-ai-proposal td:last-child { color: var(--ui-accent-hover); font-weight: 600; }
.ys-ai-check { display: flex; gap: 6px; align-items: start; font-size: 12px; line-height: 1.6; }.ys-ai-proposal__actions { margin-top: 12px; text-align: right; }
.ys-ai-composer { padding: 12px 14px; border-top: 1px solid var(--ui-line-soft); }.ys-ai-composer__actions { margin-top: 10px; display: flex; justify-content: space-between; }.ys-ai-composer small { display: block; margin-top: 9px; color: var(--ui-text-muted); font-size: 10px; line-height: 1.6; }
.ys-ai-photos { display: flex; gap: 8px; margin-bottom: 8px; }.ys-ai-photos>div { position: relative; }.ys-ai-photos img { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; }.ys-ai-photos button { position: absolute; right: -5px; top: -5px; border: 0; border-radius: 50%; background: #eee; cursor: pointer; }
@media(max-width: 700px) { .ys-ai { --ys-ai-bottom-gap: 78; bottom: calc(78px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); }.ys-ai-panel { height: calc(var(--ys-ai-viewport-height, 100dvh) - 115px - env(safe-area-inset-bottom)); }.ys-ai-launcher { width: 76px; }.ys-ai-mascot { width: 72px; height: 80px; }.ys-ai-selectors { flex-wrap: wrap; }.ys-ai-selectors .el-select { flex-basis: 100%; } }
@media(prefers-reduced-motion: reduce) { .ys-ai,.ys-ai-mascot { transition: none; } }
</style>
