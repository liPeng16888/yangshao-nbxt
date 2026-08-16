import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import MobileMonthlySettlementList from './MobileMonthlySettlementList.vue'
import type { MonthlySettlementSummaryRow } from '@/types/financeBills'

function makeSummary(id: string, customer: string, remark: string): MonthlySettlementSummaryRow {
  return {
    id,
    month: '2026-08',
    customer,
    customerDisplay: customer,
    sampleCount: 1,
    amount: 100,
    settlementStatus: '未结款',
    paidAmount: null,
    remark
  }
}

function mountList(summaries: MonthlySettlementSummaryRow[]) {
  return mount(MobileMonthlySettlementList, {
    props: { summaries, dailyRows: [], savingId: '' }
  })
}

function remark(wrapper: ReturnType<typeof mountList>, id: string) {
  return wrapper.get(`[data-testid="mobile-monthly-remark-${id}"]`)
}

describe('MobileMonthlySettlementList remark drafts', () => {
  it('preserves a dirty row while resyncing an unrelated clean row patch', async () => {
    const rows = [makeSummary('a', '客户甲', '甲原值'), makeSummary('b', '客户乙', '乙原值')]
    const wrapper = mountList(rows)
    await remark(wrapper, 'a').setValue('甲正在输入')

    await wrapper.setProps({ summaries: [rows[0], { ...rows[1], remark: '乙服务端更新' }] })

    expect((remark(wrapper, 'a').element as HTMLTextAreaElement).value).toBe('甲正在输入')
    expect((remark(wrapper, 'b').element as HTMLTextAreaElement).value).toBe('乙服务端更新')
  })

  it('preserves a newer edit when the same row receives the submitted authoritative value', async () => {
    const row = makeSummary('a', '客户甲', '原值')
    const wrapper = mountList([row])
    await remark(wrapper, 'a').setValue('已提交快照')
    await remark(wrapper, 'a').trigger('blur')
    await remark(wrapper, 'a').setValue('提交后继续输入')
    await wrapper.setProps({ savingId: 'a' })

    await wrapper.setProps({ summaries: [{ ...row, remark: '已提交快照' }] })
    await wrapper.setProps({ savingId: '' })

    expect((remark(wrapper, 'a').element as HTMLTextAreaElement).value).toBe('提交后继续输入')
    expect(wrapper.emitted('remarkCommit')?.[0]?.[1]).toBe('已提交快照')
  })

  it('resyncs an external authoritative change while the row is clean', async () => {
    const row = makeSummary('a', '客户甲', '原值')
    const wrapper = mountList([row])

    await wrapper.setProps({ summaries: [{ ...row, remark: '服务端新值' }] })

    expect((remark(wrapper, 'a').element as HTMLTextAreaElement).value).toBe('服务端新值')
  })

  it('drops removed row state and initializes added or re-added rows from authoritative values', async () => {
    const rowA = makeSummary('a', '客户甲', '甲原值')
    const rowB = makeSummary('b', '客户乙', '乙原值')
    const wrapper = mountList([rowA])
    await remark(wrapper, 'a').setValue('不应复活的草稿')

    await wrapper.setProps({ summaries: [rowB] })
    await nextTick()
    expect(wrapper.find('[data-testid="mobile-monthly-remark-a"]').exists()).toBe(false)
    expect((remark(wrapper, 'b').element as HTMLTextAreaElement).value).toBe('乙原值')

    await wrapper.setProps({ summaries: [rowB, { ...rowA, remark: '甲重新载入' }] })
    expect((remark(wrapper, 'a').element as HTMLTextAreaElement).value).toBe('甲重新载入')
  })
})
