import { catalog,registrationSchema,samplePatchSchema,customerSchema,expenseSchema } from '../../server/src/ai/ai.catalog'
import { operations,requiresRecordId } from '../../server/src/ai/ai-operations'
import { entryMenuLevels } from '../../server/src/ai/ai-menu-catalog'
import type { EntryOption,EntryOperation,EntryInputSchema } from './entry'

// Reuse the real public definitions so previews cannot omit supported menus.
// These options never grant access, read real data, invoke a model or write data.
export function demoEntryOptions(audience:'frontend'|'admin'):EntryOption[] {
  return catalog.flatMap(entry=>{
    const menu=entry[audience],fields=entry.fields.filter(field=>field.writable&&field.writeAudiences?.includes(audience))
    if(!menu||!fields.length||!entry.writeAudiences.includes(audience))return []
    let choices:EntryOperation[]=operations.filter(operation=>operation.resource===entry.key&&operation.audience===audience&&(!operation.permissionKeys||operation.permissionKeys.every(key=>fields.some(field=>field.key===key)))).map(operation=>({action:operation.action,label:operation.label,requiresId:requiresRecordId(operation),input:operation.schema.toJSONSchema() as EntryInputSchema}))
    if(entry.key==='samples')choices=[{action:'prepare_sample_registration',label:'登记付款客户、金额和费用状态',requiresId:false,input:registrationSchema.toJSONSchema() as EntryInputSchema},{action:'prepare_sample_change',label:audience==='admin'?'修改单个样品登记字段':'修改样品原始输入',requiresId:true,input:samplePatchSchema.shape.changes.toJSONSchema() as EntryInputSchema}]
    if(entry.key==='customers')choices=[{action:'create',label:'新增客户资料',requiresId:false,input:customerSchema.toJSONSchema() as EntryInputSchema}]
    if(entry.key==='expenses')choices=[{action:'create',label:'新增支出',requiresId:false,input:expenseSchema.toJSONSchema() as EntryInputSchema}]
    const permitted=(key:string,action:string)=>{const field=entry.fields.find(field=>field.key===key||entry.key==='samples'&&field.key===`inputs.${key}`);return !field||!field.writable||fields.some(item=>item.key===field.key)||entry.key==='samples'&&key==='sequence'&&action==='prepare_sample_registration'}
    choices=choices.filter(choice=>(choice.input.required||[]).every(key=>permitted(key,choice.action))).map(choice=>({...choice,input:{...choice.input,...(choice.input.properties?{properties:Object.fromEntries(Object.entries(choice.input.properties).filter(([key])=>permitted(key,choice.action)))}:{})}}))
    return choices.length?[{key:entry.key,label:entry.label,levels:entryMenuLevels(entry.key,audience),path:menu.path,writeFields:fields.map(field=>({key:field.key,label:field.label})),operations:choices,note:entry.note}]:[]
  })
}
