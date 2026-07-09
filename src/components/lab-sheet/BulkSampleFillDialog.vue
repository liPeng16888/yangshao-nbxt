<template>
  <el-dialog :model-value="visible" width="780px" class="bulk-sample-fill-dialog" title="批量填写样品" @close="emit('close')">
    <el-alert
      :title="`已选择 ${selectedCount} 个样品。勾选需要应用的字段后，确认即可批量填充到这些样品。`"
      type="info"
      show-icon
      :closable="false"
    />

    <div class="bulk-fill-form">
      <section class="bulk-fill-item" :class="{ 'bulk-fill-item--disabled': !enabled.customer }">
        <div class="bulk-fill-item__header">
          <el-checkbox v-model="enabled.customer">客户选择</el-checkbox>
        </div>
        <CustomerCellEditor
          :model-value="customerPatch.customerText"
          :selected-customers="customerPatch.customers"
          :disabled="!enabled.customer"
          placeholder="选择或输入客户"
          @update="handleCustomerUpdate"
          @blacklist-hit="(records) => emit('blacklistHit', records)"
        />
      </section>

      <section class="bulk-fill-item" :class="{ 'bulk-fill-item--disabled': !enabled.price }">
        <div class="bulk-fill-item__header">
          <el-checkbox v-model="enabled.price">样品金额</el-checkbox>
        </div>
        <el-input-number
          v-model="price"
          controls-position="right"
          :disabled="!enabled.price"
          :precision="pricePrecision"
          :step="priceStep"
          placeholder="填写金额"
        />
      </section>

      <section class="bulk-fill-item" :class="{ 'bulk-fill-item--disabled': !enabled.paymentStatus }">
        <div class="bulk-fill-item__header">
          <el-checkbox v-model="enabled.paymentStatus">费用状态</el-checkbox>
        </div>
        <el-select v-model="paymentStatus" clearable :disabled="!enabled.paymentStatus" placeholder="选择费用状态">
          <el-option v-for="status in paymentStatusOptions" :key="status" :label="status" :value="status" />
        </el-select>
      </section>

      <section class="bulk-fill-item" :class="{ 'bulk-fill-item--disabled': !enabled.elementNote }">
        <div class="bulk-fill-item__header">
          <el-checkbox v-model="enabled.elementNote">化验元素</el-checkbox>
        </div>
        <LabElementSelector
          :model-value="elementNote"
          :disabled="!enabled.elementNote"
          @update:model-value="elementNote = $event"
        />
      </section>
    </div>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button type="primary" @click="confirmApply">确认填充</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CustomerCellEditor from './CustomerCellEditor.vue'
import LabElementSelector from './LabElementSelector.vue'
import type { BlacklistRecord } from '@/types/blacklist'
import type { LabSampleInput, SamplePaymentStatus } from '@/types/labSheet'

const props = defineProps<{
  visible: boolean
  selectedCount: number
}>()

const emit = defineEmits<{
  close: []
  apply: [payload: { patch: Partial<LabSampleInput> }]
  blacklistHit: [records: BlacklistRecord[]]
}>()

const paymentStatusOptions: SamplePaymentStatus[] = ['已结款', '未结款', '月结款', '预存款']
const enabled = reactive({
  customer: false,
  price: false,
  paymentStatus: false,
  elementNote: false
})
const customerPatch = ref<Partial<LabSampleInput>>({})
const price = ref<number | null>(null)
const paymentStatus = ref<SamplePaymentStatus | ''>('')
const elementNote = ref('')

const pricePrecision = computed(() => (enabled.paymentStatus && paymentStatus.value === '预存款' ? 0 : 2))
const priceStep = computed(() => (pricePrecision.value === 0 ? 1 : 0.01))

watch(
  () => props.visible,
  (visible) => {
    if (visible) resetForm()
  }
)

function handleCustomerUpdate(patch: Partial<LabSampleInput>) {
  customerPatch.value = patch
}

async function confirmApply() {
  if (!props.selectedCount) {
    ElMessage.warning('请先选择至少一个样品')
    return
  }

  const patch = buildPatch()
  if (!Object.keys(patch).length) {
    ElMessage.warning('请至少勾选并填写一项内容')
    return
  }

  try {
    await ElMessageBox.confirm(`确认将已勾选内容填充到 ${props.selectedCount} 个样品吗？`, '批量填写确认', {
      confirmButtonText: '确认填充',
      cancelButtonText: '取消',
      type: 'warning',
      appendTo: document.body
    })
  } catch {
    return
  }

  emit('apply', { patch })
}

function buildPatch(): Partial<LabSampleInput> {
  const patch: Partial<LabSampleInput> = {}

  if (enabled.customer) {
    const customerText = customerPatch.value.customerText?.trim() || ''
    if (!customerText) {
      ElMessage.warning('请选择或输入客户')
      return {}
    }
    Object.assign(patch, {
      customerId: customerPatch.value.customerId,
      customerIds: customerPatch.value.customerIds || [],
      customers: customerPatch.value.customers || [],
      customerText
    })
  }

  if (enabled.price) {
    if (typeof price.value !== 'number' || !Number.isFinite(price.value)) {
      ElMessage.warning('请输入样品金额')
      return {}
    }
    patch.price = pricePrecision.value === 0 ? Math.trunc(price.value) : Number(price.value.toFixed(2))
  }

  if (enabled.paymentStatus) {
    if (!paymentStatus.value) {
      ElMessage.warning('请选择费用状态')
      return {}
    }
    patch.paymentStatus = paymentStatus.value
  }

  if (enabled.elementNote) {
    const note = elementNote.value.trim()
    if (!note) {
      ElMessage.warning('请选择化验元素')
      return {}
    }
    patch.elementNote = note
  }

  return patch
}

function resetForm() {
  enabled.customer = false
  enabled.price = false
  enabled.paymentStatus = false
  enabled.elementNote = false
  customerPatch.value = {}
  price.value = null
  paymentStatus.value = ''
  elementNote.value = ''
}
</script>

<style scoped lang="scss">
.bulk-fill-form {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.bulk-fill-item {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #d8e1eb;
  border-radius: 8px;
  background: #fff;

  &--disabled {
    background: #f8fafc;
  }
}

.bulk-fill-item__header {
  color: #10233f;
  font-weight: 600;
}

:deep(.el-input-number),
:deep(.el-select),
:deep(.lab-element-selector) {
  width: 100%;
}

@media (max-width: 720px) {
  .bulk-fill-item {
    grid-template-columns: 1fr;
  }
}
</style>
