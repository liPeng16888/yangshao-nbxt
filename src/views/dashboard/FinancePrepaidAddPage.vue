<template>
  <div class="page-stack">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>添加预存款客户</h2>
          <p class="muted">录入客户预存金额和可使用次数，确认后同一客户会自动合并累计。</p>
        </div>
        <el-button @click="router.push('/finance/prepaid/customers')">预存款客户</el-button>
      </div>
      <div class="panel__body">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
          <div class="prepaid-form-grid">
            <el-form-item label="充值日期" prop="rechargeDate">
              <el-date-picker v-model="form.rechargeDate" type="date" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="客户名称" prop="customer">
              <el-select
                v-model="form.customer"
                filterable
                remote
                allow-create
                default-first-option
                clearable
                reserve-keyword
                :remote-method="loadCustomerOptions"
                :loading="customerLoading"
                placeholder="选择已有客户或手动输入"
              >
                <el-option v-for="customer in customerOptions" :key="customer.id" :label="customer.name" :value="customer.name" />
              </el-select>
            </el-form-item>
            <el-form-item label="预存金额" prop="amount">
              <el-input-number v-model="form.amount" :min="0.01" :precision="2" :step="100" controls-position="right" />
            </el-form-item>
            <el-form-item label="可使用次数" prop="usableTimes">
              <el-input-number v-model="form.usableTimes" :min="1" :precision="0" :step="1" controls-position="right" />
            </el-form-item>
            <el-form-item class="prepaid-form-grid__wide" label="备注">
              <el-input v-model="form.remark" maxlength="120" placeholder="可填写备注" />
            </el-form-item>
          </div>
          <div class="form-actions">
            <el-button type="primary" :loading="store.prepaidSaving" @click="handleSubmit">确认添加</el-button>
            <el-button @click="resetForm">重置</el-button>
          </div>
        </el-form>
      </div>
    </section>

    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>添加的数据信息</h2>
          <p class="muted">这里记录每一次预存款添加明细。</p>
        </div>
        <el-button :loading="store.loading" @click="store.loadPrepaidRecharges()">刷新</el-button>
      </div>
      <el-table :data="store.prepaidRecharges" border v-loading="store.loading" empty-text="暂无预存款添加记录">
        <el-table-column prop="rechargeDate" label="充值日期" width="130" />
        <el-table-column prop="customer" label="客户名称" min-width="180" />
        <el-table-column label="预存金额" width="140">
          <template #default="{ row }">¥{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="usableTimes" label="可使用次数" width="120" />
        <el-table-column prop="remark" label="备注" min-width="240" />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-tag v-if="row.deleteRequestStatus === 'PENDING'" type="warning" effect="plain">删除待审核</el-tag>
            <el-button v-else type="danger" link :loading="store.prepaidDeletingId === row.id" @click="handleDeleteRequest(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { searchCustomers } from '@/api/customer'
import type { Customer } from '@/types/customer'
import type { PrepaidRechargeRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { todayInBeijing } from '@/utils/date'

const router = useRouter()
const store = useFinanceBillsStore()
const formRef = ref<FormInstance>()
const customerOptions = ref<Customer[]>([])
const customerLoading = ref(false)
const form = reactive({
  rechargeDate: todayInBeijing(),
  customer: '',
  amount: undefined as number | undefined,
  usableTimes: undefined as number | undefined,
  remark: ''
})

const rules: FormRules = {
  rechargeDate: [{ required: true, message: '请选择充值日期', trigger: 'change' }],
  customer: [{ required: true, message: '请选择或输入客户名称', trigger: 'change' }],
  amount: [
    { required: true, type: 'number', message: '请输入预存金额', trigger: 'change' },
    { type: 'number', min: 0.01, message: '预存金额必须大于 0', trigger: 'change' }
  ],
  usableTimes: [
    { required: true, type: 'number', message: '请输入可使用次数', trigger: 'change' },
    { type: 'number', min: 1, message: '可使用次数必须大于 0', trigger: 'change' }
  ]
}

onMounted(() => {
  store.loadPrepaidRecharges()
  loadCustomerOptions('')
})

async function loadCustomerOptions(keyword: string) {
  customerLoading.value = true
  try {
    customerOptions.value = await searchCustomers(keyword)
  } finally {
    customerLoading.value = false
  }
}

async function handleSubmit() {
  await formRef.value?.validate()
  const customer = form.customer.trim()
  const amount = Number(form.amount)
  const usableTimes = Math.trunc(Number(form.usableTimes))
  const existing = store.prepaidRecharges.filter((row) => row.customer === customer)
  const existingTimes = existing.reduce((sum, row) => sum + row.usableTimes, 0)
  const existingAmount = existing.reduce((sum, row) => sum + row.amount, 0)
  const message = existing.length
    ? `${customer} 已有预存记录，原可使用次数 ${existingTimes} 次，本次增加 ${usableTimes} 次，确认后累计为 ${existingTimes + usableTimes} 次；原累计金额 ¥${money(existingAmount)}，本次增加 ¥${money(amount)}。`
    : `确认添加 ${customer} 的预存款 ¥${money(amount)}，可使用次数 ${usableTimes} 次？`
  await ElMessageBox.confirm(message, '二次确认提醒', {
    confirmButtonText: '确认添加',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await store.addPrepaidRecharge({
    rechargeDate: form.rechargeDate,
    customer,
    amount,
    usableTimes,
    remark: form.remark
  })
  ElMessage.success('预存款客户信息已添加')
  resetForm()
}

async function handleDeleteRequest(row: PrepaidRechargeRow) {
  const result = await ElMessageBox.prompt(`确认申请删除「${row.rechargeDate} ${row.customer}」这条预存款记录？请填写删除理由。`, '删除申请', {
    confirmButtonText: '提交申请',
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputPlaceholder: '请填写删除理由',
    inputValidator: (value) => Boolean(String(value || '').trim()) || '请填写删除理由',
    type: 'warning'
  })
  await store.requestPrepaidDeletion(row, String(result.value || '').trim())
  ElMessage.success('删除申请已提交，等待后端审核')
}

function resetForm() {
  form.rechargeDate = todayInBeijing()
  form.customer = ''
  form.amount = undefined
  form.usableTimes = undefined
  form.remark = ''
  formRef.value?.clearValidate()
}

function money(value: number) {
  return Number(value || 0).toFixed(2)
}
</script>

<style scoped lang="scss">
.prepaid-form-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.prepaid-form-grid__wide {
  grid-column: 1 / -1;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
</style>
