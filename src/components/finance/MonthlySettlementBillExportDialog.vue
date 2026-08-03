<template>
  <el-dialog
    :model-value="visible"
    title="导出本月详细费用"
    width="min(1180px, calc(100vw - 32px))"
    class="monthly-bill-export-dialog"
    @close="emit('close')"
  >
    <section class="bill-export-settings">
      <el-select
        data-testid="bill-customer-select"
        :model-value="selectedCustomer"
        placeholder="选择客户"
        @update:model-value="selectCustomer"
      >
        <el-option
          v-for="customer in customerOptions"
          :key="customer.value"
          :label="customer.label"
          :value="customer.value"
        />
      </el-select>
      <div v-if="draft" class="bill-price-grid">
        <label v-for="element in priceElements" :key="element.key" :data-element-key="element.key">
          <span>{{ element.label }}单价</span>
          <el-input-number
            data-testid="bill-price-input"
            :model-value="element.unitPrice"
            :min="0"
            :precision="2"
            controls-position="right"
            @update:model-value="updateElementPrice(element.key, $event)"
          />
        </label>
      </div>
    </section>

    <el-alert
      v-if="exportStatusMessage"
      data-testid="bill-export-status"
      class="bill-export-status"
      :title="exportStatusMessage"
      type="warning"
      :closable="false"
      show-icon
    />

    <section v-if="draft && tableLayout" class="monthly-bill-preview">
      <el-input
        data-testid="bill-preview-title-input"
        class="monthly-bill-preview__title"
        :model-value="draft.title"
        :title="draft.title"
        @update:model-value="updateTitle"
      />
      <p class="monthly-bill-preview__period">账期：{{ formatMonthlyBillMonth(draft.month) }}</p>
      <div class="monthly-bill-preview__table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <template v-for="groupIndex in tableLayout.groupCount" :key="groupIndex">
                <th>元素</th>
                <th>数量</th>
                <th>价格</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableLayout.detailRows" :key="row.id">
              <td
                v-if="row.showDate"
                class="monthly-bill-preview__editable-cell monthly-bill-preview__date-cell"
                :rowspan="row.dateRowSpan"
                :title="formatMonthlyBillDate(row.date)"
              >
                <el-input
                  data-testid="bill-preview-date-input"
                  :model-value="formatMonthlyBillDate(row.date)"
                  :title="formatMonthlyBillDate(row.date)"
                  @update:model-value="updateDateGroup(row.date, $event)"
                />
              </td>
              <template v-for="(entry, groupIndex) in row.entries" :key="groupIndex">
                <td
                  class="monthly-bill-preview__editable-cell"
                  :title="entry?.elementLabel || undefined"
                >
                  <el-input
                    v-if="entry"
                    data-testid="bill-preview-element-input"
                    :model-value="entry.elementLabel"
                    :title="entry.elementLabel"
                    @update:model-value="updateEntry(entry.id, { elementLabel: $event })"
                  />
                  <el-input
                    v-else
                    data-testid="bill-preview-empty-element-input"
                    :model-value="getEmptyElementDraft(row.id, groupIndex)"
                    placeholder="补充元素"
                    @update:model-value="updateEmptyElementDraft(row.id, groupIndex, $event)"
                    @change="commitEmptyEntry(row.id, row.date, groupIndex)"
                  />
                </td>
                <td class="monthly-bill-preview__editable-cell">
                  <el-input-number
                    v-if="entry"
                    data-testid="bill-preview-quantity-input"
                    :model-value="entry.quantity"
                    :min="0"
                    controls-position="right"
                    @update:model-value="updateEntry(entry.id, { quantity: $event })"
                  />
                  <el-input-number
                    v-else
                    data-testid="bill-preview-empty-quantity-input"
                    :model-value="undefined"
                    :min="0"
                    disabled
                    controls-position="right"
                  />
                </td>
                <td>{{ entry ? formatMonthlyBillMoney(entry.subtotal) : '' }}</td>
              </template>
            </tr>
            <tr
              v-for="(summaryRow, summaryIndex) in tableLayout.summaryRows"
              :key="`summary-${summaryIndex}`"
              class="summary-row"
            >
              <td v-if="summaryIndex === 0" :rowspan="tableLayout.summaryRows.length">元素合计</td>
              <template v-for="(total, groupIndex) in summaryRow" :key="groupIndex">
                <td
                  class="monthly-bill-preview__truncate"
                  :title="total?.elementLabel || undefined"
                >
                  {{ total?.elementLabel || '' }}
                </td>
                <td>{{ total?.quantity ?? '' }}</td>
                <td>{{ total ? formatMonthlyBillMoney(total.amount) : '' }}</td>
              </template>
            </tr>
            <tr class="grand-total-row">
              <td :colspan="1 + tableLayout.groupCount * 3">合计：{{ formatMonthlyBillMoney(draft.totalAmount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="exporting" @click="exportPng">保存为 PNG</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { MonthlySettlementDailyRow } from '@/types/financeBills'
import type { MonthlyBillDraft, MonthlyBillEntry } from '@/types/monthlySettlementBill'
import {
  addMonthlyBillManualEntry,
  applyMonthlyBillElementPrice,
  createMonthlyBillDraft,
  createMonthlyBillTableLayout,
  formatMonthlyBillDate,
  formatMonthlyBillMoney,
  formatMonthlyBillMonth,
  updateMonthlyBillEntry,
  validateMonthlyBillDraft
} from '@/utils/monthlySettlementBill'
import { downloadMonthlyBillAsPng } from '@/utils/monthlySettlementBillPng'

const props = defineProps<{
  visible: boolean
  month: string
  rows: MonthlySettlementDailyRow[]
}>()

const emit = defineEmits<{
  close: []
}>()

const selectedCustomer = ref('')
const draft = ref<MonthlyBillDraft | null>(null)
const exporting = ref(false)
const emptyElementDrafts = ref<Record<string, string>>({})

const customerOptions = computed(() => {
  const customers = new Map<string, string>()
  props.rows.forEach((row) => {
    if (!customers.has(row.customer)) customers.set(row.customer, row.customerDisplay || row.customer)
  })
  return Array.from(customers, ([value, label]) => ({ value, label }))
})

const tableLayout = computed(() => draft.value ? createMonthlyBillTableLayout(draft.value, 5) : null)
const exportStatusMessage = computed(() => {
  if (!selectedCustomer.value || !draft.value) return '请选择需要导出的客户'
  return validateMonthlyBillDraft(draft.value)[0]?.message || ''
})

const priceElements = computed(() => {
  if (!draft.value) return []
  const map = new Map<string, { key: string; label: string; unitPrice: number | null }>()
  draft.value.entries.forEach((entry) => {
    if (!map.has(entry.sourceElementKey)) {
      map.set(entry.sourceElementKey, {
        key: entry.sourceElementKey,
        label: entry.elementLabel,
        unitPrice: entry.unitPrice
      })
    }
  })
  return Array.from(map.values())
})

watch(() => props.visible, (visible) => {
  if (visible) resetDraft()
})

function resetDraft() {
  selectedCustomer.value = ''
  draft.value = null
  exporting.value = false
  emptyElementDrafts.value = {}
}

function selectCustomer(customer: string) {
  const selected = customerOptions.value.find((item) => item.value === customer)
  selectedCustomer.value = customer
  draft.value = selected
    ? createMonthlyBillDraft(props.rows, customer, selected.label, props.month)
    : null
}

function updateElementPrice(elementKey: string, unitPrice: number | null | undefined) {
  if (!draft.value) return
  draft.value = applyMonthlyBillElementPrice(draft.value, elementKey, unitPrice ?? null)
}

function updateTitle(title: string) {
  if (!draft.value) return
  draft.value = { ...draft.value, title }
}

function updateDateGroup(currentDate: string, nextDate: string) {
  if (!draft.value) return
  const entries = draft.value.entries.map((entry) => (
    entry.date === currentDate ? { ...entry, date: nextDate } : { ...entry }
  ))
  draft.value = { ...draft.value, entries }
}

function updateEntry(
  entryId: string,
  patch: Partial<Pick<MonthlyBillEntry, 'date' | 'elementLabel' | 'quantity' | 'unitPrice'>>
) {
  if (!draft.value) return
  draft.value = updateMonthlyBillEntry(draft.value, entryId, patch)
}

function getEmptyElementDraft(rowId: string, groupIndex: number) {
  return emptyElementDrafts.value[getEmptyCellKey(rowId, groupIndex)] || ''
}

function updateEmptyElementDraft(rowId: string, groupIndex: number, value: string) {
  emptyElementDrafts.value = {
    ...emptyElementDrafts.value,
    [getEmptyCellKey(rowId, groupIndex)]: value
  }
}

function commitEmptyEntry(rowId: string, date: string, groupIndex: number) {
  if (!draft.value) return
  const key = getEmptyCellKey(rowId, groupIndex)
  const elementLabel = (emptyElementDrafts.value[key] || '').trim()
  if (!elementLabel) return
  draft.value = addMonthlyBillManualEntry(draft.value, date, elementLabel, 0)
  const nextDrafts = { ...emptyElementDrafts.value }
  delete nextDrafts[key]
  emptyElementDrafts.value = nextDrafts
}

function getEmptyCellKey(rowId: string, groupIndex: number) {
  return `${rowId}__${groupIndex}`
}

async function exportPng() {
  if (exporting.value) return
  if (!draft.value) {
    ElMessage.warning('请选择需要导出的客户')
    return
  }

  const errors = validateMonthlyBillDraft(draft.value)
  if (errors.length) {
    ElMessage.warning(errors[0].message)
    return
  }

  exporting.value = true
  try {
    const exported = await downloadMonthlyBillAsPng(draft.value)
    if (exported) {
      ElMessage.success('账单图片已保存')
    } else {
      ElMessage.error('账单图片生成失败，请重试')
    }
  } catch {
    ElMessage.error('账单图片生成失败，请重试')
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped lang="scss">
:deep(.monthly-bill-export-dialog) {
  max-width: calc(100vw - 32px);
}

.bill-export-settings {
  display: grid;
  gap: 16px;
}

.bill-price-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;

  label {
    display: grid;
    gap: 6px;
    color: #475569;
    font-size: 13px;
  }
}

.monthly-bill-preview {
  margin-top: 20px;
}

.bill-export-status {
  margin-top: 16px;
}

.monthly-bill-preview {
  color: #1f2937;
}

.monthly-bill-preview__period {
  margin: 6px 0 12px;
  color: #64748b;
  font-size: 13px;
  text-align: center;
}

.monthly-bill-preview__title {
  width: 100%;

  :deep(.el-input__wrapper) {
    padding: 0;
    box-shadow: none;
  }

  :deep(.el-input__inner) {
    height: 32px;
    color: #0f172a;
    font-size: 18px;
    font-weight: 700;
    text-align: center;
  }
}

.monthly-bill-preview__truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monthly-bill-preview__table-wrap {
  overflow-x: auto;
}

.monthly-bill-preview table {
  width: 100%;
  min-width: 720px;
  table-layout: fixed;
  border-collapse: collapse;
  color: #1f2937;
  font-size: 13px;

  th,
  td {
    min-width: 68px;
    padding: 8px;
    border: 1px solid #94a3b8;
    text-align: center;
    overflow-wrap: anywhere;
  }

  th {
    background: #f1f5f9;
    font-weight: 600;
  }
}

.monthly-bill-preview td.monthly-bill-preview__truncate {
  max-width: 0;
}

.monthly-bill-preview__editable-cell {
  padding: 2px !important;

  :deep(.el-input),
  :deep(.el-input-number) {
    width: 100%;
    min-width: 0;
  }

  :deep(.el-input__wrapper) {
    padding: 0 4px;
    background: transparent;
    box-shadow: none;
  }

  :deep(.el-input__inner) {
    height: 28px;
    color: #1f2937;
    font-size: 13px;
    text-align: center;
  }

  :deep(.el-input-number__increase),
  :deep(.el-input-number__decrease) {
    display: none;
  }
}

.monthly-bill-preview__date-cell {
  min-width: 92px !important;
}

.summary-row td:first-child {
  background: #f8fafc;
  font-weight: 600;
}

.grand-total-row td {
  color: #dc2626;
  font-size: 15px;
  font-weight: 700;
  text-align: right;
}

@media (max-width: 760px) {
  .bill-export-settings,
  .bill-price-grid,
  .bill-price-grid label {
    min-width: 0;
  }

  .bill-export-settings :deep(.el-select),
  .bill-price-grid :deep(.el-input-number) {
    width: 100%;
    max-width: 100%;
  }

  .bill-price-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
