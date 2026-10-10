import { fieldIsDenied, type AiAudience, type AiMenuEntry } from '../../server/src/ai/ai-menu-catalog'
import type { AiRule } from './types'
export interface AiMenuNode { id:string;label:string;entries:AiMenuEntry[];children?:AiMenuNode[] }
export function menuNodes(catalog:readonly AiMenuEntry[],audience:AiAudience,keyword=''):AiMenuNode[] {
  const groups=new Map<string,AiMenuNode>()
  for(const entry of catalog) {
    const menu=entry[audience]
    if(!menu) continue
    if(keyword&&!`${menu.group} ${menu.label} ${entry.label} ${entry.fields.map(f=>f.label).join(' ')}`.includes(keyword.trim())) continue
    let group=groups.get(menu.group)
    if(!group) {group={id:`group:${menu.group}`,label:menu.group,entries:[],children:[]};groups.set(menu.group,group)}
    group.entries.push(entry)
    let child=group.children!.find(n=>n.id===menu.path)
    if(!child) {child={id:menu.path,label:menu.label,entries:[]};group.children!.push(child)}
    child.entries.push(entry)
  }
  return [...groups.values()].map(g=>g.children?.length===1&&g.children[0].label===g.label?{...g,children:undefined}:g)
}
export function deniedGuards(catalog:readonly AiMenuEntry[],blocked:Record<string,string[]>) {
  return new Set(catalog.flatMap(e=>e.fields.filter(f=>(blocked[e.key]||[]).includes(f.key)).map(f=>f.guard)))
}
export function candidates(entry:AiMenuEntry,mode:'read'|'write',audience:AiAudience,denied:Set<string>) {
  return entry.fields.filter(f=>!fieldIsDenied(f,denied)&&(mode==='read'||f.writable&&f.writeAudiences?.includes(audience))).map(f=>f.key)
}
export function selection(entries:AiMenuEntry[],rules:AiRule[],mode:'read'|'write',audience:AiAudience,denied:Set<string>) {
  const key=mode==='read'?'readFields':'writeFields'
  let total=0,selected=0
  for(const entry of entries) {const fields=candidates(entry,mode,audience,denied);total+=fields.length;const rule=rules.find(r=>r.resource===entry.key);selected+=fields.filter(f=>rule?.[key].includes(f)).length}
  return {checked:total>0&&selected===total,indeterminate:selected>0&&selected<total,disabled:total===0,selected,total}
}
export function toggleEntries(entries:AiMenuEntry[],rules:AiRule[],mode:'read'|'write',enabled:boolean,audience:AiAudience,denied:Set<string>):AiRule[] {
  // Vue wraps props/ref arrays in proxies, which structuredClone cannot copy.
  const next=rules.map(rule=>({...rule,readFields:[...rule.readFields],writeFields:[...rule.writeFields]}))
  for(const entry of entries) {
    let rule=next.find(r=>r.resource===entry.key)
    if(!rule) {rule={resource:entry.key,readFields:[],writeFields:[]};next.push(rule)}
    const fields=candidates(entry,mode,audience,enabled?denied:new Set())
    if(mode==='read') {rule.readFields=enabled?[...new Set([...rule.readFields,...fields])]:rule.readFields.filter(k=>!fields.includes(k));rule.writeFields=rule.writeFields.filter(k=>rule!.readFields.includes(k))}
    else {rule.writeFields=enabled?[...new Set([...rule.writeFields,...fields])]:rule.writeFields.filter(k=>!fields.includes(k));if(enabled)rule.readFields=[...new Set([...rule.readFields,...fields])]}
  }
  return next
}
export function toggleField(entry:AiMenuEntry,field:string,rules:AiRule[],mode:'read'|'write',enabled:boolean,audience:AiAudience,denied:Set<string>) {
  return toggleEntries([{...entry,fields:entry.fields.filter(f=>f.key===field)}],rules,mode,enabled,audience,denied)
}
