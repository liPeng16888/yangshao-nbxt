<template>
  <div
    ref="chartRef"
    class="report-chart"
    aria-label="图表，轻触数据点显示提示"
    @pointerdown.passive="recordTouchStart"
    @pointerup.passive="showTouchTooltip"
    @pointercancel.passive="cancelTouchGesture"
    @pointerleave.passive="cancelTouchGesture"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

const props = defineProps<{
  option: EChartsOption
}>()

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
const activeTouchPointers = new Set<number>()
let touchGesture: { pointerId: number; x: number; y: number; cancelled: boolean } | null = null

type ChartData = {
  count: () => number
  getItemLayout: (index: number) => unknown
  getItemGraphicEl?: (index: number) => { contain?: (x: number, y: number) => boolean } | undefined
}

type ChartSeries = {
  seriesIndex?: number
  subType?: string
  get?: (key: string) => unknown
  getData?: () => ChartData
}

type ChartModel = {
  getSeries?: () => ChartSeries[]
}

type LayoutRect = { x: number; y: number; width?: number; height?: number }
type LayoutPie = { cx: number; cy: number; r: number; r0?: number; startAngle: number; endAngle: number; clockwise: boolean }

function renderChart() {
  if (!chartRef.value) return
  chart ||= echarts.getInstanceByDom(chartRef.value) || echarts.init(chartRef.value)
  chart.setOption(props.option, true)
}

function resizeChart() {
  chart?.resize()
}

function recordTouchStart(event: PointerEvent) {
  if (event.pointerType !== 'touch') return

  activeTouchPointers.add(event.pointerId)
  if (!touchGesture) {
    touchGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false }
    return
  }

  touchGesture.cancelled = true
}

function showTouchTooltip(event: PointerEvent) {
  if (event.pointerType !== 'touch') return
  activeTouchPointers.delete(event.pointerId)
  if (!touchGesture) return

  if (event.pointerId !== touchGesture.pointerId) {
    touchGesture.cancelled = true
    return
  }

  const gesture = touchGesture
  touchGesture = null
  if (gesture.cancelled || activeTouchPointers.size > 0 || !chart || !chartRef.value) return

  const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y)
  if (moved > 10) return

  const bounds = chartRef.value.getBoundingClientRect()
  const nearest = findNearestDataItem(event.clientX - bounds.left, event.clientY - bounds.top)
  if (!nearest) return

  chart.dispatchAction({ type: 'showTip', ...nearest })
}

function cancelTouchGesture(event: PointerEvent) {
  if (event.pointerType !== 'touch') return
  activeTouchPointers.delete(event.pointerId)
  if (!touchGesture) return

  touchGesture.cancelled = true
  if (event.pointerId === touchGesture.pointerId) touchGesture = null
}

function findNearestDataItem(x: number, y: number): { seriesIndex: number; dataIndex: number } | null {
  const model = (chart as unknown as { getModel?: () => ChartModel } | null)?.getModel?.()
  const seriesList = model?.getSeries?.() || []
  let nearest: { seriesIndex: number; dataIndex: number; distance: number } | null = null

  for (let listIndex = 0; listIndex < seriesList.length; listIndex += 1) {
    const series = seriesList[listIndex]
    const data = series.getData?.()
    if (!data) continue

    const seriesIndex = series.seriesIndex ?? listIndex
    for (let dataIndex = 0; dataIndex < data.count(); dataIndex += 1) {
      const layout = data.getItemLayout(dataIndex)
      const graphic = data.getItemGraphicEl?.(dataIndex)
      const distance = graphic?.contain?.(x, y) === true ? 0 : series.subType === 'pie'
        ? pieDistance(x, y, layout)
        : cartesianDistance(x, y, layout)
      if (distance === null || (nearest && distance >= nearest.distance)) continue
      nearest = { seriesIndex, dataIndex, distance }
    }
  }

  if (!nearest) return null
  return { seriesIndex: nearest.seriesIndex, dataIndex: nearest.dataIndex }
}

function cartesianDistance(x: number, y: number, layout: unknown) {
  if (Array.isArray(layout) && layout.length >= 2 && isFiniteNumber(layout[0]) && isFiniteNumber(layout[1])) {
    const distance = Math.hypot(x - layout[0], y - layout[1])
    return distance <= 48 ? distance : null
  }

  if (!isLayoutRect(layout)) return null
  const x1 = Math.min(layout.x, layout.x + (layout.width || 0))
  const x2 = Math.max(layout.x, layout.x + (layout.width || 0))
  const y1 = Math.min(layout.y, layout.y + (layout.height || 0))
  const y2 = Math.max(layout.y, layout.y + (layout.height || 0))
  const nearestX = clamp(x, x1, x2)
  const nearestY = clamp(y, y1, y2)
  const distance = Math.hypot(x - nearestX, y - nearestY)
  return distance <= 48 ? distance : null
}

function pieDistance(x: number, y: number, layout: unknown) {
  if (!isLayoutPie(layout)) return null
  const radius = Math.hypot(x - layout.cx, y - layout.cy)
  const innerRadius = Math.max(0, layout.r0 || 0)
  const radialDistance = radius < innerRadius ? innerRadius - radius : Math.max(0, radius - layout.r)
  if (radialDistance > 24) return null

  const angle = normalizeAngle(Math.atan2(y - layout.cy, x - layout.cx))
  const angularDistance = distanceToArc(angle, layout.startAngle, layout.endAngle, layout.clockwise)
  return radialDistance + angularDistance * Math.max(radius, innerRadius, 1)
}

function distanceToArc(angle: number, start: number, end: number, clockwise: boolean) {
  const normalizedStart = normalizeAngle(start)
  const normalizedEnd = normalizeAngle(end)
  const span = clockwise
    ? normalizeAngle(end - start)
    : normalizeAngle(start - end)
  const progress = clockwise
    ? normalizeAngle(angle - normalizedStart)
    : normalizeAngle(normalizedStart - angle)
  if (progress <= span) return 0
  return Math.min(angleDistance(angle, normalizedStart), angleDistance(angle, normalizedEnd))
}

function normalizeAngle(angle: number) {
  const fullTurn = Math.PI * 2
  return ((angle % fullTurn) + fullTurn) % fullTurn
}

function angleDistance(left: number, right: number) {
  return Math.min(normalizeAngle(left - right), normalizeAngle(right - left))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isLayoutRect(layout: unknown): layout is LayoutRect {
  return typeof layout === 'object' && layout !== null
    && isFiniteNumber((layout as LayoutRect).x)
    && isFiniteNumber((layout as LayoutRect).y)
}

function isLayoutPie(layout: unknown): layout is LayoutPie {
  return typeof layout === 'object' && layout !== null
    && isFiniteNumber((layout as LayoutPie).cx)
    && isFiniteNumber((layout as LayoutPie).cy)
    && isFiniteNumber((layout as LayoutPie).r)
    && isFiniteNumber((layout as LayoutPie).startAngle)
    && isFiniteNumber((layout as LayoutPie).endAngle)
    && typeof (layout as LayoutPie).clockwise === 'boolean'
}

onMounted(() => {
  renderChart()
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
  chart = null
  activeTouchPointers.clear()
  touchGesture = null
})

watch(() => props.option, renderChart, { deep: true })
</script>

<style scoped lang="scss">
.report-chart {
  width: 100%;
  height: 340px;
}
</style>
