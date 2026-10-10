<template>
  <div ref="chartRef" class="finance-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { chartTheme } from '../../../shared/chartTheme'

const props = defineProps<{
  option: EChartsOption
}>()

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function renderChart() {
  if (!chartRef.value) return
  chart ||= echarts.init(chartRef.value, chartTheme)
  chart.setOption(props.option, true)
}

function resizeChart() {
  chart?.resize()
}

onMounted(() => {
  renderChart()
  if (chartRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resizeChart)
    resizeObserver.observe(chartRef.value)
  }
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  resizeObserver?.disconnect()
  chart?.dispose()
})

watch(() => props.option, renderChart, { deep: true })
</script>

<style scoped>
.finance-chart {
  width: 100%;
  height: 320px;
}
</style>
