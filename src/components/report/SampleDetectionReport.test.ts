import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import type { IncomeStatusSummary } from '@/types/financeBills'
import type { SampleDetectionReport as SampleDetectionReportData } from '@/types/report'
import SampleDetectionReport from './SampleDetectionReport.vue'

const statusSummaries: IncomeStatusSummary[] = [
  { status: '已结款', count: 2, amount: 200 },
  { status: '未结款', count: 1, amount: 60 },
  { status: '月结款', count: 3, amount: 300 },
  { status: '预存款', count: 0, amount: 0 },
  { status: '未选择', count: 0, amount: 0 }
]

const report: SampleDetectionReportData = {
  summary: {
    totalSamples: 6,
    totalPrice: 560,
    averageSamples: 6,
    averagePrice: 560,
    statusSummaries
  },
  rows: [
    {
      date: '2026-08-02',
      sampleCount: 6,
      totalPrice: 560,
      statusSummaries
    }
  ]
}

function mountReport() {
  return mount(SampleDetectionReport, {
    props: { report },
    global: {
      stubs: {
        ReportSummaryCards: { template: '<div />' },
        ReportChart: {
          props: ['option'],
          template: '<pre data-testid="chart-option">{{ JSON.stringify(option) }}</pre>'
        },
        ElButton: {
          template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>'
        },
        ElEmpty: { template: '<div />' },
        ElTable: { template: '<div><slot /></div>' },
        ElTableColumn: { template: '<div />' }
      }
    }
  })
}

describe('SampleDetectionReport', () => {
  it('switches the daily category chart from amounts to sample counts', async () => {
    const wrapper = mountReport()

    expect(wrapper.get('[data-testid="chart-option"]').text()).toContain('金额（元）')
    expect(wrapper.get('[data-testid="chart-option"]').text()).toContain('"data":[200]')
    expect(wrapper.get('[data-testid="chart-option"]').text()).toContain('"name":"当日总金额"')
    expect(wrapper.get('[data-testid="chart-option"]').text()).toContain('"type":"line"')
    expect(wrapper.get('[data-testid="chart-option"]').text()).toContain('"data":[560]')

    await wrapper.get('[data-testid="chart-metric-count"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="chart-option"]').text()).toContain('样品数量（个）')
    expect(wrapper.get('[data-testid="chart-option"]').text()).toContain('"data":[2]')
    expect(wrapper.get('[data-testid="chart-option"]').text()).not.toContain('当日总金额')
  })
})
