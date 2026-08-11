<template>
  <div v-if="modelValue" class="settlement-dialog-shell" role="dialog" aria-modal="true" aria-label="结算单详情">
    <div class="settlement-dialog-shell__title"><h2>结算单详情</h2><el-button aria-label="关闭结算单详情" @click="emit('update:modelValue', false)">关闭</el-button></div>
    <div v-if="settlement" class="settlement-detail">
      <header class="settlement-detail__header">
        <div>
          <strong>结算单 {{ settlement.id }}</strong>
          <p>{{ accountLabel(settlement.accountA) }} ↔ {{ accountLabel(settlement.accountB) }}</p>
        </div>
        <el-tag :type="statusType(settlement.status)">{{ statusLabel(settlement.status) }}</el-tag>
      </header>

      <section class="settlement-totals" aria-label="结算金额汇总">
        <div><strong>{{ `A应付B ¥${money1(settlement.aToBAmount)}` }}</strong></div>
        <div><strong>{{ `B应付A ¥${money1(settlement.bToAAmount)}` }}</strong></div>
        <div><strong>{{ `抵扣金额 ¥${offsetAmount}` }}</strong></div>
        <div class="settlement-totals__net"><strong>{{ `实际转账金额 ¥${money1(settlement.netAmount)}` }}</strong></div>
      </section>

      <el-alert
        v-if="isZeroNet"
        type="info"
        :closable="false"
        title="双方金额已抵平：发起方已确认，等待另一参与主账号确认核对，无需填写转账信息。"
      />
      <p v-else class="settlement-direction">
        付款方 {{ accountLabel(settlement.payerFrontendUser) }}，
        收款方 {{ accountLabel(settlement.receiverFrontendUser) }}，
        净转账 ¥{{ money1(settlement.netAmount) }}
      </p>

      <section class="settlement-gross-lines">
        <h3>A应付B 原始应转明细</h3>
        <article v-for="line in aToBLines" :key="line.id" class="settlement-line-card">
          <SettlementLineContent :line="line" />
        </article>
        <p v-if="!aToBLines.length" class="muted">该方向无明细</p>
        <h3>B应付A 原始应转明细</h3>
        <article v-for="line in bToALines" :key="line.id" class="settlement-line-card">
          <SettlementLineContent :line="line" />
        </article>
        <p v-if="!bToALines.length" class="muted">该方向无明细</p>
      </section>

      <section class="settlement-audit">
        <h3>操作与审计</h3>
        <div class="audit-grid">
          <span>创建人 {{ accountLabel(settlement.createdBy) }}</span>
          <span>创建时间 {{ preciseDateTime(settlement.createdAt) }}</span>
          <span v-if="settlement.paymentSubmittedBy">转账提交人 {{ accountLabel(settlement.paymentSubmittedBy) }}</span>
          <span v-if="settlement.paymentSubmittedAt">转账提交时间 {{ preciseDateTime(settlement.paymentSubmittedAt) }}</span>
          <span v-if="settlement.receiptConfirmedBy">到账确认人 {{ accountLabel(settlement.receiptConfirmedBy) }}</span>
          <span v-if="settlement.receiptConfirmedAt">到账确认时间 {{ preciseDateTime(settlement.receiptConfirmedAt) }}</span>
          <span v-if="settlement.rejectedBy">驳回人 {{ accountLabel(settlement.rejectedBy) }}</span>
          <span v-if="settlement.rejectedAt">驳回时间 {{ preciseDateTime(settlement.rejectedAt) }}</span>
          <span v-if="settlement.cancelledBy">取消人 {{ accountLabel(settlement.cancelledBy) }}</span>
          <span v-if="settlement.cancelledAt">取消时间 {{ preciseDateTime(settlement.cancelledAt) }}</span>
        </div>
        <p v-if="settlement.actualTransferredAt">实际转账时间 {{ preciseDateTime(settlement.actualTransferredAt) }}</p>
        <p v-if="settlement.remark">转账备注 {{ settlement.remark }}</p>
        <p v-if="settlement.rejectionReason">驳回原因 {{ settlement.rejectionReason }}</p>
        <div v-if="settlement.proofUrls.length" class="proof-list">
          <a
            v-for="(url, index) in settlement.proofUrls"
            :key="url"
            :data-testid="`settlement-proof-${index}`"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
          >查看转账凭证 {{ index + 1 }}</a>
        </div>
        <ol v-if="settlement.actions.length" class="action-history">
          <li v-for="action in settlement.actions" :key="action.id">
            {{ operationLabel(action.operation) }} · {{ accountLabel(action.actorUser) }}
            （归属 {{ accountLabel(action.actorFrontendUser) }}）· {{ preciseDateTime(action.createdAt) }}
          </li>
        </ol>
      </section>

      <el-alert
        v-if="actionError"
        data-testid="settlement-action-error"
        type="error"
        :closable="false"
        :title="actionError"
      />

      <section v-if="canSubmitPayment" class="settlement-payment-form">
        <h3>提交实际转账</h3>
        <label>
          实际转账时间（含时区）
          <input
            data-testid="settlement-transfer-time"
            :value="paymentDraft.actualTransferredAt"
            type="text"
            required
            placeholder="2026-08-12T16:30:00+08:00"
            @input="setPaymentField('actualTransferredAt', ($event.target as HTMLInputElement).value)"
          >
        </label>
        <label>
          转账备注（选填）
          <textarea
            data-testid="settlement-payment-remark"
            :value="paymentDraft.remark || ''"
            maxlength="500"
            @input="setPaymentField('remark', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
        <label>
          转账凭证（选填，最多 10 张）
          <input
            data-testid="settlement-proof-input"
            type="file"
            accept="image/*"
            multiple
            @change="selectProofFiles"
          >
        </label>
        <span v-if="selectedProofNames">待上传：{{ selectedProofNames }}</span>
        <el-button
          data-testid="settlement-payment-submit"
          type="primary"
          :loading="store.loadingByPage.settlements"
          @click="submitPayment"
        >提交转账</el-button>
      </section>

      <div v-if="canConfirm || canReject || canCancel" class="settlement-actions">
        <el-button
          v-if="canConfirm"
          data-testid="settlement-confirm"
          type="success"
          :loading="store.loadingByPage.settlements"
          @click="confirmSettlement"
        >{{ isZeroNet ? '确认核对' : '确认到账' }}</el-button>
        <el-button v-if="canReject" data-testid="settlement-reject-open" type="warning" @click="rejectOpen = true">
          驳回
        </el-button>
        <el-button v-if="canCancel" data-testid="settlement-cancel-open" type="danger" plain @click="cancelOpen = true">
          取消结算
        </el-button>
      </div>

      <div v-if="rejectOpen" class="reason-dialog" role="dialog" aria-modal="true" aria-label="驳回结算">
        <h3>驳回原因</h3>
        <textarea v-model="rejectReason" data-testid="settlement-reject-reason" maxlength="500" />
        <p v-if="rejectError" data-testid="settlement-reject-error" class="error-text">{{ rejectError }}</p>
        <div><el-button @click="rejectOpen = false">返回</el-button><el-button data-testid="settlement-reject-submit" type="warning" @click="rejectSettlement">确认驳回</el-button></div>
      </div>

      <div v-if="cancelOpen" class="reason-dialog" role="dialog" aria-modal="true" aria-label="取消结算">
        <h3>取消结算单</h3>
        <p>取消会释放本结算单占用的应转明细；服务端将记录取消人和取消时间。</p>
        <div><el-button @click="cancelOpen = false">返回</el-button><el-button data-testid="settlement-cancel-submit" type="danger" @click="cancelSettlement">确认取消</el-button></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'

import { uploadImages } from '@/api/upload'
import { useAuthStore } from '@/stores/auth'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import type {
  PrepaidSettlementActionOperation,
  PrepaidSettlementDetailLineRow,
  PrepaidSettlementDetailRow,
  PrepaidSettlementPaymentPayload,
  PrepaidSettlementStatus
} from '@/types/sharedPrepaid'
import {
  prepaidAccountLabel,
  prepaidErrorMessage,
  prepaidFormatElements,
  prepaidIsConflict,
  prepaidPreciseDateTime
} from '@/utils/sharedPrepaidPresentation'

defineOptions({ name: 'PrepaidSettlementDetailDialog' })

const props = defineProps<{
  modelValue: boolean
  settlement: PrepaidSettlementDetailRow | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: [settlementId: string]
}>()

const store = useSharedPrepaidStore()
const auth = useAuthStore()
const actionError = ref('')
const proofFiles = ref<File[]>([])
const rejectOpen = ref(false)
const rejectReason = ref('')
const rejectError = ref('')
const cancelOpen = ref(false)

const paymentDraft = computed(() => store.settlementPaymentDraft)
const ownerId = computed(() => auth.user?.dataOwnerId || auth.user?.id || '')
const isMainAccount = computed(() => Boolean(
  auth.user?.isFrontendMainAccount && auth.user.id === auth.user.dataOwnerId
))
const isZeroNet = computed(() => toTenths(props.settlement?.netAmount) === 0)
const aToBLines = computed(() => props.settlement?.lines.filter((line) => line.direction === 'A_TO_B') ?? [])
const bToALines = computed(() => props.settlement?.lines.filter((line) => line.direction === 'B_TO_A') ?? [])
const offsetAmount = computed(() => moneyTenths(Math.min(
  toTenths(props.settlement?.aToBAmount),
  toTenths(props.settlement?.bToAAmount)
)))
const selectedProofNames = computed(() => proofFiles.value.map((file) => file.name).join('、'))
const canSubmitPayment = computed(() => Boolean(
  props.settlement && isMainAccount.value && !isZeroNet.value &&
  props.settlement.status === 'AWAITING_PAYMENT' && props.settlement.payerFrontendUserId === ownerId.value
))
const canConfirm = computed(() => {
  const row = props.settlement
  if (!row || !isMainAccount.value || row.status !== 'AWAITING_RECEIPT') return false
  if (!isZeroNet.value) return row.receiverFrontendUserId === ownerId.value
  return (row.accountAId === ownerId.value || row.accountBId === ownerId.value) && row.createdById !== auth.user?.id
})
const canReject = canConfirm
const canCancel = computed(() => {
  const row = props.settlement
  if (!row || !isMainAccount.value || row.createdById !== auth.user?.id) return false
  return row.status === 'AWAITING_PAYMENT' || (isZeroNet.value && row.status === 'AWAITING_RECEIPT')
})

const SettlementLineContent = defineComponent({
  name: 'SettlementLineContent',
  props: { line: { type: Object as () => PrepaidSettlementDetailLineRow, required: true } },
  setup(lineProps) {
    return () => {
      const line = lineProps.line
      const item = line.payable
      return h('div', { class: 'settlement-line-content' }, [
        h('strong', `应转金额 ¥${money1(line.amount)}`),
        h('span', `状态 ${payableStatusLabel(line.payableStatus)}`),
        h('span', `会员 ${item.consumption.phoneSnapshot}`),
        h('span', `样品编号 ${item.consumption.sampleNumberSnapshot || '无信息'}`),
        h('span', `样品数量 ${item.consumption.sampleCountSnapshot}`),
        h('span', `检测元素 ${prepaidFormatElements(item.consumption.elementsSnapshot)}`),
        h('span', `充值来源 ${prepaidAccountLabel(item.sourceOwner)}`),
        h('span', `消费账号 ${prepaidAccountLabel(item.consumerOwner)}`),
        h('span', `精确应转值 ${item.exactAmount}`),
        h('span', `充值批次 ${item.consumption.rechargeBatches.map((batch) => batch.id).join('、') || '无信息'}`),
        h('span', `应转创建时间 ${prepaidPreciseDateTime(item.createdAt)}`)
      ])
    }
  }
})

function setPaymentField(field: 'actualTransferredAt' | 'remark', value: string) {
  store.setSettlementPaymentDraft({ ...paymentDraft.value, [field]: value })
  actionError.value = ''
}

function selectProofFiles(event: Event) {
  proofFiles.value = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, 10)
  actionError.value = ''
}

async function submitPayment() {
  const row = props.settlement
  if (!row) return
  if (!paymentDraft.value.actualTransferredAt.trim()) {
    actionError.value = '请选择实际转账时间，并填写包含时区的时间。'
    return
  }
  actionError.value = ''
  try {
    const uploaded = proofFiles.value.length ? await uploadImages(proofFiles.value) : []
    const proofUrls = [...new Set([...(paymentDraft.value.proofUrls ?? []), ...uploaded])]
    proofFiles.value = []
    const payload: PrepaidSettlementPaymentPayload = {
      actualTransferredAt: paymentDraft.value.actualTransferredAt.trim(),
      ...(proofUrls.length ? { proofUrls } : {}),
      ...(paymentDraft.value.remark?.trim() ? { remark: paymentDraft.value.remark.trim() } : {})
    }
    store.setSettlementPaymentDraft(payload)
    await store.submitSettlementPayment(row.id)
    emit('changed', row.id)
  } catch (error) {
    actionError.value = prepaidIsConflict(error)
      ? `${prepaidErrorMessage(error, '结算单已变化')}，已保留转账时间、凭证、备注和重试编号。`
      : prepaidErrorMessage(error, '提交转账失败')
  }
}

async function confirmSettlement() {
  if (!props.settlement) return
  actionError.value = ''
  try {
    await store.confirmSettlement(props.settlement.id)
    emit('changed', props.settlement.id)
  } catch (error) {
    actionError.value = prepaidErrorMessage(error, isZeroNet.value ? '确认核对失败' : '确认到账失败')
  }
}

async function rejectSettlement() {
  if (!props.settlement) return
  const reason = rejectReason.value.trim()
  if (!reason) {
    rejectError.value = '请填写驳回原因'
    return
  }
  rejectError.value = ''
  actionError.value = ''
  try {
    await store.rejectSettlement(props.settlement.id, reason)
    rejectOpen.value = false
    rejectReason.value = ''
    emit('changed', props.settlement.id)
  } catch (error) {
    actionError.value = prepaidErrorMessage(error, '驳回结算失败')
  }
}

async function cancelSettlement() {
  if (!props.settlement) return
  actionError.value = ''
  try {
    await store.cancelSettlement(props.settlement.id)
    cancelOpen.value = false
    emit('changed', props.settlement.id)
  } catch (error) {
    actionError.value = prepaidErrorMessage(error, '取消结算失败')
  }
}

function accountLabel(value: Parameters<typeof prepaidAccountLabel>[0]) {
  return prepaidAccountLabel(value)
}

function preciseDateTime(value: string | null) {
  return prepaidPreciseDateTime(value)
}

function toTenths(value: unknown) {
  const normalized = String(value ?? 0).trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return 0
  const [whole, fraction = ''] = normalized.split('.')
  return Number(whole) * 10 + Math.sign(Number(whole) || (normalized.startsWith('-') ? -1 : 1)) * Number((fraction + '0')[0])
}

function moneyTenths(value: number) {
  return (value / 10).toFixed(1)
}

function money1(value: unknown) {
  return moneyTenths(toTenths(value))
}

function statusLabel(status: PrepaidSettlementStatus) {
  return ({
    AWAITING_PAYMENT: '待付款',
    AWAITING_RECEIPT: '待确认',
    COMPLETED: '已完成（不可修改）',
    REJECTED: '已驳回',
    CANCELLED: '已取消'
  } as const)[status]
}

function statusType(status: PrepaidSettlementStatus) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'REJECTED' || status === 'CANCELLED') return 'info'
  return status === 'AWAITING_RECEIPT' ? 'warning' : 'primary'
}

function payableStatusLabel(status: PrepaidSettlementDetailLineRow['payableStatus']) {
  return ({ PENDING: '待结算', HELD: '结算占用中', COMPLETED: '已完成', REVERSED: '已冲正' } as const)[status]
}

function operationLabel(operation: PrepaidSettlementActionOperation) {
  return ({
    SUBMIT_PAYMENT: '提交转账', CONFIRM_RECEIPT: '确认到账/核对', REJECT: '驳回', CANCEL: '取消'
  } as const)[operation]
}
</script>

<style scoped>
.settlement-detail { display: grid; gap: 18px; }
.settlement-dialog-shell { position: fixed; z-index: 2000; inset: 4vh 3vw; overflow: auto; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 24px 80px rgb(15 23 42 / 35%); }
.settlement-dialog-shell__title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.settlement-dialog-shell__title h2 { margin: 0; }
.settlement-detail__header, .settlement-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.settlement-detail__header p, .muted { margin: 4px 0 0; color: #64748b; }
.settlement-totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.settlement-totals > div { display: grid; gap: 4px; padding: 12px; border-radius: 10px; background: #f8fafc; }
.settlement-totals__net { background: #fff7ed !important; color: #9a3412; }
.settlement-direction { padding: 12px; border-left: 4px solid #f97316; background: #fff7ed; }
.settlement-gross-lines h3, .settlement-audit h3, .settlement-payment-form h3 { margin: 12px 0 8px; }
.settlement-line-card { margin-bottom: 8px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; }
.settlement-line-content, .audit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 16px; }
.settlement-payment-form { display: grid; gap: 10px; padding: 14px; border: 1px solid #fed7aa; border-radius: 10px; }
.settlement-payment-form label { display: grid; gap: 5px; }
.settlement-payment-form input, .settlement-payment-form textarea, .reason-dialog textarea { padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 6px; }
.proof-list { display: flex; gap: 12px; flex-wrap: wrap; }
.action-history { display: grid; gap: 6px; padding-left: 22px; }
.reason-dialog { position: fixed; z-index: 3000; inset: 50% auto auto 50%; transform: translate(-50%, -50%); width: min(440px, 90vw); padding: 20px; border-radius: 12px; background: #fff; box-shadow: 0 20px 60px rgb(15 23 42 / 30%); }
.reason-dialog textarea { width: 100%; min-height: 90px; box-sizing: border-box; }
.error-text { color: #dc2626; }
@media (max-width: 720px) {
  .settlement-totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settlement-line-content, .audit-grid { grid-template-columns: 1fr; }
}
</style>
