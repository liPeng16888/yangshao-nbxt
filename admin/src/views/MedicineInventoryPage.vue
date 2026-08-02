<template>
  <div class="page medicine-inventory-page">
    <section class="panel">
      <div class="panel__header">
        <div>
          <strong>药品库存</strong>
          <p class="page-description">仅查看当前管理员有权访问的账号库存及入出库流水。</p>
        </div>
        <el-button :loading="loading || initializing" @click="loadActive">查询</el-button>
      </div>

      <div class="inventory-controls">
        <label class="control-field control-field--wide">
          <span>前台账号</span>
          <el-select
            v-model="selectedFrontendIds"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            placeholder="选择一个或多个前台账号"
            @change="loadActive"
          >
            <el-option
              v-for="item in frontendOptions"
              :key="item.id"
              :label="`${item.name}（${item.account}）`"
              :value="item.id"
            />
          </el-select>
        </label>

        <label class="control-field control-field--wide">
          <span>药品</span>
          <el-select
            v-model="selectedMedicineItemIds"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            :disabled="!medicineItems.length"
            placeholder="选择一个或多个药品"
            @change="loadActive"
          >
            <el-option
              v-for="item in medicineItems"
              :key="item.id"
              :label="medicineOptionLabel(item)"
              :value="item.id"
            />
          </el-select>
        </label>

        <label v-if="isMovementTab" class="control-field control-field--date">
          <span>业务日期</span>
          <el-date-picker
            v-model="movementDateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="loadActive"
          />
        </label>
      </div>
    </section>

    <section class="panel inventory-tabs-panel">
      <div class="panel__body">
        <el-tabs v-model="active" @tab-change="loadActive">
          <el-tab-pane label="当前库存" name="stock" />
          <el-tab-pane label="入库明细" name="inbound" />
          <el-tab-pane label="出库明细" name="outbound" />
        </el-tabs>
      </div>
    </section>

    <section v-if="loadError" class="panel inventory-error" data-testid="medicine-inventory-load-error" role="alert">
      <span>加载库存数据失败：{{ loadError }}</span>
      <el-button data-testid="medicine-inventory-retry" @click="retry">重试</el-button>
    </section>

    <section class="panel" v-loading="loading || initializing">
      <el-table v-if="active === 'stock'" :data="itemRows" border empty-text="暂无药品库存数据">
        <el-table-column label="前台账号" min-width="170">
          <template #default="{ row }">{{ frontendName(row.frontendUserId) }}</template>
        </el-table-column>
        <el-table-column prop="name" label="药品名称" min-width="150" />
        <el-table-column prop="currentQuantity" label="现有库存" width="130" />
        <el-table-column prop="unitLabel" label="单位" width="100" />
        <el-table-column label="最后变动时间" width="190">
          <template #default="{ row }">{{ beijingTime(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>

      <el-table v-else :data="movementRows" border empty-text="暂无药品流水数据">
        <el-table-column prop="occurredOn" label="业务日期" width="120" />
        <el-table-column label="前台账号" min-width="170">
          <template #default="{ row }">{{ frontendName(row.frontendUserId) }}</template>
        </el-table-column>
        <el-table-column prop="nameSnapshot" label="药品名称" min-width="150" />
        <el-table-column prop="quantity" label="数量" width="110" />
        <el-table-column prop="unitLabel" label="单位" width="90" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ movementTypeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="180">
          <template #default="{ row }">{{ row.remark || '无' }}</template>
        </el-table-column>
        <el-table-column label="录入时间" width="190">
          <template #default="{ row }">{{ beijingTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { computed, onMounted, ref } from 'vue'
import {
  getAdminMedicineInbounds,
  getAdminMedicineItems,
  getAdminMedicineOutbounds,
  getFrontendOptions
} from '../api'
import type {
  AdminMedicineInventoryItem,
  AdminMedicineInventoryMovement,
  FrontendOption,
  MedicineMovementType
} from '../types'

dayjs.extend(utc)

type InventoryTab = 'stock' | 'inbound' | 'outbound'

const frontendOptions = ref<FrontendOption[]>([])
const medicineItems = ref<AdminMedicineInventoryItem[]>([])
const selectedFrontendIds = ref<string[]>([])
const selectedMedicineItemIds = ref<string[]>([])
const movementDateRange = ref<[string, string] | undefined>()
const itemRows = ref<AdminMedicineInventoryItem[]>([])
const movementRows = ref<AdminMedicineInventoryMovement[]>([])
const active = ref<InventoryTab>('stock')
const loading = ref(false)
const initializing = ref(false)
const loadError = ref('')
const isMovementTab = computed(() => active.value === 'inbound' || active.value === 'outbound')
const frontendNames = computed(() => new Map(frontendOptions.value.map((item) => [item.id, item.name])))
let optionsLoaded = false
let latestRequestId = 0

onMounted(() => {
  void initialize()
})

async function initialize() {
  initializing.value = true
  loadError.value = ''
  try {
    frontendOptions.value = await getFrontendOptions()
    optionsLoaded = true
    selectedFrontendIds.value = frontendOptions.value.map((item) => item.id)
    await loadActive()
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    initializing.value = false
  }
}

async function loadActive() {
  const requestedTab = active.value
  const requestedFrontendIds = [...selectedFrontendIds.value]
  const requestedMedicineItemIds = [...selectedMedicineItemIds.value]
  const [startDate, endDate] = isMovementTab.value && movementDateRange.value ? movementDateRange.value : []
  const requestId = ++latestRequestId
  loading.value = true
  loadError.value = ''

  try {
    const availableItemsRequest = getAdminMedicineItems(requestedFrontendIds)
    const rowsRequest = requestedTab === 'stock'
      ? requestedMedicineItemIds.length
        ? getAdminMedicineItems(requestedFrontendIds, requestedMedicineItemIds)
        : availableItemsRequest
      : requestedTab === 'inbound'
        ? getAdminMedicineInbounds(requestedFrontendIds, requestedMedicineItemIds, startDate, endDate)
        : getAdminMedicineOutbounds(requestedFrontendIds, requestedMedicineItemIds, startDate, endDate)
    const [availableItems, rows] = await Promise.all([availableItemsRequest, rowsRequest])

    if (requestId !== latestRequestId || requestedTab !== active.value) return

    medicineItems.value = availableItems
    if (requestedTab === 'stock') {
      itemRows.value = rows as AdminMedicineInventoryItem[]
      movementRows.value = []
    } else {
      movementRows.value = rows as AdminMedicineInventoryMovement[]
      itemRows.value = []
    }
  } catch (error) {
    if (requestId !== latestRequestId || requestedTab !== active.value) return

    itemRows.value = []
    movementRows.value = []
    loadError.value = errorMessage(error)
  } finally {
    if (requestId === latestRequestId) loading.value = false
  }
}

function retry() {
  if (!optionsLoaded) {
    void initialize()
    return
  }
  void loadActive()
}

function medicineOptionLabel(item: AdminMedicineInventoryItem) {
  return `${frontendName(item.frontendUserId)}｜${item.name}（${item.unitLabel}）`
}

function frontendName(frontendUserId: string) {
  return frontendNames.value.get(frontendUserId) || frontendUserId
}

function movementTypeLabel(type: MedicineMovementType) {
  const labels: Record<MedicineMovementType, string> = {
    INBOUND: '入库',
    OUTBOUND: '出库',
    CORRECTION_IN: '更正入库',
    CORRECTION_OUT: '更正出库'
  }
  return labels[type]
}

function beijingTime(value: string) {
  const time = dayjs.utc(value)
  return time.isValid() ? time.utcOffset(8).format('YYYY-MM-DD HH:mm:ss') : value
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '请检查网络后重试'
}
</script>

<style scoped>
.page-description {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
}

.inventory-controls {
  display: grid;
  grid-template-columns: minmax(250px, 1fr) minmax(250px, 1fr) minmax(260px, 1fr);
  gap: 12px;
  padding: 14px 16px;
}

.control-field {
  display: grid;
  gap: 6px;
}

.control-field > span {
  color: #64748b;
  font-size: 13px;
}

.inventory-tabs-panel {
  margin-bottom: 0;
}

.inventory-tabs-panel .panel__body {
  padding-bottom: 0;
}

.inventory-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  color: #b42318;
  border-color: #f7c7c2;
  background: #fff8f7;
}

@media (max-width: 960px) {
  .inventory-controls {
    grid-template-columns: 1fr 1fr;
  }

  .control-field--date {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .inventory-controls {
    grid-template-columns: 1fr;
  }

  .control-field--date {
    grid-column: auto;
  }

  .inventory-error {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
