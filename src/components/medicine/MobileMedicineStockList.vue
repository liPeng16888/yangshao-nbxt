<script setup lang="ts">
import { ref, watch } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import type { MedicineInventoryItem } from '@/types/medicineInventory'
import { formatDateTime } from '@/utils/date'
import { formatMedicineQuantity } from '@/utils/medicineInventory'

const props = defineProps<{
  items: MedicineInventoryItem[]
  filterItems: MedicineInventoryItem[]
  loading: boolean
  error: string
  selectedMedicineItemIds: string[]
}>()

const emit = defineEmits<{
  filter: [medicineItemIds: string[]]
  retry: []
}>()

const filterOpen = ref(false)
const draftMedicineItemIds = ref<string[]>([])

watch(() => props.selectedMedicineItemIds, (value) => {
  if (!filterOpen.value) draftMedicineItemIds.value = [...value]
}, { immediate: true, deep: true })

function applyFilter() {
  emit('filter', [...draftMedicineItemIds.value])
  filterOpen.value = false
}

function resetFilter() {
  draftMedicineItemIds.value = []
  emit('filter', [])
  filterOpen.value = false
}
</script>

<template>
  <section class="mobile-medicine-list" data-testid="mobile-medicine-stock-list" aria-labelledby="mobile-stock-title">
    <header class="mobile-medicine-list__heading">
      <div>
        <h2 id="mobile-stock-title">药品库存</h2>
        <p class="muted">按药品查看当前账号下的独立库存项。</p>
      </div>
      <button data-testid="mobile-stock-refresh" class="mobile-touch-target mobile-medicine-list__refresh" type="button" @click="emit('retry')">
        刷新
      </button>
    </header>

    <MobileFilterDrawer
      v-model="filterOpen"
      title="筛选药品库存"
      :summary="selectedMedicineItemIds.length ? `已选 ${selectedMedicineItemIds.length} 项` : '全部药品'"
      @apply="applyFilter"
      @reset="resetFilter"
    >
      <el-select
        v-model="draftMedicineItemIds"
        class="mobile-medicine-stock-filter-control"
        style="width: 100%; min-width: 0; max-width: 100%; --el-component-size: 44px"
        multiple
        clearable
        collapse-tags
        placeholder="筛选药品"
      >
        <el-option v-for="item in filterItems" :key="item.id" :label="`${item.name}（${item.unitLabel}）`" :value="item.id" />
      </el-select>
    </MobileFilterDrawer>

    <div v-if="error" class="mobile-medicine-list__error" data-testid="stock-load-error" role="alert">
      <span>{{ error }}</span>
      <button data-testid="stock-retry" class="mobile-touch-target" type="button" :disabled="loading" @click="emit('retry')">重试</button>
    </div>
    <p v-else-if="loading" class="mobile-medicine-list__state" role="status" aria-live="polite">药品库存加载中…</p>
    <p v-else-if="!items.length" class="mobile-medicine-list__state empty-text" role="status">暂无药品库存</p>
    <div v-else class="mobile-medicine-list__cards">
      <article v-for="item in items" :key="item.id" class="mobile-medicine-stock-card" data-testid="mobile-medicine-stock-card">
        <div class="mobile-medicine-stock-card__heading">
          <strong>{{ item.name }}</strong>
          <span>{{ formatMedicineQuantity(item.currentQuantity) }} {{ item.unitLabel }}</span>
        </div>
        <dl>
          <div><dt>现有库存</dt><dd>{{ formatMedicineQuantity(item.currentQuantity) }}</dd></div>
          <div><dt>单位</dt><dd>{{ item.unitLabel }}</dd></div>
          <div><dt>最后变动时间</dt><dd>{{ formatDateTime(item.updatedAt) }}</dd></div>
        </dl>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.mobile-medicine-list {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-medicine-list__heading {
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

.mobile-medicine-list__refresh,
.mobile-medicine-list__error button {
  padding: 8px 12px;
  color: #2563eb;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}

.mobile-medicine-stock-filter-control {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.mobile-medicine-stock-filter-control :deep(.el-select__wrapper),
.mobile-medicine-stock-filter-control :deep(.el-select__input) {
  min-height: 44px;
}

.mobile-medicine-stock-filter-control :deep(.el-select__wrapper) {
  min-width: 0;
  max-width: 100%;
}

.mobile-medicine-list__error {
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

.mobile-medicine-list__state {
  margin: 0;
  padding: 28px 12px;
  text-align: center;
}

.mobile-medicine-list__cards {
  display: grid;
  gap: 10px;
}

.mobile-medicine-stock-card {
  min-width: 0;
  padding: 14px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
}

.mobile-medicine-stock-card__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: #2563eb;
    font-weight: 600;
  }
}

dl {
  display: grid;
  gap: 7px;
  margin: 12px 0 0;
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
</style>
