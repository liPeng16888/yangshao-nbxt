<template>
  <section class="mobile-report-filter" data-testid="mobile-report-filter">
    <button
      class="mobile-report-filter__summary mobile-touch-target"
      type="button"
      :aria-label="`打开报表筛选：${summary}`"
      @click="openDrawer"
    >
      <span>{{ summary }}</span>
      <span>筛选</span>
    </button>

    <el-drawer
      v-model="open"
      class="mobile-report-filter__drawer"
      title="报表筛选"
      direction="btt"
      size="auto"
    >
      <div class="mobile-report-filter__fields">
        <section>
          <h2>统计维度</h2>
          <el-radio-group v-model="draft.kind">
            <el-radio-button label="sample">收入数据统计</el-radio-button>
            <el-radio-button label="finance">开支数据统计</el-radio-button>
          </el-radio-group>
        </section>

        <section>
          <h2>时间范围</h2>
          <el-radio-group v-model="draft.mode">
            <el-radio-button label="daily">日报</el-radio-button>
            <el-radio-button label="weekly">周报</el-radio-button>
            <el-radio-button label="monthly">月报</el-radio-button>
            <el-radio-button label="custom">筛选日期</el-radio-button>
          </el-radio-group>
        </section>

        <el-date-picker
          v-if="draft.mode !== 'custom'"
          v-model="draft.date"
          type="date"
          value-format="YYYY-MM-DD"
          :teleported="false"
        />
        <template v-else>
          <el-date-picker
            v-model="draft.startDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="开始日期"
            :teleported="false"
          />
          <el-date-picker
            v-model="draft.endDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="结束日期"
            :teleported="false"
          />
        </template>
      </div>

      <template #footer>
        <button class="mobile-report-filter__search mobile-touch-target" data-testid="mobile-report-search" type="button" @click="search">
          查询
        </button>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { ReportKind } from '@/stores/report'
import type { ReportMode } from '@/types/report'

const props = withDefaults(defineProps<{
  kind?: ReportKind
  mode: ReportMode
  date: string
  startDate: string
  endDate: string
}>(), {
  kind: 'sample'
})

const emit = defineEmits<{
  'update:kind': [kind: ReportKind]
  'update:mode': [mode: ReportMode]
  'update:date': [date: string]
  'update:startDate': [date: string]
  'update:endDate': [date: string]
  search: []
}>()

const open = ref(false)
const draft = reactive({
  kind: props.kind,
  mode: props.mode,
  date: props.date,
  startDate: props.startDate,
  endDate: props.endDate
})
const summary = computed(() => {
  const modeLabel: Record<ReportMode, string> = {
    daily: '日报',
    weekly: '周报',
    monthly: '月报',
    custom: '自定义日期'
  }
  const dateRange = props.mode === 'custom' ? `${props.startDate} 至 ${props.endDate}` : props.date
  return `${props.kind === 'sample' ? '收入' : '开支'} · ${modeLabel[props.mode]} · ${dateRange}`
})

function syncDraft() {
  Object.assign(draft, {
    kind: props.kind,
    mode: props.mode,
    date: props.date,
    startDate: props.startDate,
    endDate: props.endDate
  })
}

function openDrawer() {
  syncDraft()
  open.value = true
}

function search() {
  emit('update:kind', draft.kind)
  emit('update:mode', draft.mode)
  emit('update:date', draft.date)
  emit('update:startDate', draft.startDate)
  emit('update:endDate', draft.endDate)
  open.value = false
  emit('search')
}

watch(
  () => [props.kind, props.mode, props.date, props.startDate, props.endDate],
  () => {
    if (!open.value) syncDraft()
  }
)
</script>

<style scoped lang="scss">
.mobile-report-filter__summary {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  color: #10233f;
  text-align: left;
  background: #ffffff;
  border: 1px solid #dce5ef;
  border-radius: 10px;

  span:first-child {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  span:last-child {
    flex: none;
    color: #2563eb;
    font-weight: 600;
  }
}

.mobile-report-filter__fields {
  display: grid;
  gap: 18px;

  section {
    display: grid;
    gap: 10px;
  }

  h2 {
    margin: 0;
    color: #334155;
    font-size: 14px;
  }

  :deep(.el-radio-group) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  :deep(.el-radio-button) {
    min-width: 0;
  }

  :deep(.el-radio-button__inner) {
    display: inline-flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  :deep(.el-date-editor) {
    width: 100%;
    min-height: 44px;
  }
}

.mobile-report-filter__search {
  width: 100%;
  color: #ffffff;
  font-weight: 700;
  background: #2563eb;
  border: 0;
  border-radius: 8px;
}

:deep(.mobile-report-filter__drawer .el-drawer__body) {
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}
</style>
