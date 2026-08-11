<template>
  <el-dialog
    :model-value="visible"
    title="选择预存款会员"
    width="520px"
    :close-on-click-modal="false"
    @close="emit('close')"
  >
    <el-form label-position="top">
      <el-form-item label="会员手机号" required>
        <div class="phone-search-row">
          <el-input
            v-model="phone"
            data-testid="prepaid-member-phone"
            inputmode="numeric"
            maxlength="15"
            placeholder="请输入11位会员手机号"
            clearable
            @keyup.enter="lookupExactPhone"
          />
          <el-button
            data-testid="prepaid-member-search"
            type="primary"
            :loading="searching"
            @click="lookupExactPhone"
          >精确查询</el-button>
        </div>
      </el-form-item>

      <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />

      <template v-if="selectedMember">
        <div class="member-summary">
          <div>
            <span>会员手机号</span>
            <strong>{{ selectedMember.phone }}</strong>
          </div>
          <div>
            <span>当前余额</span>
            <strong>{{ formatMoney(selectedMember.currentBalance) }}</strong>
          </div>
          <el-button
            data-testid="prepaid-member-refresh"
            link
            type="primary"
            :loading="searching"
            @click="lookupExactPhone"
          >刷新余额</el-button>
        </div>

        <el-form-item label="扣除金额" required>
          <el-input-number
            v-model="amount"
            data-testid="prepaid-deduction-amount"
            :precision="2"
            :step="0.01"
            :min="0.01"
            controls-position="right"
            placeholder="请输入扣除金额"
          />
        </el-form-item>

        <div class="balance-preview" :class="{ 'balance-preview--insufficient': isInsufficient }">
          <span>扣除后余额</span>
          <strong>{{ formatMoney(balanceAfterDeduction) }}</strong>
          <span v-if="isInsufficient" class="balance-preview__warning">余额不足</span>
        </div>
        <p class="advisory">余额仅供参考，最终以保存时服务器校验为准。</p>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button
        data-testid="prepaid-member-confirm"
        type="primary"
        :disabled="!canConfirm"
        @click="confirmSelection"
      >确认扣除</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PrepaidMemberPickerResult } from '@/types/labSheet'
import type { PrepaidLabMemberLookupRow } from '@/types/sharedPrepaid'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'

const props = withDefaults(defineProps<{
  visible: boolean
  initialPhone?: string
  initialAmount?: number | null
}>(), {
  initialPhone: '',
  initialAmount: null
})

const emit = defineEmits<{
  close: []
  confirm: [result: PrepaidMemberPickerResult]
}>()

const store = useSharedPrepaidStore()
const phone = ref('')
const amount = ref<number | null>(null)
const selectedMember = ref<PrepaidLabMemberLookupRow | null>(null)
const searching = ref(false)
const errorMessage = ref('')
let lookupGeneration = 0

const amountInCents = computed(() => {
  if (typeof amount.value !== 'number' || !Number.isFinite(amount.value) || amount.value <= 0) return null
  const cents = Math.round(amount.value * 100)
  return cents > 0 ? cents : null
})
const balanceInCents = computed(() => Math.round((selectedMember.value?.currentBalance ?? 0) * 100))
const balanceAfterDeduction = computed(() => (
  (balanceInCents.value - (amountInCents.value ?? 0)) / 100
))
const isInsufficient = computed(() => (
  Boolean(selectedMember.value && amountInCents.value !== null && amountInCents.value > balanceInCents.value)
))
const canConfirm = computed(() => (
  Boolean(selectedMember.value && amountInCents.value !== null && !isInsufficient.value && !searching.value)
))

watch(
  () => props.visible,
  (visible) => {
    lookupGeneration += 1
    if (!visible) {
      resetDraft()
      return
    }
    resetDraft()
    phone.value = props.initialPhone
    amount.value = normalizeInitialAmount(props.initialAmount)
    if (normalizePhone(phone.value)) void lookupExactPhone()
  },
  { immediate: true }
)

watch(phone, () => {
  lookupGeneration += 1
  searching.value = false
  if (selectedMember.value && normalizePhone(phone.value) !== selectedMember.value.phone) {
    selectedMember.value = null
    errorMessage.value = ''
  }
}, { flush: 'sync' })

async function lookupExactPhone() {
  const normalized = normalizePhone(phone.value)
  if (!normalized) {
    selectedMember.value = null
    errorMessage.value = '请输入11位会员手机号'
    return
  }

  const generation = ++lookupGeneration
  searching.value = true
  errorMessage.value = ''
  try {
    const member = await store.lookupLabMember(normalized)
    if (generation !== lookupGeneration || !props.visible || normalizePhone(phone.value) !== normalized) return
    selectedMember.value = member
    if (!member) errorMessage.value = '未找到该预存款会员'
  } catch (error) {
    if (generation !== lookupGeneration || !props.visible) return
    selectedMember.value = null
    errorMessage.value = readErrorMessage(error)
  } finally {
    if (generation === lookupGeneration) searching.value = false
  }
}

function confirmSelection() {
  if (!canConfirm.value || !selectedMember.value || amountInCents.value === null) return
  emit('confirm', {
    memberId: selectedMember.value.id,
    phone: selectedMember.value.phone,
    amount: amountInCents.value / 100,
    currentBalance: balanceInCents.value / 100
  })
}

function resetDraft() {
  phone.value = ''
  amount.value = null
  selectedMember.value = null
  searching.value = false
  errorMessage.value = ''
}

function normalizePhone(value: unknown) {
  const normalized = String(value ?? '').replace(/\D/g, '')
  return /^1[3-9]\d{9}$/.test(normalized) ? normalized : ''
}

function normalizeInitialAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

function formatMoney(value: number) {
  return `¥${value.toFixed(2)}`
}

function readErrorMessage(error: unknown) {
  const responseMessage = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage
  return error instanceof Error && error.message ? error.message : '会员查询失败，请重试'
}
</script>

<style scoped lang="scss">
.phone-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  width: 100%;
}

.member-summary,
.balance-preview {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 14px;
  margin: 14px 0;
  border: 1px solid #dbe5ef;
  border-radius: 8px;
  background: #f8fafc;
}

.member-summary > div {
  display: grid;
  gap: 4px;
}

.member-summary span,
.balance-preview span,
.advisory {
  color: #64748b;
}

.member-summary strong,
.balance-preview strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.member-summary .el-button {
  margin-left: auto;
}

.balance-preview--insufficient {
  border-color: #fecaca;
  background: #fff7f7;
}

.balance-preview__warning {
  margin-left: auto;
  color: #dc2626 !important;
  font-weight: 600;
}

.advisory {
  margin: -4px 0 0;
  font-size: 13px;
}

:deep(.el-input-number) {
  width: 100%;
}
</style>
