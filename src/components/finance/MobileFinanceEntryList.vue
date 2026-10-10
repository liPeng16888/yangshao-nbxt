<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import type { FinanceEntry } from '@/types/finance'
import { getFinanceScreenshotUrls } from './useFinanceEntryDraft'

const props = defineProps<{
  month: string
  entries: FinanceEntry[]
  loading?: boolean
  loadError?: string
  deletingId?: string
}>()

const emit = defineEmits<{
  monthChange: [month: string]
  retry: []
  deleteRequest: [row: FinanceEntry]
}>()

const filterOpen = ref(false)
const draftMonth = ref(props.month)
const sortedEntries = computed(() => [...props.entries].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)))
const previewInstances = new Map<string, ComponentPublicInstance & { showPreview: () => void }>()

watch(filterOpen, (open) => {
  if (open) draftMonth.value = props.month
})

function applyMonth() {
  const month = draftMonth.value || props.month
  filterOpen.value = false
  if (month) emit('monthChange', month)
}

function resetMonth() {
  draftMonth.value = props.month
  filterOpen.value = false
  emit('monthChange', props.month)
}

function money(value: number) {
  return `¥${Number(value).toFixed(2)}`
}

function previewKey(rowId: string, index: number) {
  return `${rowId}:${index}`
}

function setPreviewInstance(key: string, instance: Element | ComponentPublicInstance | null) {
  if (instance && 'showPreview' in instance && typeof instance.showPreview === 'function') {
    previewInstances.set(key, instance as ComponentPublicInstance & { showPreview: () => void })
  } else {
    previewInstances.delete(key)
  }
}

function openScreenshotPreview(key: string) {
  previewInstances.get(key)?.showPreview()
}
</script>

<template>
  <section class="panel mobile-finance-entry-list">
    <header>
      <h2>月度支出明细</h2>
      <div data-testid="mobile-finance-month-summary">
        <MobileFilterDrawer
          v-model="filterOpen"
          title="选择支出月份"
          :summary="`当前月份：${month}`"
          @apply="applyMonth"
          @reset="resetMonth"
        >
          <label class="mobile-finance-entry-list__month-field">
            <span>支付月份</span>
            <input v-model="draftMonth" data-testid="mobile-finance-month-input" class="mobile-touch-target" type="month" />
          </label>
        </MobileFilterDrawer>
      </div>
    </header>

    <p v-if="loading" class="mobile-finance-entry-list__state" role="status" aria-live="polite">支出明细加载中…</p>
    <div v-else-if="loadError" class="mobile-finance-entry-list__error" data-testid="mobile-finance-load-error" role="alert">
      <span>{{ loadError }}</span>
      <button data-testid="mobile-finance-retry" class="mobile-touch-target" type="button" @click="emit('retry')">重试</button>
    </div>
    <p v-else-if="!sortedEntries.length" class="mobile-finance-entry-list__state empty-text" role="status">本月暂无支出记录</p>
    <div v-else class="mobile-finance-entry-list__cards">
      <article v-for="row in sortedEntries" :key="row.id" class="mobile-expense-card" data-testid="mobile-expense-card" :data-entry-id="row.id">
        <header class="mobile-expense-card__header">
          <div>
            <strong>{{ row.item }}</strong>
            <small>{{ row.paymentDate }} · {{ row.paymentMethod === 'cash' ? '现金支付' : '线上支付' }}</small>
          </div>
          <b>{{ money(row.amount) }}</b>
        </header>

        <dl>
          <div><dt>支付日期</dt><dd>{{ row.paymentDate }}</dd></div>
          <div><dt>支付方式</dt><dd>{{ row.paymentMethod === 'cash' ? '现金支付' : '线上支付' }}</dd></div>
          <div><dt>备注</dt><dd>{{ row.remark || '无信息' }}</dd></div>
          <div class="mobile-expense-card__screenshots">
            <dt>支付截图</dt>
            <dd>
              <div v-if="getFinanceScreenshotUrls(row).length" class="mobile-expense-card__thumbs">
                <button
                  v-for="(url, index) in getFinanceScreenshotUrls(row)"
                  :key="url"
                  data-testid="mobile-expense-preview"
                  class="mobile-expense-card__preview mobile-touch-target"
                  style="min-width: 44px; min-height: 44px"
                  type="button"
                  :aria-label="`查看${row.item}第 ${index + 1} 张支付截图`"
                  @click="openScreenshotPreview(previewKey(row.id, index))"
                  @keydown.enter.prevent.stop="openScreenshotPreview(previewKey(row.id, index))"
                  @keydown.space.prevent.stop="openScreenshotPreview(previewKey(row.id, index))"
                >
                  <el-image
                    :ref="(instance: Element | ComponentPublicInstance | null) => setPreviewInstance(previewKey(row.id, index), instance)"
                    :src="url"
                    fit="cover"
                    :preview-src-list="getFinanceScreenshotUrls(row)"
                    :initial-index="index"
                    class="mobile-expense-card__thumb"
                    @click.stop
                  />
                </button>
              </div>
              <span v-else class="empty-text">无信息</span>
            </dd>
          </div>
        </dl>

        <footer>
          <span v-if="row.deleteRequestStatus === 'PENDING'" class="mobile-expense-card__pending" data-testid="mobile-expense-pending">删除待审核</span>
          <button
            v-else
            data-testid="mobile-expense-delete"
            class="mobile-expense-card__delete mobile-touch-target"
            type="button"
            :disabled="deletingId === row.id"
            @click="emit('deleteRequest', row)"
          >{{ deletingId === row.id ? '提交中…' : '申请删除' }}</button>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.mobile-finance-entry-list,
.mobile-finance-entry-list__cards {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-finance-entry-list {
  box-sizing: border-box;
  padding: 14px 14px max(18px, env(safe-area-inset-bottom));
}

.mobile-finance-entry-list > header,
.mobile-expense-card__header,
.mobile-expense-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-finance-entry-list h2 {
  margin: 0;
}

.mobile-finance-entry-list__month-field {
  display: grid;
  gap: 8px;
  color: var(--ui-text-secondary);
}

.mobile-finance-entry-list__month-field input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  color: var(--ui-text);
  background: #fff;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
}

.mobile-finance-entry-list__state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
}

.mobile-finance-entry-list__error {
  display: grid;
  gap: 10px;
  padding: 14px;
  color: #991b1b;
  background: var(--ui-danger-soft);
  border: 1px solid var(--ui-danger-line);
  border-radius: 10px;
}

.mobile-finance-entry-list__error button {
  justify-self: start;
  min-height: 44px;
  padding: 8px 16px;
  color: #991b1b;
  background: #fff;
  border: 1px solid #ef9a9a;
  border-radius: 8px;
}

.mobile-expense-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: 14px;
  background: #fff;
  border: 1px solid var(--ui-line);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgb(15 23 42 / 5%);
}

.mobile-expense-card__header > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.mobile-expense-card__header strong,
.mobile-expense-card__header small {
  overflow-wrap: anywhere;
}

.mobile-expense-card__header small {
  color: var(--ui-text-muted);
}

.mobile-expense-card__header b {
  color: var(--ui-danger);
  white-space: nowrap;
}

.mobile-expense-card dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.mobile-expense-card dl > div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
}

.mobile-expense-card dt {
  color: var(--ui-text-muted);
}

.mobile-expense-card dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.mobile-expense-card__thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mobile-expense-card__preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--ui-line);
  border-radius: 7px;
  cursor: pointer;
}

.mobile-expense-card__preview:focus-visible {
  outline: 3px solid rgb(37 99 235 / 35%);
  outline-offset: 2px;
}

.mobile-expense-card__thumb {
  width: 56px;
  height: 56px;
  border-radius: 6px;
}

.mobile-expense-card footer {
  justify-content: flex-end;
}

.mobile-expense-card__delete {
  min-height: 44px;
  padding: 8px 14px;
  color: var(--ui-danger);
  background: #fff;
  border: 1px solid #e8aaa5;
  border-radius: 8px;
}

.mobile-expense-card__pending {
  padding: 5px 10px;
  color: var(--ui-warning);
  background: var(--ui-warning-soft);
  border: 1px solid #f6d88a;
  border-radius: 999px;
}

@media (max-width: 480px) {
  .mobile-finance-entry-list > header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
