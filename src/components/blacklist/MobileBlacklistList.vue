<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import type { BlacklistRecord } from '@/types/blacklist'
import { formatDateTime } from '@/utils/date'
import BlacklistImagePreview from './BlacklistImagePreview.vue'

const props = defineProps<{
  records: BlacklistRecord[]
  keyword: string
  loading?: boolean
  highlightId?: string
  deletingId?: string
  updatingId?: string
}>()

const emit = defineEmits<{
  search: [keyword: string]
  delete: [id: string]
  supplement: [row: BlacklistRecord]
}>()

const filterOpen = ref(false)
const draftKeyword = ref('')
const expandedIds = ref(new Set<string>())
const cardElements = new Map<string, HTMLElement>()
type TemplateRefValue = Element | ComponentPublicInstance | null
const cardElementSetters = new Map<string, (element: TemplateRefValue) => void>()
let autoExpandedId = ''
let lastScrolledId = ''
let disposed = false

watch(filterOpen, (open) => {
  if (open) draftKeyword.value = props.keyword
})

watch(
  () => [props.highlightId, props.records, props.loading] as const,
  async ([highlightId, rows, loading]) => {
    const activeIds = new Set(rows.map((row) => row.id))
    for (const id of cardElementSetters.keys()) {
      if (!activeIds.has(id)) { cardElementSetters.delete(id); cardElements.delete(id) }
    }
    const exactId = typeof highlightId === 'string' && rows.some((row) => row.id === highlightId) ? highlightId : ''
    const nextExpanded = new Set(expandedIds.value)
    if (autoExpandedId && autoExpandedId !== exactId) nextExpanded.delete(autoExpandedId)
    if (!exactId) {
      autoExpandedId = ''
      lastScrolledId = ''
      expandedIds.value = nextExpanded
      return
    }
    autoExpandedId = exactId
    nextExpanded.add(exactId)
    expandedIds.value = nextExpanded
    if (loading || lastScrolledId === exactId) return
    await nextTick()
    if (!disposed && props.highlightId === exactId) {
      const element = cardElements.get(exactId)
      if (element) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' })
        lastScrolledId = exactId
      }
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  disposed = true
  cardElements.clear()
  cardElementSetters.clear()
})

function cardElementRef(id: string) {
  let setter = cardElementSetters.get(id)
  if (!setter) {
    setter = (element: TemplateRefValue) => {
      if (element instanceof HTMLElement) cardElements.set(id, element)
      else cardElements.delete(id)
    }
    cardElementSetters.set(id, setter)
  }
  return setter
}

function applySearch() {
  filterOpen.value = false
  emit('search', draftKeyword.value.trim())
}

function resetSearch() {
  draftKeyword.value = ''
  filterOpen.value = false
  emit('search', '')
}

function toggle(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function emptyText(value?: string) {
  return value?.trim() || '无信息'
}

function title(row: BlacklistRecord) {
  return row.wechatNickname?.trim() || row.phone?.trim() || row.wechat?.trim() || '未提供客户信息'
}

function reason(row: BlacklistRecord) {
  return row.note?.trim() || row.other?.trim() || '无信息'
}

function money(value?: number) {
  return Number.isFinite(value) ? `¥${Number(value).toFixed(2)}` : '无信息'
}

function canManage(row: BlacklistRecord) {
  return row.canManage === true
}
</script>

<template>
  <div class="mobile-blacklist-list">
    <div data-testid="mobile-blacklist-filter-summary">
      <MobileFilterDrawer
        v-model="filterOpen"
        title="查询黑名单"
        :summary="keyword ? `当前查询：${keyword}` : '全部黑名单记录'"
        @apply="applySearch"
        @reset="resetSearch"
      >
        <label class="mobile-blacklist-list__search-field">
          <span>关键词</span>
          <input
            v-model="draftKeyword"
            data-testid="mobile-blacklist-keyword"
            class="mobile-blacklist-list__keyword mobile-touch-target"
            style="min-height: 44px"
            type="search"
            autocomplete="off"
            placeholder="电话号、微信号、昵称、其他信息"
            @keyup.enter="applySearch"
          />
        </label>
      </MobileFilterDrawer>
    </div>

    <p v-if="loading" class="mobile-blacklist-list__state" role="status" aria-live="polite">黑名单加载中…</p>
    <p v-else-if="!records.length" class="mobile-blacklist-list__state empty-text" role="status">暂无黑名单记录</p>
    <div v-else class="mobile-blacklist-list__cards">
      <article
        v-for="row in records"
        :key="row.id"
        :ref="cardElementRef(row.id)"
        class="mobile-blacklist-card"
        :class="{
          'mobile-blacklist-card--highlight': row.id === highlightId,
          'mobile-record-card--expanded': expandedIds.has(row.id)
        }"
        data-testid="mobile-blacklist-card"
        :data-record-id="row.id"
      >
        <header class="mobile-blacklist-card__header">
          <div>
            <strong>{{ title(row) }}</strong>
            <span>状态：黑名单记录</span>
            <small>命中原因：{{ reason(row) }}</small>
          </div>
          <button
            class="mobile-blacklist-card__toggle mobile-touch-target"
            data-testid="mobile-blacklist-toggle"
            type="button"
            :aria-expanded="expandedIds.has(row.id)"
            :aria-label="`${expandedIds.has(row.id) ? '收起' : '展开'}${title(row)}黑名单详情`"
            @click="toggle(row.id)"
          >
            {{ expandedIds.has(row.id) ? '收起' : '详情' }}
          </button>
        </header>

        <div v-if="expandedIds.has(row.id)" class="mobile-blacklist-card__details">
          <dl>
            <div><dt>状态</dt><dd>黑名单记录</dd></div>
            <div><dt>命中原因</dt><dd>{{ reason(row) }}</dd></div>
            <div><dt>电话号</dt><dd>{{ emptyText(row.phone) }}</dd></div>
            <div><dt>微信号</dt><dd>{{ emptyText(row.wechat) }}</dd></div>
            <div><dt>微信昵称</dt><dd>{{ emptyText(row.wechatNickname) }}</dd></div>
            <div><dt>金额</dt><dd>{{ money(row.amount) }}</dd></div>
            <div class="mobile-blacklist-card__images"><dt>图片</dt><dd><BlacklistImagePreview :images="row.images" /></dd></div>
            <div><dt>其他</dt><dd>{{ emptyText(row.other) }}</dd></div>
            <div><dt>备注</dt><dd>{{ emptyText(row.note) }}</dd></div>
            <div><dt>上传用户</dt><dd>{{ emptyText(row.uploadedBy) }}</dd></div>
            <div><dt>上传时间</dt><dd>{{ formatDateTime(row.uploadedAt) }}</dd></div>
          </dl>
        </div>

        <footer class="mobile-blacklist-card__actions">
          <template v-if="canManage(row)">
            <button
              class="mobile-touch-target mobile-blacklist-card__supplement"
              :data-testid="`supplement-${row.id}`"
              type="button"
              :disabled="updatingId === row.id"
              @click="emit('supplement', row)"
            >补充信息</button>
            <button
              class="mobile-touch-target mobile-blacklist-card__delete"
              :data-testid="`delete-${row.id}`"
              type="button"
              :disabled="deletingId === row.id"
              @click="emit('delete', row.id)"
            >删除</button>
          </template>
          <span v-else class="readonly-action">仅查看</span>
        </footer>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
.mobile-blacklist-list,
.mobile-blacklist-list__cards {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-blacklist-list__search-field {
  display: grid;
  gap: 8px;
  color: #475569;
}

.mobile-blacklist-list__keyword {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  color: #0f172a;
  background: #fff;
  border: 1px solid #aebdcd;
  border-radius: 8px;
}

.mobile-blacklist-list__state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
}

.mobile-blacklist-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: 14px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
  scroll-margin-block: 80px;
}

.mobile-blacklist-card--highlight {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgb(220 38 38 / 14%);
}

.mobile-blacklist-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  > div {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  strong,
  small,
  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  span,
  small {
    color: #64748b;
  }
}

.mobile-blacklist-card__toggle,
.mobile-blacklist-card__actions button {
  flex: none;
  min-height: 44px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}

.mobile-blacklist-card__details dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.mobile-blacklist-card__details dl > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.mobile-blacklist-card__details dt {
  flex: none;
  color: #64748b;
}

.mobile-blacklist-card__details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
}

.mobile-blacklist-card__images dd {
  display: flex;
  justify-content: flex-end;
}

.mobile-blacklist-card__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.mobile-blacklist-card__supplement {
  color: #2563eb;
}

.mobile-blacklist-card__delete {
  color: #b42318;
}

.readonly-action {
  grid-column: 1 / -1;
  color: #94a3b8;
}
</style>
