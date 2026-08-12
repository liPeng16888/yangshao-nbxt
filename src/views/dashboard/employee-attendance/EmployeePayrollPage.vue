<template>
  <PageShell
    title="工资统计"
    description="生成月度工资草稿，查看计算快照，增加正负调整，确认后锁定源记录。"
    :show-employee="false"
    :dirty="adjustmentVisible"
    @refresh="load"
  >
    <template #actions>
      <el-button type="primary" :loading="store.saving" @click="generate">生成/刷新草稿</el-button>
    </template>

    <el-empty v-if="!store.payroll" description="当月尚未生成工资草稿" />
    <template v-else>
      <div class="payroll-summary">
        <div>
          <span>工资状态</span>
          <el-tag :type="store.payroll.status === 'CONFIRMED' ? 'success' : 'warning'">
            {{ store.payroll.status === 'CONFIRMED' ? '已确认' : '草稿' }}
          </el-tag>
        </div>
        <div><span>应发合计</span><strong>¥{{ store.payroll.totalAmount.toFixed(2) }}</strong></div>
        <div><span>阻断问题</span><strong>{{ store.payroll.issueCount }}</strong></div>
        <div class="summary-actions">
          <el-button
            v-if="store.payroll.status === 'DRAFT'"
            type="success"
            :disabled="store.payroll.issueCount > 0"
            @click="confirm"
          >
            确认工资并锁定
          </el-button>
          <el-button v-else type="warning" @click="reopen">撤销确认</el-button>
          <el-button data-testid="export-payroll-summary" @click="openSummaryExport">
            导出全员汇总 PNG
          </el-button>
        </div>
      </div>

      <el-alert
        v-for="issue in store.payroll.issues"
        :key="issue"
        :title="issue"
        type="warning"
        :closable="false"
        show-icon
        class="issue"
      />

      <el-table :data="store.payroll.items" empty-text="暂无工资明细">
        <el-table-column label="员工" width="110">
          <template #default="{ row }">{{ row.employee.name }}</template>
        </el-table-column>
        <el-table-column label="基本工资">
          <template #default="{ row }">¥{{ row.calculationSnapshot.input.baseSalary.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="加班费">
          <template #default="{ row }">¥{{ row.calculationSnapshot.result.overtimePay.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="提成+奖金">
          <template #default="{ row }">
            ¥{{ (row.calculationSnapshot.result.commissionAmount + row.calculationSnapshot.result.bonusAmount).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="人工调整">
          <template #default="{ row }">
            <div v-for="adjustmentRow in row.adjustments" :key="adjustmentRow.id">
              {{ adjustmentRow.amount > 0 ? '+' : '' }}{{ adjustmentRow.amount.toFixed(2) }} · {{ adjustmentRow.reason }}
              <template v-if="store.payroll?.status === 'DRAFT'">
                <el-button link type="primary" @click="openAdjustment(row.id, adjustmentRow)">编辑</el-button>
                <el-button link type="danger" @click="removeAdjustment(adjustmentRow.id)">删除</el-button>
              </template>
            </div>
            <el-button
              v-if="store.payroll?.status === 'DRAFT'"
              link
              type="primary"
              @click="openAdjustment(row.id)"
            >
              增加调整
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="应发工资">
          <template #default="{ row }"><span class="money">¥{{ row.payableAmount.toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="145">
          <template #default="{ row }">
            <el-button data-testid="export-payroll-slip" link type="primary" @click="openEmployeeExport(row)">
              导出工资条 PNG
            </el-button>
            <el-popover v-if="row.issues.length" trigger="hover" :content="row.issues.join('；')">
              <template #reference><el-tag type="warning">异常 {{ row.issues.length }}</el-tag></template>
            </el-popover>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </PageShell>

  <el-dialog
    v-model="adjustmentVisible"
    :title="adjustmentEditingId ? '编辑工资调整' : '增加工资调整'"
    width="480px"
    :close-on-click-modal="false"
  >
    <el-alert v-if="formError" :title="formError" type="error" :closable="false" />
    <el-form label-position="top">
      <el-form-item label="调整金额（可为负数）" required>
        <el-input-number v-model="adjustment.amount" />
      </el-form-item>
      <el-form-item label="调整原因" required><el-input v-model="adjustment.reason" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="adjustmentVisible = false">取消</el-button>
      <el-button type="primary" :loading="store.saving" @click="saveAdjustment">保存</el-button>
    </template>
  </el-dialog>

  <PayrollExportDialog
    :visible="exportVisible"
    :run="store.payroll"
    :item="exportItem"
    @close="closeExport"
  />
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageShell from './EmployeeAttendancePageShell.vue'
import PayrollExportDialog from '@/components/employee-attendance/PayrollExportDialog.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { PayrollAdjustment, PayrollItem } from '@/types/employeeAttendance'

const store = useEmployeeAttendanceStore()
const adjustmentVisible = ref(false)
const adjustmentItemId = ref('')
const adjustmentEditingId = ref('')
const adjustmentEditingUpdatedAt = ref('')
const formError = ref('')
const exportVisible = ref(false)
const exportItem = ref<PayrollItem | null>(null)
const adjustment = reactive({ amount: 0, reason: '' })

const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const isCancel = (error: unknown) => error === 'cancel' || error === 'close'
  || (error instanceof Error && ['cancel', 'close'].includes(error.message))

async function load() {
  await store.loadPayroll().catch(() => undefined)
}

async function generate() {
  try {
    await store.run(() => api.generatePayroll(store.month), true)
    await load()
    ElMessage.success('工资草稿已生成')
  } catch (error) {
    store.setError(errorText(error, '工资草稿生成失败'))
  }
}

function openAdjustment(id: string, row?: PayrollAdjustment) {
  adjustmentItemId.value = id
  adjustmentEditingId.value = row?.id || ''
  adjustmentEditingUpdatedAt.value = row?.updatedAt || ''
  Object.assign(adjustment, row ? { amount: row.amount, reason: row.reason } : { amount: 0, reason: '' })
  formError.value = ''
  adjustmentVisible.value = true
}

async function saveAdjustment() {
  try {
    await store.run(
      () => adjustmentEditingId.value
        ? api.updatePayrollAdjustment(adjustmentEditingId.value, { ...adjustment }, adjustmentEditingUpdatedAt.value)
        : api.createPayrollAdjustment(adjustmentItemId.value, { ...adjustment }),
      true
    )
    adjustmentVisible.value = false
    await load()
  } catch (error) {
    formError.value = errorText(error, '保存失败')
  }
}

async function removeAdjustment(id: string) {
  const row = store.payroll?.items.flatMap(item => item.adjustments).find(item => item.id === id)
  if (!row) return
  try {
    await store.run(() => api.deletePayrollAdjustment(row), true)
    await load()
  } catch (error) {
    store.setError(errorText(error, '工资调整删除失败'))
  }
}

async function confirm() {
  if (!store.payroll) return
  try {
    await ElMessageBox.confirm('确认后当月考勤、请假、提成和奖金将被锁定。', '确认工资', { type: 'warning' })
    store.payroll = await store.run(() => api.confirmPayroll(store.payroll!.id), true)
  } catch (error) {
    if (!isCancel(error)) store.setError(errorText(error, '工资确认失败'))
  }
}

async function reopen() {
  if (!store.payroll) return
  try {
    const { value } = await ElMessageBox.prompt('撤销后可重新修改当月数据，请填写原因。', '撤销确认', {
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填'
    })
    store.payroll = await store.run(() => api.reopenPayroll(store.payroll!.id, value), true)
  } catch (error) {
    if (!isCancel(error)) store.setError(errorText(error, '撤销工资确认失败'))
  }
}

function openSummaryExport() {
  if (!store.payroll) return
  exportItem.value = null
  exportVisible.value = true
}

function openEmployeeExport(item: PayrollItem) {
  exportItem.value = item
  exportVisible.value = true
}

function closeExport() {
  exportVisible.value = false
  exportItem.value = null
}

onMounted(() => { store.restoreMonthMode(); void load() })
</script>

<style scoped>
.payroll-summary {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid #dbe5f0;
  border-radius: 7px;
  background: #f8fbff;
}

.payroll-summary span {
  display: block;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
}

.payroll-summary strong { font-size: 18px; }
.summary-actions { display: flex; gap: 8px; margin-left: auto; }
.issue { margin: 8px 0; }
</style>
