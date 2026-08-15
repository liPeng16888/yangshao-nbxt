// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReportChart from './ReportChart.vue'

const mocks = vi.hoisted(() => ({
  chart: {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    dispatchAction: vi.fn()
  },
  init: vi.fn(),
  getInstanceByDom: vi.fn()
}))

vi.mock('echarts', () => ({
  init: mocks.init,
  getInstanceByDom: mocks.getInstanceByDom
}))

describe('ReportChart', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mocks.init.mockReturnValue(mocks.chart)
    mocks.getInstanceByDom.mockReturnValue(undefined)
  })

  it('shows the ECharts tooltip after a tap but not after a scroll gesture', async () => {
    mocks.init.mockReturnValue(mocks.chart)
    const wrapper = mount(ReportChart, { props: { option: { xAxis: {}, yAxis: {}, series: [] } } })

    await wrapper.trigger('pointerdown', { pointerType: 'touch', clientX: 24, clientY: 36 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', clientX: 24, clientY: 36 })
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'showTip' }))

    mocks.chart.dispatchAction.mockClear()
    await wrapper.trigger('pointerdown', { pointerType: 'touch', clientX: 24, clientY: 36 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', clientX: 24, clientY: 64 })
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('resizes the existing chart and disposes it when the presentation unmounts', () => {
    mocks.init.mockReturnValue(mocks.chart)
    const wrapper = mount(ReportChart, { props: { option: { xAxis: {}, yAxis: {}, series: [] } } })

    window.dispatchEvent(new Event('resize'))
    expect(mocks.chart.resize).toHaveBeenCalledOnce()

    wrapper.unmount()
    expect(mocks.chart.dispose).toHaveBeenCalledOnce()
  })
})
