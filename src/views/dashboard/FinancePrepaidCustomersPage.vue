<template>
  <div class="page-stack">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>预存款客户</h2>
          <p class="muted">汇总同一客户的累计充值金额、总可用次数和样品消耗后的剩余次数。</p>
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
        <el-table-column prop="availableTimes" label="可使用次数" width="120" />
        <el-table-column prop="usedTimes" label="已使用次数" width="120" />
        <el-table-column label="备注" min-width="260">
          <template #default="{ row }">
            <el-input
              v-model="row.remark"
              size="small"
              placeholder="可填写备注"
              :disabled="store.prepaidRemarkSavingId === `customer__${row.customer}`"
              @blur="() => handleCustomerRemarkBlur(row.customer, row.remark || '')"
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
        <el-table-column prop="sampleCount" label="样品数量" width="120" />
        <el-table-column label="备注" min-width="280">
          <template #default="{ row }">
            <el-input
              v-model="row.remark"
              size="small"
              placeholder="可填写备注"
              :disabled="store.prepaidRemarkSavingId === row.id"
              @blur="() => handleUsageRemarkBlur(row.id, row.remark || '')"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFinanceBillsStore } from '@/stores/financeBills'

const router = useRouter()
const store = useFinanceBillsStore()
const report = computed(() => store.prepaidReport)

onMounted(() => {
  store.loadPrepaidReport()
})

async function handleCustomerRemarkBlur(customer: string, remark: string) {
  await store.savePrepaidCustomerRemark(customer, remark)
}

async function handleUsageRemarkBlur(id: string, remark: string) {
  await store.savePrepaidUsageRemark(id, remark)
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
