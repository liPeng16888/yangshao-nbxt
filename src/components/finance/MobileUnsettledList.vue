<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import type { UnsettledSampleRow } from '@/types/financeBills'

const props = defineProps<{
  rows: UnsettledSampleRow[]
  selectedIds: string[]
  customerOptions: string[]
  selectedCustomers: string[]
  loading?: boolean
  busy?: boolean
  settlingId?: string
}>()

const emit = defineEmits<{
  selectionChange: [ids: string[]]
  filterChange: [customers: string[]]
  refresh: []
  settle: [row: UnsettledSampleRow]
  jump: [row: UnsettledSampleRow]
}>()

const filterOpen = ref(false)
const draftCustomers = ref<string[]>([...props.selectedCustomers])
const selectedIdSet = computed(() => new Set(props.selectedIds))
const filterSummary = computed(() => props.selectedCustomers.length
  ? `客户：${props.selectedCustomers.join('、')}`
  : '全部客户')

watch(filterOpen, (open) => {
  if (open) draftCustomers.value = [...props.selectedCustomers]
})

function applyFilter() {
  filterOpen.value = false
  emit('filterChange', [...draftCustomers.value])
}

function resetFilter() {
  draftCustomers.value = []
  filterOpen.value = false
  emit('filterChange', [])
}

function updateCustomer(customer: string, checked: boolean) {
  const next = new Set(draftCustomers.value)
  if (checked) next.add(customer)
  else next.delete(customer)
  draftCustomers.value = props.customerOptions.filter((option) => next.has(option))
}

function updateSelection(row: UnsettledSampleRow, checked: boolean) {
  const next = new Set(props.selectedIds)
  if (checked) next.add(row.blockId)
  else next.delete(row.blockId)
  emit('selectionChange', next.size ? props.rows.map((item) => item.blockId).filter((id) => next.has(id)) : [])
}

function money(value: number) {
  return `¥${Number(value).toFixed(2)}`
}
</script>

<template>
  <section class="panel mobile-unsettled-list" :aria-busy="loading || busy">
    <header class="mobile-unsettled-list__header">
      <div>
        <h2>未结款</h2>
        <p class="muted">费用状态为“未结款”的样品会显示在这里。</p>
      </div>
      <button class="mobile-unsettled-list__refresh mobile-touch-target" type="button" :disabled="loading || busy" @click="emit('refresh')">
        {{ loading ? '刷新中…' : '刷新' }}
      </button>
    </header>

    <div data-testid="mobile-unsettled-filter-summary">
      <MobileFilterDrawer
        v-model="filterOpen"
        title="筛选未结款客户"
        :summary="filterSummary"
        @apply="applyFilter"
        @reset="resetFilter"
      >
        <fieldset class="mobile-unsettled-list__filters" :disabled="busy">
          <legend>客户</legend>
          <label v-for="customer in customerOptions" :key="customer" class="mobile-touch-target">
            <input
              :data-testid="`mobile-unsettled-filter-${customer}`"
              type="checkbox"
              :checked="draftCustomers.includes(customer)"
              @change="updateCustomer(customer, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ customer }}</span>
          </label>
        </fieldset>
      </MobileFilterDrawer>
    </div>

    <p v-if="loading" class="mobile-unsettled-list__state" role="status" aria-live="polite">未结款样品加载中…</p>
    <p v-else-if="!rows.length" class="mobile-unsettled-list__state empty-text" role="status">暂无未结款样品</p>
    <div v-else class="mobile-unsettled-list__cards">
      <article
        v-for="row in rows"
        :key="row.blockId"
        data-testid="mobile-unsettled-card"
        class="mobile-unsettled-card"
        :class="{ 'mobile-unsettled-card--selected': selectedIdSet.has(row.blockId) }"
      >
        <header>
          <label class="mobile-unsettled-card__selection mobile-touch-target">
            <input
              :data-testid="`select-unsettled-${row.blockId}`"
              type="checkbox"
              :checked="selectedIdSet.has(row.blockId)"
              :aria-label="`选择样品 ${row.sampleNumber}`"
              @change="updateSelection(row, ($event.target as HTMLInputElement).checked)"
            />
          </label>
          <div>
            <strong>{{ row.sampleNumber }}</strong>
            <small>{{ row.date }} · 编号 {{ row.sequence }}</small>
          </div>
          <b>{{ money(row.amount) }}</b>
        </header>
        <dl>
          <div><dt>客户</dt><dd>{{ row.customer }}</dd></div>
          <div><dt>样品编号</dt><dd>{{ row.sampleNumber }}</dd></div>
          <div><dt>检测日期</dt><dd>{{ row.date }}</dd></div>
          <div><dt>金额</dt><dd>{{ money(row.amount) }}</dd></div>
        </dl>
        <footer>
          <button
            :data-testid="`jump-unsettled-${row.blockId}`"
            class="mobile-touch-target"
            type="button"
            :disabled="busy"
            @click="emit('jump', row)"
          >跳转样品</button>
          <button
            :data-testid="`settle-unsettled-${row.blockId}`"
            class="mobile-touch-target mobile-unsettled-card__settle"
            type="button"
            :disabled="busy"
            @click="emit('settle', row)"
          >{{ settlingId === row.blockId ? '结款中…' : '确认已结款' }}</button>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.mobile-unsettled-list,
.mobile-unsettled-list__cards {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-unsettled-list {
  box-sizing: border-box;
  padding: 14px 14px max(18px, env(safe-area-inset-bottom));
}

.mobile-unsettled-list__header,
.mobile-unsettled-card header,
.mobile-unsettled-card footer {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mobile-unsettled-list__header > div,
.mobile-unsettled-card header > div {
  min-width: 0;
}

.mobile-unsettled-list__header h2,
.mobile-unsettled-list__header p {
  margin: 0;
}

.mobile-unsettled-list__header p {
  margin-top: 4px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.mobile-unsettled-list__refresh,
.mobile-unsettled-card footer button {
  padding: 8px 12px;
  color: var(--ui-text-secondary);
  background: #fff;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
}

.mobile-unsettled-list__filters {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}

.mobile-unsettled-list__filters legend {
  margin-bottom: 8px;
  color: var(--ui-text-secondary);
}

.mobile-unsettled-list__filters label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  overflow-wrap: anywhere;
}

.mobile-unsettled-list__filters input,
.mobile-unsettled-card__selection input {
  width: 20px;
  height: 20px;
}

.mobile-unsettled-list__state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
}

.mobile-unsettled-card {
  min-width: 0;
  padding: 12px;
  background: #fff;
  border: 1px solid var(--ui-line);
  border-radius: 12px;
}

.mobile-unsettled-card--selected {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.14);
}

.mobile-unsettled-card__selection {
  display: grid;
  flex: 0 0 44px;
  place-items: center;
}

.mobile-unsettled-card header > div {
  display: grid;
  flex: 1;
  gap: 3px;
}

.mobile-unsettled-card strong,
.mobile-unsettled-card small,
.mobile-unsettled-card b,
.mobile-unsettled-card dd {
  overflow-wrap: anywhere;
}

.mobile-unsettled-card small,
.mobile-unsettled-card dt {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.mobile-unsettled-card dl {
  display: grid;
  gap: 8px;
  margin: 12px 0;
  padding: 10px 0;
  border-top: 1px solid var(--ui-line-soft);
  border-bottom: 1px solid var(--ui-line-soft);
}

.mobile-unsettled-card dl > div {
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  gap: 12px;
}

.mobile-unsettled-card dt,
.mobile-unsettled-card dd {
  margin: 0;
}

.mobile-unsettled-card dd {
  text-align: right;
}

.mobile-unsettled-card footer button {
  flex: 1;
}

.mobile-unsettled-card footer .mobile-unsettled-card__settle {
  color: #fff;
  background: var(--ui-accent);
  border-color: var(--ui-accent);
}
</style>
