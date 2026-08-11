<template>
  <div class="page-stack medicine-inventory-stock">
    <section class="inventory-control-band">
      <div>
        <h2>药品库存</h2>
        <p class="muted">按药品查看当前账号下的独立库存项。</p>
      </div>
      <el-select v-model="selectedMedicineItemIds" multiple clearable collapse-tags placeholder="筛选药品" class="inventory-filter">
        <el-option v-for="item in items" :key="item.id" :label="itemLabel(item)" :value="item.id" />
      </el-select>
    </section>

    <section v-if="loadError" class="inventory-load-error" data-testid="stock-load-error" role="alert">
      <span>{{ loadError }}</span>
      <el-button data-testid="stock-retry" link type="primary" :loading="loading" @click="loadItems">重试</el-button>
    </section>

    <el-table :data="visibleItems" border v-loading="loading" empty-text="暂无药品库存">
      <el-table-column prop="name" label="药品名称" min-width="180" />
      <el-table-column label="现有库存" width="140">
        <template #default="{ row }">{{ formatMedicineQuantity(row.currentQuantity) }}</template>
      </el-table-column>
      <el-table-column prop="unitLabel" label="单位" width="100" />
      <el-table-column label="最后变动时间" min-width="180">
        <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getMedicineItems } from '@/api/medicineInventory'
import type { MedicineInventoryItem } from '@/types/medicineInventory'
import { formatDateTime } from '@/utils/date'
import { formatMedicineQuantity } from '@/utils/medicineInventory'
import { tryUseTenantRealtimeStore } from '@/stores/tenantRealtime'

const loading = ref(false)
const loadError = ref('')
const items = ref<MedicineInventoryItem[]>([])
const selectedMedicineItemIds = ref<string[]>([])
const tenantRealtime = tryUseTenantRealtimeStore()
let unregisterRealtime: (() => void) | undefined

const visibleItems = computed(() => {
  if (!selectedMedicineItemIds.value.length) return items.value
  const selected = new Set(selectedMedicineItemIds.value)
  return items.value.filter((item) => selected.has(item.id))
})

onMounted(() => {
  void loadItems()
  unregisterRealtime = tenantRealtime?.registerModule('medicine-inventory', { isDirty: () => false, refresh: loadItems })
})

onBeforeUnmount(() => unregisterRealtime?.())

async function loadItems() {
  loading.value = true
  loadError.value = ''
  try {
    items.value = await getMedicineItems()
  } catch (error) {
    items.value = []
    loadError.value = errorMessage(error, '药品库存加载失败，请稍后重试')
    ElMessage.error(loadError.value)
  } finally {
    loading.value = false
  }
}

function itemLabel(item: MedicineInventoryItem) {
  return `${item.name}（${item.unitLabel}）`
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(message) ? message.join('；') : message || fallback
}
</script>

<style scoped lang="scss">
.inventory-control-band {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0;

  h2 {
    margin: 0;
    font-size: 20px;
  }

  p {
    margin: 6px 0 0;
  }
}

.inventory-filter {
  width: min(420px, 100%);
}

.inventory-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fecdca;
  border-radius: 6px;
}

@media (max-width: 680px) {
  .inventory-control-band {
    align-items: stretch;
    flex-direction: column;
  }

  .inventory-filter {
    width: 100%;
  }
}
</style>
