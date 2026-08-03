<template>
  <div ref="chartRef" class="finance-chart" />
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

function renderChart() {
  if (!chartRef.value) return
  chart ||= echarts.init(chartRef.value)
  chart.setOption(props.option, true)
}

onMounted(() => {
  renderChart()
  window.addEventListener('resize', renderChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', renderChart)
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
