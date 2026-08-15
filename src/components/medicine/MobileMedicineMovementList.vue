<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import MobileRecordCard from '@/components/mobile/MobileRecordCard.vue'
import type { MedicineInventoryItem, MedicineInventoryMovement, MedicineMovementKind } from '@/types/medicineInventory'
import { formatDateTime } from '@/utils/date'
import { formatMedicineQuantity } from '@/utils/medicineInventory'

const props = defineProps<{
  kind: MedicineMovementKind
  rows: MedicineInventoryMovement[]
  items: MedicineInventoryItem[]
  loading: boolean
  error: string
  selectedMedicineItemIds: string[]
  dateRange?: string[]
  correctableIds: string[]
  correctedMovementIds: string[]
}>()

const emit = defineEmits<{
  filter: [value: { medicineItemIds: string[]; dateRange?: string[] }]
  correct: [movement: MedicineInventoryMovement]
  retry: []
}>()

const filterOpen = ref(false)
const draftMedicineItemIds = ref<string[]>([])
const draftDateRange = ref<string[] | undefined>()
const expandedIds = ref(new Set<string>())

watch(() => [props.selectedMedicineItemIds, props.dateRange] as const, ([ids, dates]) => {
  if (filterOpen.value) return
  draftMedicineItemIds.value = [...ids]
  draftDateRange.value = dates ? [...dates] : undefined
}, { immediate: true, deep: true })

watch(() => props.rows, (rows) => {
  expandedIds.value = new Set(rows.map((row) => row.id))
}, { immediate: true })

const selectedSummary = computed(() => {
  const parts: string[] = []
  if (props.selectedMedicineItemIds.length) parts.push(`已选 ${props.selectedMedicineItemIds.length} 项`)
  if (props.dateRange?.length === 2) parts.push(`${props.dateRange[0]} 至 ${props.dateRange[1]}`)
  return parts.join('，') || '全部记录'
})

function applyFilter() {
  emit('filter', {
    medicineItemIds: [...draftMedicineItemIds.value],
    dateRange: draftDateRange.value ? [...draftDateRange.value] : undefined
  })
  filterOpen.value = false
}

function resetFilter() {
  draftMedicineItemIds.value = []
  draftDateRange.value = undefined
  emit('filter', { medicineItemIds: [], dateRange: undefined })
  filterOpen.value = false
}

function setExpanded(id: string, expanded: boolean) {
  const next = new Set(expandedIds.value)
  if (expanded) next.add(id)
  else next.delete(id)
  expandedIds.value = next
}

function movementTypeLabel(type: MedicineInventoryMovement['type']) {
  if (type === 'INBOUND') return '入库'
  if (type === 'OUTBOUND') return '出库'
  if (type === 'CORRECTION_IN') return '更正入库'
  return '更正出库'
}

function currentQuantity(row: MedicineInventoryMovement) {
  const item = props.items.find((candidate) => candidate.id === row.medicineItemId)
  return item ? `${formatMedicineQuantity(item.currentQuantity)} ${item.unitLabel}` : '-'
}
</script>

<template>
  <section class="mobile-medicine-movements" :aria-labelledby="`mobile-${kind}-history-title`">
    <header class="mobile-medicine-movements__heading">
      <div>
        <h2 :id="`mobile-${kind}-history-title`">{{ kind === 'inbound' ? '入库明细' : '出库明细' }}</h2>
        <p class="muted">已提交记录不可编辑或删除；如需调整，请使用更正。</p>
      </div>
      <button class="mobile-touch-target mobile-medicine-movements__refresh" type="button" :disabled="loading" @click="emit('retry')">刷新</button>
    </header>

    <MobileFilterDrawer v-model="filterOpen" :title="`${kind === 'inbound' ? '入库' : '出库'}明细筛选`" :summary="selectedSummary" @apply="applyFilter" @reset="resetFilter">
      <div class="mobile-medicine-movements__filters">
        <el-select
          v-model="draftMedicineItemIds"
          class="mobile-medicine-movement-filter-control"
          style="width: 100%; min-width: 0; max-width: 100%; --el-component-size: 44px"
          data-testid="mobile-medicine-history-item-filter"
          multiple
          clearable
          collapse-tags
          placeholder="筛选药品"
        >
          <el-option v-for="item in items" :key="item.id" :label="`${item.name}（${item.unitLabel}）`" :value="item.id" />
        </el-select>
        <el-date-picker
          v-model="draftDateRange"
          class="mobile-medicine-movement-date-control"
          style="width: 100%; min-width: 0; max-width: 100%; --el-component-size: 44px; --el-date-editor-width: 100%"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
      </div>
    </MobileFilterDrawer>

    <div v-if="error" class="mobile-medicine-movements__error" :data-testid="`${kind}-history-error`" role="alert">
      <span>{{ error }}</span>
      <button :data-testid="`${kind}-history-retry`" class="mobile-touch-target" type="button" :disabled="loading" @click="emit('retry')">重试</button>
    </div>
    <p v-else-if="loading" class="mobile-medicine-movements__state" role="status" aria-live="polite">明细加载中…</p>
    <p v-else-if="!rows.length" class="mobile-medicine-movements__state empty-text" role="status">暂无{{ kind === 'inbound' ? '入库' : '出库' }}明细</p>
    <div v-else class="mobile-medicine-movements__cards">
      <MobileRecordCard
        v-for="row in rows"
        :key="row.id"
        :data-testid="`mobile-${kind}-card`"
        :title="row.nameSnapshot"
        :subtitle="row.occurredOn"
        :status="movementTypeLabel(row.type)"
        :expanded="expandedIds.has(row.id)"
        @update:expanded="setExpanded(row.id, $event)"
      >
        <template #details>
          <dl>
            <div><dt>数量</dt><dd>{{ formatMedicineQuantity(row.quantity) }} {{ row.unitLabel }}</dd></div>
            <div><dt>当前剩余库存</dt><dd>{{ currentQuantity(row) }}</dd></div>
            <div><dt>类型</dt><dd>{{ movementTypeLabel(row.type) }}</dd></div>
            <div><dt>操作账号</dt><dd>{{ row.frontendUserId }}</dd></div>
            <div><dt>录入时间</dt><dd>{{ formatDateTime(row.createdAt) }}</dd></div>
            <div><dt>{{ row.correctionOfId ? '更正原因' : '备注' }}</dt><dd>{{ row.remark || '-' }}</dd></div>
            <div v-if="row.correctionOfId"><dt>更正关系</dt><dd>更正自 {{ row.correctionOfId }}</dd></div>
            <div v-else-if="correctedMovementIds.includes(row.id)"><dt>更正关系</dt><dd>已更正</dd></div>
          </dl>
        </template>
        <template v-if="correctableIds.includes(row.id)" #actions>
          <button :data-testid="`correct-${row.id}`" class="mobile-touch-target mobile-medicine-movements__correct" type="button" @click="emit('correct', row)">更正</button>
        </template>
      </MobileRecordCard>
    </div>
  </section>
</template>

<style scoped lang="scss">
.mobile-medicine-movements {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-medicine-movements__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h2,
  p {
    margin: 0;
  }

  p {
    margin-top: 4px;
  }
}

.mobile-medicine-movements__refresh,
.mobile-medicine-movements__error button,
.mobile-medicine-movements__correct {
  padding: 8px 12px;
  color: #2563eb;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}

.mobile-medicine-movements__filters,
.mobile-medicine-movements__cards {
  display: grid;
  gap: 10px;
}

.mobile-medicine-movements__filters > * {
  width: 100%;
}

.mobile-medicine-movement-filter-control,
.mobile-medicine-movement-date-control {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.mobile-medicine-movement-filter-control :deep(.el-select__wrapper),
.mobile-medicine-movement-filter-control :deep(.el-select__input),
.mobile-medicine-movement-date-control,
.mobile-medicine-movement-date-control :deep(.el-range-input) {
  min-height: 44px;
}

.mobile-medicine-movement-filter-control :deep(.el-select__wrapper),
.mobile-medicine-movement-date-control :deep(.el-range-input) {
  min-width: 0;
  max-width: 100%;
}

.mobile-medicine-movements__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fecdca;
  border-radius: 10px;
}

.mobile-medicine-movements__state {
  margin: 0;
  padding: 28px 12px;
  text-align: center;
}

dl {
  display: grid;
  gap: 7px;
  margin: 0;
}

dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

dt {
  color: #64748b;
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
}

.mobile-medicine-movements__correct {
  width: 100%;
  color: #b45309;
  border-color: #f59e0b;
}
</style>
