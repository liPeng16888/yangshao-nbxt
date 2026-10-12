<template>
  <section class="ai-history" aria-label="历史会话">
    <div class="ai-history-heading"><strong>历史会话</strong><button type="button" @click="$emit('close')">返回当前会话</button></div>
    <p class="ai-history-note">{{ ownerLabel }} · 只显示当前登录身份在此数据账号下的会话。</p>
    <p v-if="mockMode" class="ai-history-note">演示模式不读取、保存或删除真实历史会话。</p>
    <p v-if="error" role="alert" class="ai-history-error">{{ error }} <button type="button" :disabled="loading" @click="load(true)">重新加载</button></p>
    <p v-if="loading && !items.length" role="status">正在加载历史会话…</p>
    <p v-else-if="!items.length" class="ai-history-empty">暂无历史会话。新建对话不会删除已保存的聊天。</p>
    <article v-for="item in items" :key="item.id" class="ai-history-item" :class="{'is-current':item.id===currentId}">
      <div><strong>{{ item.title }}</strong><span v-if="item.id===currentId" class="ai-history-current">当前</span></div>
      <small>{{ formatTime(item.updatedAt) }}</small>
      <p v-if="!item.available" class="ai-history-note">当前权限或访问密码授权与原会话不同。为保护数据，不能查看内容或续聊；仍可删除。</p>
      <div class="ai-history-actions"><button type="button" :disabled="disabled || loading || !item.available" @click="$emit('select',item.id)">查看并继续聊天</button><button type="button" :disabled="disabled || loading" @click="deletingId=item.id">删除</button></div>
      <div v-if="deletingId===item.id" class="ai-history-confirm" role="alertdialog" aria-label="确认删除历史会话">
        <p>删除此会话及其消息、草稿？删除后不能继续该会话。已确认写入的业务数据不会撤销，操作审计保留。</p>
        <button type="button" :disabled="loading" @click="deletingId=''">保留会话</button><button type="button" :disabled="loading" @click="remove(item.id)">确认删除会话</button>
      </div>
    </article>
    <button v-if="hasMore" type="button" :disabled="loading || disabled" @click="load(false)">{{ loading?'正在加载…':'加载更多会话' }}</button>
  </section>
</template>
<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {aiClient,currentAiGrants} from './client'
import type {AiHistory,AiHistoryItem} from './types'
const props=defineProps<{audience:'frontend'|'admin';actorId:string;ownerId:string;ownerIds?:string[];ownerLabel:string;currentId:string;disabled?:boolean;apiBase?:string;mockMode?:boolean}>()
const emit=defineEmits<{close:[];select:[string];deleted:[string]}>()
const request=aiClient(props.audience,props.apiBase),items=ref<AiHistoryItem[]>([]),hasMore=ref(false),loading=ref(false),error=ref(''),deletingId=ref(''),page=ref(0)
let generation=0,controller:AbortController|undefined
function scopeBody(){return props.ownerIds?.length?{ownerIds:[...props.ownerIds]}:{ownerId:props.ownerId||undefined}}
async function load(reset:boolean){if(loading.value)return;if(reset){items.value=[];page.value=0;hasMore.value=false;deletingId.value=''}if(props.mockMode)return;const token=++generation;controller=new AbortController();loading.value=true;error.value='';try{const next=page.value+1;const result=await request<AiHistory>('/ai/conversations/list',{method:'POST',body:{...scopeBody(),page:next,grants:currentAiGrants(props.audience)},signal:controller.signal});if(token!==generation)return;items.value=[...items.value,...result.items.filter(item=>!items.value.some(current=>current.id===item.id))];page.value=next;hasMore.value=result.hasMore}catch(e){if(token===generation&&(e as Error).name!=='AbortError')error.value=(e as Error).message}finally{if(token===generation)loading.value=false}}
async function remove(id:string){if(loading.value||props.disabled)return;const token=++generation;controller=new AbortController();loading.value=true;error.value='';try{await request(`/ai/conversations/${encodeURIComponent(id)}`,{method:'DELETE',body:scopeBody(),signal:controller.signal});if(token!==generation)return;items.value=items.value.filter(item=>item.id!==id);deletingId.value='';emit('deleted',id);loading.value=false;await load(true)}catch(e){if(token===generation&&(e as Error).name!=='AbortError')error.value=(e as Error).message}finally{if(token===generation)loading.value=false}}
function formatTime(value:string){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
watch(()=>[props.actorId,props.ownerId,JSON.stringify(props.ownerIds||[])],()=>{generation++;controller?.abort();loading.value=false;items.value=[];error.value='';void load(true)})
onMounted(()=>load(true));onBeforeUnmount(()=>{generation++;controller?.abort()})
</script>
<style scoped>
.ai-history-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.ai-history button{border:1px solid var(--ui-line);border-radius:6px;padding:6px 9px;background:var(--ui-surface-subtle);color:var(--ui-accent);cursor:pointer}.ai-history button:disabled{opacity:.5;cursor:not-allowed}.ai-history-note,.ai-history-empty{font-size:12px;line-height:1.7;color:var(--ui-text-muted)}.ai-history-item{padding:12px;margin:10px 0;border:1px solid var(--ui-line);border-radius:8px;overflow-wrap:anywhere}.ai-history-item.is-current{border-color:var(--ui-accent-line);background:var(--ui-surface-subtle)}.ai-history-item strong{font-size:13px}.ai-history-item small{display:block;margin-top:6px;color:var(--ui-text-muted);font-size:11px}.ai-history-current{margin-left:8px;color:var(--ui-accent);font-size:11px}.ai-history-actions{display:flex;justify-content:space-between;gap:8px;margin-top:10px}.ai-history-confirm{margin-top:12px;padding:9px;border:1px solid var(--ui-danger);border-radius:6px;font-size:12px;line-height:1.7}.ai-history-confirm button{margin-right:8px}.ai-history-error{color:var(--ui-danger);font-size:12px}
</style>
