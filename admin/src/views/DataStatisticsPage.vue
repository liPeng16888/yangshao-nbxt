<template>
  <div class="page">
    <section class="panel">
      <div class="panel__header">
        <strong>数据统计</strong>
        <div class="filters">
          <el-select v-model="selectedFrontendIds" multiple filterable collapse-tags placeholder="选择前端账号" style="width: 300px">
            <el-option v-for="item in frontendOptions" :key="item.id" :label="`${item.name}（${item.account}）`" :value="item.id" />
          </el-select>
          <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" />
          <el-button type="primary" :loading="loading" @click="loadData">查询</el-button>
        </div>
      </div>
    </section>

    <section v-for="sheet in sheets" :key="sheet.id" class="panel">
      <div class="panel__header">
        <strong>{{ sheet.name }} - {{ sheet.date }}</strong>
        <span>只读数据</span>
      </div>
      <el-table :data="sheet.sampleBlocks" border :row-class-name="getRowClassName" row-key="id">
        <el-table-column label="编号" width="90">
          <template #default="{ row }">{{ row.inputs.sequence || String(row.index).padStart(3, '0') }}</template>
        </el-table-column>
        <el-table-column label="样品编号" min-width="160">
          <template #default="{ row }">
            <span>{{ row.inputs.sampleNumber || '无信息' }}</span>
            <el-button link type="primary" @click="openHistory(row.id, 'sampleNumber')">历史</el-button>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">
            <span>{{ customerName(row.inputs) }}</span>
            <el-button link type="primary" @click="openHistory(row.id, 'customerText')">历史</el-button>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">¥{{ money(row.inputs.price) }}</template>
        </el-table-column>
        <el-table-column label="费用状态" width="120">
          <template #default="{ row }">{{ row.inputs.paymentStatus || '未选择' }}</template>
        </el-table-column>
        <el-table-column
          v-for="column in elementColumns"
          :key="column.key"
          :label="column.label"
          :min-width="column.minWidth || 96"
        >
          <template #default="{ row }">{{ elementDisplay(row, column) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <el-empty v-if="!loading && !sheets.length" description="暂无数据" />

    <el-dialog v-model="historyVisible" title="单元格修改历史" width="760px">
      <el-table :data="historyRows" border>
        <el-table-column prop="changedAt" label="修改时间" width="190" />
        <el-table-column prop="field" label="字段" width="120" />
        <el-table-column label="旧值">
          <template #default="{ row }">{{ displayValue(row.oldValue) }}</template>
        </el-table-column>
        <el-table-column label="新值">
          <template #default="{ row }">{{ displayValue(row.newValue) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { buildFrontendIds, getFrontendOptions, request } from '../api'
import type { FrontendOption } from '../types'

const route = useRoute()
const frontendOptions = ref<FrontendOption[]>([])
const selectedFrontendIds = ref<string[]>([])
const date = ref(dayjs().format('YYYY-MM-DD'))
const sheets = ref<any[]>([])
const historyRows = ref<any[]>([])
const loading = ref(false)
const historyVisible = ref(false)
const highlightedBlockId = ref('')
const routeReady = ref(false)

type ElementColumn = {
  key: string
  label: string
  source: 'input' | 'result'
  field: string
  requiredFields?: string[]
  requireMode?: 'all' | 'any'
  minWidth?: number
}

const elementColumns: ElementColumn[] = [
  { key: 'iron', label: '铁', source: 'result', field: 'iron', requiredFields: ['ironRaw'] },
  { key: 'silicon', label: '硅', source: 'result', field: 'silicon', requiredFields: ['siliconRaw'] },
  { key: 'aluminum', label: '铝', source: 'result', field: 'aluminum', requiredFields: ['aluminumRaw'] },
  {
    key: 'aluminumSiliconRatio',
    label: '铝硅比',
    source: 'result',
    field: 'aluminumSiliconRatio',
    requiredFields: ['aluminumRaw', 'siliconRaw'],
    requireMode: 'any',
    minWidth: 108
  },
  {
    key: 'total',
    label: '合量',
    source: 'result',
    field: 'total',
    requiredFields: ['ironRaw', 'siliconRaw', 'aluminumRaw'],
    requireMode: 'any'
  },
  { key: 'sulfur', label: '硫', source: 'input', field: 'sulfur' },
  { key: 'density', label: '比重', source: 'result', field: 'density', requiredFields: ['densityRaw'] },
  { key: 'whiteness', label: '白度', source: 'input', field: 'whiteness' },
  { key: 'calcium', label: '钙', source: 'result', field: 'calcium', requiredFields: ['calciumRaw'] },
  { key: 'magnesium', label: '镁', source: 'result', field: 'magnesium', requiredFields: ['calciumRaw', 'magnesiumRaw'] },
  { key: 'carbon', label: '碳', source: 'input', field: 'carbon' },
  { key: 'titanium', label: '钛', source: 'result', field: 'titanium', requiredFields: ['titaniumRaw'] },
  {
    key: 'bottleDensity',
    label: '比重(瓶法)',
    source: 'result',
    field: 'moisture',
    requiredFields: ['waterSample', 'bottleWater', 'bottleWaterSample'],
    minWidth: 122
  },
  {
    key: 'moisture',
    label: '水份',
    source: 'result',
    field: 'moisture',
    requiredFields: ['waterSample', 'bottleWater', 'bottleWaterSample']
  },
  {
    key: 'burnLoss',
    label: '灼减',
    source: 'result',
    field: 'burnLoss',
    requiredFields: ['crucible', 'sampleWeight', 'burnedCrucibleSample']
  }
]

onMounted(async () => {
  frontendOptions.value = await getFrontendOptions()
  applyRouteQuery()
  routeReady.value = true
  await loadDataAndFocus()
})

watch(
  () => route.fullPath,
  async () => {
    if (!routeReady.value) return
    applyRouteQuery()
    await loadDataAndFocus()
  }
)

function applyRouteQuery() {
  const routeDate = queryValue(route.query.date)
  if (routeDate) date.value = routeDate

  const routeFrontendIds = queryValue(route.query.frontendUserIds)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  selectedFrontendIds.value = routeFrontendIds.length ? routeFrontendIds : frontendOptions.value.map((item) => item.id)
  highlightedBlockId.value = queryValue(route.query.blockId)
}

async function loadData() {
  loading.value = true
  try {
    sheets.value = await request.get('/admin/data-statistics/lab-sheets', {
      params: { date: date.value, frontendUserIds: buildFrontendIds(selectedFrontendIds.value) }
    })
  } finally {
    loading.value = false
  }
}

async function loadDataAndFocus() {
  await loadData()
  await scrollToHighlightedRow()
}

async function scrollToHighlightedRow() {
  if (!highlightedBlockId.value) return
  await nextTick()
  const row = document.querySelector('.admin-highlight-row') as HTMLElement | null
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function openHistory(blockId: string, field: string) {
  historyRows.value = await request.get('/admin/data-statistics/cell-history', { params: { blockId, field } })
  historyVisible.value = true
}

function getRowClassName({ row }: { row: any }) {
  return row.id === highlightedBlockId.value ? 'admin-highlight-row' : ''
}

function customerName(inputs: any) {
  if (inputs.customerText) return inputs.customerText
  if (Array.isArray(inputs.customers) && inputs.customers.length) return inputs.customers.map((item: any) => item.name).join('、')
  return '无信息'
}

function elementDisplay(row: any, column: ElementColumn) {
  if (column.requiredFields?.length && !hasRequiredInputs(row.inputs, column)) return ''
  const source = column.source === 'input' ? row.inputs : row.results
  return formatOptionalNumber(source?.[column.field])
}

function hasRequiredInputs(inputs: any, column: ElementColumn) {
  const checker = (field: string) => hasValue(inputs?.[field])
  return column.requireMode === 'any' ? column.requiredFields!.some(checker) : column.requiredFields!.every(checker)
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== ''
}

function formatOptionalNumber(value: unknown) {
  if (!hasValue(value)) return ''
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value)
}

function money(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '空'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function queryValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return typeof value === 'string' ? value : ''
}
</script>

<style scoped>
:deep(.admin-highlight-row > td) {
  background: #fff5f5 !important;
  border-top: 2px solid #e03131 !important;
  border-bottom: 2px solid #e03131 !important;
}

:deep(.admin-highlight-row > td:first-child) {
  border-left: 2px solid #e03131 !important;
}

:deep(.admin-highlight-row > td:last-child) {
  border-right: 2px solid #e03131 !important;
}

:deep(.admin-highlight-row .cell) {
  color: #b42318;
  font-weight: 600;
}
</style>
