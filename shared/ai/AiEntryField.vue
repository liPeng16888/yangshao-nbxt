<template>
  <div class="entry-field">
    <span>{{ label }}<small v-if="required">（必填）</small></span>
    <select v-if="references" :value="modelValue ?? ''" :disabled="disabled" :aria-label="label" @change="update(($event.target as HTMLSelectElement).value || undefined)">
      <option value="">请选择本账号的记录</option><option v-for="row in references" :key="String(row.id)" :value="String(row.id)">{{ entryRecordLabel(row) }}</option>
    </select>
    <select v-else-if="choices" :value="modelValue ?? ''" :disabled="disabled" :aria-label="label" @change="selectValue(($event.target as HTMLSelectElement).value)">
      <option value="">请选择</option><option v-for="value in choices" :key="String(value)" :value="String(value)">{{ choiceLabel(value) }}</option>
    </select>
    <select v-else-if="definition.type==='boolean'" :value="modelValue === undefined ? '' : String(modelValue)" :disabled="disabled" :aria-label="label" @change="update(($event.target as HTMLSelectElement).value === '' ? undefined : ($event.target as HTMLSelectElement).value === 'true')"><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>
    <input v-else-if="definition.type==='number' || definition.type==='integer'" type="number" :value="modelValue ?? ''" :min="definition.minimum" :max="definition.maximum" :step="definition.type==='integer'?1:'any'" :disabled="disabled" :aria-label="label" @input="update(($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value))" />
    <template v-else-if="definition.type==='array'">
      <div v-for="(item,index) in arrayValue" :key="index" class="entry-array-item">
        <template v-if="definition.items?.properties">
          <AiEntryField v-for="(child,key) in definition.items.properties" :key="key" :schema="child" :field-key="String(key)" :label="`${label}第${index+1}项 · ${childLabel(String(key))}`" :model-value="(item as Record<string,unknown>)?.[key]" :disabled="disabled" :required="definition.items.required?.includes(String(key))" @update:model-value="updateChild(index,String(key),$event)" />
        </template>
        <AiEntryField v-else :schema="definition.items || {type:'string'}" :field-key="fieldKey" :label="`${label}${index+1}`" :model-value="item" :disabled="disabled" @update:model-value="updateItem(index,$event)" />
        <button v-if="!definition.minItems || arrayValue.length>definition.minItems" type="button" :disabled="disabled" @click="update(arrayValue.filter((_,i)=>i!==index))">移除此项</button>
      </div>
      <button v-if="arrayValue.length<(definition.maxItems || 12)" type="button" :disabled="disabled" @click="update([...arrayValue,definition.items?.properties?{}:''])">增加一项</button>
    </template>
    <input v-else :type="inputType" :value="displayValue" :disabled="disabled" :aria-label="label" @input="updateInput(($event.target as HTMLInputElement).value)" />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { entryRecordLabel,type EntryInputSchema } from './entry'
const props=defineProps<{modelValue?:unknown;schema:EntryInputSchema;label:string;fieldKey:string;required?:boolean;disabled?:boolean;references?:Record<string,unknown>[]}>()
const emit=defineEmits<{'update:modelValue':[unknown]}>()
const definition=computed(()=>props.schema.anyOf?.find(value=>value.type!=='null')||props.schema)
const choices=computed(()=>definition.value.enum||(definition.value.const!==undefined?[definition.value.const]:undefined))
const arrayValue=computed(()=>Array.isArray(props.modelValue)?props.modelValue:[])
const inputType=computed(()=>['checkInAt','checkOutAt'].includes(props.fieldKey)?'datetime-local':/^(date|.*Date|occurredOn)$/.test(props.fieldKey)?'date':['startTime','endTime'].includes(props.fieldKey)?'time':'text')
const displayValue=computed(()=>{
  if(inputType.value==='datetime-local'&&typeof props.modelValue==='string'&&props.modelValue){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(props.modelValue));return parts.replace(' ','T')}
  return props.modelValue??''
})
function update(value:unknown){emit('update:modelValue',value)}
function updateInput(value:string){update(inputType.value==='datetime-local'&&value?`${value}:00+08:00`:value||undefined)}
function selectValue(value:string){update(value===''?undefined:choices.value?.find(item=>String(item)===value))}
function updateItem(index:number,value:unknown){const next=[...arrayValue.value];next[index]=value;update(next)}
function updateChild(index:number,key:string,value:unknown){updateItem(index,{...(arrayValue.value[index] as object),[key]:value})}
function childLabel(key:string){return ({startTime:'开始时间',endTime:'结束时间',checkInAt:'上班时间',checkOutAt:'下班时间'} as Record<string,string>)[key]||key}
function choiceLabel(value:unknown){return ({cash:'现金',online:'线上',ACTIVE:'在职',INACTIVE:'离职',BOTTLE:'瓶',LITER:'升',MILLILITER:'毫升',GRAM:'克',HOUR:'小时',HALF_DAY:'半天',FULL_DAY:'全天',standardRows:'标准行',calculationRows:'测量行'} as Record<string,string>)[String(value)]||String(value)}
</script>
<style scoped>
.entry-field{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:12px}.entry-field small{color:var(--ui-text-muted);font-size:10px}.entry-field input,.entry-field select{box-sizing:border-box;width:100%;min-height:32px;border:1px solid var(--ui-line);border-radius:5px;padding:5px 8px;background:#fff;color:var(--ui-text)}.entry-field button{border:1px solid var(--ui-line);background:var(--ui-surface-subtle);color:var(--ui-accent);border-radius:5px;padding:5px 8px;cursor:pointer}.entry-array-item{display:grid;gap:8px;padding:8px;border:1px solid var(--ui-line-soft);border-radius:6px}
</style>
