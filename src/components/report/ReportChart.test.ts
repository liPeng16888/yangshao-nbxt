// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReportChart from './ReportChart.vue'

type Layout = [number, number]
  | { x: number; y: number; width?: number; height?: number }
  | { cx: number; cy: number; r: number; r0?: number; startAngle: number; endAngle: number }

function series(type: 'line' | 'bar' | 'pie', layouts: Layout[]) {
  return {
    seriesIndex: 0,
    subType: type,
    getData: () => ({
      count: () => layouts.length,
      getItemLayout: (index: number) => layouts[index]
    })
  }
}

const mocks = vi.hoisted(() => ({
  chart: {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    dispatchAction: vi.fn(),
    getModel: vi.fn()
  },
  init: vi.fn(),
  getInstanceByDom: vi.fn()
}))

vi.mock('echarts', () => ({
  init: mocks.init,
  getInstanceByDom: mocks.getInstanceByDom
}))

function mountChart() {
  mocks.init.mockReturnValue(mocks.chart)
  mocks.getInstanceByDom.mockReturnValue(undefined)
  return mount(ReportChart, { props: { option: { xAxis: {}, yAxis: {}, series: [] } } })
}

async function tap(wrapper: ReturnType<typeof mountChart>, pointerId: number, x: number, y: number) {
  await wrapper.trigger('pointerdown', { pointerType: 'touch', pointerId, clientX: x, clientY: y })
  await wrapper.trigger('pointerup', { pointerType: 'touch', pointerId, clientX: x, clientY: y })
}

describe('ReportChart', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('selects the nearest rendered cartesian data item with series and data indexes', async () => {
    mocks.chart.getModel.mockReturnValue({ getSeries: () => [series('line', [[20, 20], [70, 70]])] })
    const wrapper = mountChart()

    await tap(wrapper, 1, 64, 66)

    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({ type: 'showTip', seriesIndex: 0, dataIndex: 1 })
    wrapper.unmount()
  })

  it('selects the nearest pie sector by angle within the chart interaction area', async () => {
    mocks.chart.getModel.mockReturnValue({
      getSeries: () => [
        series('pie', [
          { cx: 100, cy: 100, r0: 40, r: 80, startAngle: 0, endAngle: Math.PI },
          { cx: 100, cy: 100, r0: 40, r: 80, startAngle: Math.PI, endAngle: Math.PI * 2 }
        ])
      ]
    })
    const wrapper = mountChart()

    await tap(wrapper, 1, 100, 28)

    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({ type: 'showTip', seriesIndex: 0, dataIndex: 1 })
    wrapper.unmount()
  })

  it('does not dispatch a tooltip for empty data or a touch outside a rendered interaction area', async () => {
    mocks.chart.getModel.mockReturnValue({ getSeries: () => [series('bar', [])] })
    const wrapper = mountChart()
    await tap(wrapper, 1, 20, 20)
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()

    mocks.chart.getModel.mockReturnValue({ getSeries: () => [series('line', [[20, 20]])] })
    await tap(wrapper, 2, 500, 500)
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancels multi-pointer, cancelled, mismatched, and drag gestures before accepting a later normal tap', async () => {
    mocks.chart.getModel.mockReturnValue({ getSeries: () => [series('bar', [{ x: 20, y: 20, width: 24, height: 30 }])] })
    const wrapper = mountChart()

    await wrapper.trigger('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 24, clientY: 24 })
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()

    await wrapper.trigger('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointercancel', { pointerType: 'touch', pointerId: 3, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', pointerId: 3, clientX: 24, clientY: 24 })
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()

    await wrapper.trigger('pointerdown', { pointerType: 'touch', pointerId: 4, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', pointerId: 5, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', pointerId: 4, clientX: 24, clientY: 24 })
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()

    await wrapper.trigger('pointerdown', { pointerType: 'touch', pointerId: 6, clientX: 24, clientY: 24 })
    await wrapper.trigger('pointerup', { pointerType: 'touch', pointerId: 6, clientX: 24, clientY: 48 })
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()

    await tap(wrapper, 7, 24, 24)
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({ type: 'showTip', seriesIndex: 0, dataIndex: 0 })
    wrapper.unmount()
  })

  it('uses the current chart model after an option update and removes passive listeners on unmount', async () => {
    mocks.chart.getModel.mockReturnValue({ getSeries: () => [series('line', [[10, 10]])] })
    const wrapper = mountChart()
    mocks.chart.getModel.mockReturnValue({ getSeries: () => [series('line', [[70, 70]])] })
    await wrapper.setProps({ option: { xAxis: {}, yAxis: {}, series: [{ data: [70] }] } })

    await tap(wrapper, 9, 70, 70)
    expect(mocks.chart.dispatchAction).toHaveBeenCalledWith({ type: 'showTip', seriesIndex: 0, dataIndex: 0 })

    wrapper.unmount()
    mocks.chart.dispatchAction.mockClear()
    wrapper.element.dispatchEvent(new Event('pointerup', { bubbles: true }))
    expect(mocks.chart.dispatchAction).not.toHaveBeenCalled()
    expect(mocks.chart.dispose).toHaveBeenCalledOnce()
  })
})
