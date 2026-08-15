<script setup lang="ts">
import { ref } from 'vue'
import { formatPayrollMoney } from '@/utils/payrollPng'
import type { PayrollAdjustment, PayrollItem, PayrollRun } from '@/types/employeeAttendance'

const props = withDefaults(defineProps<{ run: PayrollRun; busy?: boolean; pendingIds?: string[] }>(), { busy: false, pendingIds: () => [] })
const emit = defineEmits<{
  adjust: [itemId: string, row?: PayrollAdjustment]
  removeAdjustment: [row: PayrollAdjustment]
  confirm: []
  reopen: []
  exportSummary: []
  exportEmployee: [item: PayrollItem]
}>()
const expanded = ref(new Set<string>())
function toggle(id: string) { const next = new Set(expanded.value); next.has(id) ? next.delete(id) : next.add(id); expanded.value = next }
function pending(id: string) { return props.pendingIds.includes(id) }
</script>

<template>
  <section class="mobile-payroll" aria-label="工资统计">
    <section class="mobile-payroll__summary" aria-label="工资汇总">
      <div><span>工资状态</span><strong>{{ run.status === 'CONFIRMED' ? '已确认' : '草稿' }}</strong></div>
      <div><span>应发合计</span><strong>{{ formatPayrollMoney(run.totalAmount) }}</strong></div>
      <div><span>阻断问题</span><strong>{{ run.issueCount }}</strong></div>
    </section>
    <p v-for="issue in run.issues" :key="issue" class="mobile-payroll__issue">{{ issue }}</p>

    <article v-for="item in run.items" :key="item.id" data-testid="mobile-payroll-card" class="mobile-payroll-card">
      <header><div><strong>{{ item.employee.employeeNumber }} {{ item.employee.name }}</strong><span>{{ run.status === 'CONFIRMED' ? '已确认' : '草稿' }}</span></div></header>
      <div class="mobile-payroll-card__totals">
        <div data-testid="mobile-payroll-authoritative-snapshot-payable"><span>应发</span><strong>{{ formatPayrollMoney(item.calculationSnapshot.result.payableAmount) }}</strong></div>
        <div data-testid="mobile-payroll-authoritative-item-payable"><span>实发</span><strong>{{ formatPayrollMoney(item.payableAmount) }}</strong></div>
      </div>
      <button :data-testid="`mobile-payroll-details-${item.id}`" class="details-button" type="button" :aria-expanded="expanded.has(item.id)" @click="toggle(item.id)">{{ expanded.has(item.id) ? '收起工资组成' : '展开工资组成' }}</button>
      <dl v-if="expanded.has(item.id)" class="mobile-payroll-card__details">
        <div><dt>基本月薪</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.input.baseSalary) }}</dd></div>
        <div><dt>全勤奖</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.attendanceBonus) }}</dd></div>
        <div><dt>加班费</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.overtimePay) }}</dd></div>
        <div><dt>提成</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.commissionAmount) }}</dd></div>
        <div><dt>奖金</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.bonusAmount) }}</dd></div>
        <div><dt>请假扣款</dt><dd>{{ formatPayrollMoney(-Math.abs(item.calculationSnapshot.result.leaveDeduction)) }}</dd></div>
        <div><dt>缺勤扣款</dt><dd>{{ formatPayrollMoney(-Math.abs(item.calculationSnapshot.result.absenceDeduction)) }}</dd></div>
        <div><dt>人工调整</dt><dd>{{ formatPayrollMoney(item.calculationSnapshot.result.adjustmentAmount) }}</dd></div>
      </dl>
      <div v-if="expanded.has(item.id) && item.adjustments.length" class="mobile-payroll-card__adjustments">
        <div v-for="row in item.adjustments" :key="row.id">
          <span>{{ row.reason }}：{{ formatPayrollMoney(row.amount) }}</span>
          <span v-if="run.status === 'DRAFT'" class="inline-actions">
            <button type="button" :disabled="busy || pending(row.id)" @click="emit('adjust', item.id, row)">编辑</button>
            <button type="button" :disabled="busy || pending(row.id)" @click="emit('removeAdjustment', row)">删除</button>
          </span>
        </div>
      </div>
      <p v-if="item.issues.length" class="mobile-payroll-card__issues">异常：{{ item.issues.join('；') }}</p>
      <footer>
        <button v-if="run.status === 'DRAFT'" :data-testid="`mobile-adjust-payroll-${item.id}`" type="button" :disabled="busy || pending(item.id)" @click="emit('adjust', item.id)">增加调整</button>
        <button :data-testid="`mobile-export-payroll-${item.id}`" type="button" :disabled="busy" @click="emit('exportEmployee', item)">导出工资条 PNG</button>
      </footer>
    </article>

    <div class="mobile-payroll__actions" role="region" aria-label="工资操作">
      <button v-if="run.status === 'DRAFT'" data-testid="mobile-confirm-payroll" type="button" :disabled="busy || run.issueCount > 0" @click="emit('confirm')">确认工资并锁定</button>
      <button v-else data-testid="mobile-reopen-payroll" type="button" :disabled="busy" @click="emit('reopen')">撤销确认</button>
      <button data-testid="mobile-export-payroll-summary" type="button" :disabled="busy" @click="emit('exportSummary')">导出全员汇总 PNG</button>
    </div>
  </section>
</template>

<style scoped>
.mobile-payroll{display:grid;min-width:0;gap:12px;padding-bottom:calc(72px + env(safe-area-inset-bottom))}.mobile-payroll button{min-height:44px;padding:8px 10px;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:9px;font:inherit}.mobile-payroll__summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mobile-payroll__summary div{display:grid;gap:5px;padding:10px;background:#f8fafc;border:1px solid #d8e1eb;border-radius:10px}.mobile-payroll__summary span{color:#64748b;font-size:12px}.mobile-payroll__summary strong{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.mobile-payroll__issue,.mobile-payroll-card__issues{margin:0;padding:10px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;overflow-wrap:anywhere}.mobile-payroll-card{display:grid;min-width:0;gap:10px;padding:14px;background:#fff;border:1px solid #d8e1eb;border-radius:12px}.mobile-payroll-card header>div{display:flex;align-items:center;gap:8px}.mobile-payroll-card header strong{min-width:0;overflow-wrap:anywhere}.mobile-payroll-card header span{margin-left:auto;padding:4px 8px;color:#92400e;background:#fef3c7;border-radius:999px;font-size:12px}.mobile-payroll-card__totals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-payroll-card__totals div{display:grid;gap:4px;padding:10px;background:#eff6ff;border-radius:9px}.mobile-payroll-card__totals span{color:#64748b;font-size:12px}.mobile-payroll-card__totals strong{color:#b91c1c;font-size:17px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.mobile-payroll-card__details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;border-top:1px solid #e2e8f0;border-left:1px solid #e2e8f0}.mobile-payroll-card__details div{display:grid;gap:3px;padding:9px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}.mobile-payroll-card__details dt{color:#64748b;font-size:12px}.mobile-payroll-card__details dd{margin:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.mobile-payroll-card__adjustments{display:grid;gap:8px}.mobile-payroll-card__adjustments>div{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}.inline-actions{display:flex;gap:6px;margin-left:auto}.inline-actions button{padding-inline:8px}.mobile-payroll-card footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-payroll__actions{position:sticky;bottom:calc(var(--mobile-secondary-nav-height,0px) + env(safe-area-inset-bottom));z-index:3;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px;background:rgba(255,255,255,.96);border:1px solid #d8e1eb;border-radius:10px}.mobile-payroll__actions button:first-child{color:#fff;background:#15803d;border-color:#166534}@media(max-width:380px){.mobile-payroll__summary{grid-template-columns:1fr}.mobile-payroll-card__details{grid-template-columns:1fr}}
</style>
