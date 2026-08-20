<template>
  <section class="panel sample-change-panel">
    <div class="panel__header">
      <strong>样品修改申请</strong>
      <div class="filters">
        <el-select v-model="selectedFrontendIds" multiple filterable collapse-tags placeholder="选择前端账号" style="width: 300px">
          <el-option v-for="item in frontendOptions" :key="item.id" :label="`${item.name}（${item.account}）`" :value="item.id" />
        </el-select>
        <el-select v-model="status" clearable placeholder="全部状态" style="width: 140px">
          <el-option label="待审核" value="PENDING" />
          <el-option label="已同意" value="APPROVED" />
          <el-option label="已拒绝" value="REJECTED" />
          <el-option label="已撤回" value="WITHDRAWN" />
        </el-select>
        <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" clearable placeholder="表格日期" />
        <el-button data-testid="sample-change-search" type="primary" :loading="loading" @click="loadRequests">查询</el-button>
      </div>
    </div>
    <div class="panel__body todo-intro">管理员只能整份同意或拒绝申请，不能修改申请值；公式结果由服务端按样品保存的参数快照计算。</div>

    <el-alert v-if="loadError" data-testid="sample-change-load-error" :title="loadError" type="error" :closable="false" show-icon>
      <el-button data-testid="sample-change-retry" link type="primary" @click="retryLoad">重试</el-button>
    </el-alert>
    <div v-if="loading" data-testid="sample-change-loading" class="loading-state">正在加载样品修改申请...</div>

    <el-table v-else-if="!loadError" v-loading="loading" :data="rows" border>
      <el-table-column prop="createdAt" label="申请时间" width="190" />
      <el-table-column label="前端账号" min-width="190">
        <template #default="{ row }">{{ accountLabel(row.frontendUserId) }}</template>
      </el-table-column>
      <el-table-column prop="date" label="表格日期" width="120" />
      <el-table-column prop="sampleName" label="样品名称" min-width="150" />
      <el-table-column label="修改字段" min-width="220">
        <template #default="{ row }">{{ row.changedFieldLabels.join('、') || '无信息' }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="申请原因" min-width="220" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }"><el-tag :type="statusType(row.status)" effect="plain">{{ statusLabel(row.status) }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button :data-testid="`view-sample-change-${row.id}`" size="small" @click="openDetail(row)">详情</el-button>
          <template v-if="row.status === 'PENDING'">
            <el-button
              :data-testid="`approve-sample-change-${row.id}`"
              size="small"
              type="primary"
              :disabled="Boolean(actionRequestId)"
              :loading="actionRequestId === row.id && actionKind === 'approve'"
              @click="approve(row)"
            >同意</el-button>
            <el-button
              :data-testid="`reject-sample-change-${row.id}`"
              size="small"
              type="danger"
              :disabled="Boolean(actionRequestId)"
              :loading="actionRequestId === row.id && actionKind === 'reject'"
              @click="reject(row)"
            >拒绝</el-button>
          </template>
          <span v-else class="muted">已处理</span>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !loadError && !rows.length" description="暂无样品修改申请" />

    <el-dialog v-model="detailVisible" title="样品修改申请详情" width="860px">
      <div v-if="detailLoading" class="loading-state">正在加载申请详情...</div>
      <el-alert v-else-if="detailError" :title="detailError" type="error" :closable="false" show-icon>
        <el-button link type="primary" @click="reloadDetail">重试</el-button>
      </el-alert>
      <template v-else-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="前端账号">{{ accountLabel(detail.frontendUserId) }}</el-descriptions-item>
          <el-descriptions-item label="表格日期">{{ detail.date }}</el-descriptions-item>
          <el-descriptions-item label="样品序号">第 {{ detail.blockIndex }} 个</el-descriptions-item>
          <el-descriptions-item label="样品名称">{{ detail.sampleName || '无信息' }}</el-descriptions-item>
          <el-descriptions-item label="申请原因">{{ detail.reason }}</el-descriptions-item>
          <el-descriptions-item label="申请状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
          <el-descriptions-item label="申请时间">{{ detail.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ identityLabel(detail.requestedBy) }}</el-descriptions-item>
          <el-descriptions-item label="审批人">{{ identityLabel(detail.reviewedBy) }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.withdrawnAt" label="撤回时间">{{ detail.withdrawnAt }}</el-descriptions-item>
          <el-descriptions-item label="审批备注">{{ detail.review?.remark || '无信息' }}</el-descriptions-item>
          <el-descriptions-item label="审批时间">{{ detail.review?.reviewedAt || '无信息' }}</el-descriptions-item>
        </el-descriptions>

        <h4>申请字段对比</h4>
        <el-table :data="diffRows" border>
          <el-table-column prop="label" label="字段" width="150" />
          <el-table-column prop="oldValue" label="原值" min-width="220" />
          <el-table-column prop="newValue" label="申请值" min-width="220" />
        </el-table>

        <h4>公式结果预览</h4>
        <el-table :data="resultRows" border>
          <el-table-column prop="label" label="公式结果" width="150" />
          <el-table-column prop="oldValue" label="修改前" />
          <el-table-column prop="previewValue" label="服务端预览" />
          <el-table-column v-if="detail.actualResults" prop="actualValue" label="审批生效结果" />
        </el-table>

        <el-alert
          v-if="mayResetMonthlySettlement"
          class="settlement-warning"
          title="月结状态重置警告"
          type="warning"
          :closable="false"
          show-icon
        >
          审批通过后，受影响的已结款或部分结款月结记录将重置为未结款，并保留重置前快照供追溯。
        </el-alert>
        <ul v-if="detail.settlementEffects.length" class="settlement-effects">
          <li v-for="effect in detail.settlementEffects" :key="effect.recordId">
            {{ effect.customer }}（{{ effect.month }}）：{{ settlementStatusLabel(effect.oldStatus) }} → 未结款；原已结金额 {{ displayValue(effect.oldPaidAmount) }}；原备注 {{ displayValue(effect.oldRemark) }}
          </li>
        </ul>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  approveAdminLabSampleChangeRequest,
  getAdminLabSampleChangeRequest,
  getAdminLabSampleChangeRequests,
  getFrontendOptions,
  rejectAdminLabSampleChangeRequest
} from '../../api'
import type {
  AdminLabSampleChangeRequestDetail,
  AdminLabSampleChangeRequestQuery,
  AdminLabSampleChangeRequestStatus,
  AdminLabSampleChangeRequestSummary,
  FrontendOption
} from '../../types'

const frontendOptions = ref<FrontendOption[]>([])
const selectedFrontendIds = ref<string[]>([])
const status = ref<AdminLabSampleChangeRequestStatus | ''>('')
const date = ref('')
const rows = ref<AdminLabSampleChangeRequestSummary[]>([])
const loading = ref(false)
const loadError = ref('')
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detail = ref<AdminLabSampleChangeRequestDetail | null>(null)
const detailRequestId = ref('')
const actionRequestId = ref('')
const actionKind = ref<'approve' | 'reject' | ''>('')
let loadGeneration = 0
let detailGeneration = 0

const fieldLabels: Record<string, string> = {
  sampleNumber: '样品编号', payerCustomer: '付款客户', price: '价格', paymentStatus: '付款状态', elementNote: '元素备注',
  ironRaw: '铁', siliconRaw: '硅', siliconAdjust: '硅调整', aluminumRaw: '铝', aluminumAdjust: '铝调整',
  sulfur: '硫', densityRaw: '密度', whiteness: '白度', calciumRaw: '钙', magnesiumRaw: '镁', carbon: '碳',
  titaniumRaw: '钛', waterSample: '水样', bottleWater: '瓶水', bottleWaterSample: '瓶水样', moisture: '水分',
  crucible: '坩埚', sampleWeight: '样品重量', burnedCrucibleSample: '灼烧后坩埚样品'
}

const resultLabels: Record<string, string> = {
  iron: '铁', silicon: '硅', aluminum: '铝', aluminumSiliconRatio: '铝硅比', total: '合量', density: '比重',
  calcium: '钙', magnesium: '镁', titanium: '钛', bottleDensity: '比重（瓶法）', moisture: '水份', burnLoss: '灼减'
}

const diffRows = computed(() => {
  if (!detail.value) return []
  return Object.entries(detail.value.requestedChanges).map(([field, newValue]) => ({
    field,
    label: fieldLabels[field] || field,
    oldValue: displayValue(sourceValue(detail.value!, field)),
    newValue: displayValue(requestedValue(field, newValue))
  }))
})

const resultRows = computed(() => {
  if (!detail.value) return []
  const oldResults = detail.value.sourceSnapshot.results
  const previewResults = detail.value.previewResults
  const actualResults = detail.value.actualResults
  const fields = Array.from(new Set([...Object.keys(oldResults), ...Object.keys(previewResults), ...Object.keys(actualResults || {})]))
  return fields
    .filter((field) => oldResults[field] !== previewResults[field] || (actualResults && previewResults[field] !== actualResults[field]))
    .map((field) => ({
      field,
      label: resultLabels[field] || field,
      oldValue: displayValue(oldResults[field]),
      previewValue: displayValue(previewResults[field]),
      actualValue: displayValue(actualResults?.[field])
    }))
})

const mayResetMonthlySettlement = computed(() => {
  if (!detail.value) return false
  const changes = detail.value.requestedChanges
  if (!['price', 'payerCustomer', 'paymentStatus'].some((field) => Object.prototype.hasOwnProperty.call(changes, field))) return false
  const oldStatus = detail.value.sourceSnapshot.inputs.paymentStatus
  const nextStatus = Object.prototype.hasOwnProperty.call(changes, 'paymentStatus') ? changes.paymentStatus : oldStatus
  return oldStatus === '月结款' || nextStatus === '月结款'
})

onMounted(() => { void initialize() })

async function initialize() {
  try {
    frontendOptions.value = await getFrontendOptions()
    selectedFrontendIds.value = frontendOptions.value.map((item) => item.id)
    await loadRequests()
  } catch (error) {
    loadError.value = errorMessage(error)
    loading.value = false
  }
}

function currentQuery(): AdminLabSampleChangeRequestQuery {
  return {
    frontendUserIds: [...selectedFrontendIds.value],
    ...(status.value ? { status: status.value } : {}),
    ...(date.value ? { date: date.value } : {})
  }
}

async function loadRequests() {
  const generation = ++loadGeneration
  loadError.value = ''
  rows.value = []
  loading.value = true
  try {
    const loaded = await getAdminLabSampleChangeRequests(currentQuery())
    if (generation === loadGeneration) rows.value = loaded
  } catch (error) {
    if (generation === loadGeneration) loadError.value = errorMessage(error)
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function retryLoad() {
  if (frontendOptions.value.length) await loadRequests()
  else await initialize()
}

function accountLabel(frontendUserId: string) {
  const option = frontendOptions.value.find((item) => item.id === frontendUserId)
  return option ? `${option.name}（${option.account}）` : frontendUserId
}

function identityLabel(identity: AdminLabSampleChangeRequestSummary['reviewedBy']) {
  return identity ? `${identity.username}（${identity.account}）` : '无信息'
}

function statusLabel(value: AdminLabSampleChangeRequestStatus) {
  return ({ PENDING: '待审核', APPROVED: '已同意', REJECTED: '已拒绝', WITHDRAWN: '已撤回' } as Record<AdminLabSampleChangeRequestStatus, string>)[value]
}

function statusType(value: AdminLabSampleChangeRequestStatus) {
  if (value === 'APPROVED') return 'success'
  if (value === 'REJECTED') return 'danger'
  if (value === 'WITHDRAWN') return 'info'
  return 'warning'
}

async function openDetail(row: AdminLabSampleChangeRequestSummary) {
  detailRequestId.value = row.id
  detailVisible.value = true
  await reloadDetail()
}

async function reloadDetail() {
  const id = detailRequestId.value
  if (!id) return
  const generation = ++detailGeneration
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  try {
    const loaded = await getAdminLabSampleChangeRequest(id)
    if (generation === detailGeneration) detail.value = loaded
  } catch (error) {
    if (generation === detailGeneration) detailError.value = errorMessage(error)
  } finally {
    if (generation === detailGeneration) detailLoading.value = false
  }
}

function sourceValue(request: AdminLabSampleChangeRequestDetail, field: string) {
  if (field === 'payerCustomer') return request.sourceSnapshot.inputs.customerText || request.sourceSnapshot.inputs.customers
  return request.sourceSnapshot.inputs[field]
}

function requestedValue(field: string, value: unknown) {
  if (field === 'payerCustomer' && value && typeof value === 'object') return (value as { customerText?: string }).customerText
  return value
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '空'
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join('、') : '空'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function settlementStatusLabel(status: string) {
  return status === 'PAID' ? '已结款' : status === 'PARTIAL' ? '部分结款' : status
}

async function approve(row: AdminLabSampleChangeRequestSummary) {
  if (!beginAction(row.id, 'approve')) return
  try {
    const result = await ElMessageBox.prompt(
      `确认同意整份申请「${row.sampleName || `第 ${row.blockIndex} 个样品`}」？申请值将直接生效，公式结果由服务端重算；受影响的已结款或部分结款月结记录可能重置为未结款。`,
      '同意样品修改申请',
      { confirmButtonText: '整份同意', cancelButtonText: '取消', inputType: 'textarea', inputPlaceholder: '可选：填写审批备注', type: 'warning' }
    )
    await approveAdminLabSampleChangeRequest(row.id, String(result.value || '').trim())
    ElMessage.success('已同意样品修改申请')
    detailVisible.value = false
    await loadRequests()
  } catch (error) {
    if (!isPromptCancel(error)) ElMessage.error(errorMessage(error))
  } finally {
    endAction()
  }
}

async function reject(row: AdminLabSampleChangeRequestSummary) {
  if (!beginAction(row.id, 'reject')) return
  try {
    const result = await ElMessageBox.prompt(
      `确认整份拒绝「${row.sampleName || `第 ${row.blockIndex} 个样品`}」的修改申请？请填写拒绝原因。`,
      '拒绝样品修改申请',
      { confirmButtonText: '整份拒绝', cancelButtonText: '取消', inputType: 'textarea', inputPlaceholder: '必填：拒绝原因', type: 'warning' }
    )
    const reason = String(result.value || '').trim()
    if (!reason) {
      ElMessage.warning('请填写拒绝原因')
      return
    }
    await rejectAdminLabSampleChangeRequest(row.id, reason)
    ElMessage.success('已拒绝样品修改申请')
    detailVisible.value = false
    await loadRequests()
  } catch (error) {
    if (!isPromptCancel(error)) ElMessage.error(errorMessage(error))
  } finally {
    endAction()
  }
}

function beginAction(requestId: string, kind: 'approve' | 'reject') {
  if (actionRequestId.value) return false
  actionRequestId.value = requestId
  actionKind.value = kind
  return true
}

function endAction() {
  actionRequestId.value = ''
  actionKind.value = ''
}

function isPromptCancel(error: unknown) {
  if (error === 'cancel' || error === 'close') return true
  if (!error || typeof error !== 'object' || !('action' in error)) return false
  const action = String((error as { action?: unknown }).action || '')
  return action === 'cancel' || action === 'close'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败'
}
</script>

<style scoped>
.todo-intro { padding-top: 0; color: #64748b; }
.loading-state { padding: 28px; text-align: center; color: #64748b; }
.muted { color: #94a3b8; }
h4 { margin: 20px 0 10px; }
.settlement-warning { margin-top: 18px; }
.settlement-effects { margin: 12px 0 0; padding-left: 22px; color: #92400e; }
</style>
