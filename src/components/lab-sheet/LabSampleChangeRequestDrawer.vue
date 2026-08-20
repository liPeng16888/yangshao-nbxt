<template>
  <el-drawer
    :model-value="modelValue"
    title="修改申请记录"
    size="760px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-skeleton v-if="loading && !rows.length" animated />
    <el-empty v-else-if="!rows.length" description="暂无修改申请" />
    <div v-else class="request-history-list">
      <article v-for="row in rows" :key="row.id" class="request-history-card">
        <button
          type="button"
          class="request-history-card__main"
          :data-testid="`select-request-${row.id}`"
          :disabled="loading"
          @click="emit('select', row.id)"
        >
          <span class="request-history-card__title">{{ row.date }} · {{ row.sampleName || `样品 ${row.blockIndex}` }}</span>
          <span>{{ row.changedFieldLabels.join('、') || '无字段摘要' }}</span>
          <span>申请原因：{{ row.reason }}</span>
          <span>申请时间：{{ formatTimestamp(row.createdAt) }}</span>
          <span v-if="row.review?.remark">复核备注：{{ row.review.remark }}</span>
          <span v-if="row.review?.reviewedAt">复核时间：{{ formatTimestamp(row.review.reviewedAt) }}</span>
          <span v-if="row.withdrawnAt">撤回时间：{{ formatTimestamp(row.withdrawnAt) }}</span>
        </button>
        <div class="request-history-card__actions">
          <el-tag :type="statusTagType(row.status)" effect="plain" size="small">
            {{ statusLabels[row.status] }}
          </el-tag>
          <el-button
            v-if="row.status === 'PENDING'"
            :data-testid="`withdraw-request-${row.id}`"
            link
            type="danger"
            size="small"
            :loading="withdrawingId === row.id"
            :disabled="loading || Boolean(withdrawingId)"
            @click="confirmWithdrawal(row)"
          >
            撤回申请
          </el-button>
        </div>
      </article>
    </div>

    <section v-if="detail" class="request-detail" data-testid="sample-change-request-detail">
      <h3>申请详情</h3>
      <dl class="request-detail__meta">
        <div><dt>日期</dt><dd>{{ detail.date }}</dd></div>
        <div><dt>样品</dt><dd>{{ detail.sampleName || `样品 ${detail.blockIndex}` }}</dd></div>
        <div><dt>状态</dt><dd>{{ statusLabels[detail.status] }}</dd></div>
        <div><dt>申请时间</dt><dd>{{ formatTimestamp(detail.createdAt) }}</dd></div>
        <div v-if="detail.review?.remark"><dt>复核备注</dt><dd>{{ detail.review.remark }}</dd></div>
        <div v-if="detail.review?.reviewedAt"><dt>复核时间</dt><dd>{{ formatTimestamp(detail.review.reviewedAt) }}</dd></div>
        <div v-if="detail.withdrawnAt"><dt>撤回时间</dt><dd>{{ formatTimestamp(detail.withdrawnAt) }}</dd></div>
      </dl>

      <h4>变更字段</h4>
      <div class="request-detail__changes">
        <div v-for="change in detailChanges" :key="change.field" class="request-detail__change">
          <strong>{{ change.label }}</strong>
          <span>{{ formatValue(change.oldValue) }}</span>
          <span aria-hidden="true">→</span>
          <span>{{ formatValue(change.newValue) }}</span>
        </div>
      </div>

      <div class="request-detail__reason"><strong>申请原因：</strong>{{ detail.reason }}</div>

      <template v-if="detail.settlementEffects?.length">
        <h4>结算影响</h4>
        <ul class="request-detail__settlements">
          <li v-for="(effect, index) in detail.settlementEffects" :key="index">{{ formatSettlementEffect(effect) }}</li>
        </ul>
      </template>
    </section>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { labSampleChangeFieldLabels, labSampleChangeRequestStatusLabels } from '@/constants/labSampleChangeRequest'
import type {
  LabSampleChangeRequestDetail,
  LabSampleChangeRequestStatus,
  LabSampleChangeRequestSummary
} from '@/types/labSampleChangeRequest'

const props = defineProps<{
  modelValue: boolean
  rows: LabSampleChangeRequestSummary[]
  detail: LabSampleChangeRequestDetail | null
  loading: boolean
  withdrawingId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [id: string]
  withdraw: [id: string]
}>()

const statusLabels = labSampleChangeRequestStatusLabels

const detailChanges = computed(() => {
  if (!props.detail) return []
  return Object.entries(props.detail.requestedChanges).map(([field, newValue]) => ({
    field,
    label: labSampleChangeFieldLabels[field] || field,
    oldValue: sourceFieldValue(props.detail!, field),
    newValue
  }))
})

async function confirmWithdrawal(row: LabSampleChangeRequestSummary) {
  if (row.status !== 'PENDING' || props.loading || props.withdrawingId) return
  try {
    await ElMessageBox.confirm(
      '撤回后该申请会保留在历史记录中，且可重新提交修改申请。',
      '确认撤回修改申请',
      { type: 'warning', confirmButtonText: '确认撤回', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  emit('withdraw', row.id)
}

function sourceFieldValue(detail: LabSampleChangeRequestDetail, field: string) {
  if (field === 'payerCustomer') {
    return {
      customerIds: detail.sourceSnapshot.inputs.customerIds || [],
      customerText: detail.sourceSnapshot.inputs.customerText || ''
    }
  }
  return detail.sourceSnapshot.inputs[field as keyof typeof detail.sourceSnapshot.inputs]
}

function statusTagType(status: LabSampleChangeRequestStatus) {
  if (status === 'PENDING') return 'warning'
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  return 'info'
}

function formatTimestamp(value: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—'
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '空'
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.customerText === 'string' && record.customerText) return record.customerText
    return Object.values(record).flatMap((item) => Array.isArray(item) ? item : [item]).filter(Boolean).join('、') || '空'
  }
  return String(value)
}

function formatSettlementEffect(effect: unknown) {
  if (!effect || typeof effect !== 'object') return String(effect ?? '')
  return Object.values(effect as Record<string, unknown>).filter((value) => value !== null && value !== undefined && value !== '').join(' · ')
}
</script>

<style scoped lang="scss">
.request-history-list,
.request-detail__changes {
  display: grid;
  gap: 10px;
}

.request-history-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.request-history-card__main {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0;
  color: #475569;
  background: transparent;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.request-history-card__title {
  color: #10233f;
  font-weight: 700;
}

.request-history-card__actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.request-detail {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid #cbd5e1;
}

.request-detail h3,
.request-detail h4 {
  margin: 0 0 10px;
  color: #10233f;
}

.request-detail h4 {
  margin-top: 16px;
  font-size: 14px;
}

.request-detail__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 0;
}

.request-detail__meta > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
}

.request-detail__meta dt {
  color: #64748b;
}

.request-detail__meta dd {
  margin: 0;
}

.request-detail__change {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 6px;
}

.request-detail__reason {
  margin-top: 16px;
}

.request-detail__settlements {
  margin: 0;
  padding-left: 20px;
}

@media (max-width: 640px) {
  .request-history-card,
  .request-detail__meta {
    grid-template-columns: 1fr;
  }
}
</style>
