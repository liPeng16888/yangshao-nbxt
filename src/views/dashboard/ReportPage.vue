<template>
  <div class="page-stack" :class="{ 'mobile-page': isMobileLayout }" v-loading="pageLoading" :aria-busy="pageLoading">
    <div v-if="!isMobileLayout" class="toolbar">
      <ReportTabs v-model:kind="reportStore.kind" />
    </div>
    <MobileReportFilter
      v-if="isMobileLayout"
      v-model:kind="reportStore.kind"
      v-model:mode="reportStore.mode"
      v-model:date="reportStore.date"
      v-model:start-date="reportStore.startDate"
      v-model:end-date="reportStore.endDate"
      @search="searchMobileReport"
    />
    <ReportFilterBar
      v-else
      v-model:mode="reportStore.mode"
      v-model:date="reportStore.date"
      v-model:start-date="reportStore.startDate"
      v-model:end-date="reportStore.endDate"
      @search="loadReport"
    />

    <section v-if="loadError" class="report-load-error" data-testid="mobile-report-load-error" role="alert">
      <span>报表加载失败，请检查网络后重试。</span>
      <button class="mobile-touch-target" data-testid="retry-mobile-report" type="button" @click="loadReport">重试</button>
    </section>
    <p v-if="pageLoading" class="report-loading-status" data-testid="mobile-report-loading" role="status" aria-live="polite">正在加载报表…</p>

    <SampleDetectionReport
      v-if="reportStore.kind === 'sample' && reportStore.sampleReport"
      :report="reportStore.sampleReport"
      :mobile="isMobileLayout"
    />
    <FinanceReport
      v-if="reportStore.kind === 'finance' && reportStore.financeReport"
      :report="reportStore.financeReport"
      :mobile="isMobileLayout"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FinanceReport from '@/components/report/FinanceReport.vue'
import MobileReportFilter from '@/components/report/MobileReportFilter.vue'
import ReportFilterBar from '@/components/report/ReportFilterBar.vue'
import ReportTabs from '@/components/report/ReportTabs.vue'
import SampleDetectionReport from '@/components/report/SampleDetectionReport.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useReportStore } from '@/stores/report'

const reportStore = useReportStore()
const { isMobileLayout } = useMobileLayout()
const loadError = ref(false)
const pageLoading = ref(false)
let activeLoad = 0
let suppressMobileKindLoad = false
let disposed = false

async function loadReport() {
  const loadId = ++activeLoad
  pageLoading.value = true
  loadError.value = false
  try {
    await reportStore.loadReport()
    if (loadId === activeLoad && !disposed) loadError.value = false
  } catch {
    if (loadId === activeLoad && !disposed) loadError.value = true
  } finally {
    if (loadId === activeLoad && !disposed) pageLoading.value = false
  }
}

function searchMobileReport() {
  suppressMobileKindLoad = true
  void loadReport()
  queueMicrotask(() => {
    suppressMobileKindLoad = false
  })
}

onMounted(() => {
  void loadReport()
})

watch(
  () => reportStore.kind,
  () => {
    if (isMobileLayout.value && suppressMobileKindLoad) return
    void loadReport()
  }
)

onBeforeUnmount(() => {
  disposed = true
  activeLoad += 1
})
</script>

<style scoped lang="scss">
.report-load-error {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  button {
    flex: none;
    color: #9a3412;
    background: #ffffff;
    border: 1px solid currentcolor;
    border-radius: 6px;
  }
}

.report-loading-status {
  margin: 0;
  color: #475569;
  font-size: 14px;
}
</style>
