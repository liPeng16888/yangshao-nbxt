import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { compileString } from 'sass'
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

const source = readFileSync(resolve(process.cwd(), 'src/components/report/SampleDetectionReport.vue'), 'utf8')
const style = source.match(/<style scoped lang="scss">([\s\S]*?)<\/style>/)?.[1] || ''
const compiledCss = compileString(style).css

function mountReport(mobile = false) {
  return mount(SampleDetectionReport, {
    props: { report, mobile },
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

  it('keeps status summaries in two mobile columns after the desktop 1200px cascade', () => {
    const mobile = mountReport(true)
    const desktop = mountReport(false)

    expect(mobile.get('.status-grid').classes()).toContain('status-grid--mobile')
    expect(desktop.get('.status-grid').classes()).not.toContain('status-grid--mobile')
    expect(compiledCss.lastIndexOf('.status-grid.status-grid--mobile')).toBeGreaterThan(compiledCss.indexOf('@media (max-width: 1200px)'))
    expect(compiledCss.slice(compiledCss.lastIndexOf('.status-grid.status-grid--mobile'))).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(compiledCss).toContain('grid-template-columns: repeat(3, minmax(150px, 1fr))')
    expect(compiledCss).toContain('grid-template-columns: repeat(5, minmax(150px, 1fr))')
  })

  it('enlarges chart metric actions only in the mobile report layout', () => {
    const mobile = mountReport(true)
    const desktop = mountReport(false)

    expect(mobile.get('[data-testid="chart-metric-amount"]').classes()).toContain('mobile-touch-target')
    expect(mobile.get('[data-testid="chart-metric-count"]').classes()).toContain('mobile-touch-target')
    expect(desktop.get('[data-testid="chart-metric-amount"]').classes()).not.toContain('mobile-touch-target')
    expect(desktop.get('[data-testid="chart-metric-count"]').classes()).not.toContain('mobile-touch-target')
  })
})
