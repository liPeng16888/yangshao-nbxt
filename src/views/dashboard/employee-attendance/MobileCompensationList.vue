<script setup lang="ts">
import type { BonusRecord, CommissionRecord, CommissionType, Employee } from '@/types/employeeAttendance'

export type MobileCompensationTab = 'records' | 'types' | 'bonuses'

const props = withDefaults(defineProps<{
  tab: MobileCompensationTab
  commissions: CommissionRecord[]
  types: CommissionType[]
  bonuses: BonusRecord[]
  employees: Employee[]
  month: string
  employeeId: string
  busy?: boolean
  saveStatus?: string
  pendingIds?: string[]
}>(), { busy: false, saveStatus: '已保存', pendingIds: () => [] })

const emit = defineEmits<{
  changeTab: [tab: MobileCompensationTab]
  createCommission: []
  editCommission: [row: CommissionRecord]
  removeCommission: [row: CommissionRecord]
  createType: []
  editType: [row: CommissionType]
  removeType: [row: CommissionType]
  createBonus: []
  editBonus: [row: BonusRecord]
  removeBonus: [row: BonusRecord]
}>()

function employeeName(id: string) {
  const employee = props.employees.find((row) => row.id === id)
  return employee ? `${employee.employeeNumber} ${employee.name}` : '未知员工'
}
function selectedEmployee() {
  return props.employeeId ? employeeName(props.employeeId) : '全部员工'
}
function typeName(id: string) { return props.types.find((row) => row.id === id)?.name || '未知类型' }
function pending(id: string) { return props.pendingIds.includes(id) }
function recordLocked(row: CommissionRecord | BonusRecord) { return Boolean(row.lockedAt) }
</script>

<template>
  <section class="mobile-compensation" aria-label="提成与奖金">
    <p data-testid="mobile-compensation-filter-summary" class="mobile-compensation__summary">
      {{ month }} · {{ selectedEmployee() }}
    </p>
    <div class="mobile-compensation__tabs" role="tablist" aria-label="提成与奖金分类">
      <button data-testid="mobile-compensation-tab-records" type="button" role="tab" :aria-selected="tab === 'records'" @click="emit('changeTab', 'records')">提成记录</button>
      <button data-testid="mobile-compensation-tab-types" type="button" role="tab" :aria-selected="tab === 'types'" @click="emit('changeTab', 'types')">提成类型</button>
      <button data-testid="mobile-compensation-tab-bonuses" type="button" role="tab" :aria-selected="tab === 'bonuses'" @click="emit('changeTab', 'bonuses')">奖金记录</button>
    </div>

    <section v-if="tab === 'records'" class="mobile-compensation__panel" role="tabpanel" aria-label="提成记录">
      <button data-testid="mobile-create-commission" class="primary" type="button" :disabled="busy" @click="emit('createCommission')">新增提成</button>
      <p v-if="!commissions.length" role="status">暂无提成记录</p>
      <article v-for="row in commissions" :key="row.id" data-testid="mobile-commission-card" class="mobile-compensation-card">
        <header><strong>{{ employeeName(row.employeeId) }}</strong><span>{{ row.date }}</span></header>
        <p>{{ typeName(row.commissionTypeId) }} · {{ row.quantity }} × ¥{{ row.unitPrice.toFixed(2) }}</p>
        <p class="money">金额 ¥{{ row.amount.toFixed(2) }}</p>
        <p v-if="row.remark" class="wrap">{{ row.remark }}</p>
        <p v-if="row.lockedAt" class="lock">工资已锁定</p>
        <footer>
          <button :data-testid="`mobile-edit-commission-${row.id}`" type="button" :disabled="busy || pending(row.id) || recordLocked(row)" @click="emit('editCommission', row)">编辑</button>
          <button :data-testid="`mobile-remove-commission-${row.id}`" type="button" class="danger" :disabled="busy || pending(row.id) || recordLocked(row)" @click="emit('removeCommission', row)">删除</button>
        </footer>
      </article>
    </section>

    <section v-else-if="tab === 'types'" class="mobile-compensation__panel" role="tabpanel" aria-label="提成类型">
      <button data-testid="mobile-create-commission-type" class="primary" type="button" :disabled="busy" @click="emit('createType')">新增提成类型</button>
      <p v-if="!types.length" role="status">暂无提成类型</p>
      <article v-for="row in types" :key="row.id" :data-testid="`mobile-commission-type-card-${row.id}`" class="mobile-compensation-card">
        <header><strong>{{ row.name }}</strong><span>{{ row.active ? '启用' : '停用' }}</span></header>
        <p>默认单价 ¥{{ row.unitPrice.toFixed(2) }} / {{ row.unitName }}</p>
        <p v-if="row.referenced" class="lock">已使用，仅可停用</p>
        <footer>
          <button :data-testid="`mobile-edit-commission-type-${row.id}`" type="button" :disabled="busy || pending(row.id) || !!row.referenced" @click="emit('editType', row)">编辑</button>
          <button :data-testid="`mobile-remove-commission-type-${row.id}`" type="button" class="danger" :disabled="busy || pending(row.id)" @click="emit('removeType', row)">删除/停用</button>
        </footer>
      </article>
    </section>

    <section v-else class="mobile-compensation__panel" role="tabpanel" aria-label="奖金记录">
      <button data-testid="mobile-create-bonus" class="primary" type="button" :disabled="busy" @click="emit('createBonus')">新增奖金</button>
      <p v-if="!bonuses.length" role="status">暂无奖金记录</p>
      <article v-for="row in bonuses" :key="row.id" data-testid="mobile-bonus-card" class="mobile-compensation-card">
        <header><strong>{{ employeeName(row.employeeId) }}</strong><span>{{ row.date }}</span></header>
        <p class="money">奖金 ¥{{ row.amount.toFixed(2) }}</p>
        <p class="wrap">{{ row.reason }}</p>
        <p v-if="row.lockedAt" class="lock">工资已锁定</p>
        <footer>
          <button :data-testid="`mobile-edit-bonus-${row.id}`" type="button" :disabled="busy || pending(row.id) || recordLocked(row)" @click="emit('editBonus', row)">编辑</button>
          <button :data-testid="`mobile-remove-bonus-${row.id}`" type="button" class="danger" :disabled="busy || pending(row.id) || recordLocked(row)" @click="emit('removeBonus', row)">删除</button>
        </footer>
      </article>
    </section>

    <div class="mobile-compensation__action-status" data-testid="mobile-compensation-action-status" role="status" aria-live="polite">
      {{ busy ? '保存中…' : saveStatus }}
    </div>
  </section>
</template>

<style scoped>
.mobile-compensation{display:grid;min-width:0;gap:12px;padding-bottom:calc(64px + env(safe-area-inset-bottom))}.mobile-compensation__summary{margin:0;padding:10px 12px;color:var(--ui-text-secondary);background:var(--ui-surface-subtle);border:1px solid var(--ui-line);border-radius:10px;overflow-wrap:anywhere}.mobile-compensation__tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.mobile-compensation button{min-height:44px;padding:8px 10px;color:var(--ui-text-secondary);background:#fff;border:1px solid var(--ui-line);border-radius:9px;font:inherit}.mobile-compensation__tabs button[aria-selected='true']{color:var(--ui-accent-hover);background:var(--ui-accent-soft);border-color:var(--ui-accent);font-weight:700}.mobile-compensation__panel{display:grid;min-width:0;gap:10px}.mobile-compensation button.primary{color:#fff;background:var(--ui-accent);border-color:var(--ui-accent-hover)}.mobile-compensation-card{min-width:0;padding:14px;background:#fff;border:1px solid var(--ui-line);border-radius:12px}.mobile-compensation-card header,.mobile-compensation-card footer{display:flex;align-items:center;gap:8px}.mobile-compensation-card header strong{min-width:0;overflow-wrap:anywhere}.mobile-compensation-card header span{margin-left:auto;color:var(--ui-text-muted);font-size:13px}.mobile-compensation-card p{margin:10px 0;color:var(--ui-text-secondary)}.mobile-compensation-card .money{color:var(--ui-danger);font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}.mobile-compensation-card .lock{color:var(--ui-warning)}.mobile-compensation-card .wrap{overflow-wrap:anywhere}.mobile-compensation-card footer button{flex:1}.mobile-compensation-card footer .danger{color:var(--ui-danger)}.mobile-compensation__action-status{position:sticky;bottom:calc(var(--mobile-secondary-nav-height,0px) + env(safe-area-inset-bottom));z-index:3;padding:12px;text-align:center;color:var(--ui-text-secondary);background:rgba(255,255,255,.96);border:1px solid var(--ui-line);border-radius:10px}@media(max-width:390px){.mobile-compensation__tabs{gap:4px}.mobile-compensation__tabs button{padding-inline:4px;font-size:13px}}
</style>
