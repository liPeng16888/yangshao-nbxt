<template>
  <div class="page-stack" v-loading="reportStore.loading">
    <div class="toolbar">
      <ReportTabs v-model:kind="reportStore.kind" />
    </div>
    <ReportFilterBar
      v-model:mode="reportStore.mode"
      v-model:date="reportStore.date"
      v-model:start-date="reportStore.startDate"
      v-model:end-date="reportStore.endDate"
      @search="reportStore.loadReport"
    />

    <SampleDetectionReport
      v-if="reportStore.kind === 'sample' && reportStore.sampleReport"
      :report="reportStore.sampleReport"
    />
    <FinanceReport
      v-if="reportStore.kind === 'finance' && reportStore.financeReport"
      :report="reportStore.financeReport"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import FinanceReport from '@/components/report/FinanceReport.vue'
import ReportFilterBar from '@/components/report/ReportFilterBar.vue'
import ReportTabs from '@/components/report/ReportTabs.vue'
import SampleDetectionReport from '@/components/report/SampleDetectionReport.vue'
import { useReportStore } from '@/stores/report'

const reportStore = useReportStore()

onMounted(() => {
  reportStore.loadReport()
})

watch(
  () => reportStore.kind,
  () => reportStore.loadReport()
)
</script>
