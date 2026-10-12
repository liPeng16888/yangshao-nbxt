import {describe,it,expect} from 'vitest'
import {mount} from '@vue/test-utils'
import AiEntryField from './AiEntryField.vue'
describe('business-specific entry field editors',()=>{
  it('keeps zero numeric and false boolean values instead of dropping them',async()=>{const number=mount(AiEntryField,{props:{schema:{type:'number'},label:'金额',fieldKey:'amount'}});await number.get('input').setValue('0');expect(number.emitted('update:modelValue')!.at(-1)).toEqual([0]);number.unmount();const flag=mount(AiEntryField,{props:{schema:{type:'boolean'},label:'工作日',fieldKey:'isWorkday'}});await flag.get('select').setValue('false');expect(flag.emitted('update:modelValue')!.at(-1)).toEqual([false]);flag.unmount()})
  it('uses business labels for payment and unit choices',()=>{const wrapper=mount(AiEntryField,{props:{schema:{type:'string',enum:['BOTTLE','LITER','GRAM']},label:'单位',fieldKey:'unit'}});expect(wrapper.text()).toContain('瓶');expect(wrapper.text()).toContain('升');wrapper.unmount()})
  it('edits schedule times without requiring users to type JSON',async()=>{const wrapper=mount(AiEntryField,{props:{schema:{type:'array',items:{type:'object',properties:{startTime:{type:'string'},endTime:{type:'string'}},required:['startTime','endTime']}},label:'排班时间段',fieldKey:'segments',modelValue:[{}]}});await wrapper.get('input[aria-label="排班时间段第1项 · 开始时间"]').setValue('08:30');expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([[{startTime:'08:30'}]]);wrapper.unmount()})
})
