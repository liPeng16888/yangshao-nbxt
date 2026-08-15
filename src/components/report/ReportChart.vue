<template>
  <div
    ref="chartRef"
    class="report-chart"
    aria-label="图表，轻触数据点显示提示"
    @pointerdown="recordTouchStart"
    @pointerup="showTouchTooltip"
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
let touchStart: { x: number; y: number } | null = null

function renderChart() {
  if (!chartRef.value) return
  chart ||= echarts.getInstanceByDom(chartRef.value) || echarts.init(chartRef.value)
  chart.setOption(props.option, true)
}

function resizeChart() {
  chart?.resize()
}

function recordTouchStart(event: PointerEvent) {
  touchStart = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null
}

function showTouchTooltip(event: PointerEvent) {
  if (event.pointerType !== 'touch' || !touchStart || !chart || !chartRef.value) return

  const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y)
  touchStart = null
  if (moved > 10) return

  const bounds = chartRef.value.getBoundingClientRect()
  chart.dispatchAction({
    type: 'showTip',
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  })
}

onMounted(() => {
  renderChart()
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
  chart = null
})

watch(() => props.option, renderChart, { deep: true })
</script>

<style scoped lang="scss">
.report-chart {
  width: 100%;
  height: 340px;
}
</style>
