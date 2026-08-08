<template>
  <div class="page">
    <section class="panel">
      <div class="panel__header">
        <strong>数据统计</strong>
        <div class="filters">
          <el-switch v-model="historyLookupEnabled" active-text="历史数据查看" />
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
          <template #default="{ row }">
            <div class="history-cell">
              <span>{{ row.inputs.sequence || String(row.index).padStart(3, '0') }}</span>
              <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, 'sequence', '编号')">历史</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="样品编号" min-width="160">
          <template #default="{ row }">
            <div class="history-cell">
              <span>{{ row.inputs.sampleNumber || '无信息' }}</span>
              <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, 'sampleNumber', '样品编号')">历史</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="260">
          <template #default="{ row }">
            <div class="history-cell history-cell--customer">
              <span :title="customerName(row.inputs)">{{ customerName(row.inputs) }}</span>
              <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, ['customerText', 'customerId', 'customerIds', 'customers'], '客户')">历史</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <div class="history-cell">
              <span>¥{{ money(row.inputs.price) }}</span>
              <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, 'price', '金额')">历史</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="费用状态" width="120">
          <template #default="{ row }">
            <div class="history-cell">
              <span>{{ row.inputs.paymentStatus || '未选择' }}</span>
              <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, 'paymentStatus', '费用状态')">历史</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="化验元素" min-width="160">
          <template #default="{ row }">
            <div class="history-cell">
              <span>{{ row.inputs.elementNote || '未选择' }}</span>
              <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, 'elementNote', '化验元素')">历史</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          v-for="column in elementColumns"
          :key="column.key"
          :label="column.label"
          :min-width="column.minWidth || 96"
        >
          <template #default="{ row }">
            <div class="history-cell">
              <span>{{ elementDisplay(row, column) }}</span>
              <el-button v-if="historyLookupEnabled" link type="primary" @click="openHistory(row.id, historyFieldsForColumn(column), column.label)">历史</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-empty v-if="!loading && !sheets.length" description="暂无数据" />

    <el-dialog v-model="historyVisible" :title="historyTitle" width="760px">
      <el-table :data="historyRows" border>
        <el-table-column prop="changedAt" label="修改时间" width="190" />
        <el-table-column label="字段" width="140">
          <template #default="{ row }">{{ fieldLabel(row.field) }}</template>
        </el-table-column>
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
const historyLookupEnabled = ref(false)
const historyTitle = ref('单元格修改历史')
const highlightedBlockId = ref('')
const routeReady = ref(false)

type ElementColumn = {
  key: string
  label: string
  source: 'input' | 'result'
  field: string
  requiredFields?: string[]
  historyFields?: string[]
  requireMode?: 'all' | 'any'
  minWidth?: number
}

const elementColumns: ElementColumn[] = [
  { key: 'iron', label: '铁', source: 'result', field: 'iron', requiredFields: ['ironRaw'] },
  { key: 'silicon', label: '硅', source: 'result', field: 'silicon', requiredFields: ['siliconRaw'], historyFields: ['siliconRaw', 'siliconAdjust'] },
  { key: 'aluminum', label: '铝', source: 'result', field: 'aluminum', requiredFields: ['aluminumRaw'], historyFields: ['aluminumRaw', 'aluminumAdjust'] },
  {
    key: 'aluminumSiliconRatio',
    label: '铝硅比',
    source: 'result',
    field: 'aluminumSiliconRatio',
    requiredFields: ['aluminumRaw', 'siliconRaw'],
    historyFields: ['aluminumRaw', 'aluminumAdjust', 'siliconRaw', 'siliconAdjust'],
    requireMode: 'any',
    minWidth: 108
  },
  {
    key: 'total',
    label: '合量',
    source: 'result',
    field: 'total',
    requiredFields: ['ironRaw', 'siliconRaw', 'aluminumRaw'],
    historyFields: ['ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust'],
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
    field: 'bottleDensity',
    requiredFields: ['waterSample', 'bottleWater', 'bottleWaterSample'],
    minWidth: 122
  },
  {
    key: 'moisture',
    label: '水份',
    source: 'input',
    field: 'moisture'
  },
  {
    key: 'burnLoss',
    label: '灼减',
    source: 'result',
    field: 'burnLoss',
    requiredFields: ['crucible', 'sampleWeight', 'burnedCrucibleSample']
  }
]

const fieldLabels: Record<string, string> = {
  sequence: '编号',
  sampleNumber: '样品编号',
  customerId: '客户',
  customerIds: '客户',
  customers: '客户',
  customerText: '客户',
  price: '金额',
  paymentStatus: '费用状态',
  ironRaw: '铁',
  siliconRaw: '硅',
  siliconAdjust: '硅调整数',
  aluminumRaw: '铝',
  aluminumAdjust: '铝调整数',
  sulfur: '硫',
  densityRaw: '比重',
  whiteness: '白度',
  calciumRaw: '钙',
  magnesiumRaw: '镁',
  carbon: '碳',
  titaniumRaw: '钛',
  waterSample: '样',
  bottleWater: '瓶+水',
  bottleWaterSample: '瓶+水+样',
  crucible: '坩埚',
  sampleWeight: '样重',
  burnedCrucibleSample: '烧坩埚+样',
  elementNote: '化验元素',
  note: '备注'
}

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

async function openHistory(blockId: string, fields: string | string[], label: string) {
  const normalizedFields = Array.isArray(fields) ? fields : [fields]
  historyTitle.value = `${label}修改历史`
  historyRows.value = await request.get('/admin/data-statistics/cell-history', {
    params: { blockId, fields: normalizedFields.join(',') }
  })
  historyVisible.value = true
}

function getRowClassName({ row }: { row: any }) {
  return row.id === highlightedBlockId.value ? 'admin-highlight-row' : ''
}

function customerName(inputs: any) {
  if (Array.isArray(inputs.customers) && inputs.customers.length) {
    const customerText = inputs.customers.map(formatCustomerDisplay).filter(Boolean).join('、')
    if (customerText) return customerText
  }
  if (inputs.customerText) return inputs.customerText
  return '无信息'
}

function formatCustomerDisplay(customer: any) {
  if (!customer || typeof customer !== 'object') return ''
  return [customer.name, customer.phone, customer.wechat, customer.wechatNickname, customer.note]
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .join(' ')
}

function elementDisplay(row: any, column: ElementColumn) {
  if (column.requiredFields?.length && !hasRequiredInputs(row.inputs, column)) return ''
  const source = column.source === 'input' ? row.inputs : row.results
  return formatOptionalNumber(source?.[column.field])
}

function historyFieldsForColumn(column: ElementColumn) {
  return column.historyFields || column.requiredFields || [column.field]
}

function fieldLabel(field: string) {
  return fieldLabels[field] || field
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
.history-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.history-cell > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-cell--customer {
  align-items: flex-start;
  width: 100%;
}

.history-cell--customer > span {
  overflow: visible;
  text-overflow: initial;
  white-space: normal;
  overflow-wrap: anywhere;
}

.history-cell :deep(.el-button) {
  height: auto;
  padding: 0;
}

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
