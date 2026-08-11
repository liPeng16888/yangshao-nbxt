<template>
  <div class="page-stack">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>预存款客户</h2>
          <p class="muted">汇总同一客户的累计充值金额、已扣除金额和剩余金额。</p>
        </div>
        <div class="panel-actions">
          <el-button @click="router.push('/finance/prepaid/add')">添加预存款客户</el-button>
          <el-button :loading="store.loading" @click="store.loadPrepaidReport()">刷新</el-button>
        </div>
      </div>
      <el-table :data="report?.customerRows || []" border v-loading="store.loading" empty-text="暂无预存款客户">
        <el-table-column prop="customer" label="客户名称" min-width="180" />
        <el-table-column label="累计充值金额" width="150">
          <template #default="{ row }">¥{{ money(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="剩余金额" width="140"><template #default="{ row }">¥{{ money(row.availableAmount) }}</template></el-table-column>
        <el-table-column label="已扣除金额" width="140"><template #default="{ row }">¥{{ money(row.usedAmount) }}</template></el-table-column>
        <el-table-column label="备注" min-width="260">
          <template #default="{ row }">
            <el-input
              v-model="row.remark"
              size="small"
              placeholder="可填写备注"
              :disabled="store.prepaidRemarkSavingId === `customer__${row.customer}`"
              @input="() => markDirty(`customer__${row.customer}`)"
              @blur="() => handleCustomerRemarkBlur(row, row.remark || '')"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>预存款客户每日明细</h2>
          <p class="muted">数据计算中费用状态选择为“预存款”的样品，会按日期和客户自动汇总到这里。</p>
        </div>
      </div>
      <el-table :data="report?.dailyRows || []" border v-loading="store.loading" empty-text="暂无预存款样品消耗">
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column prop="customer" label="客户名称" min-width="180" />
        <el-table-column label="扣除金额" width="140"><template #default="{ row }">¥{{ money(row.deductionAmount) }}</template></el-table-column>
        <el-table-column label="备注" min-width="280">
          <template #default="{ row }">
            <el-input
              v-model="row.remark"
              size="small"
              placeholder="可填写备注"
              :disabled="store.prepaidRemarkSavingId === row.id"
              @input="() => markDirty(row.id)"
              @blur="() => handleUsageRemarkBlur(row, row.remark || '')"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { tryUseTenantRealtimeStore } from '@/stores/tenantRealtime'
import type { PrepaidCustomerRow, PrepaidDailyUsageRow } from '@/types/financeBills'

const router = useRouter()
const store = useFinanceBillsStore()
const tenantRealtime = tryUseTenantRealtimeStore()
const dirtyRows = ref(new Set<string>())
let unregisterRealtime: (() => void) | undefined
const report = computed(() => store.prepaidReport)

onMounted(() => {
  store.loadPrepaidReport()
  unregisterRealtime = tenantRealtime?.registerModule('finance-prepaid', {
    isDirty: () => dirtyRows.value.size > 0,
    refresh: () => store.loadPrepaidReport()
  })
})

onBeforeUnmount(() => unregisterRealtime?.())

function markDirty(id: string) { dirtyRows.value = new Set(dirtyRows.value).add(id) }
function clearDirty(id: string) { const next = new Set(dirtyRows.value); next.delete(id); dirtyRows.value = next }

async function handleCustomerRemarkBlur(row: PrepaidCustomerRow, remark: string) {
  await store.savePrepaidCustomerRemark(row, remark)
  clearDirty(`customer__${row.customer}`)
}

async function handleUsageRemarkBlur(row: PrepaidDailyUsageRow, remark: string) {
  await store.savePrepaidUsageRemark(row, remark)
  clearDirty(row.id)
}

function money(value: number) {
  return Number(value || 0).toFixed(2)
}
</script>

<style scoped lang="scss">
.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
