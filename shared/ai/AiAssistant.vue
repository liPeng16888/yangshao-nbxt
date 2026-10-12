<template>
  <div ref="floatingRoot" class="ys-ai" :class="{ 'ys-ai--dragging': dragging }" :style="floatingStyle" :data-dock="dockSide">
    <button v-if="!opened" class="ys-ai-launcher" type="button" aria-label="打开 AI 助手" title="点击打开 AI助手；拖动后自动吸附到左右边缘。方向键也可调整位置。"
      @click="onLauncherClick" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @keydown="moveWithKeyboard">
      <img class="ys-ai-mascot" :src="mascotUrl" alt="" draggable="false" /><span class="ys-ai-launcher__label">AI助手</span>
    </button>
    <section v-else class="ys-ai-panel" :class="{'ys-ai-panel--entry':entryOpened}" role="dialog" aria-label="AI助手" :aria-busy="busy || quickBusy" @keydown.esc="opened = false">
      <header class="ys-ai-header" tabindex="0" aria-label="拖动 AI助手对话框，或使用方向键调整位置" title="拖动顶部移动对话框，松手后自动贴靠左右边缘"
        @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @keydown="moveWithKeyboard">
        <div class="ys-ai-header__identity"><img :src="mascotUrl" alt="" draggable="false" /><div><strong>AI助手</strong><small>{{ audience === 'admin' ? multiOwnerReadOnly?'多账号只读 · 按账号区分结果':'按授权账号操作 · 写入需确认' : '受控查询 · 确认后写入' }}</small></div></div>
        <div class="ys-ai-header__actions"><button type="button" :disabled="busy || quickBusy || authorizationChecking || (audience==='admin'&&!ownerIds.length&&!mockMode)" @click="showHistory">历史会话</button><button type="button" :disabled="busy || quickBusy || authorizationChecking" @click="newConversation">新对话</button><button type="button" aria-label="关闭 AI 对话框" @click="opened = false">×</button></div>
      </header>
      <div class="ys-ai-selectors">
        <el-select v-model="modelId" :disabled="busy || quickBusy" placeholder="选择模型" aria-label="选择 AI 模型">
          <el-option v-for="model in bootstrap?.models || []" :key="model.id" :value="model.id" :label="`${model.name}${model.vision ? ' · 图片' : ''}`" />
        </el-select>
        <el-select v-if="audience === 'admin'" class="ys-ai-owner-select" v-model="ownerIds" multiple filterable clearable collapse-tags collapse-tags-tooltip :multiple-limit="bootstrap?.maxSelectedOwners || 20" :disabled="busy || quickBusy || authorizationChecking" placeholder="选择授权账号（可多选）" aria-label="选择数据账号" @change="newConversation">
          <el-option v-for="owner in bootstrap?.owners || []" :key="owner.id" :value="owner.id" :label="`${owner.username}（${owner.account}）`" />
        </el-select>
      </div>
      <p v-if="audience==='admin'" class="ys-ai-scope" role="status">{{ownerIds.length?`已选择 ${ownerIds.length} 个授权账号`:'请选择授权账号，可多选（最多20个）'}}<span v-if="multiOwnerReadOnly"> · 多账号只读，快捷写入请选择一个账号并新建会话</span></p>
      <div v-if="bootstrap?.quickEntry && !historyOpened" class="ys-ai-entry-toolbar"><button type="button" :disabled="busy || quickBusy || authorizationChecking || multiOwnerReadOnly" @click="entryOpened=!entryOpened">{{ entryOpened?'收起快捷录入':'快捷录入' }}</button><button type="button" :disabled="busy || quickBusy || authorizationChecking" @click="load">刷新授权</button><small v-if="entryContext">已锁定：{{ entryContextLabel }} · {{ entryContext.date }}</small></div>
      <div v-if="mockMode" class="ys-ai-demo-notice" role="status">本地演示：展示已支持的录入菜单，不代表真实账号授权。照片仅在本页预览，不上传、不识别、不写入；真实识别需连接后端并选择图片模型。</div>
      <div v-if="error" class="ys-ai-error" role="alert">{{ error }} <button type="button" :disabled="busy" @click="load">重试连接</button></div>
      <div class="ys-ai-messages" ref="messageList" aria-live="polite">
        <p v-if="authorizationChecking" class="ys-ai-working" role="status">正在重新核对会话权限…</p>
        <AiConversationHistory v-else-if="historyOpened" :audience="audience" :actor-id="actorId" :owner-id="ownerId" :owner-ids="audience==='admin'?ownerIds:undefined" :owner-label="ownerLabel" :current-id="conversationId" :disabled="busy" :api-base="apiBase" :mock-mode="mockMode" @close="historyOpened=false" @select="resumeConversation" @deleted="onHistoryDeleted" />
        <template v-else>
        <AiQuickEntry v-if="entryOpened && bootstrap?.quickEntry && !multiOwnerReadOnly" ref="quickEntry" :audience="audience" :actor-id="actorId" :owner-id="ownerId" :owner-label="mockMode?'演示账号（仅预览）':ownerLabel" :model-id="modelId" :conversation-id="conversationId" :enabled="Boolean(bootstrap.enabled) || Boolean(mockMode)" :external-busy="busy" :api-base="apiBase" :mock-mode="mockMode" :page-context="pageContext" :initial-context="entryContext" @close="entryOpened=false" @scope-change="resetEntryConversation" @context="entryContext=$event" @proposed="receiveEntry" @activity="quickBusy=$event" />
        <p v-if="contextNotice" class="ys-ai-working">{{ contextNotice }}</p>
        <button v-if="hasEarlier" type="button" class="ys-ai-older" :disabled="busy || quickBusy" @click="loadEarlier">加载更早消息</button>
        <div v-if="!messages.length && !entryOpened" class="ys-ai-welcome">
          <img class="ys-ai-welcome__mascot" :src="mascotUrl" alt="AI助手小机器人" draggable="false" /><h3>让业务操作更轻松</h3>
          <p>询问样品数据、核对客户资料，或上传照片生成录入草稿。</p>
          <p v-if="bootstrap && !bootstrap.enabled" class="ys-ai-notice">AI 尚未启用。请在管理后台「AI API 配置」添加模型并开启服务。</p>
          <p v-else-if="bootstrap && !bootstrap.models.length" class="ys-ai-notice">暂无可用模型，请联系管理员授权。</p>
          <button type="button" @click="draft = '查询今天的数据计算样品，仅展示我有权限读取的信息'">查询今天的样品</button>
          <button v-if="audience === 'frontend'" type="button" @click="draft = '我需要录入一条支出，请先询问日期、事项、金额和付款方式，再生成待确认草稿'">协助录入支出</button>
        </div>
        <Bubble v-for="(message, index) in messages" :key="index" :placement="message.role === 'user' ? 'end' : 'start'" :variant="message.role === 'user' ? 'filled' : 'outlined'" max-width="100%">
          <template #content><AiMessage :role="message.role" :content="message.content" /></template>
        </Bubble>
        <p v-if="busy" class="ys-ai-working" role="status">正在核对权限并处理，请稍候…</p>
        <div v-if="batchProposals.length>1" class="ys-ai-proposal"><label class="ys-ai-check"><input type="checkbox" :checked="batchReviewed" :disabled="busy || quickBusy" @change="reviewBatch" />我已逐项核对下方 {{ batchProposals.length }} 条样品草稿的账号、位置和数据</label><el-button type="primary" :disabled="busy || quickBusy || !batchReviewed" @click="confirmEntryBatch">整批确认写入</el-button><small>任意一条校验失败，整批不写入。</small></div>
        <article v-for="proposal in proposals" :key="proposal.id" class="ys-ai-proposal">
          <div class="ys-ai-proposal__heading"><strong>{{ proposal.preview.title }}</strong><el-tag :type="proposal.status === 'APPLIED' ? 'success' : 'warning'">{{ statusLabel(proposal.status) }}</el-tag></div>
          <p><b>账号：</b>{{ proposal.preview.account }}</p><p><b>位置：</b>{{ proposal.preview.location }}</p>
          <table><thead><tr><th>字段</th><th>原值</th><th>拟写入值</th></tr></thead><tbody><tr v-for="field in proposal.preview.fields" :key="field.key"><td>{{ field.label }}</td><td>{{ valueText(field.before) }}</td><td>{{ valueText(field.after) }}</td></tr></tbody></table>
          <p class="ys-ai-notice" v-for="warning in proposal.preview.warnings" :key="warning">{{ warning }}</p>
          <template v-if="proposal.status === 'PENDING'">
            <label class="ys-ai-check"><input v-model="reviewed[proposal.id]" type="checkbox" :disabled="busy || multiOwnerReadOnly" />我已核对账号、位置和每个字段的数据</label>
            <div class="ys-ai-proposal__actions"><el-button v-if="(proposal.preview.target || proposal.preview.entry) && bootstrap?.quickEntry" :disabled="busy || quickBusy || multiOwnerReadOnly" @click="editEntry(proposal)">调整录入</el-button><el-button :disabled="busy || quickBusy || multiOwnerReadOnly" @click="decide(proposal, 'reject')">取消草稿</el-button><el-button type="primary" :disabled="busy || quickBusy || multiOwnerReadOnly || !reviewed[proposal.id]" @click="decide(proposal, 'confirm')">确认写入</el-button></div>
          </template>
        </article>
        <el-button v-if="entryOpened && proposals.some(p=>p.status==='APPLIED'&&p.preview.target)" :disabled="busy || quickBusy" @click="quickEntry?.focusNext()">继续录入下一条</el-button>
        </template>
      </div>
      <footer v-if="!historyOpened && !authorizationChecking" class="ys-ai-composer">
        <div v-if="photos.length" class="ys-ai-photos"><div v-for="(photo, index) in photos" :key="photo.url"><img :src="photo.url" alt="待识别照片" /><button type="button" :disabled="busy" aria-label="移除照片" @click="removePhoto(index)">×</button></div></div>
        <el-input v-model="draft" type="textarea" :rows="entryOpened?1:3" :maxlength="6000" :disabled="busy || quickBusy || (entryOpened&&!entryContext)" :placeholder="entryOpened&&!entryContext?'请先选择菜单并确认录入位置':entryContext?'输入当前菜单的录入信息，或添加照片；无需重复菜单名称':'描述需要查询或录入的信息；修改请写明日期和样品位置'" aria-label="AI 消息" @keydown="onKey" />
        <div class="ys-ai-composer__actions"><input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="selectPhotos" /><span :title="photoNotice"><el-button :disabled="!canAddPhoto" @click="fileInput?.click()">添加照片</el-button></span><el-button type="primary" :loading="busy" :disabled="!canSend" @click="send">发送</el-button></div>
        <small v-if="photoNotice" role="status">{{ photoNotice }}</small>
        <small v-if="!mockMode">照片和对话会发送给所选模型；切换模型会使用本次对话上下文。写入前请逐项核对。</small>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Bubble } from './bubble'
import AiMessage from './AiMessage.vue'
import { aiClient, currentAiGrants } from './client'
import mascotUrl from './assets/ai-assistant-mascot.png'
import { useFloatingDock } from './useFloatingDock'
import AiQuickEntry from './AiQuickEntry.vue'
import AiConversationHistory from './AiConversationHistory.vue'
import { menuCatalog } from '../../server/src/ai/ai-menu-catalog'
import type { EntryContext, EntryPageContext } from './entry'
import type { AiBootstrap, AiChatResponse, AiProposal, AiConversationDetail } from './types'
const props = defineProps<{ audience: 'frontend' | 'admin'; actorId: string; apiBase?: string; mockMode?: boolean; pageContext?: EntryPageContext }>()
const request = aiClient(props.audience, props.apiBase)
const opened = ref(false), busy = ref(false), error = ref(''), modelId = ref(''), ownerIds = ref<string[]>([]), draft = ref(''), conversationId = ref('')
const ownerId=computed({get:()=>ownerIds.value.length===1?ownerIds.value[0]:'',set:(id:string)=>{ownerIds.value=id?[id]:[]}})
const multiOwnerReadOnly=computed(()=>props.audience==='admin'&&ownerIds.value.length>1)
function conversationOwnerScope(){return props.audience==='admin'?{ownerIds:[...ownerIds.value]}:{}}
const { floatingRoot, floatingStyle, dockSide, dragging, startDrag, moveDrag, endDrag, cancelDrag, allowClick, moveWithKeyboard } = useFloatingDock(computed(() => `ys-ai-dock:${props.audience}:${props.actorId}`), opened)
const bootstrap = ref<AiBootstrap | null>(null)
const entryOpened=ref(false),quickBusy=ref(false),entryContext=ref<EntryContext>(),quickEntry=ref<InstanceType<typeof AiQuickEntry>>()
const historyOpened=ref(false),authorizationChecking=ref(false),hasEarlier=ref(false),nextBeforeId=ref(''),contextNotice=ref('')
const entryContextLabel=computed(()=>menuCatalog.find(entry=>entry.key===entryContext.value?.scene)?.label||'所选菜单')
const ownerLabel=computed(()=>props.audience==='frontend'?'当前登录账号':ownerIds.value.length>1?`所选${ownerIds.value.length}个授权账号`:bootstrap.value?.owners.find(owner=>owner.id===ownerId.value)?.username||'请先选择数据账号')
const messages = ref<{ id?:string; role: string; content: string }[]>([]), proposals = ref<AiProposal[]>([])
const reviewed = reactive<Record<string, boolean>>({})
const batchProposals=computed(()=>proposals.value.filter(p=>p.status==='PENDING'&&p.resource==='samples'&&p.preview.target))
const batchReviewed=computed(()=>batchProposals.value.length>0&&batchProposals.value.every(p=>reviewed[p.id]))
function reviewBatch(event:Event){const checked=(event.target as HTMLInputElement).checked;batchProposals.value.forEach(p=>reviewed[p.id]=checked)}
async function confirmEntryBatch(){if(busy.value||quickBusy.value||multiOwnerReadOnly.value||!batchReviewed.value)return;const token=requestGeneration,selected=[...batchProposals.value];busy.value=true;error.value='';try{const response=await request<{results:{id:string;status:string}[]}>('/ai/proposals/batch-decision',{method:'POST',body:{ids:selected.map(p=>p.id),...conversationOwnerScope(),grants:currentAiGrants(props.audience)}});if(token!==requestGeneration)return;for(const result of response.results){const p=proposals.value.find(p=>p.id===result.id);if(p)p.status=result.status}messages.value.push({role:'assistant',content:`已整批确认并保存${response.results.length}条样品登记。`});await scroll()}catch(e){if(token===requestGeneration)error.value=(e as Error).message}finally{if(token===requestGeneration)busy.value=false}}
const photos = ref<{ file: File; url: string }[]>([])
const messageList = ref<HTMLElement>(), fileInput = ref<HTMLInputElement>()
const selectedModel = computed(() => bootstrap.value?.models.find(m => m.id === modelId.value))
const canAddPhoto=computed(()=>!busy.value&&!quickBusy.value&&!authorizationChecking.value&&(!entryOpened.value||Boolean(entryContext.value))&&(props.mockMode||Boolean(bootstrap.value?.enabled&&selectedModel.value?.vision)))
const photoNotice=computed(()=>busy.value||quickBusy.value?'正在处理，请完成后添加照片。':entryOpened.value&&!entryContext.value?'请先选择菜单并确认录入位置。':props.mockMode?'演示照片只在本页预览；没有上传或识别，也不能发送给模型或写入数据库。':!bootstrap.value?.enabled?'AI 服务尚未启用，请在后台开启服务后刷新授权。':!selectedModel.value?'请先选择支持图片的模型，再添加照片。':!selectedModel.value.vision?'当前模型未启用图片能力，请切换支持图片的模型。':'')
const canSend = computed(() => !busy.value && !quickBusy.value && !historyOpened.value && !authorizationChecking.value && (!entryOpened.value || entryContext.value) && bootstrap.value?.enabled && modelId.value && (props.audience !== 'admin' || ownerIds.value.length>0) && (draft.value.trim() || photos.value.length))
let activeRequest: AbortController | undefined,loadGeneration=0,requestGeneration=0
function onLauncherClick(event: MouseEvent) { if (allowClick(event)) void open() }
async function open() { opened.value = true; await load() }
async function load() {
  const generation=++loadGeneration
  error.value = '';authorizationChecking.value=true
  if (props.mockMode) { bootstrap.value={enabled:false,dailyRequestLimit:0,adminReadOnly:true,models:[],owners:[],quickEntry:true};error.value = '当前使用本地演示账号。可预览快捷核对表，但不生成真实草稿、不写入、不向模型发送演示数据。';authorizationChecking.value=false; return }
  try {const result=await request<AiBootstrap>('/ai/bootstrap');if(generation!==loadGeneration)return;bootstrap.value=result;if(!modelId.value||!result.models.some(m=>m.id===modelId.value))modelId.value=result.models[0]?.id||'';if(props.audience==='admin'){const valid=ownerIds.value.filter(id=>result.owners.some(owner=>owner.id===id));if(valid.length!==ownerIds.value.length){ownerIds.value=valid;newConversation()}}if(conversationId.value){const detail=await request<AiConversationDetail>(`/ai/conversations/${encodeURIComponent(conversationId.value)}/read`,{method:'POST',body:{...conversationOwnerScope(),grants:currentAiGrants(props.audience)}});if(generation!==loadGeneration)return;applyConversation(detail)}}catch(e){if(generation===loadGeneration){clearChat();error.value=(e as Error).message}}finally{if(generation===loadGeneration)authorizationChecking.value=false}
}
function removePhoto(index: number) { URL.revokeObjectURL(photos.value[index].url); photos.value.splice(index, 1) }
function clearChat(){requestGeneration++;activeRequest?.abort();messages.value=[];proposals.value=[];conversationId.value='';draft.value='';entryContext.value=undefined;hasEarlier.value=false;nextBeforeId.value='';contextNotice.value='';photos.value.forEach(p=>URL.revokeObjectURL(p.url));photos.value=[];Object.keys(reviewed).forEach(key=>delete reviewed[key])}
function newConversation(){if(busy.value||quickBusy.value)return;clearChat();entryOpened.value=false;historyOpened.value=false;error.value=''}
function resetEntryConversation(){if(busy.value||quickBusy.value)return;clearChat();historyOpened.value=false;error.value=''}
function showHistory(){if(busy.value||quickBusy.value)return;entryOpened.value=false;historyOpened.value=true;error.value=''}
function applyConversation(detail:AiConversationDetail){if(props.audience==='admin'&&detail.ownerIds)ownerIds.value=[...detail.ownerIds];conversationId.value=detail.id;messages.value=detail.messages;proposals.value=detail.proposals;entryContext.value=detail.entryContext||undefined;hasEarlier.value=detail.hasMore;nextBeforeId.value=detail.nextBeforeId||'';contextNotice.value=detail.contextNotice;Object.keys(reviewed).forEach(key=>delete reviewed[key]);if(bootstrap.value?.models.some(model=>model.id===detail.modelId))modelId.value=detail.modelId}
async function resumeConversation(id:string){if(busy.value||quickBusy.value)return;const token=requestGeneration;busy.value=true;error.value='';activeRequest=new AbortController();try{const detail=await request<AiConversationDetail>(`/ai/conversations/${encodeURIComponent(id)}/read`,{method:'POST',body:{...conversationOwnerScope(),grants:currentAiGrants(props.audience)},signal:activeRequest.signal});if(token!==requestGeneration)return;draft.value='';photos.value.forEach(photo=>URL.revokeObjectURL(photo.url));photos.value=[];applyConversation(detail);historyOpened.value=false;entryOpened.value=Boolean(detail.entryContext);await scroll()}catch(e){if(token===requestGeneration&&(e as Error).name!=='AbortError')error.value=(e as Error).message}finally{if(token===requestGeneration){busy.value=false;activeRequest=undefined}}}
async function loadEarlier(){if(busy.value||quickBusy.value||!hasEarlier.value)return;const token=requestGeneration,oldHeight=messageList.value?.scrollHeight||0,oldTop=messageList.value?.scrollTop||0;busy.value=true;error.value='';activeRequest=new AbortController();try{const detail=await request<AiConversationDetail>(`/ai/conversations/${encodeURIComponent(conversationId.value)}/read`,{method:'POST',body:{...conversationOwnerScope(),grants:currentAiGrants(props.audience),beforeId:nextBeforeId.value},signal:activeRequest.signal});if(token!==requestGeneration)return;messages.value=[...detail.messages.filter(message=>!messages.value.some(existing=>existing.id===message.id)),...messages.value];hasEarlier.value=detail.hasMore;nextBeforeId.value=detail.nextBeforeId||'';await nextTick();if(messageList.value)messageList.value.scrollTop=oldTop+messageList.value.scrollHeight-oldHeight}catch(e){if(token===requestGeneration&&(e as Error).name!=='AbortError')error.value=(e as Error).message}finally{if(token===requestGeneration){busy.value=false;activeRequest=undefined}}}
function onHistoryDeleted(id:string){if(id===conversationId.value){clearChat();entryOpened.value=false}}
async function receiveEntry(result:AiChatResponse){conversationId.value=result.conversationId;proposals.value=result.proposals;if(result.inputSummary)messages.value.push({role:'user',content:result.inputSummary});messages.value.push({role:'assistant',content:result.answer});await scroll()}
async function editEntry(proposal:AiProposal){await decide(proposal,'reject');if(proposal.status!=='REJECTED')return;entryOpened.value=true;await nextTick();try{await quickEntry.value?.editProposal(proposal);await quickEntry.value?.focusNext()}catch(e){error.value=(e as Error).message}}
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
  const token=requestGeneration
  busy.value = true; error.value = ''; activeRequest = new AbortController()
  const text = draft.value.trim()
  try {
    const attachmentIds: string[] = []
    for (const photo of photos.value) { const form = new FormData(); form.append('file', photo.file); const response = await request<{ id: string }>('/ai/attachments', { method: 'POST', body: form, signal: activeRequest.signal });if(token!==requestGeneration)return;attachmentIds.push(response.id) }
    const response = await request<AiChatResponse>('/ai/chat', { method: 'POST', body: { modelId: modelId.value, ...conversationOwnerScope(), conversationId: conversationId.value || undefined, text, attachmentIds, grants: currentAiGrants(props.audience), ...(entryContext.value?{entryContext:entryContext.value}:{}) }, signal: activeRequest.signal })
    if(token!==requestGeneration)return
    messages.value.push({ role: 'user', content: `${text}${photos.value.length ? `\n[附加 ${photos.value.length} 张照片]` : ''}` }, { role: 'assistant', content: response.answer })
    conversationId.value = response.conversationId; proposals.value = response.proposals; draft.value = ''
    photos.value.forEach(p => URL.revokeObjectURL(p.url)); photos.value = []; await scroll()
  } catch (e) { if(token===requestGeneration&&(e as Error).name !== 'AbortError') error.value = (e as Error).message } finally {if(token===requestGeneration){busy.value = false; activeRequest = undefined}}
}
async function decide(proposal: AiProposal, decision: 'confirm' | 'reject') {
  if (busy.value || quickBusy.value || multiOwnerReadOnly.value || (decision === 'confirm' && !reviewed[proposal.id])) return
  const token=requestGeneration
  busy.value = true; error.value = ''
  try {const result = await request<{ status: string }>(`/ai/proposals/${proposal.id}/decision`, { method: 'POST', body: { decision, ...conversationOwnerScope(), grants: currentAiGrants(props.audience) } });if(token!==requestGeneration)return;proposal.status = result.status;messages.value.push({ role: 'assistant', content: result.status === 'APPLIED' ? '已确认并成功写入。请在对应菜单查看，未保存的编辑内容不会被覆盖。' : `草稿已${statusLabel(result.status)}。` });await scroll()}catch(e){if(token===requestGeneration)error.value=(e as Error).message}finally{if(token===requestGeneration)busy.value=false}
}
function valueText(value: unknown) { return value === null || value === undefined || value === '' ? '—' : value === 'cash' ? '现金' : value === 'online' ? '线上' : typeof value==='object'?JSON.stringify(value):String(value) }
function statusLabel(status: string) { return ({ PENDING: '待确认', APPLIED: '已写入', REJECTED: '已取消', EXPIRED: '已过期' } as Record<string, string>)[status] || status }
watch(() => props.actorId, () => {loadGeneration++;authorizationChecking.value=false;busy.value=false;quickBusy.value=false;ownerId.value='';newConversation();bootstrap.value=null;opened.value=false})
onBeforeUnmount(() => {loadGeneration++;requestGeneration++;activeRequest?.abort();photos.value.forEach(p => URL.revokeObjectURL(p.url))})
</script>

<style scoped>
.ys-ai { --ys-ai-bottom-gap: 24; position: fixed; right: 12px; bottom: 24px; z-index: 1800; font-family: inherit; color: var(--ui-text); transition: left .18s ease-out, top .18s ease-out; }
.ys-ai--dragging { transition: none; }
.ys-ai-launcher { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 108px; padding: 0; border: 0; border-radius: 18px; background: transparent; color: var(--ui-text-secondary); cursor: grab; font-weight: 600; touch-action: none; user-select: none; -webkit-user-select: none; }
.ys-ai-mascot { display: block; width: 104px; height: 114px; object-fit: contain; pointer-events: none; filter: drop-shadow(0 3px 5px rgba(30, 55, 75, .16)); transition: transform .15s; }
.ys-ai-launcher:hover .ys-ai-mascot { transform: translateY(-2px); }
.ys-ai-launcher__label { padding: 4px 12px; border: 1px solid var(--ui-line); border-radius: 14px; background: #fff; box-shadow: var(--ui-floating-shadow); font-size: 13px; line-height: 20px; pointer-events: none; }
.ys-ai-launcher:focus-visible,.ys-ai-header:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
.ys-ai--dragging .ys-ai-launcher,.ys-ai--dragging .ys-ai-header { cursor: grabbing; }
.ys-ai-panel { width: min(460px, calc(var(--ys-ai-viewport-width, 100vw) - 24px)); height: min(740px, calc(var(--ys-ai-viewport-height, 100dvh) - 48px)); display: flex; flex-direction: column; overflow: hidden; background: #fff; border: 1px solid var(--ui-line); border-radius: 10px; box-shadow: var(--ui-floating-shadow); }
.ys-ai-panel--entry{width:min(620px,calc(var(--ys-ai-viewport-width,100vw) - 24px));height:min(840px,calc(var(--ys-ai-viewport-height,100dvh) - 48px))}
.ys-ai-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--ui-surface-subtle); border-bottom: 1px solid var(--ui-line-soft); cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }.ys-ai-header small { display: block; font-size: 11px; color: var(--ui-text-muted); margin-top: 4px; }
.ys-ai-header__identity { display: flex; align-items: center; gap: 9px; }.ys-ai-header__identity img { width: 36px; height: 40px; object-fit: contain; pointer-events: none; }
.ys-ai-header__actions { display: flex; gap: 10px; }.ys-ai-header button,.ys-ai-error button { border: 0; background: transparent; color: var(--ui-accent); cursor: pointer; }.ys-ai-header button:last-child { font-size: 24px; }
.ys-ai-selectors { display: flex; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #edf0f5; }.ys-ai-selectors .el-select { flex: 1; min-width: 0; }
.ys-ai-entry-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 14px;border-bottom:1px solid var(--ui-line-soft)}.ys-ai-entry-toolbar button{border:1px solid var(--ui-line);border-radius:6px;padding:5px 9px;background:var(--ui-surface-subtle);color:var(--ui-accent);cursor:pointer}.ys-ai-entry-toolbar small{color:var(--ui-text-muted);font-size:10px}
.ys-ai-selectors--admin{flex-wrap:wrap}.ys-ai-selectors .ys-ai-owner-select{flex-basis:100%}.ys-ai-scope{margin:0;padding:7px 14px;color:var(--ui-text-muted);background:var(--ui-surface-subtle);font-size:11px;line-height:1.6;border-bottom:1px solid var(--ui-line-soft)}
.ys-ai-error { padding: 10px 14px; background: var(--ui-danger-soft); color: var(--ui-danger); font-size: 12px; line-height: 1.6; }
.ys-ai-demo-notice{padding:8px 14px;background:var(--ui-surface-subtle);color:var(--ui-text-muted);border-bottom:1px solid var(--ui-line-soft);font-size:11px;line-height:1.6}
.ys-ai-messages { flex: 1; overflow: auto; min-height: 120px; display: flex; flex-direction: column; gap: 16px; padding: 16px 14px; }
.ys-ai-messages :deep(.elx-bubble), .ys-ai-messages :deep(.elx-bubble__content-wrapper), .ys-ai-messages :deep(.elx-bubble__content) { min-width: 0; max-width: 100%; }
.ys-ai-welcome { padding: 8px 4px; }.ys-ai-welcome__mascot { display: block; width: 64px; height: 70px; object-fit: contain; }.ys-ai-welcome h3 { font-size: 18px; margin: 14px 0 8px; }.ys-ai-welcome p { font-size: 13px; line-height: 1.7; color: var(--ui-text-muted); }.ys-ai-welcome button { text-align: left; display: block; width: 100%; margin-top: 8px; border: 1px solid var(--ui-line); border-radius: 8px; background: var(--ui-surface-subtle); padding: 10px; color: var(--ui-text-secondary); cursor: pointer; }
.ys-ai-working,.ys-ai-notice { font-size: 11px; line-height: 1.6; color: var(--ui-warning); }
.ys-ai-proposal { border: 1px solid var(--ui-accent-line); border-radius: 12px; padding: 12px; background: var(--ui-surface-subtle); }.ys-ai-proposal p { font-size: 12px; margin: 8px 0; overflow-wrap: anywhere; }.ys-ai-proposal__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; }
.ys-ai-proposal table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; }.ys-ai-proposal th,.ys-ai-proposal td { padding: 7px 4px; border-bottom: 1px solid var(--ui-line); text-align: left; overflow-wrap: anywhere; }.ys-ai-proposal td:last-child { color: var(--ui-accent-hover); font-weight: 600; }
.ys-ai-check { display: flex; gap: 6px; align-items: start; font-size: 12px; line-height: 1.6; }.ys-ai-proposal__actions { margin-top: 12px; text-align: right; }
.ys-ai-composer { padding: 12px 14px; border-top: 1px solid var(--ui-line-soft); }.ys-ai-composer__actions { margin-top: 10px; display: flex; justify-content: space-between; }.ys-ai-composer small { display: block; margin-top: 9px; color: var(--ui-text-muted); font-size: 10px; line-height: 1.6; }
.ys-ai-photos { display: flex; gap: 8px; margin-bottom: 8px; }.ys-ai-photos>div { position: relative; }.ys-ai-photos img { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; }.ys-ai-photos button { position: absolute; right: -5px; top: -5px; border: 0; border-radius: 50%; background: #eee; cursor: pointer; }
@media(max-width: 700px) { .ys-ai { --ys-ai-bottom-gap: 78; bottom: calc(78px + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); }.ys-ai-panel { height: calc(var(--ys-ai-viewport-height, 100dvh) - 115px - env(safe-area-inset-bottom)); }.ys-ai-launcher { width: 92px; }.ys-ai-mascot { width: 88px; height: 98px; }.ys-ai-selectors { flex-wrap: wrap; }.ys-ai-selectors .el-select { flex-basis: 100%; } }
@media(prefers-reduced-motion: reduce) { .ys-ai,.ys-ai-mascot { transition: none; } }
</style>
