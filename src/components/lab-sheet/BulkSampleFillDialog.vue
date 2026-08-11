<template>
  <el-dialog :model-value="visible" width="780px" class="bulk-sample-fill-dialog" title="批量填写样品" @close="emit('close')">
    <el-alert
      :title="`已选择 ${selectedCount} 个样品。直接填写需要批量应用的内容，未填写的字段保持原样。`"
      type="info"
      show-icon
      :closable="false"
    />

    <div class="bulk-fill-form">
      <section class="bulk-fill-item">
        <div class="bulk-fill-item__header">
          付款客户
        </div>
        <CustomerCellEditor
          customer-role="payer"
          :selection-limit="1"
          :model-value="payerCustomerPatch.customerText"
          :selected-customers="payerCustomerPatch.customers"
          placeholder="选择或输入付款客户"
          @update="payerCustomerPatch = $event"
          @blacklist-hit="(records) => emit('blacklistHit', records)"
        />
      </section>

      <section class="bulk-fill-item">
        <div class="bulk-fill-item__header">
          数据发送
        </div>
        <CustomerCellEditor
          customer-role="recipient"
          :selection-limit="0"
          :model-value="recipientCustomerPatch.recipientCustomerText"
          :selected-customers="recipientCustomerPatch.recipientCustomers"
          placeholder="选择或输入数据发送客户"
          @update="recipientCustomerPatch = $event"
          @blacklist-hit="(records) => emit('blacklistHit', records)"
        />
      </section>

      <section class="bulk-fill-item">
        <div class="bulk-fill-item__header">
          {{ amountLabel }}
        </div>
        <el-input-number
          v-model="price"
          controls-position="right"
          :precision="pricePrecision"
          :step="priceStep"
          placeholder="填写金额"
        />
      </section>

      <section class="bulk-fill-item">
        <div class="bulk-fill-item__header">
          费用状态
        </div>
        <el-select v-model="paymentStatus" clearable placeholder="选择费用状态">
          <el-option v-for="status in paymentStatusOptions" :key="status" :label="status" :value="status" />
        </el-select>
      </section>

      <section class="bulk-fill-item">
        <div class="bulk-fill-item__header">
          化验元素
        </div>
        <LabElementSelector
          :model-value="elementNote"
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
import { computed, ref, watch } from 'vue'
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

const paymentStatusOptions: SamplePaymentStatus[] = ['已结款', '未结款', '月结款']
const payerCustomerPatch = ref<Partial<LabSampleInput>>({})
const recipientCustomerPatch = ref<Partial<LabSampleInput>>({})
const price = ref<number | null>(null)
const paymentStatus = ref<SamplePaymentStatus | ''>('')
const elementNote = ref('')

const amountLabel = computed(() => (paymentStatus.value === '预存款' ? '扣除金额' : '样品金额'))
const pricePrecision = computed(() => 2)
const priceStep = computed(() => 0.01)

watch(
  () => props.visible,
  (visible) => {
    if (visible) resetForm()
  }
)

async function confirmApply() {
  if (!props.selectedCount) {
    ElMessage.warning('请先选择至少一个样品')
    return
  }
  if (paymentStatus.value === '预存款') {
    ElMessage.warning('预存款不能批量填写，请逐个样品选择会员并填写扣除金额')
    return
  }

  const patch = buildPatch()
  if (!Object.keys(patch).length) {
    ElMessage.warning('请至少填写一项内容')
    return
  }

  try {
    await ElMessageBox.confirm(`确认将已填写内容填充到 ${props.selectedCount} 个样品吗？`, '批量填写确认', {
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

  const customerText = payerCustomerPatch.value.customerText?.trim() || ''
  if (customerText) {
    Object.assign(patch, {
      customerId: payerCustomerPatch.value.customerId,
      customerIds: payerCustomerPatch.value.customerIds || [],
      customers: payerCustomerPatch.value.customers || [],
      customerText
    })
  }

  const recipientCustomerText = recipientCustomerPatch.value.recipientCustomerText?.trim() || ''
  if (recipientCustomerText) {
    Object.assign(patch, {
      recipientCustomerId: recipientCustomerPatch.value.recipientCustomerId,
      recipientCustomerIds: recipientCustomerPatch.value.recipientCustomerIds || [],
      recipientCustomers: recipientCustomerPatch.value.recipientCustomers || [],
      recipientCustomerText
    })
  }

  if (typeof price.value === 'number' && Number.isFinite(price.value)) {
    patch.price = Number(price.value.toFixed(2))
  }

  if (paymentStatus.value) {
    patch.paymentStatus = paymentStatus.value
  }

  const note = elementNote.value.trim()
  if (note) {
    patch.elementNote = note
  }

  return patch
}

function resetForm() {
  payerCustomerPatch.value = {}
  recipientCustomerPatch.value = {}
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
