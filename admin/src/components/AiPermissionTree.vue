<template>
  <div class="ai-permissions-tree">
    <div class="permission-toolbar">
      <el-radio-group v-if="!accountAudience" v-model="audience"><el-radio-button value="frontend">前台菜单</el-radio-button><el-radio-button value="admin">后台菜单</el-radio-button></el-radio-group>
      <el-input v-model="keyword" placeholder="搜索一级/二级菜单或字段" clearable aria-label="搜索 AI 权限菜单" />
    </div>
    <div class="permission-batch"><span>{{ audience === 'frontend' ? '前台' : '后台' }} · {{ nodes.length }} 个一级菜单</span><el-button :disabled="disabled" @click="batch('read',true)">全选读取</el-button><el-button :disabled="disabled" @click="batch('write',true)">全选写入</el-button><el-button :disabled="disabled" @click="clear">清空当前菜单授权</el-button><el-button link type="primary" :disabled="!parentIds.length" @click="expandedIds=allExpanded?[]:parentIds">{{ allExpanded?'收起二级菜单':'展开二级菜单' }}</el-button></div>
    <el-table :data="nodes" row-key="id" :tree-props="{children:'children'}" :expand-row-keys="expandedIds" class="permission-menu-table" @expand-change="expandRow">
      <el-table-column label="一级 / 二级菜单" min-width="250"><template #default="{row}"><span>{{ row.label }}</span><small v-if="row.children" class="menu-count">{{ row.children.length }} 个子菜单</small></template></el-table-column>
      <el-table-column label="允许读取" width="130"><template #default="{row}"><el-checkbox :aria-label="`${row.label}允许读取`" :model-value="state(row,'read').checked" :indeterminate="state(row,'read').indeterminate" :disabled="disabled || state(row,'read').disabled" @change="toggle(row,'read',$event)">{{ state(row,'read').selected }}/{{ state(row,'read').total }}</el-checkbox></template></el-table-column>
      <el-table-column label="允许写入 · 需确认" width="155"><template #default="{row}"><el-checkbox v-if="!state(row,'write').disabled" :aria-label="`${row.label}允许写入`" :model-value="state(row,'write').checked" :indeterminate="state(row,'write').indeterminate" :disabled="disabled" @change="toggle(row,'write',$event)">{{ state(row,'write').selected }}/{{ state(row,'write').total }}</el-checkbox><span v-else class="readonly">只读 / 原流程</span></template></el-table-column>
      <el-table-column label="细分" width="120"><template #default="{row}"><el-button link type="primary" @click="detail=row">字段与限制</el-button></template></el-table-column>
    </el-table>
    <p class="permission-hint">勾选一级菜单会批量设置全部二级菜单；写入自动包含对应读取权限。全选只影响当前搜索结果和菜单侧，固定禁止项不会被解禁。</p>
    <el-drawer :model-value="Boolean(detail)" :title="`${detail?.label || ''} · 字段与限制`" size="min(760px, 96vw)" @close="detail=null">
      <template v-if="detail">
        <section v-for="entry in detail.entries" :key="entry.key" class="permission-detail">
          <h4>{{ entry.label }}</h4><el-alert v-if="entry.note" :title="entry.note" type="info" :closable="false" />
          <el-table :data="entry.fields" size="small"><el-table-column prop="label" label="字段 / 操作" min-width="200" /><el-table-column label="读取" width="95"><template #default="{row}"><el-checkbox :aria-label="`${entry.label} ${row.label}读取`" :model-value="selected(entry,row.key,'read')" :disabled="disabled || isDenied(row)" @change="field(entry,row.key,'read',$event)" /></template></el-table-column><el-table-column label="写入" width="95"><template #default="{row}"><el-checkbox v-if="row.writeAudiences?.includes(audience)" :aria-label="`${entry.label} ${row.label}写入`" :model-value="selected(entry,row.key,'write')" :disabled="disabled || isDenied(row)" @change="field(entry,row.key,'write',$event)" /><span v-else class="readonly">—</span></template></el-table-column><el-table-column label="限制" width="120"><template #default="{row}"><el-tag v-if="isDenied(row)" type="danger" size="small">全局禁止</el-tag><span v-else-if="!row.writable" class="readonly">仅可读取</span></template></el-table-column></el-table>
        </section>
      </template>
    </el-drawer>
  </div>
</template>
<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {AiAudience,AiMenuEntry} from '../../../server/src/ai/ai-menu-catalog'
import {fieldIsDenied,type AiField} from '../../../server/src/ai/ai-menu-catalog'
import type {AiRule} from '../../../shared/ai/types'
import {menuNodes,deniedGuards,selection,toggleEntries,toggleField,type AiMenuNode} from '../../../shared/ai/permissions'
const props=defineProps<{catalog:readonly AiMenuEntry[];modelValue:AiRule[];blocked:Record<string,string[]>;disabled?:boolean;accountAudience?:AiAudience}>()
const emit=defineEmits<{ 'update:modelValue':[AiRule[]] }>()
const audience=ref<AiAudience>(props.accountAudience||'frontend'),keyword=ref(''),detail=ref<AiMenuNode|null>(null),expandedIds=ref<string[]>([])
watch(()=>props.accountAudience,v=>{if(v)audience.value=v;detail.value=null})
const nodes=computed(()=>menuNodes(props.catalog,audience.value,keyword.value)),denied=computed(()=>deniedGuards(props.catalog,props.blocked))
const parentIds=computed(()=>nodes.value.filter(n=>n.children?.length).map(n=>n.id)),allExpanded=computed(()=>parentIds.value.length>0&&parentIds.value.every(id=>expandedIds.value.includes(id)))
watch([keyword,audience],()=>{expandedIds.value=keyword.value.trim()?parentIds.value:[];detail.value=null})
function expandRow(row:AiMenuNode,expanded:boolean){expandedIds.value=expanded?[...new Set([...expandedIds.value,row.id])]:expandedIds.value.filter(id=>id!==row.id)}
function isDenied(field:AiField){return fieldIsDenied(field,denied.value)}
const visible=computed(()=>nodes.value.flatMap(n=>n.entries))
function state(row:AiMenuNode,mode:'read'|'write'){return selection(row.entries,props.modelValue,mode,audience.value,denied.value)}
function toggle(row:AiMenuNode,mode:'read'|'write',value:unknown){emit('update:modelValue',toggleEntries(row.entries,props.modelValue,mode,Boolean(value),audience.value,denied.value))}
function batch(mode:'read'|'write',value:boolean){emit('update:modelValue',toggleEntries(visible.value,props.modelValue,mode,value,audience.value,denied.value))}
function clear(){const next=toggleEntries(visible.value,props.modelValue,'write',false,audience.value,denied.value);emit('update:modelValue',toggleEntries(visible.value,next,'read',false,audience.value,denied.value))}
function selected(entry:AiMenuEntry,key:string,mode:'read'|'write'){return props.modelValue.find(r=>r.resource===entry.key)?.[mode==='read'?'readFields':'writeFields'].includes(key)||false}
function field(entry:AiMenuEntry,key:string,mode:'read'|'write',value:unknown){emit('update:modelValue',toggleField(entry,key,props.modelValue,mode,Boolean(value),audience.value,denied.value))}
</script>
<style scoped>
.permission-toolbar,.permission-batch{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0}.permission-toolbar .el-input{max-width:330px}.permission-batch>span{margin-right:auto;color:var(--ui-text-muted);font-size:13px}.permission-hint,.readonly,.menu-count{color:#78879b;font-size:12px;line-height:1.7}.menu-count{margin-left:12px}.permission-detail{margin-bottom:28px}.permission-detail .el-alert{margin-bottom:12px}.permission-menu-table{border:1px solid #e6ebf2;border-radius:8px}.permission-detail h4{margin:0 0 12px}
</style>
