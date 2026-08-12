<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="min(980px, calc(100vw - 32px))"
    class="payroll-export-dialog"
    :close-on-click-modal="!exporting"
    :close-on-press-escape="!exporting"
    @close="requestClose"
  >
    <section v-if="run && item" class="payroll-preview payroll-preview--slip">
      <header>
        <h3>{{ item.employee.name }}工资条</h3>
        <p>{{ formatPayrollMonth(run.month) }} · 员工编号 {{ item.employee.employeeNumber }}</p>
      </header>
      <dl class="payroll-slip-grid">
        <div><dt>基本月薪</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.input.baseSalary) }}</dd></div>
        <div><dt>全勤奖</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.attendanceBonus) }}</dd></div>
        <div><dt>加班费</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.overtimePay) }}</dd></div>
        <div><dt>提成</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.commissionAmount) }}</dd></div>
        <div><dt>奖金</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.bonusAmount) }}</dd></div>
        <div><dt>请假扣款</dt><dd>{{ deduction(item.calculationSnapshot.result.leaveDeduction) }}</dd></div>
        <div><dt>缺勤扣款</dt><dd>{{ deduction(item.calculationSnapshot.result.absenceDeduction) }}</dd></div>
        <div><dt>人工调整</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.adjustmentAmount) }}</dd></div>
      </dl>
      <div v-if="item.adjustments.length" class="payroll-adjustments">
        <span v-for="adjustment in item.adjustments" :key="adjustment.id">
          {{ adjustment.reason }}：{{ formatPayrollMoney(adjustment.amount) }}
        </span>
      </div>
      <div class="payroll-preview-total">
        <span>应发工资</span>
        <strong>{{ formatPayrollMoney(item.calculationSnapshot.result.payableAmount) }}</strong>
      </div>
      <el-alert
        v-if="item.issues.length"
        :title="item.issues.join('；')"
        type="warning"
        :closable="false"
        show-icon
      />
    </section>

    <section v-else-if="run" class="payroll-preview payroll-preview--summary">
      <header>
        <h3>{{ formatPayrollMonth(run.month) }}全员工资汇总</h3>
        <p>状态：{{ run.status === 'CONFIRMED' ? '已确认' : '草稿' }} · {{ run.items.length }} 人</p>
      </header>
      <div class="payroll-summary-table-wrap">
        <table>
          <thead><tr><th>编号</th><th>员工</th><th>基本工资</th><th>加班费</th><th>提成+奖金</th><th>调整</th><th>应发工资</th></tr></thead>
          <tbody>
            <tr v-for="payrollItem in run.items" :key="payrollItem.id">
              <td>{{ payrollItem.employee.employeeNumber }}</td>
              <td>{{ payrollItem.employee.name }}</td>
              <td>{{ formatPayrollMoney(payrollItem.calculationSnapshot.input.baseSalary) }}</td>
              <td>{{ formatPayrollMoney(payrollItem.calculationSnapshot.result.overtimePay) }}</td>
              <td>{{ formatPayrollMoney(payrollItem.calculationSnapshot.result.commissionAmount + payrollItem.calculationSnapshot.result.bonusAmount) }}</td>
              <td>{{ formatPayrollMoney(payrollItem.calculationSnapshot.result.adjustmentAmount) }}</td>
              <td>{{ formatPayrollMoney(payrollItem.payableAmount) }}</td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="6">应发合计</td><td>{{ formatPayrollMoney(run.totalAmount) }}</td></tr></tfoot>
        </table>
      </div>
    </section>

    <el-empty v-else description="暂无可导出的工资数据" />

    <template #footer>
      <el-button :disabled="exporting" @click="emit('close')">取消</el-button>
      <el-button
        data-testid="payroll-export-confirm"
        type="primary"
        :loading="exporting"
        :disabled="!run"
        @click="exportPng"
      >
        保存为 PNG
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { PayrollItem, PayrollRun } from '@/types/employeeAttendance'
import {
  downloadEmployeePayrollPng,
  downloadPayrollSummaryPng,
  formatPayrollMoney,
  formatPayrollMonth
} from '@/utils/payrollPng'

const props = defineProps<{
  visible: boolean
  run: PayrollRun | null
  item: PayrollItem | null
}>()

const emit = defineEmits<{
  close: []
}>()

const exporting = ref(false)
const dialogTitle = computed(() => props.item ? '导出个人工资条' : '导出全员工资汇总')
let dialogGeneration = 0

watch(() => props.visible, (visible) => {
  dialogGeneration += 1
  if (visible) exporting.value = false
})

function deduction(value: number) {
  return formatPayrollMoney(-Math.abs(value))
}

function requestClose() {
  if (!exporting.value) emit('close')
}

async function exportPng() {
  if (exporting.value || !props.run) return
  exporting.value = true
  const generation = dialogGeneration
  try {
    const exported = props.item
      ? await downloadEmployeePayrollPng(
        props.item,
        `${props.run.month}_${props.item.employee.employeeNumber}_${props.item.employee.name}_工资条`
      )
      : await downloadPayrollSummaryPng(props.run)
    if (generation !== dialogGeneration || !props.visible) return
    if (!exported) {
      ElMessage.error('工资图片生成失败，请重试')
      return
    }
    ElMessage.success(props.item ? '工资条图片已保存' : '工资汇总图片已保存')
    emit('close')
  } catch {
    if (generation === dialogGeneration && props.visible) {
      ElMessage.error('工资图片生成失败，请重试')
    }
  } finally {
    if (generation === dialogGeneration) exporting.value = false
  }
}
</script>

<style scoped lang="scss">
:deep(.payroll-export-dialog) {
  max-width: calc(100vw - 32px);
}

.payroll-preview {
  color: #1f2937;

  header {
    margin-bottom: 18px;
    text-align: center;
  }

  h3 {
    margin: 0 0 8px;
    color: #0f172a;
    font-size: 21px;
  }

  p {
    margin: 0;
    color: #64748b;
  }
}

.payroll-slip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border-top: 1px solid #dbe5f0;
  border-left: 1px solid #dbe5f0;

  div {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border-right: 1px solid #dbe5f0;
    border-bottom: 1px solid #dbe5f0;
  }

  dt { color: #64748b; }
  dd { margin: 0; font-weight: 600; }
}

.payroll-adjustments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 12px 14px;
  border: 1px solid #dbe5f0;
  border-top: 0;
  color: #475569;
}

.payroll-preview-total {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
  padding: 18px;
  background: #eff6ff;

  strong {
    color: #dc2626;
    font-size: 23px;
  }
}

.payroll-summary-table-wrap { overflow: auto; }

table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;

  th,
  td {
    padding: 10px;
    border: 1px solid #dbe5f0;
    text-align: center;
    white-space: nowrap;
  }

  th { background: #edf4fb; }
  tfoot { color: #dc2626; font-weight: 700; }
  tfoot td:first-child { text-align: right; }
}

@media (max-width: 680px) {
  .payroll-slip-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
