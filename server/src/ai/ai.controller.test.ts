import {describe,expect,it,vi} from 'vitest'
import {ConflictException,HttpException} from '@nestjs/common'
import {AiController} from './ai.controller'
describe('AI route error privacy',()=>{
  it('does not return unrestricted business conflict snapshots to the client',async()=>{
    const controller=new AiController({confirm:vi.fn().mockRejectedValue(new ConflictException({code:'CALCULATION_DRAFT_CONFLICT',serverDraft:{parameters:{ironFactor:99},customer:'hidden'}}))} as never)
    const error=await controller.confirm({} as never,'proposal',{}).catch(error=>error)
    expect(error).toBeInstanceOf(HttpException);expect(error.getStatus()).toBe(409)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/ironFactor|parameters|customer|hidden|serverDraft/)
  })
  it('preserves a safe status and explanation without arbitrary detail',async()=>{
    const controller=new AiController({confirm:vi.fn().mockRejectedValue(new ConflictException({message:'记录已变化',current:{private:'secret'}}))} as never)
    const error=await controller.confirm({} as never,'proposal',{}).catch(error=>error)
    expect(error.getResponse()).toBe('记录已变化')
  })
})
