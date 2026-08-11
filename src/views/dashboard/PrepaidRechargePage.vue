<template>
  <div class="page-stack prepaid-page">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>预存款充值</h2>
          <p class="muted">充值按金额记入全局共享会员账本，每笔记录永久保留归属与操作人审计信息。</p>
        </div>
      </div>
      <div class="panel__body">
        <el-alert
          v-if="realtime.hasPendingRefresh.value"
          data-testid="recharge-refresh-prompt"
          type="warning"
          :closable="false"
          show-icon
          title="共享余额或明细已变化，已保留尚未提交的内容。"
        >
          <template #default>
            <span>请先提交或重置表单，再刷新最新数据。</span>
            <el-button v-if="!hasUnsavedInput" link type="primary" @click="realtime.retryRefresh">刷新最新数据</el-button>
          </template>
        </el-alert>

        <el-alert
          v-if="mutationError"
          data-testid="recharge-mutation-error"
          type="error"
          :closable="false"
          show-icon
          :title="mutationError"
        />

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
          <div class="prepaid-form-grid">
            <el-form-item label="会员手机号" prop="phone" required>
              <el-input
                v-model="form.phone"
                data-testid="recharge-phone"
                inputmode="tel"
                maxlength="20"
                placeholder="支持输入空格或短横线"
              />
            </el-form-item>
            <el-form-item label="充值金额" prop="paidAmount" required>
              <el-input v-model="form.paidAmount" data-testid="recharge-paid" inputmode="decimal" placeholder="必填，大于 0">
                <template #prepend>¥</template>
              </el-input>
            </el-form-item>
            <el-form-item label="赠送金额" prop="giftAmount" required>
              <el-input v-model="form.giftAmount" data-testid="recharge-gift" inputmode="decimal" placeholder="必填，可填 0">
                <template #prepend>¥</template>
              </el-input>
            </el-form-item>
            <el-form-item label="充值日期" prop="rechargeDate" required>
              <el-date-picker v-model="form.rechargeDate" type="date" value-format="YYYY-MM-DD" placeholder="选择充值日期" />
            </el-form-item>
            <el-form-item class="prepaid-form-grid__wide" label="备注" prop="remark">
              <el-input v-model="form.remark" data-testid="recharge-remark" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="可选，说明本次充值来源" />
            </el-form-item>
          </div>

          <div v-if="isMainAccount" class="opening-balance" data-testid="opening-balance-control">
            <el-checkbox v-model="form.isOpeningBalance">录入期初余额（仅主账号）</el-checkbox>
            <p>期初余额用于新账本上线导入，会作为明确标记的充值批次并进入完整审计。</p>
          </div>

          <div class="recharge-confirmation">
            <strong>充值确认</strong>
            <span>充值金额 ¥{{ money(paidValue) }}</span>
            <span>赠送金额 ¥{{ money(giftValue) }}</span>
            <span>可用合计 ¥{{ money(totalValue) }}</span>
            <span>归属主账号：{{ ownerLabel }}</span>
          </div>

          <div class="form-actions">
            <el-button data-testid="recharge-submit" type="primary" :loading="saving" @click="submitRecharge">确认充值</el-button>
            <el-button :disabled="saving" @click="resetForm">重置</el-button>
          </div>
        </el-form>

        <el-result v-if="lastResult" data-testid="recharge-result" icon="success" title="充值已记入不可变账本">
          <template #sub-title>
            <div class="recharge-result-grid">
              <span>充值金额 ¥{{ money(lastResult.paidAmount) }}</span>
              <span>赠送金额 ¥{{ money(lastResult.giftAmount) }}</span>
              <span>可用合计 ¥{{ money(lastResult.totalAmount) }}</span>
              <span>新可用余额 ¥{{ money(lastResult.balance) }}</span>
              <span>归属主账号 {{ lastResult.ownerFrontendUserId }}</span>
              <span>实际操作账号 {{ actorLabel }}</span>
              <span>精确录入时间 {{ formatPreciseDateTime(lastResult.createdAt) }}</span>
            </div>
          </template>
        </el-result>
      </div>
    </section>

    <section class="panel">
      <div class="panel__header prepaid-history-header">
        <div>
          <h2>充值与期初明细</h2>
          <p class="muted">记录不可编辑或删除；主账号只能对本账号归属的未冲正充值创建反向冲正。</p>
        </div>
        <div class="prepaid-filters">
          <el-input v-model="filters.phone" data-testid="recharge-filter-phone" clearable placeholder="会员手机号" @keyup.enter="applyFilters" />
          <el-input v-model="filters.ownerFrontendUserId" data-testid="recharge-filter-owner" clearable placeholder="归属主账号 ID" @keyup.enter="applyFilters" />
          <el-date-picker v-model="filters.dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" />
          <el-select v-model="filters.isOpeningBalance" clearable placeholder="全部记录">
            <el-option label="普通充值" :value="false" />
            <el-option label="期初余额" :value="true" />
          </el-select>
          <el-button data-testid="recharge-filter-submit" type="primary" :loading="store.loadingByPage.recharges" @click="applyFilters">查询</el-button>
        </div>
      </div>
      <el-alert v-if="store.errorsByPage.recharges" class="prepaid-error" type="error" :closable="false" show-icon :title="store.errorsByPage.recharges">
        <template #default><el-button link type="primary" @click="loadHistory">重试</el-button></template>
      </el-alert>
      <el-table :data="store.rechargesPage.items" border v-loading="store.loadingByPage.recharges" empty-text="暂无充值记录">
        <el-table-column prop="phone" label="会员手机号" width="140" />
        <el-table-column label="记录类型" width="110">
          <template #default="{ row }"><el-tag :type="row.isOpeningBalance ? 'warning' : 'success'">{{ row.isOpeningBalance ? '期初余额' : '普通充值' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="充值本金" width="120"><template #default="{ row }">¥{{ money(row.paidAmount) }}</template></el-table-column>
        <el-table-column label="赠送金额" width="120"><template #default="{ row }">¥{{ money(row.giftAmount) }}</template></el-table-column>
        <el-table-column label="批次总额" width="120"><template #default="{ row }">¥{{ money(row.totalAmount) }}</template></el-table-column>
        <el-table-column label="批次剩余" width="120"><template #default="{ row }">¥{{ money(row.remainingAmount) }}</template></el-table-column>
        <el-table-column label="归属主账号" min-width="180"><template #default="{ row }">{{ accountLabel(row.ownerUsername, row.ownerAccount) }}</template></el-table-column>
        <el-table-column label="实际操作账号" min-width="180"><template #default="{ row }">{{ accountLabel(row.actorUsername, row.actorAccount) }}</template></el-table-column>
        <el-table-column prop="rechargeDate" label="充值日期" width="120" />
        <el-table-column label="精确录入时间" width="180"><template #default="{ row }">{{ formatPreciseDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column prop="remark" label="备注" min-width="150" />
        <el-table-column label="状态" width="100"><template #default="{ row }">{{ row.reversedAt ? '已冲正' : '有效' }}</template></el-table-column>
        <el-table-column v-if="isMainAccount" label="不可变更正" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canReverseRecharge(row)"
              :data-testid="`reverse-recharge-${row.id}`"
              link
              type="warning"
              @click="reverseRecharge(row)"
            >冲正</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="prepaid-pagination">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="store.rechargesPage.total"
          :page-size="pageSize"
          :current-page="store.rechargesPage.page"
          @current-change="changePage"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

import { useSharedPrepaidRealtimeRegistration } from '@/composables/useSharedPrepaidRealtime'
import { useAuthStore } from '@/stores/auth'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import type { PrepaidRechargeMutationResult, PrepaidRechargeQuery, PrepaidRechargeRow } from '@/types/sharedPrepaid'
import { formatPreciseDateTime, todayInBeijing } from '@/utils/date'

defineOptions({ name: 'PrepaidRechargePage' })

interface RechargeForm {
  phone: string
  paidAmount: string
  giftAmount: string
  rechargeDate: string
  remark: string
  isOpeningBalance: boolean
}

const pageSize = 20
const store = useSharedPrepaidStore()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const saving = ref(false)
const mutationError = ref('')
const lastResult = ref<PrepaidRechargeMutationResult | null>(null)
const initialDate = todayInBeijing()
const form = reactive<RechargeForm>({
  phone: String(store.rechargeDraft.phone || ''),
  paidAmount: String(store.rechargeDraft.paidAmount || ''),
  giftAmount: String(store.rechargeDraft.giftAmount || ''),
  rechargeDate: store.rechargeDraft.rechargeDate || initialDate,
  remark: store.rechargeDraft.remark || '',
  isOpeningBalance: Boolean(store.rechargeDraft.isOpeningBalance)
})
const filters = reactive<{
  phone: string
  ownerFrontendUserId: string
  dateRange: string[]
  isOpeningBalance: boolean | undefined
}>({ phone: '', ownerFrontendUserId: '', dateRange: [], isOpeningBalance: undefined })

const isMainAccount = computed(() => auth.user?.role === 'FRONTEND_USER' || auth.user?.isFrontendMainAccount === true)
const currentOwnerId = computed(() => auth.user?.dataOwnerId || auth.user?.id || '')
const paidValue = computed(() => positiveNumber(form.paidAmount))
const giftValue = computed(() => nonNegativeNumber(form.giftAmount))
const totalValue = computed(() => paidValue.value + giftValue.value)
const ownerLabel = computed(() => isMainAccount.value
  ? accountLabel(auth.user?.username || '', auth.user?.account || currentOwnerId.value)
  : `主账号 ID ${currentOwnerId.value}`)
const actorLabel = computed(() => accountLabel(auth.user?.username || '', auth.user?.account || auth.user?.id || ''))
const hasUnsavedInput = computed(() => Boolean(
  normalizePhone(form.phone) || form.paidAmount.trim() || form.giftAmount.trim() || form.remark.trim() ||
  form.isOpeningBalance || form.rechargeDate !== initialDate
))

const rules: FormRules<RechargeForm> = {
  phone: [
    { required: true, message: '请输入会员手机号', trigger: 'change' },
    { validator: (_rule, value, callback) => /^1[3-9]\d{9}$/.test(normalizePhone(value)) ? callback() : callback(new Error('请输入 11 位中国大陆手机号')), trigger: 'change' }
  ],
  paidAmount: [
    { required: true, message: '请输入充值金额', trigger: 'change' },
    { validator: (_rule, value, callback) => validMoney(value, true) ? callback() : callback(new Error('充值金额必须大于 0，最多两位小数')), trigger: 'change' }
  ],
  giftAmount: [
    { required: true, message: '请输入赠送金额，无赠送请填 0', trigger: 'change' },
    { validator: (_rule, value, callback) => validMoney(value, false) ? callback() : callback(new Error('赠送金额不得为负数，最多两位小数')), trigger: 'change' }
  ],
  rechargeDate: [{ required: true, message: '请选择充值日期', trigger: 'change' }],
  remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'change' }]
}

const realtime = useSharedPrepaidRealtimeRegistration('recharges', {
  isDirty: () => hasUnsavedInput.value,
  refresh: () => loadHistory(store.rechargesPage.page)
})

watch(form, () => {
  if (!isMainAccount.value) form.isOpeningBalance = false
  store.setRechargeDraft({ ...form })
  store.setPageDirty('recharges', hasUnsavedInput.value)
}, { deep: true })

onMounted(() => void loadHistory())

async function submitRecharge() {
  mutationError.value = ''
  if (!/^1[3-9]\d{9}$/.test(normalizePhone(form.phone))) {
    mutationError.value = '请输入 11 位中国大陆手机号'
    await formRef.value?.validateField('phone').catch(() => undefined)
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    lastResult.value = await store.createRecharge({
      phone: normalizePhone(form.phone),
      paidAmount: form.paidAmount.trim(),
      giftAmount: form.giftAmount.trim(),
      rechargeDate: form.rechargeDate,
      isOpeningBalance: isMainAccount.value && form.isOpeningBalance,
      remark: form.remark.trim()
    })
    resetForm()
    await loadHistory(1)
    ElMessage.success('充值已记入共享预存款账本')
  } catch (error) {
    mutationError.value = isConflict(error)
      ? `${errorMessage(error, '共享余额或充值记录已变化')}；已保留了当前输入和本次操作键，请核对后直接重试。`
      : errorMessage(error, '充值失败，已保留当前输入')
  } finally {
    saving.value = false
  }
}

function resetForm() {
  Object.assign(form, {
    phone: '', paidAmount: '', giftAmount: '', rechargeDate: todayInBeijing(), remark: '', isOpeningBalance: false
  })
  mutationError.value = ''
  store.setRechargeDraft({ ...form })
  store.setPageDirty('recharges', false)
  formRef.value?.clearValidate()
}

function rechargeQuery(page = 1): PrepaidRechargeQuery {
  const [startDate, endDate] = filters.dateRange
  return {
    page,
    pageSize,
    ...(normalizePhone(filters.phone) ? { phone: normalizePhone(filters.phone) } : {}),
    ...(filters.ownerFrontendUserId.trim() ? { ownerFrontendUserId: filters.ownerFrontendUserId.trim() } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(filters.isOpeningBalance === undefined ? {} : { isOpeningBalance: filters.isOpeningBalance })
  }
}

async function loadHistory(page = 1) {
  try {
    await store.loadRecharges(rechargeQuery(page))
  } catch {
    // Store keeps the persistent error for the inline retry state.
  }
}

function applyFilters() {
  return loadHistory(1)
}

function changePage(page: number) {
  return loadHistory(page)
}

function canReverseRecharge(row: PrepaidRechargeRow) {
  return isMainAccount.value && row.ownerFrontendUserId === currentOwnerId.value && !row.reversedAt
}

async function reverseRecharge(row: PrepaidRechargeRow) {
  try {
    const { value } = await ElMessageBox.prompt(
      `将创建反向冲正流水，不会修改或删除原充值 ${row.id}。请填写原因。`,
      '确认冲正充值',
      { type: 'warning', inputPattern: /\S+/, inputErrorMessage: '请填写冲正原因', confirmButtonText: '创建冲正', cancelButtonText: '取消' }
    )
    await store.reverseRecharge(row.id, value.trim())
    await loadHistory(store.rechargesPage.page)
    ElMessage.success('充值冲正流水已创建')
  } catch (error) {
    if (!isMessageBoxCancel(error)) {
      mutationError.value = isConflict(error)
        ? `${errorMessage(error, '充值状态已变化')}，请刷新后核对批次剩余金额。`
        : errorMessage(error, '充值冲正失败')
    }
  }
}

function normalizePhone(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function validMoney(value: unknown, positive: boolean) {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return false
  const amount = Number(text)
  return Number.isFinite(amount) && (positive ? amount > 0 : amount >= 0)
}

function positiveNumber(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function nonNegativeNumber(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}

function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function accountLabel(username: string, account: string) {
  return username && username !== account ? `${username}（${account}）` : account || username || '无信息'
}

function isConflict(error: unknown) {
  return (error as { response?: { status?: unknown } } | null)?.response?.status === 409
}

function errorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: unknown } }; message?: unknown } | null)?.response
  const message = response?.data?.message ?? (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function isMessageBoxCancel(error: unknown) {
  return error === 'cancel' || error === 'close'
}
</script>

<style scoped>
.prepaid-page :deep(.el-alert) { margin-bottom: 14px; }
.prepaid-form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 14px; }
.prepaid-form-grid__wide { grid-column: 1 / -1; }
.opening-balance { padding: 12px 14px; margin-bottom: 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; }
.opening-balance p { margin: 4px 0 0; color: #9a3412; font-size: 13px; }
.recharge-confirmation { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 12px 14px; margin-bottom: 14px; background: #f8fafc; border: 1px solid #dce5ef; border-radius: 8px; font-size: 13px; }
.recharge-confirmation strong { width: 100%; }
.form-actions { display: flex; gap: 10px; }
.recharge-result-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; }
.prepaid-history-header { align-items: flex-start; }
.prepaid-filters { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.prepaid-filters > * { width: 180px; }
.prepaid-filters :deep(.el-date-editor) { width: 250px; }
.prepaid-error { margin: 14px 16px 0; }
.prepaid-pagination { display: flex; justify-content: flex-end; padding: 14px 16px; }
@media (max-width: 1100px) { .prepaid-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .prepaid-history-header { flex-direction: column; } .prepaid-filters { justify-content: flex-start; width: 100%; } }
@media (max-width: 640px) { .prepaid-form-grid { grid-template-columns: 1fr; } .prepaid-form-grid__wide { grid-column: auto; } .prepaid-filters > *, .prepaid-filters :deep(.el-date-editor) { width: 100%; } }
</style>
