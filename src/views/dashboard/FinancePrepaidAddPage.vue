<template>
  <div class="page-stack" :class="{ 'mobile-page mobile-prepaid-page': isMobileLayout }">
    <template v-if="isMobileLayout">
      <section class="panel mobile-prepaid-form" data-testid="mobile-prepaid-form">
        <header class="mobile-prepaid-header">
          <div><h2>添加预存款客户</h2><p class="muted">同一客户的金额和可使用次数会自动累计。</p></div>
          <button data-testid="mobile-prepaid-customers-link" class="mobile-touch-target mobile-prepaid-link" type="button" @click="router.push('/finance/prepaid/customers')">预存款客户</button>
        </header>
        <label><span>充值日期 *</span><input v-model="form.rechargeDate" data-testid="mobile-prepaid-date" class="mobile-touch-target" type="date" /></label>
        <label><span>客户名称 *</span><span class="mobile-prepaid-customer-field"><input v-model="form.customer" data-testid="mobile-prepaid-customer-value" class="mobile-touch-target" type="text" autocomplete="off" placeholder="选择或输入客户名称" /><button data-testid="mobile-prepaid-customer-open" class="mobile-touch-target" type="button" @click="openCustomerSelector">选择客户</button></span></label>
        <div class="mobile-prepaid-form__numbers">
          <label><span>预存金额 *</span><input v-model.number="form.amount" data-testid="mobile-prepaid-amount" class="mobile-touch-target" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0.00" /></label>
          <label><span>可使用次数 *</span><input v-model.number="form.usableTimes" data-testid="mobile-prepaid-times" class="mobile-touch-target" type="number" inputmode="numeric" min="1" step="1" placeholder="1" /></label>
        </div>
        <label><span>备注</span><textarea v-model="form.remark" data-testid="mobile-prepaid-remark" rows="3" maxlength="120" placeholder="可填写备注" /></label>
        <div class="mobile-prepaid-form__actions">
          <button data-testid="mobile-prepaid-submit" class="mobile-touch-target mobile-prepaid-submit" style="min-height: 44px" type="button" :disabled="submitPending" @click="handleSubmit">{{ submitPending ? '添加中…' : '确认添加' }}</button>
          <button data-testid="mobile-prepaid-reset" class="mobile-touch-target" type="button" :disabled="submitPending" @click="resetForm">重置</button>
        </div>
      </section>

      <section class="panel mobile-prepaid-records">
        <header class="mobile-prepaid-header"><div><h2>添加的数据信息</h2><p class="muted">这里记录每一次预存款添加明细。</p></div><button data-testid="mobile-prepaid-recharges-refresh" class="mobile-touch-target" type="button" :disabled="store.loading" @click="requestPrepaidRecharges">{{ store.loading ? '刷新中…' : '刷新' }}</button></header>
        <div v-if="loadError" data-testid="mobile-prepaid-recharges-error" class="mobile-prepaid-error" role="alert"><span>{{ loadError }}</span><button data-testid="mobile-prepaid-recharges-retry" class="mobile-touch-target" type="button" @click="retryPrepaidRecharges">重试</button></div>
        <MobilePrepaidList v-else kind="recharge" :rows="store.prepaidRecharges" :loading="store.loading" :deleting-id="deletePendingId || store.prepaidDeletingId" @delete-request="handleDeleteRequest" />
      </section>

      <MobileFullscreenDialog v-model="customerSelectorVisible" title="选择客户" fullscreen>
        <section class="mobile-prepaid-customer-selector" aria-label="客户选择">
          <label><span>搜索或输入客户名称</span><input v-model="customerKeyword" data-testid="mobile-prepaid-customer-search" class="mobile-touch-target" type="search" autocomplete="off" placeholder="输入客户名称" @input="loadCustomerOptions(customerKeyword)" /></label>
          <button data-testid="mobile-prepaid-customer-use-input" class="mobile-touch-target mobile-prepaid-customer-selector__custom" type="button" :disabled="!customerKeyword.trim()" @click="selectCustomer(customerKeyword)">使用“{{ customerKeyword || '输入内容' }}”</button>
          <p v-if="customerLoading" role="status" aria-live="polite">客户列表加载中…</p>
          <div v-else class="mobile-prepaid-customer-selector__options">
            <button v-for="customer in customerOptions" :key="customer.id" data-testid="mobile-prepaid-customer-option" class="mobile-touch-target" type="button" @click="selectCustomer(customer.name)">{{ customer.name }}</button>
            <p v-if="!customerOptions.length" class="empty-text">没有匹配客户，可使用上方输入内容。</p>
          </div>
        </section>
        <template #footer="{ cancel }"><button class="mobile-touch-target" type="button" @click="cancel">关闭</button></template>
      </MobileFullscreenDialog>
    </template>

    <template v-else>
      <section class="panel">
        <div class="panel__header"><div><h2>添加预存款客户</h2><p class="muted">录入客户预存金额和可使用次数，确认后同一客户会自动合并累计。</p></div><el-button @click="router.push('/finance/prepaid/customers')">预存款客户</el-button></div>
        <div class="panel__body">
          <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
            <div class="prepaid-form-grid">
              <el-form-item label="充值日期" prop="rechargeDate"><el-date-picker v-model="form.rechargeDate" type="date" value-format="YYYY-MM-DD" /></el-form-item>
              <el-form-item label="客户名称" prop="customer"><el-select v-model="form.customer" filterable remote allow-create default-first-option clearable reserve-keyword :remote-method="loadCustomerOptions" :loading="customerLoading" placeholder="选择已有客户或手动输入"><el-option v-for="customer in customerOptions" :key="customer.id" :label="customer.name" :value="customer.name" /></el-select></el-form-item>
              <el-form-item label="预存金额" prop="amount"><el-input-number v-model="form.amount" :min="0.01" :precision="2" :step="100" controls-position="right" /></el-form-item>
              <el-form-item label="可使用次数" prop="usableTimes"><el-input-number v-model="form.usableTimes" :min="1" :precision="0" :step="1" controls-position="right" /></el-form-item>
              <el-form-item class="prepaid-form-grid__wide" label="备注"><el-input v-model="form.remark" maxlength="120" placeholder="可填写备注" /></el-form-item>
            </div>
            <div class="form-actions"><el-button type="primary" :loading="store.prepaidSaving" @click="handleSubmit">确认添加</el-button><el-button @click="resetForm">重置</el-button></div>
          </el-form>
        </div>
      </section>
      <section class="panel">
        <div class="panel__header"><div><h2>添加的数据信息</h2><p class="muted">这里记录每一次预存款添加明细。</p></div><el-button :loading="store.loading" @click="requestPrepaidRecharges">刷新</el-button></div>
        <el-table :data="store.prepaidRecharges" border v-loading="store.loading" empty-text="暂无预存款添加记录">
          <el-table-column prop="rechargeDate" label="充值日期" width="130" /><el-table-column prop="customer" label="客户名称" min-width="180" />
          <el-table-column label="预存金额" width="140"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
          <el-table-column prop="usableTimes" label="可使用次数" width="120" /><el-table-column prop="remark" label="备注" min-width="240" />
          <el-table-column label="操作" width="130" fixed="right"><template #default="{ row }"><el-tag v-if="row.deleteRequestStatus === 'PENDING'" type="warning" effect="plain">删除待审核</el-tag><el-button v-else type="danger" link :loading="store.prepaidDeletingId === row.id" @click="handleDeleteRequest(row)">删除</el-button></template></el-table-column>
        </el-table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { searchCustomers } from '@/api/customer'
import MobilePrepaidList from '@/components/finance/MobilePrepaidList.vue'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { Customer } from '@/types/customer'
import type { PrepaidRechargePayload, PrepaidRechargeRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { todayInBeijing } from '@/utils/date'

const router = useRouter()
const store = useFinanceBillsStore()
const { isMobileLayout } = useMobileLayout()
const formRef = ref<FormInstance>()
const customerOptions = ref<Customer[]>([])
const customerLoading = ref(false)
const customerSelectorVisible = ref(false)
const customerKeyword = ref('')
const submitPending = ref(false)
const deletePendingId = ref('')
const loadError = ref('')
const rechargeLoadScope = Symbol('finance-prepaid-add-page')
let pageActive = true
let lifecycleEpoch = 0
let rechargeLoadVersion = 0
let customerLoadVersion = 0

const form = reactive({ rechargeDate: todayInBeijing(), customer: '', amount: undefined as number | undefined, usableTimes: undefined as number | undefined, remark: '' })
const rules: FormRules = {
  rechargeDate: [{ required: true, message: '请选择充值日期', trigger: 'change' }],
  customer: [{ required: true, message: '请选择或输入客户名称', trigger: 'change' }],
  amount: [{ required: true, type: 'number', message: '请输入预存金额', trigger: 'change' }, { type: 'number', min: 0.01, message: '预存金额必须大于 0', trigger: 'change' }],
  usableTimes: [{ required: true, type: 'number', message: '请输入可使用次数', trigger: 'change' }, { type: 'number', min: 1, message: '可使用次数必须大于 0', trigger: 'change' }]
}

onMounted(() => { void requestPrepaidRecharges(); void loadCustomerOptions('') })
onBeforeUnmount(() => { pageActive = false; lifecycleEpoch += 1; rechargeLoadVersion += 1; customerLoadVersion += 1; store.cancelPrepaidRechargeLoads(rechargeLoadScope) })

async function requestPrepaidRecharges() {
  const requestVersion = ++rechargeLoadVersion
  loadError.value = ''
  try { await store.loadPrepaidRecharges({ scope: rechargeLoadScope }) }
  catch { if (pageActive && requestVersion === rechargeLoadVersion) loadError.value = '预存款添加记录加载失败，请重试。' }
}

async function retryPrepaidRecharges() {
  const requestVersion = ++rechargeLoadVersion
  loadError.value = ''
  try { await store.retryPrepaidRecharges({ scope: rechargeLoadScope }) }
  catch { if (pageActive && requestVersion === rechargeLoadVersion) loadError.value = '预存款添加记录加载失败，请重试。' }
}

async function loadCustomerOptions(keyword: string) {
  const requestVersion = ++customerLoadVersion
  customerLoading.value = true
  try { const rows = await searchCustomers(keyword); if (pageActive && requestVersion === customerLoadVersion) customerOptions.value = rows }
  finally { if (pageActive && requestVersion === customerLoadVersion) customerLoading.value = false }
}

function openCustomerSelector() { customerKeyword.value = form.customer; customerSelectorVisible.value = true; void loadCustomerOptions(customerKeyword.value) }
function selectCustomer(customer: string) { const value = customer.trim(); if (!value) return; form.customer = value; customerSelectorVisible.value = false }

async function handleSubmit() {
  if (submitPending.value) return
  const lifecycleToken = lifecycleEpoch
  const snapshot = snapshotForm()
  submitPending.value = true
  try {
    const valid = isMobileLayout.value ? validateMobile(snapshot) : await formRef.value?.validate().then(() => true).catch(() => false)
    if (!valid || !isLifecycleCurrent(lifecycleToken)) return
    const payload = payloadFromSnapshot(snapshot)
    const existing = store.prepaidRecharges.filter((row) => row.customer === payload.customer)
    const existingTimes = existing.reduce((sum, row) => sum + row.usableTimes, 0)
    const existingAmount = existing.reduce((sum, row) => sum + row.amount, 0)
    const message = existing.length ? `${payload.customer} 已有预存记录，原可使用次数 ${existingTimes} 次，本次增加 ${payload.usableTimes} 次，确认后累计为 ${existingTimes + payload.usableTimes} 次；原累计金额 ¥${money(existingAmount)}，本次增加 ¥${money(payload.amount)}。` : `确认添加 ${payload.customer} 的预存款 ¥${money(payload.amount)}，可使用次数 ${payload.usableTimes} 次？`
    await ElMessageBox.confirm(message, '二次确认提醒', { confirmButtonText: '确认添加', cancelButtonText: '取消', type: 'warning' })
    if (!isLifecycleCurrent(lifecycleToken)) return
    await store.addPrepaidRecharge(payload)
    if (!isLifecycleCurrent(lifecycleToken)) return
    ElMessage.success('预存款客户信息已添加')
    if (formMatches(snapshot)) resetForm()
  } catch { /* The request layer owns failures; keeping the draft is intentional. */ }
  finally { if (isLifecycleCurrent(lifecycleToken)) submitPending.value = false }
}

async function handleDeleteRequest(row: PrepaidRechargeRow) {
  if (deletePendingId.value) return
  const lifecycleToken = lifecycleEpoch
  deletePendingId.value = row.id
  try {
    const result = await ElMessageBox.prompt(`确认申请删除「${row.rechargeDate} ${row.customer}」这条预存款记录？请填写删除理由。`, '删除申请', { confirmButtonText: '提交申请', cancelButtonText: '取消', inputType: 'textarea', inputPlaceholder: '请填写删除理由', inputValidator: (value) => Boolean(String(value || '').trim()) || '请填写删除理由', type: 'warning' })
    if (!isLifecycleCurrent(lifecycleToken)) return
    await store.requestPrepaidDeletion(row, String(result.value || '').trim())
    if (isLifecycleCurrent(lifecycleToken)) ElMessage.success('删除申请已提交，等待后端审核')
  } catch { /* Cancellation and request failures keep the record actionable. */ }
  finally { if (isLifecycleCurrent(lifecycleToken)) deletePendingId.value = '' }
}

function snapshotForm() { return { rechargeDate: form.rechargeDate, customer: form.customer, amount: form.amount, usableTimes: form.usableTimes, remark: form.remark } }
function payloadFromSnapshot(snapshot: ReturnType<typeof snapshotForm>): PrepaidRechargePayload { return { rechargeDate: snapshot.rechargeDate, customer: snapshot.customer.trim(), amount: Number(snapshot.amount), usableTimes: Math.trunc(Number(snapshot.usableTimes)), remark: snapshot.remark } }
function validateMobile(snapshot: ReturnType<typeof snapshotForm>) {
  const payload = payloadFromSnapshot(snapshot)
  if (!payload.rechargeDate) { ElMessage.warning('请选择充值日期'); return false }
  if (!payload.customer) { ElMessage.warning('请选择或输入客户名称'); return false }
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) { ElMessage.warning('预存金额必须大于 0'); return false }
  if (!Number.isInteger(Number(snapshot.usableTimes)) || payload.usableTimes < 1) { ElMessage.warning('可使用次数必须是大于 0 的整数'); return false }
  return true
}
function formMatches(snapshot: ReturnType<typeof snapshotForm>) { return form.rechargeDate === snapshot.rechargeDate && form.customer === snapshot.customer && Number(form.amount) === Number(snapshot.amount) && Number(form.usableTimes) === Number(snapshot.usableTimes) && form.remark === snapshot.remark }
function resetForm() { form.rechargeDate = todayInBeijing(); form.customer = ''; form.amount = undefined; form.usableTimes = undefined; form.remark = ''; formRef.value?.clearValidate() }
function isLifecycleCurrent(token: number) { return pageActive && token === lifecycleEpoch }
function money(value: number) { return Number(value || 0).toFixed(2) }
</script>

<style scoped lang="scss">
.prepaid-form-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.prepaid-form-grid__wide { grid-column: 1 / -1; }
.form-actions { display: flex; gap: 10px; margin-top: 4px; }
.mobile-prepaid-page { min-width: 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
.mobile-prepaid-form, .mobile-prepaid-records, .mobile-prepaid-customer-selector, .mobile-prepaid-customer-selector__options { display: grid; min-width: 0; gap: 14px; }
.mobile-prepaid-header { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: 10px; }
.mobile-prepaid-header h2, .mobile-prepaid-header p { margin: 0; overflow-wrap: anywhere; }
.mobile-prepaid-header p { margin-top: 4px; }
.mobile-prepaid-form label, .mobile-prepaid-customer-selector label { display: grid; min-width: 0; gap: 6px; color: #475569; }
.mobile-prepaid-form input, .mobile-prepaid-form textarea, .mobile-prepaid-customer-selector input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; padding: 9px 10px; color: #0f172a; background: #fff; border: 1px solid #aebdcd; border-radius: 8px; font: inherit; }
.mobile-prepaid-form textarea { min-height: 84px; resize: vertical; }
.mobile-prepaid-customer-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.mobile-prepaid-form__numbers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.mobile-prepaid-form__actions { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 10px; }
.mobile-prepaid-form__actions button, .mobile-prepaid-link, .mobile-prepaid-header > button, .mobile-prepaid-customer-field button, .mobile-prepaid-customer-selector button, .mobile-prepaid-error button { min-height: 44px; border: 1px solid #bfdbfe; border-radius: 8px; color: #1d4ed8; background: #eff6ff; }
.mobile-prepaid-submit { color: #fff !important; background: #2563eb !important; border-color: #2563eb !important; }
.mobile-prepaid-error { display: grid; gap: 10px; padding: 12px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; overflow-wrap: anywhere; }
.mobile-prepaid-customer-selector { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
.mobile-prepaid-customer-selector__options button { width: 100%; text-align: left; overflow-wrap: anywhere; }
@media (max-width: 420px) { .mobile-prepaid-header { display: grid; } .mobile-prepaid-link, .mobile-prepaid-header > button { width: 100%; } }
</style>
